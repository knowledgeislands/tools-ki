import { readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import { parse } from 'yaml'
import { KiError } from '../errors.ts'

/**
 * The Cairn store's work packages, under the `ki-work-package` standard: each package at `work/<territory>/<id>/`, its
 * entry file `_index.md` and its change documents beside it, and each sub-package a folder of the same shape inside its
 * parent. Only `work/` is read, so the retired `work-legacy/` beside it never is; a package holds no other file `ki`
 * reads. Where the store sits on a rig is the rig's own setting: `MCP_CAIRN_STORE`, then `[store] path` in its Cairn
 * configuration.
 */
export const STORE_WORK = 'work'
export const PACKAGE_ENTRY = '_index.md'
export const CHANGE_DOCUMENT_SUFFIX = '.change.md'

/** The rig's Cairn configuration, which chezmoi renders and the Cairn app reads, under the user's XDG configuration home. */
const CAIRN_CONFIGURATION = join('cairn', 'config.toml')

export interface CairnConfiguration {
  /** The store clone, from `[store] path`, with a leading `~` expanded. */
  readonly store?: string
  /** This rig's name, from `[rig] name`. */
  readonly rig?: string
}

/** Reads the rig's Cairn configuration; a missing file reads as empty, a malformed one is an error naming it. */
export const readCairnConfiguration = async (configHome: string, home: string): Promise<CairnConfiguration> => {
  const path = join(configHome, CAIRN_CONFIGURATION)
  const text = await readFile(path, 'utf8').catch(() => undefined)
  if (text === undefined) return {}
  let values: Record<string, unknown>
  try {
    values = parseToml(text)
  } catch (error) {
    throw new KiError(`${path} is not valid TOML: ${(error as Error).message}`)
  }
  const table = (name: string): Record<string, unknown> => Object(values[name])
  const store = table('store')['path']
  const rig = table('rig')['name']
  return {
    ...(typeof store === 'string' ? { store: store.replace(/^~(?=$|\/)/, home) } : {}),
    ...(typeof rig === 'string' ? { rig } : {})
  }
}

/** The rig's store: `MCP_CAIRN_STORE`, then the rig's Cairn configuration, or undefined where neither names one. */
export const configuredCairnStore = (
  environment: NodeJS.ProcessEnv,
  configuration: CairnConfiguration,
  workingDirectory: string
): string | undefined => {
  const store = (environment['MCP_CAIRN_STORE'] || undefined) ?? configuration.store
  return store === undefined ? undefined : resolve(workingDirectory, store)
}

/** The store to read: the given folder, then the rig's store. */
export const resolveCairnStore = (
  given: string | undefined,
  environment: NodeJS.ProcessEnv,
  configuration: CairnConfiguration,
  workingDirectory: string
): string => {
  const store =
    given === undefined
      ? configuredCairnStore(environment, configuration, workingDirectory)
      : resolve(workingDirectory, given)
  if (store === undefined)
    throw new KiError(
      "no Cairn store: pass --store <dir>, set MCP_CAIRN_STORE, or set [store] path in the rig's cairn/config.toml",
      1
    )
  return store
}

/** A Markdown file's YAML front matter as a mapping, or undefined where it has none or it does not parse to one. */
export const frontMatter = (text: string): Record<string, unknown> | undefined => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (!match) return undefined
  try {
    const values: unknown = parse(match[1] as string)
    return values && typeof values === 'object' && !Array.isArray(values)
      ? (values as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

/** The directories in a folder, sorted; none where the folder cannot be read. */
export const directories = async (path: string): Promise<readonly string[]> =>
  (await readdir(path, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

/** One package or sub-package folder in the store, read but not yet judged against the standard. */
export interface StorePackage {
  /** The id its folder gives it: the folder name, or a sub-package's `<parent id>+<folder name>`. */
  readonly folderId: string
  /** The folder id of the package holding a sub-package; null for a package directly under its territory. */
  readonly enclosing: string | null
  /** The entry file's path within the store, as `work/ki/ki.tools/_index.md`. */
  readonly path: string
  /** The entry file's front matter, or undefined where it has none that reads as a mapping. */
  readonly fields: Record<string, unknown> | undefined
  /** The package's own change documents, by path within the store, sorted; a sub-package's are its own. */
  readonly changes: readonly string[]
}

export interface StorePackages {
  readonly packages: readonly StorePackage[]
  /** Each folder under a territory that holds no entry file. */
  readonly warnings: readonly string[]
}

/**
 * Reads every package under the store's `work/<territory>/`, and each sub-package inside it, in folder order: its entry
 * file's front matter and the names of its change documents. A folder inside a package without an entry file is not a
 * sub-package and is passed over. It writes nothing.
 */
export const readStorePackages = async (store: string): Promise<StorePackages> => {
  const packages: StorePackage[] = []
  const warnings: string[] = []
  const visit = async (relative: string, folderId: string, enclosing: string | null): Promise<void> => {
    const folder = join(store, relative)
    const text = await readFile(join(folder, PACKAGE_ENTRY), 'utf8').catch(() => undefined)
    if (text === undefined) {
      if (enclosing === null) warnings.push(`${relative}/ has no ${PACKAGE_ENTRY}`)
      return
    }
    const names = await readdir(folder, { withFileTypes: true })
    packages.push({
      folderId,
      enclosing,
      path: `${relative}/${PACKAGE_ENTRY}`,
      fields: frontMatter(text),
      changes: names
        .filter((entry) => entry.isFile() && entry.name.endsWith(CHANGE_DOCUMENT_SUFFIX))
        .map((entry) => `${relative}/${entry.name}`)
        .sort()
    })
    for (const name of await directories(folder)) await visit(`${relative}/${name}`, `${folderId}+${name}`, folderId)
  }
  for (const territory of await directories(join(store, STORE_WORK)))
    for (const name of await directories(join(store, STORE_WORK, territory)))
      await visit(`${STORE_WORK}/${territory}/${name}`, name, null)
  return { packages, warnings }
}
