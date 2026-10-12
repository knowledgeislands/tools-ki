import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import { KiError } from '../errors.ts'

/** A Capital key or `territory_prefix`; the registry key grammar admits both. */
const HANDLE = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Reads the user's optional `[territories] ranking` from `config.toml`, the personal order in which
 * territories are listed, selected and opened. Like the MCP inventory reader it leaves a missing,
 * irregular or unparseable file to the harness registry reader, but validates a present table
 * strictly so a mistyped ranking never silently falls back to the derived order.
 */
export const readTerritoryRanking = async (configurationDirectory: string): Promise<readonly string[]> => {
  const path = join(configurationDirectory, 'config.toml')
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isFile()) return []
  let parsed: unknown
  try {
    parsed = parse(await readFile(path, 'utf8'))
  } catch {
    return []
  }
  // A successfully parsed TOML document is always a table; this only guards a future parser change.
  /* v8 ignore next */
  if (!isRecord(parsed)) return []
  const territories = parsed['territories']
  if (territories === undefined) return []
  if (!isRecord(territories)) throw new KiError('ki configuration territories must be a TOML table', 1)
  for (const key of Object.keys(territories))
    if (key !== 'ranking') throw new KiError(`ki configuration territories has unrecognised key ${key}`, 1)
  const ranking = territories['ranking']
  if (ranking === undefined) return []
  if (!Array.isArray(ranking) || ranking.some((handle) => typeof handle !== 'string' || !HANDLE.test(handle)))
    throw new KiError('ki configuration territories.ranking must be an array of territory handles', 1)
  const seen = new Set<string>()
  for (const handle of ranking as readonly string[]) {
    if (seen.has(handle)) throw new KiError(`ki configuration territories.ranking repeats ${handle}`, 1)
    seen.add(handle)
  }
  return ranking as readonly string[]
}
