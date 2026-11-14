import { readFile, writeFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { parse } from 'smol-toml'
import { KiError } from '../errors.ts'
import { notice } from '../notices.ts'
import { isRecord } from './declaration.ts'
import { renameTomlKey } from './toml-edit.ts'

/**
 * Whether a repository declaration's retired `[repo] harnesses` key was renamed to `backpacks`:
 * `renamed`, or would be under a dry run; `manual` when the file spells it in a way a text edit
 * cannot safely change, such as a dotted or inline `repo` table; `none` when there is nothing to
 * rename, including a file that does not parse, which the declaration reader then reports.
 */
export type RetiredRepositoryKeyRename = 'none' | 'renamed' | 'manual'

/** Renames a declaration's retired `[repo] harnesses` key to `backpacks`, editing only that key. */
export const renameRetiredRepositoryKey = async (
  configurationPath: string,
  dryRun: boolean
): Promise<RetiredRepositoryKeyRename> => {
  const before = await readFile(configurationPath, 'utf8')
  let parsed: Record<string, unknown>
  try {
    parsed = parse(before)
  } catch {
    return 'none'
  }
  const repository = parsed['repo']
  if (!isRecord(repository) || !('harnesses' in repository) || 'backpacks' in repository) return 'none'
  const after = renameTomlKey(before, ['repo'], 'harnesses', 'backpacks')
  const renamed = parse(after)['repo']
  const { harnesses, ...rest } = repository
  // The parser's tables have no prototype, so compare plain copies.
  const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value))
  if (!isDeepStrictEqual(plain(renamed), plain({ ...rest, backpacks: harnesses }))) return 'manual'
  if (!dryRun) await writeFile(configurationPath, after, 'utf8')
  return 'renamed'
}

/**
 * The user configuration's `[backpacks]` table, read from the retired `[harnesses]` table for one
 * release with a warning; a file declaring both is refused, since neither can be preferred safely.
 */
export const configuredBackpacksTable = (configuration: Record<string, unknown>): unknown => {
  const current = configuration['backpacks']
  const retired = configuration['harnesses']
  if (current !== undefined && retired !== undefined)
    throw new KiError('ki configuration must declare [backpacks] only; remove its retired [harnesses] table', 1)
  if (retired !== undefined) notice('ki configuration uses the retired [harnesses] table; rename it to [backpacks]')
  return current ?? retired
}
