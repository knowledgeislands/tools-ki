import { lstat, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { LocalRegistryEntry } from '../storage/local-registry.ts'
import { git, remoteIdentity } from './git.ts'
import type { EstatePorts } from './model.ts'

const WORKSPACE_DEPTH = 4

const isDirectory = async (path: string): Promise<boolean> =>
  Boolean((await lstat(path).catch(() => undefined))?.isDirectory())

/** Primary checkouts hold a `.git` directory; linked worktrees hold a `.git` file and are not checkouts. */
const isCheckout = (path: string): Promise<boolean> => isDirectory(join(path, '.git'))

const workspaceCheckouts = async (directory: string, depth: number): Promise<readonly string[]> => {
  if (await isCheckout(directory)) return [directory]
  if (!depth) return []
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
      .map((entry) => workspaceCheckouts(join(directory, entry.name), depth - 1))
  )
  return nested.flat()
}

/**
 * Every local primary checkout keyed by the normalised GitHub identity of its origin remote,
 * searched under ~/workspaces, the chezmoi source and every registered path.
 */
export const discoverCheckouts = async (
  ports: EstatePorts,
  registry: readonly LocalRegistryEntry[]
): Promise<ReadonlyMap<string, readonly string[]>> => {
  const candidates = new Set([
    ...(await workspaceCheckouts(join(ports.homeDirectory, 'workspaces'), WORKSPACE_DEPTH)),
    join(ports.homeDirectory, '.local/share/chezmoi'),
    ...registry.map((entry) => entry.path)
  ])
  const checkouts = new Map<string, string[]>()
  for (const path of [...candidates].sort()) {
    if (!(await isCheckout(path))) continue
    const remote = await git(ports, path, ['remote', 'get-url', 'origin'])
    const identity = remote.exitCode === 0 ? remoteIdentity(remote.output.trim()) : undefined
    if (identity) checkouts.set(identity, [...(checkouts.get(identity) ?? []), path])
  }
  return checkouts
}
