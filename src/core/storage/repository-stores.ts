import { lstat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
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

export interface RepositoryStoreBinding {
  readonly role: KnowledgeBaseStoreRole
  readonly path?: string
  readonly state: 'bound' | 'unbound'
}

export interface RepositoryStoreInventory {
  readonly repository: string
  readonly identity: string
  readonly stores: readonly RepositoryStoreBinding[]
}

export const externalStoreRoles = (roles: readonly KnowledgeBaseStoreRole[]): readonly ExternalStoreRole[] =>
  roles.filter((role): role is ExternalStoreRole => role !== 'notes')

export const repositoryStoreInventory = (
  root: string,
  identity: string,
  roles: readonly KnowledgeBaseStoreRole[],
  entries: readonly LocalRegistryEntry[]
): RepositoryStoreInventory => {
  const entry = entries.find((candidate) => candidate.repository === identity && candidate.path === root)
  return {
    repository: root,
    identity,
    stores: roles.map((role) => {
      const path = role === 'notes' ? root : entry?.stores?.[role]
      return { role, ...(path ? { path } : {}), state: path ? 'bound' : 'unbound' }
    })
  }
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
  return { ...base, stores: { ...base.stores, [role]: path } }
}

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

export const conventionalSourcesStore = (homeDirectory: string, repository: string): string =>
  join(homeDirectory, 'Library', 'CloudStorage', 'OneDrive-Personal', `sources-${basename(repository)}`)

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
}

/** Inspect conventional directories only; declaration and binding decisions remain with each repository. */
export const inspectUndeclaredSourcesStores = async (
  entries: readonly SourcesStoreTarget[],
  homeDirectory: string
): Promise<SourcesStoreInspection> => {
  const undeclared: UndeclaredSourcesStore[] = []
  const diagnostics: SourcesStoreDiagnostic[] = []
  for (const entry of entries) {
    const path = conventionalSourcesStore(homeDirectory, entry.path)
    try {
      const state = await lstat(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return undefined
        throw error
      })
      if (!state) continue
      if (!state.isDirectory() || state.isSymbolicLink())
        throw new KiError('conventional sources path is not a direct directory', 1)
      const parent = await lstat(dirname(path))
      if (!parent.isDirectory() || parent.isSymbolicLink())
        throw new KiError('OneDrive source-store root is not a direct directory', 1)
      const root = await lstat(entry.path)
      if (!root.isDirectory() || root.isSymbolicLink())
        throw new KiError('repository root is not a direct directory', 1)
      const declarationPath = join(entry.path, REPOSITORY_DECLARATION_FILE)
      const declarationState = await lstat(declarationPath).catch(() => undefined)
      if (!declarationState?.isFile() || declarationState.isSymbolicLink())
        throw new KiError('repository declaration is not a direct file', 1)
      const declaration = await readRepositoryDeclaration(declarationPath)
      const identity = declaredRepositoryIdentity(declaration)
      if (entry.repository && identity !== entry.repository)
        throw new KiError('repository declaration does not match its registered identity', 1)
      const kind = declaredRepositoryKind(declaration)
      if (declaredKnowledgeBaseStoreRoles(declaration).includes('sources')) continue
      undeclared.push({ repository: identity, root: entry.path, path, kind })
    } catch (error) {
      diagnostics.push({ repository: entry.repository ?? entry.path, path, message: (error as Error).message })
    }
  }
  return { undeclared, diagnostics }
}

export const managedSourcesStore = async (homeDirectory: string, repository: string): Promise<string> => {
  const root = join(homeDirectory, 'Library', 'CloudStorage', 'OneDrive-Personal')
  const state = await lstat(root).catch(() => undefined)
  if (!state?.isDirectory() || state.isSymbolicLink())
    throw new KiError(`OneDrive source-store root is unavailable: ${root}`, 1)
  const path = conventionalSourcesStore(homeDirectory, repository)
  const store = await lstat(path).catch(() => undefined)
  if (store && (!store.isDirectory() || store.isSymbolicLink()))
    throw new KiError('sources store path must be absent or an existing direct directory', 1)
  return path
}

export const validateRepositoryStore = repositoryStoreDirectory
