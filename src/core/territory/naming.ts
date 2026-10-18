import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { parse } from 'smol-toml'
import { isRecord, REPOSITORY_DECLARATION_FILE } from '../configuration/index.ts'
import { conventionalStoreCandidates, type ExternalStoreRole, storeFix } from '../storage/index.ts'
import { skillTable, territoryDeclarationFrom } from './declaration.ts'

/**
 * The conventional names of a repository's managed sources store. A territory Capital is named by
 * its canonical territory handle, `territory_prefix` or else its registry key, and keeps its
 * historical repository-basename name for read-only discovery; any other repository has only the
 * basename. Aliases never name a store.
 */
export interface SourcesStoreNames {
  readonly capital: boolean
  /** A Capital's handle; absent for a non-Capital and for a prefixless, unregistered Capital. */
  readonly canonical?: string
  readonly historical: string
}

/**
 * Reads the repository declaration at `root`, which the caller has already selected and loaded. A
 * non-Capital names the store by basename; a Capital's territory metadata is validated, so
 * malformed naming metadata fails here.
 */
export const sourcesStoreNames = async (root: string, registryKey: string | undefined): Promise<SourcesStoreNames> => {
  const historical = basename(root)
  const path = join(root, REPOSITORY_DECLARATION_FILE)
  const document = parse(await readFile(path, 'utf8'))
  const declaration = skillTable(document, 'ki-repo')
  if (
    !isRecord(declaration) ||
    declaration['capital'] === undefined ||
    declaration['capital'] !== declaration['repository']
  )
    return { capital: false, historical }
  const canonical = territoryDeclarationFrom(document, path).territory?.prefix ?? registryKey
  return { capital: true, historical, ...(canonical ? { canonical } : {}) }
}

/** The names a read-only scan inspects, canonical first, without repeating an equal name. */
export const scannedSourcesStoreNames = (names: SourcesStoreNames): readonly string[] => [
  ...new Set([names.canonical, names.historical].filter((name): name is string => Boolean(name)))
]

/**
 * The fix for a declared store that is unavailable or missing on this host, naming a single matching
 * conventional folder when there is one. Unreadable naming metadata only loses the suggested path.
 */
export const repositoryStoreFix = async (
  homeDirectory: string,
  root: string,
  registryKey: string | undefined,
  role: ExternalStoreRole,
  bound: boolean
): Promise<string> => {
  const names = await sourcesStoreNames(root, registryKey).then(scannedSourcesStoreNames, () => [])
  return storeFix(root, role, await conventionalStoreCandidates(homeDirectory, role, names), bound)
}
