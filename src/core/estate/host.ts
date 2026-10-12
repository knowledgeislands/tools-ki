import { lstat, open, readdir, readFile, readlink } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { KiError } from '../errors.ts'
import { git } from './git.ts'
import type { EstatePorts, WorktreeMove } from './model.ts'

/** A path relocated by the first move that contains it, or unchanged. */
export type PathMap = (path: string) => string

export const within = (root: string, path: string): boolean => path === root || path.startsWith(`${root}/`)

export const pathMap =
  (moves: readonly { readonly from: string; readonly to: string }[]): PathMap =>
  (path) => {
    const move = moves.find((candidate) => within(candidate.from, path))
    return move ? move.to + path.slice(move.from.length) : path
  }

export const exists = async (path: string): Promise<boolean> => Boolean(await lstat(path).catch(() => undefined))

/** Working directories of every visible process, from one `lsof` call. */
export const busyDirectories = async (ports: EstatePorts): Promise<readonly string[]> => {
  const result = await ports.runner('lsof', ['-n', '-P', '-d', 'cwd', '-F', 'n'], ports.environment).catch(() => {
    throw new KiError('lsof is required to detect processes working inside a checkout', 1)
  })
  return result.output.split('\n').flatMap((line) => (line.startsWith('n/') ? [line.slice(1)] : []))
}

/** Claude Code names a project folder by its path with every non-alphanumeric character as `-`. */
export const claudeProjectName = (path: string): string => path.replace(/[^a-zA-Z0-9]/g, '-')

const sessionDirectory = async (folder: string): Promise<string | undefined> => {
  const sessions = (await readdir(folder)).filter((name) => name.endsWith('.jsonl')).sort()
  for (const session of sessions) {
    const handle = await open(join(folder, session))
    const { buffer, bytesRead } = await handle.read({ buffer: Buffer.alloc(65_536) })
    await handle.close()
    const match = /"cwd":"((?:[^"\\]|\\.)*)"/.exec(buffer.subarray(0, bytesRead).toString('utf8'))
    if (match) return JSON.parse(`"${match[1]}"`) as string
  }
  return undefined
}

/**
 * Claude project folders for a checkout and its subdirectories. A folder whose encoded name only
 * shares the checkout's prefix is attributed by the working directory its sessions record.
 */
export const claudeFolders = async (
  homeDirectory: string,
  from: string,
  to: string
): Promise<{ readonly renames: readonly WorktreeMove[]; readonly notes: readonly string[] }> => {
  const projects = join(homeDirectory, '.claude/projects')
  const encoded = claudeProjectName(from)
  const renames: WorktreeMove[] = []
  const notes: string[] = []
  for (const name of (await readdir(projects).catch(() => [])).sort()) {
    if (name !== encoded && !name.startsWith(`${encoded}-`)) continue
    const directory = name === encoded ? from : await sessionDirectory(join(projects, name))
    if (directory === undefined) {
      notes.push(`Claude folder ${name} has no session to attribute; left in place`)
      continue
    }
    if (!within(from, directory)) continue
    const target = join(projects, claudeProjectName(to + directory.slice(from.length)))
    if (await exists(target)) notes.push(`Claude folder ${target} already exists; not merging ${name}`)
    else renames.push({ before: join(projects, name), after: target })
  }
  return { renames, notes }
}

export const readClaudeState = async (homeDirectory: string): Promise<Record<string, unknown> | undefined> => {
  const contents = await readFile(join(homeDirectory, '.claude.json'), 'utf8').catch(() => undefined)
  return contents === undefined ? undefined : (JSON.parse(contents) as Record<string, unknown>)
}

export const claudeProjects = (state: Record<string, unknown> | undefined): readonly string[] => {
  const projects = state?.['projects']
  return typeof projects === 'object' && projects !== null ? Object.keys(projects) : []
}

/** Linked worktrees git records, plus Paperclip worktrees whose `.git` file points into the checkout. */
export const linkedWorktrees = async (ports: EstatePorts, checkout: string): Promise<readonly string[]> => {
  const listed = (await git(ports, checkout, ['worktree', 'list', '--porcelain'])).output
    .split('\n')
    .flatMap((line) => (line.startsWith('worktree ') ? [line.slice('worktree '.length)] : []))
    .filter((path) => path !== checkout)
  const paperclip: string[] = []
  const instances = join(ports.homeDirectory, '.paperclip/instances')
  const visit = async (directory: string, depth: number): Promise<void> => {
    const pointer = await readFile(join(directory, '.git'), 'utf8').catch(() => undefined)
    if (pointer !== undefined) {
      if (within(join(checkout, '.git'), pointer.replace(/^gitdir: /, '').trim())) paperclip.push(directory)
      return
    }
    if (!depth) return
    for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => []))
      if (entry.isDirectory()) await visit(join(directory, entry.name), depth - 1)
  }
  for (const instance of await readdir(instances).catch(() => []))
    await visit(join(instances, instance, 'worktrees'), 4)
  return [...new Set([...listed, ...paperclip])].sort()
}

export interface SymlinkChange {
  /** The link's location once every move has happened. */
  readonly path: string
  readonly from: string
  readonly to: string
  readonly tracked: boolean
}

const symlinkRoots = async (
  homeDirectory: string
): Promise<readonly { readonly root: string; readonly depth?: number }[]> => {
  const storage = join(homeDirectory, 'Library/CloudStorage')
  const stores: { root: string; depth?: number }[] = []
  for (const provider of await readdir(storage).catch(() => []))
    if (provider.startsWith('OneDrive'))
      for (const store of await readdir(join(storage, provider)).catch(() => []))
        if (store.startsWith('sources-')) stores.push({ root: join(storage, provider, store), depth: 2 })
  return [{ root: join(homeDirectory, 'workspaces') }, ...stores]
}

const isTracked = async (ports: EstatePorts, path: string): Promise<boolean> => {
  let directory = dirname(path)
  while (directory !== dirname(directory)) {
    if (await exists(join(directory, '.git')))
      return (
        (await git(ports, directory, ['ls-files', '--error-unmatch', '--', relative(directory, path)])).exitCode === 0
      )
    directory = dirname(directory)
  }
  return false
}

/**
 * Symlinks whose resolution changes when the moves happen: an absolute target inside a moved
 * checkout, or a relative link whose own location or target moves independently of the other.
 */
export const symlinkChanges = async (
  ports: EstatePorts,
  moves: readonly { readonly from: string; readonly to: string }[]
): Promise<readonly SymlinkChange[]> => {
  if (!moves.length) return []
  const relocate = pathMap(moves)
  const changes: SymlinkChange[] = []
  for (const { root, depth } of await symlinkRoots(ports.homeDirectory)) {
    if (!(await exists(root))) continue
    const listing = await ports.runner(
      'find',
      [
        root,
        ...(depth === undefined ? [] : ['-maxdepth', String(depth)]),
        '-name',
        '.git',
        '-prune',
        '-o',
        '-type',
        'l',
        '-print'
      ],
      ports.environment
    )
    for (const path of listing.output.split('\n').filter(Boolean)) {
      const target = await readlink(path)
      const resolved = isAbsolute(target) ? target : resolve(dirname(path), target)
      const location = relocate(path)
      const destination = relocate(resolved)
      const changed = isAbsolute(target)
        ? destination !== resolved
        : relative(dirname(location), destination) !== relative(dirname(path), resolved)
      if (!changed) continue
      const rewritten = isAbsolute(target) ? destination : relative(dirname(location), destination)
      changes.push({ path: location, from: target, to: rewritten, tracked: await isTracked(ports, path) })
    }
  }
  return changes
}
