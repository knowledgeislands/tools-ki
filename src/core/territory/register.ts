import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import { HANDLE } from './ranking.ts'

/** The store's territory register: one folder per territory, named by its code, each with its `_index.md`. */
const REGISTER = join('roster', 'territories')
const ENTRY = '_index.md'

/** One ranked territory in the register: its code and the `ki` handle local files join it by. */
interface RankedTerritory {
  readonly code: string
  readonly handle: string
  readonly rank: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The record's front matter, or why it cannot be read as one. */
const frontMatter = (text: string): Record<string, unknown> | string => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (!match) return 'no front matter'
  try {
    const fields: unknown = parse(match[1] as string)
    return isRecord(fields) ? fields : 'front matter holds no fields'
  } catch {
    return 'front matter is not valid YAML'
  }
}

/** A ranked territory from one record, undefined where it settles no rank or handle yet, or why it is malformed. */
const rankedTerritory = (code: string, fields: Record<string, unknown>): RankedTerritory | undefined | string => {
  if (fields['ki-id'] !== `territory:${code}`) return `ki-id is not territory:${code}`
  const { 'ki-rank': rank, 'ki-handle': handle } = fields
  if (rank !== undefined && rank !== null && !(Number.isSafeInteger(rank) && (rank as number) > 0))
    return 'ki-rank is not a positive integer'
  if (handle !== undefined && handle !== null && !(typeof handle === 'string' && HANDLE.test(handle)))
    return 'ki-handle is not a territory handle'
  // A fact not yet settled is left out of its record, so a record without both cannot rank a Capital.
  if (typeof rank !== 'number' || typeof handle !== 'string') return undefined
  return { code, handle, rank }
}

/**
 * The handles the Cairn store's territory register ranks, `ki-rank` order, 1 first, then code.
 * Undefined where the store holds no register; a missing or malformed record is passed over, with
 * a warning for a malformed one, so its territory falls back to the configuration ranking.
 */
export const readRegisterRanking = async (
  store: string,
  warn?: (message: string) => void
): Promise<readonly string[] | undefined> => {
  const root = join(store, REGISTER)
  const folders = await readdir(root, { withFileTypes: true }).catch(() => undefined)
  if (!folders) return undefined
  const ranked: RankedTerritory[] = []
  for (const folder of folders.filter((entry) => entry.isDirectory()).map((entry) => entry.name)) {
    const path = join(root, folder, ENTRY)
    const text = await readFile(path, 'utf8').catch(() => undefined)
    if (text === undefined) continue
    const fields = frontMatter(text)
    const territory = typeof fields === 'string' ? fields : rankedTerritory(folder, fields)
    if (typeof territory === 'string')
      warn?.(`territory register record ${path}: ${territory}; its territory keeps its configuration rank`)
    else if (territory) ranked.push(territory)
  }
  ranked.sort((left, right) => left.rank - right.rank || left.code.localeCompare(right.code, 'en'))
  const handles: string[] = []
  for (const { handle } of ranked) if (!handles.includes(handle)) handles.push(handle)
  return handles
}
