import { lstat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { KnowledgeBaseStoreRole } from '../configuration/declaration.ts'
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
