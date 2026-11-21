import { readFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { parse } from 'smol-toml'
import { isRecord, REPOSITORY_DECLARATION_FILE } from '../configuration/index.ts'
import { conventionalStoreCandidates, type ExternalStoreRole, storeFix } from '../storage/index.ts'
import { skillTable, territoryDeclarationFrom } from './declaration.ts'

/**
 * The territory code of a checkout: the name of the folder it sits in, by the rigs' convention of
 * `~/kis/<territory code>/<repository>`, so `hnr` for `~/kis/hnr/hnr-principal`.
 */
export const territoryCode = (root: string): string => basename(dirname(root))

/**
 * The conventional names of a repository's managed sources store, each read as `sources-<name>` under
 * the OneDrive root (SOURCES-LAYOUT a). The current layout names every repository, Capital or not, by
 * its territory code and basename, `<territory code>/<repository>`. The fallback names come from the
 * layout before it and are only ever found, never created: a territory Capital's canonical territory
 * handle, `territory_prefix` or else its registry key, then the repository basename. The basename is
 * also how a store for a high-level purpose is found, such as `sources-inbox` for the `inbox`
 * repository. A fallback name equal to the territory code is the current layout's territory folder,
 * not a store, so it is left out. Aliases never name a store.
 */
export interface SourcesStoreNames {
  /** `<territory code>/<repository basename>`. */
  readonly conventional: string
  /** The older names, handle first, without repeating an equal name. */
  readonly fallback: readonly string[]
}

/**
 * Reads the repository declaration at `root`, which the caller has already selected and loaded. A
 * Capital's territory metadata is validated, so malformed naming metadata fails here.
 */
export const sourcesStoreNames = async (root: string, registryKey: string | undefined): Promise<SourcesStoreNames> => {
  const repository = basename(root)
  const territory = territoryCode(root)
  const handle = await capitalHandle(root, registryKey)
  return {
    conventional: `${territory}/${repository}`,
    fallback: [...new Set([handle, repository])].filter(
      (name): name is string => name !== undefined && name !== territory
    )
  }
}

/** A Capital's canonical territory handle; absent for a non-Capital and for a prefixless, unregistered Capital. */
const capitalHandle = async (root: string, registryKey: string | undefined): Promise<string | undefined> => {
  const path = join(root, REPOSITORY_DECLARATION_FILE)
  const document = parse(await readFile(path, 'utf8'))
  const declaration = skillTable(document, 'ki-repo')
  if (
    !isRecord(declaration) ||
    declaration['capital'] === undefined ||
    declaration['capital'] !== declaration['repository']
  )
    return undefined
  return territoryDeclarationFrom(document, path).territory?.prefix ?? registryKey
}

/** The names a read-only scan inspects: the current layout first, then the fallback names. */
export const scannedSourcesStoreNames = (names: SourcesStoreNames): readonly string[] => [
  names.conventional,
  ...names.fallback
]

/**
 * The fix for a declared store that is unavailable or missing on this host. It names the current
 * layout's folder when that exists, or else a single matching fallback folder. Unreadable naming
 * metadata only loses the suggested path.
 */
export const repositoryStoreFix = async (
  homeDirectory: string,
  root: string,
  registryKey: string | undefined,
  role: ExternalStoreRole,
  bound: boolean
): Promise<string> => {
  const names = await sourcesStoreNames(root, registryKey).catch(() => undefined)
  if (!names) return storeFix(root, role, [], bound)
  const current = await conventionalStoreCandidates(homeDirectory, role, [names.conventional])
  return storeFix(
    root,
    role,
    current.length ? current : await conventionalStoreCandidates(homeDirectory, role, names.fallback),
    bound
  )
}
