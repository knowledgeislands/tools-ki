import { constants } from 'node:fs'
import { cp, lstat, mkdir, readdir, readFile, realpath, symlink } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { KiError } from '../errors.ts'
import { gitWorkingTreeRoot, scrubbedGitEnvironment } from '../runtime/git.ts'
import { requiredLocalRegistry } from '../storage/local-registry.ts'
import { type AgentContext, agentsDirectory, runDirectory } from './context.ts'

export interface AgentWorktree {
  readonly repository: string
  readonly path: string
  readonly branch: string
}
interface WorktreeRequest {
  readonly run: string
  readonly name: string
  readonly worktree?: string | undefined
}
const git = (context: AgentContext, repository: string, args: readonly string[]) =>
  context.runner('git', ['-C', repository, ...args], scrubbedGitEnvironment(context.environment))

export const agentWorktree = (context: AgentContext, request: WorktreeRequest): AgentWorktree | undefined =>
  request.worktree === undefined
    ? undefined
    : {
        repository: request.worktree,
        path: join(runDirectory(context, request.run), 'worktrees', `${request.name}.${basename(request.worktree)}`),
        branch: `run/${request.run}/${request.name}`
      }

export const worktreeRepository = async (context: AgentContext, directory: string): Promise<string> => {
  const root = await gitWorkingTreeRoot(directory, context.runner, context.environment)
  if (root === undefined) throw new KiError(`--worktree requires a Git repository: ${directory}`, 2)
  return root
}

/** Snapshot committed HEAD, clone installed dependencies locally, and retain managed project skill links. */
export const prepareAgentWorktree = async (
  context: AgentContext,
  request: WorktreeRequest
): Promise<AgentWorktree | undefined> => {
  const tree = agentWorktree(context, request)
  if (tree === undefined) return undefined
  const created = await git(context, tree.repository, ['worktree', 'add', '-q', '-b', tree.branch, tree.path, 'HEAD'])
  if (created.exitCode !== 0) throw new KiError(`cannot create worktree ${tree.path}: ${created.output.trim()}`, 1)
  try {
    for (const relative of ['node_modules', 'tooling/depcruise/node_modules']) {
      const source = join(tree.repository, relative)
      if ((await lstat(source).catch(() => undefined))?.isDirectory()) {
        await mkdir(join(tree.path, relative, '..'), { recursive: true })
        await cp(source, join(tree.path, relative), {
          recursive: true,
          mode: constants.COPYFILE_FICLONE,
          verbatimSymlinks: true
        })
      }
    }
    for (const relative of ['.agents/skills', '.claude/skills']) {
      for (const entry of await readdir(join(tree.repository, relative), { withFileTypes: true }).catch(() => [])) {
        const target = join(tree.path, relative, entry.name)
        if (!entry.isSymbolicLink() || (await lstat(target).catch(() => undefined))) continue
        await mkdir(join(tree.path, relative), { recursive: true })
        await symlink(await realpath(join(tree.repository, relative, entry.name)), target)
      }
    }
  } catch (error) {
    throw new KiError(`worktree preparation failed; stranded worktree retained at ${tree.path}: ${String(error)}`, 1)
  }
  return tree
}

const age = (now: number, seconds: number): string => {
  const elapsed = Math.max(0, Math.floor(now / 1000 - seconds))
  if (elapsed < 60) return `${elapsed}s`
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m`
  if (elapsed < 86400) return `${Math.floor(elapsed / 3600)}h`
  return `${Math.floor(elapsed / 86400)}d`
}
const counts = async (context: AgentContext, repository: string, branch: string, base = 'main'): Promise<string> => {
  const result = await git(context, repository, ['rev-list', '--left-right', '--count', `${branch}...${base}`])
  const match = result.exitCode === 0 && /^(\d+)\s+(\d+)\s*$/.exec(result.output)
  return match ? `${match[1]} ahead, ${match[2]} behind` : 'ahead/behind unknown'
}
const defaultBranch = async (context: AgentContext, repository: string): Promise<string> => {
  const result = await git(context, repository, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'])
  return result.exitCode === 0 && result.output.trim().startsWith('origin/') ? result.output.trim().slice(7) : 'main'
}
const worktreeLine = async (
  context: AgentContext,
  tree: AgentWorktree,
  agent: string,
  stopped: boolean
): Promise<string> => {
  const base = await defaultBranch(context, tree.repository)
  const [difference, status, last] = await Promise.all([
    counts(context, tree.path, 'HEAD', base),
    git(context, tree.path, ['status', '--porcelain', '--untracked-files=all']),
    git(context, tree.path, ['log', '-1', '--format=%ct'])
  ])
  const dirty = status.exitCode === 0 ? String(status.output.split('\n').filter(Boolean).length) : 'unknown'
  const stamp =
    last.exitCode === 0 && /^\d+\s*$/.test(last.output) ? age(context.now(), Number(last.output.trim())) : 'unknown'
  return `- [${stopped ? 'stranded' : 'worktree'}] ${agent} · ${basename(tree.repository)} · ${tree.branch} · ${difference} · ${dirty} uncommitted · last commit ${stamp}`
}

export const agentWorktreeLines = async (
  context: AgentContext,
  directory: string,
  name: string,
  stopped: boolean
): Promise<readonly string[]> => {
  const text = await readFile(join(directory, `${name}.launch.json`), 'utf8').catch(() => undefined)
  if (text === undefined) return []
  const details = JSON.parse(text) as { worktree?: AgentWorktree }
  return details.worktree === undefined ? [] : [await worktreeLine(context, details.worktree, name, stopped)]
}

const worktreeOwners = async (context: AgentContext): Promise<ReadonlyMap<string, boolean>> => {
  const owners = new Map<string, boolean>()
  for (const run of await readdir(agentsDirectory(context), { withFileTypes: true }).catch(() => [])) {
    if (!run.isDirectory() || run.name === '_archive') continue
    const directory = join(agentsDirectory(context), run.name)
    for (const file of (await readdir(directory)).filter((name) => name.endsWith('.launch.json'))) {
      const details = JSON.parse(await readFile(join(directory, file), 'utf8')) as { worktree?: AgentWorktree }
      const tree = details.worktree
      if (!tree) continue
      const name = file.slice(0, -'.launch.json'.length)
      const [pid, status] = await Promise.all([
        readFile(join(directory, `${name}.pid`), 'utf8').catch(() => ''),
        readFile(join(directory, `${name}.status`), 'utf8').catch(() => '')
      ])
      const processId = Number.parseInt(pid, 10)
      const path = await realpath(tree.path).catch(() => tree.path)
      owners.set(
        path,
        status.trimEnd().endsWith('\nDONE') ||
          status.trim() === 'DONE' ||
          !Number.isInteger(processId) ||
          processId <= 0 ||
          !context.processes.alive(processId)
      )
    }
  }
  return owners
}

/** Every linked checkout and non-default branch in the registered local estate, read without mutation. */
export const estateWorktreeLines = async (context: AgentContext): Promise<readonly string[]> => {
  const lines: string[] = []
  const owners = await worktreeOwners(context)
  for (const repository of await requiredLocalRegistry(context.stateDirectory)) {
    const base = await defaultBranch(context, repository.path)
    const [listing, branches] = await Promise.all([
      git(context, repository.path, ['worktree', 'list', '--porcelain', '-z']),
      git(context, repository.path, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'])
    ])
    if (listing.exitCode !== 0 || branches.exitCode !== 0) {
      lines.push(`- [unknown] ${repository.key} · Git worktree inventory unavailable`)
      continue
    }
    for (const record of listing.output.split('\0\0').filter(Boolean).slice(1)) {
      const fields = record.split('\0')
      const path = fields.find((field) => field.startsWith('worktree '))?.slice(9)
      const branch = fields.find((field) => field.startsWith('branch refs/heads/'))?.slice(18) ?? '(detached)'
      if (!path) {
        lines.push(`- [unknown] ${repository.key} · malformed Git worktree inventory`)
        continue
      }
      lines.push(
        `${await worktreeLine(context, { repository: repository.path, path, branch }, repository.key, owners.get(path) === true)} · ${path}`
      )
    }
    for (const branch of branches.output.split('\n').filter((name) => name && name !== base))
      lines.push(`- [branch] ${repository.key} · ${branch} · ${await counts(context, repository.path, branch, base)}`)
  }
  return lines
}
