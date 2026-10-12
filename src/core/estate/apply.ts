import { copyFile, mkdir, readFile, rename, rmdir, symlink, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { KiError } from '../errors.ts'
import { localRegistryPath, publishLocalRegistryReplacement } from '../storage/local-registry.ts'
import { requiredGit } from './git.ts'
import { exists } from './host.ts'
import type { ConvergeAction, ConvergeLog, EstatePorts } from './model.ts'

const LOG_SCHEMA = 'ki/estate-converge/v1'

export const convergeLogDirectory = (ports: EstatePorts): string => join(ports.stateDirectory, 'converge')

const writeAtomically = async (path: string, content: string): Promise<void> => {
  const staging = `${path}.ki-converge`
  await writeFile(staging, content)
  await rename(staging, path)
}

const renameClaudeProject = async (ports: EstatePorts, from: string, to: string): Promise<void> => {
  const path = join(ports.homeDirectory, '.claude.json')
  const contents = await readFile(path, 'utf8')
  const state = JSON.parse(contents) as { projects: Record<string, unknown> }
  if (!(from in state.projects) || to in state.projects)
    throw new KiError(`~/.claude.json cannot rename project ${from} to ${to}`, 1)
  state.projects = Object.fromEntries(
    Object.entries(state.projects).map(([key, value]) => [key === from ? to : key, value])
  )
  await writeAtomically(path, `${JSON.stringify(state, null, 2)}${contents.endsWith('\n') ? '\n' : ''}`)
}

const relocate = async (from: string, to: string): Promise<void> => {
  if (await exists(to)) throw new KiError(`${to} already exists; not moving ${from}`, 1)
  await mkdir(dirname(to), { recursive: true })
  await rename(from, to)
}

const perform = async (ports: EstatePorts, action: ConvergeAction): Promise<void> => {
  switch (action.kind) {
    case 'move':
      await relocate(action.from, action.to)
      await requiredGit(ports, action.to, ['worktree', 'repair', ...action.worktrees.map((worktree) => worktree.after)])
      return
    case 'remote':
      await requiredGit(ports, action.path, ['remote', 'set-url', 'origin', action.to])
      return
    case 'registry':
      await publishLocalRegistryReplacement(ports.stateDirectory, action.before, action.after)
      return
    case 'claude-folder':
      await relocate(action.from, action.to)
      return
    case 'claude-key':
      await renameClaudeProject(ports, action.from, action.to)
      return
    case 'clone':
      await mkdir(dirname(action.path), { recursive: true })
      await requiredGit(ports, dirname(action.path), ['clone', action.url, action.path])
      return
    case 'symlink':
      await unlink(action.path)
      await symlink(action.to, action.path)
      return
    case 'rmdir':
      await rmdir(action.path)
      return
    case 'mkdir':
      await mkdir(action.path, { recursive: true })
  }
}

/**
 * Execute actions in order, recording each completed one in a JSON log written after every step,
 * so an interrupted run can still be rolled back. Registry and Claude state are copied first.
 */
export const executeConvergence = async (
  ports: EstatePorts,
  manifest: string,
  actions: readonly ConvergeAction[],
  suffix = ''
): Promise<string> => {
  const directory = convergeLogDirectory(ports)
  await mkdir(directory, { recursive: true })
  const stamp = new Date(ports.now()).toISOString().replace(/[:.]/g, '-')
  const backups: { original: string; copy: string }[] = []
  for (const [original, name] of [
    [localRegistryPath(ports.stateDirectory), 'registry.toml'],
    [join(ports.homeDirectory, '.claude.json'), 'claude.json']
  ] as const) {
    if (!(await exists(original))) continue
    const copy = join(directory, `${stamp}${suffix}.${name}`)
    await copyFile(original, copy)
    backups.push({ original, copy })
  }
  const path = join(directory, `${stamp}${suffix}.json`)
  const startedAt = new Date(ports.now()).toISOString()
  const completed: ConvergeAction[] = []
  const record = (): Promise<void> => {
    const log: ConvergeLog = { schema: LOG_SCHEMA, manifest, startedAt, backups, actions: completed }
    return writeFile(path, `${JSON.stringify(log, null, 2)}\n`)
  }
  await record()
  for (const action of actions) {
    try {
      await perform(ports, action)
    } catch (error) {
      throw new KiError(
        `converge stopped; ${completed.length} action(s) recorded in ${path}: ${(error as Error).message}`,
        1
      )
    }
    completed.push(action)
    await record()
  }
  return path
}

const inverse = (action: ConvergeAction): ConvergeAction | undefined => {
  switch (action.kind) {
    case 'move':
      return {
        kind: 'move',
        from: action.to,
        to: action.from,
        worktrees: action.worktrees.map((worktree) => ({ before: worktree.after, after: worktree.before }))
      }
    case 'registry':
      return { kind: 'registry', before: action.after, after: action.before }
    case 'clone':
      return undefined
    case 'rmdir':
      return { kind: 'mkdir', path: action.path }
    case 'mkdir':
      return { kind: 'rmdir', path: action.path }
    default:
      return { ...action, from: action.to, to: action.from }
  }
}

export interface RollbackPlan {
  readonly manifest: string
  readonly actions: readonly ConvergeAction[]
  /** Clones a rollback never removes, since converge never deletes a repository. */
  readonly retained: readonly string[]
}

export const planRollback = async (path: string): Promise<RollbackPlan> => {
  let log: ConvergeLog
  try {
    log = JSON.parse(await readFile(path, 'utf8')) as ConvergeLog
  } catch {
    throw new KiError(`converge log ${path} must be a readable JSON document`, 1)
  }
  if (log.schema !== LOG_SCHEMA || !Array.isArray(log.actions))
    throw new KiError(`${path} is not a ki estate converge log`, 1)
  const reversed = [...log.actions].reverse()
  return {
    manifest: log.manifest,
    actions: reversed.flatMap((action) => {
      const undo = inverse(action)
      return undo ? [undo] : []
    }),
    retained: reversed.flatMap((action) => (action.kind === 'clone' ? [action.path] : []))
  }
}
