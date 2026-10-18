import { lstat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { KnowledgeBaseStoreRole } from '../configuration/declaration.ts'
import {
  declaredKnowledgeBaseStoreRoles,
  declaredRepositoryIdentity,
  declaredRepositoryKind,
  REPOSITORY_DECLARATION_FILE,
  readRepositoryDeclaration
} from '../configuration/declaration.ts'
import { KiError } from '../errors.ts'
import type { LocalRegistryEntry } from './local-registry.ts'
import { registryEntry } from './local-registry.ts'
import type { ExternalStoreRole } from './local-stores.ts'
import { repositoryStoreDirectory } from './local-stores.ts'

/** Whether a store can be used on this host: a bound store is available or not, an unbound one absent by choice or missing. */
export type RepositoryStoreAvailability = 'available' | 'unavailable' | 'absent' | 'missing'

export interface RepositoryStoreBinding {
  readonly role: KnowledgeBaseStoreRole
  readonly path?: string
  readonly state: 'bound' | 'unbound'
  readonly availability: RepositoryStoreAvailability
  readonly reason?: string
}

export interface RepositoryStoreInventory {
  readonly repository: string
  readonly identity: string
  readonly stores: readonly RepositoryStoreBinding[]
}

export const externalStoreRoles = (roles: readonly KnowledgeBaseStoreRole[]): readonly ExternalStoreRole[] =>
  roles.filter((role): role is ExternalStoreRole => role !== 'notes')

export const repositoryStoreInventory = async (
  root: string,
  identity: string,
  roles: readonly KnowledgeBaseStoreRole[],
  entries: readonly LocalRegistryEntry[]
): Promise<RepositoryStoreInventory> => {
  const entry = entries.find((candidate) => candidate.repository === identity && candidate.path === root)
  const stores: RepositoryStoreBinding[] = []
  for (const role of roles) {
    if (role === 'notes') {
      stores.push({ role, path: root, state: 'bound', availability: 'available' })
      continue
    }
    const path = entry?.stores?.[role]
    if (!path) {
      stores.push({ role, state: 'unbound', availability: entry?.absentStores?.includes(role) ? 'absent' : 'missing' })
      continue
    }
    stores.push(
      await repositoryStoreDirectory(role, path).then(
        () => ({ role, path, state: 'bound' as const, availability: 'available' as const }),
        (error: Error) => ({
          role,
          path,
          state: 'bound' as const,
          availability: 'unavailable' as const,
          reason: error.message
        })
      )
    )
  }
  return { repository: root, identity, stores }
}

/**
 * The commands that settle an unavailable or missing store: bind it, naming the path when exactly one
 * conventional folder matches, or record that this host does without it, unbinding a bound role first
 * because `store absent` refuses one.
 */
export const storeFix = (
  root: string,
  role: ExternalStoreRole,
  candidates: readonly string[],
  bound: boolean
): string =>
  `ki repo --repo ${root} store bind ${role} ${candidates.length === 1 ? candidates[0] : '<absolute-path>'} --write, or ${bound ? `ki repo --repo ${root} store unbind ${role} --write then ` : ''}ki repo --repo ${root} store absent ${role} --write`

/** Existing conventional `sources-<name>` folders for the given names; only the sources role has a convention. */
export const conventionalStoreCandidates = async (
  homeDirectory: string,
  role: ExternalStoreRole,
  names: readonly string[]
): Promise<readonly string[]> => {
  if (role !== 'sources') return []
  const candidates: string[] = []
  for (const path of new Set(names.map((name) => conventionalSourcesStore(homeDirectory, name)))) {
    const state = await lstat(path).catch(() => undefined)
    if (state?.isDirectory() && !state.isSymbolicLink()) candidates.push(path)
  }
  return candidates
}

export const registryEntryForRepository = (
  root: string,
  identity: string,
  entries: readonly LocalRegistryEntry[]
): LocalRegistryEntry =>
  entries.find((candidate) => candidate.repository === identity && candidate.path === root) ??
  registryEntry(root, identity)

export const bindRepositoryStore = (
  root: string,
  identity: string,
  role: ExternalStoreRole,
  path: string,
  entries: readonly LocalRegistryEntry[]
): LocalRegistryEntry => {
  const base = registryEntryForRepository(root, identity, entries)
  return withAbsentStores({ ...base, stores: { ...base.stores, [role]: path } }, (roles) =>
    roles.filter((candidate) => candidate !== role)
  )
}

const withAbsentStores = (
  entry: LocalRegistryEntry,
  change: (roles: readonly ExternalStoreRole[]) => readonly ExternalStoreRole[]
): LocalRegistryEntry => {
  const roles = [...change(entry.absentStores ?? [])].sort()
  const { absentStores: _, ...rest } = entry
  return roles.length ? { ...rest, absentStores: roles } : rest
}

/** Record, or with `clear` remove, that this host deliberately does without an unbound store. */
export const markRepositoryStoreAbsent = (
  root: string,
  identity: string,
  role: ExternalStoreRole,
  clear: boolean,
  entries: readonly LocalRegistryEntry[]
): LocalRegistryEntry =>
  withAbsentStores(registryEntryForRepository(root, identity, entries), (roles) =>
    clear ? roles.filter((candidate) => candidate !== role) : [...new Set([...roles, role])]
  )

export const unbindRepositoryStore = (
  root: string,
  identity: string,
  role: ExternalStoreRole,
  entries: readonly LocalRegistryEntry[]
): LocalRegistryEntry => {
  const base = registryEntryForRepository(root, identity, entries)
  const stores = { ...base.stores }
  delete stores[role]
  return { ...base, ...(Object.keys(stores).length ? { stores } : { stores: undefined }) }
}

const sourcesStoreRoot = (homeDirectory: string): string =>
  join(homeDirectory, 'Library', 'CloudStorage', 'OneDrive-Personal')

/** The conventional source-store directory for a store name, such as a territory handle or basename. */
export const conventionalSourcesStore = (homeDirectory: string, name: string): string =>
  join(sourcesStoreRoot(homeDirectory), `sources-${name}`)

export interface UndeclaredSourcesStore {
  readonly repository: string
  readonly root: string
  readonly path: string
  readonly kind: 'project' | 'kb'
}

export interface SourcesStoreDiagnostic {
  readonly repository: string
  readonly path: string
  readonly message: string
}

export interface SourcesStoreInspection {
  readonly undeclared: readonly UndeclaredSourcesStore[]
  readonly diagnostics: readonly SourcesStoreDiagnostic[]
}

export interface SourcesStoreTarget {
  readonly path: string
  readonly repository?: string
  /** Conventional store names to inspect, in order; a naming failure becomes this target's diagnostic. */
  readonly names: () => Promise<readonly string[]>
}

/** Inspect conventional directories only; declaration and binding decisions remain with each repository. */
export const inspectUndeclaredSourcesStores = async (
  entries: readonly SourcesStoreTarget[],
  homeDirectory: string
): Promise<SourcesStoreInspection> => {
  const undeclared: UndeclaredSourcesStore[] = []
  const diagnostics: SourcesStoreDiagnostic[] = []
  for (const entry of entries) {
    let names: readonly string[]
    try {
      names = await entry.names()
    } catch (error) {
      diagnostics.push({
        repository: entry.repository ?? entry.path,
        path: join(entry.path, REPOSITORY_DECLARATION_FILE),
        message: (error as Error).message
      })
      continue
    }
    for (const name of names)
      await inspectSourcesStore(entry, conventionalSourcesStore(homeDirectory, name), undeclared, diagnostics)
  }
  return { undeclared, diagnostics }
}

/** Inspect one conventional directory, rechecking the repository after the directory is seen. */
const inspectSourcesStore = async (
  entry: SourcesStoreTarget,
  path: string,
  undeclared: UndeclaredSourcesStore[],
  diagnostics: SourcesStoreDiagnostic[]
): Promise<void> => {
  try {
    const state = await lstat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined
      throw error
    })
    if (!state) return
    if (!state.isDirectory() || state.isSymbolicLink())
      throw new KiError('conventional sources path is not a direct directory', 1)
    const parent = await lstat(dirname(path))
    if (!parent.isDirectory() || parent.isSymbolicLink())
      throw new KiError('OneDrive source-store root is not a direct directory', 1)
    const root = await lstat(entry.path)
    if (!root.isDirectory() || root.isSymbolicLink()) throw new KiError('repository root is not a direct directory', 1)
    const declarationPath = join(entry.path, REPOSITORY_DECLARATION_FILE)
    const declarationState = await lstat(declarationPath).catch(() => undefined)
    if (!declarationState?.isFile() || declarationState.isSymbolicLink())
      throw new KiError('repository declaration is not a direct file', 1)
    const declaration = await readRepositoryDeclaration(declarationPath)
    const identity = declaredRepositoryIdentity(declaration)
    if (entry.repository && identity !== entry.repository)
      throw new KiError('repository declaration does not match its registered identity', 1)
    const kind = declaredRepositoryKind(declaration)
    if (declaredKnowledgeBaseStoreRoles(declaration).includes('sources')) return
    undeclared.push({ repository: identity, root: entry.path, path, kind })
  } catch (error) {
    diagnostics.push({ repository: entry.repository ?? entry.path, path, message: (error as Error).message })
  }
}

/** The managed store path; where the OneDrive root is missing the refusal names `fix`, the routes that remain. */
export const managedSourcesStore = async (homeDirectory: string, name: string, fix: string): Promise<string> => {
  const root = sourcesStoreRoot(homeDirectory)
  const state = await lstat(root).catch(() => undefined)
  if (!state?.isDirectory() || state.isSymbolicLink())
    throw new KiError(`OneDrive source-store root is unavailable: ${root}; fix: ${fix}`, 1)
  const path = conventionalSourcesStore(homeDirectory, name)
  const store = await lstat(path).catch(() => undefined)
  if (store && (!store.isDirectory() || store.isSymbolicLink()))
    throw new KiError('sources store path must be absent or an existing direct directory', 1)
  return path
}

export const validateRepositoryStore = repositoryStoreDirectory
