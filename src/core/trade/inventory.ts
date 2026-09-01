import { lstat, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isTradeRepository } from './configuration.ts'
import { localRegisteredConfiguration, registeredRepositories } from './estate.ts'
import { assertTradeIdentifier as identifier } from './identifiers.ts'
import type { LocatedTrade, TradeContext, TradeDirection } from './model.ts'
import { tradeError } from './model.ts'
import { directionForPhase, phaseOf, recordFromContents } from './record-codec.ts'

export const readDirectory = async (path: string): Promise<readonly string[]> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isDirectory()) return []
  return (await readdir(path, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(path, entry.name))
}

const peerDirectories = async (root: string, area: '+' | '-'): Promise<readonly string[]> => {
  const base = join(root, area, '_TRADES')
  const state = await lstat(base).catch(() => undefined)
  if (!state?.isDirectory()) return []
  const paths: string[] = []
  for (const owner of await readdir(base, { withFileTypes: true })) {
    // No reserved directory name shares the owner namespace now that phase carries lifecycle.
    if (!owner.isDirectory()) continue
    for (const repository of await readdir(join(base, owner.name), { withFileTypes: true })) {
      if (!repository.isDirectory()) continue
      paths.push(...(await readDirectory(join(base, owner.name, repository.name))))
    }
  }
  return paths
}

/**
 * Projects what the sender authored, so pairing compares the payload rather than the receiver's
 * storage of it. A receiver that formats its repository renormalises frontmatter quoting and the
 * blank line after the frontmatter; neither is payload, and neither may read as tampering, or no
 * trade could complete its lifecycle in a repository with ordinary Markdown hygiene. A receiver
 * that alters a field value or the prose still fails, which is the guard's reason to exist.
 */
export const locateTrades = async (
  context: TradeContext,
  options: { readonly id?: string; readonly direction?: TradeDirection; readonly repository?: string } = {}
): Promise<readonly LocatedTrade[]> => {
  if (options.id) identifier(options.id)
  /* v8 ignore next -- public CLI grammar validates canonical repository filters before estate traversal. */
  if (options.repository && !isTradeRepository(options.repository))
    throw tradeError('repository must use canonical HTTPS GitHub repository form')
  const locations: LocatedTrade[] = []
  for (const repository of await registeredRepositories(context)) {
    if (!repository.configuration || (options.repository && repository.repository !== options.repository)) continue
    for (const area of ['+', '-'] as const) {
      for (const path of await peerDirectories(repository.root, area)) {
        const contents = await readFile(path, 'utf8')
        const direction = directionForPhase[phaseOf(contents, path)]
        if (options.direction && direction !== options.direction) continue
        const record = recordFromContents(contents, path, direction)
        if (options.id && record.id !== options.id) continue
        locations.push({ repository: repository.repository, root: repository.root, direction, path, record })
      }
    }
  }
  return locations.sort((left, right) =>
    `${left.repository}:${left.direction}:${left.record.id}`.localeCompare(
      `${right.repository}:${right.direction}:${right.record.id}`
    )
  )
}

export const localTrade = async (
  context: TradeContext,
  direction: TradeDirection,
  id: string
): Promise<{
  readonly local: Awaited<ReturnType<typeof localRegisteredConfiguration>>
  readonly trade: LocatedTrade
}> => {
  const local = await localRegisteredConfiguration(context)
  const candidates = (
    await locateTrades(context, { id, direction, repository: local.configuration.repository })
  ).filter((candidate) => candidate.root === local.repository.root)
  if (candidates.length !== 1) throw tradeError(`${direction} trade ${id} was not found in the current repository`)
  return { local, trade: candidates[0] as LocatedTrade }
}
