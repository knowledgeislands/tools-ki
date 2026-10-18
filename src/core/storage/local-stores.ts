import { lstat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import type { KnowledgeBaseStoreRole } from '../configuration/declaration.ts'
import { KiError } from '../errors.ts'
import type { LocalRegistryEntry } from './local-registry.ts'

export type ExternalStoreRole = Exclude<KnowledgeBaseStoreRole, 'notes'>

export const repositoryStoreDirectory = async (role: ExternalStoreRole, path: string): Promise<string> => {
  if (!isAbsolute(path)) throw new KiError(`${role} store must be an absolute path`, 1)
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isDirectory() || state.isSymbolicLink())
    throw new KiError(`${role} store must be an existing direct directory`, 1)
  return path
}

export type KnowledgeBaseStoreAvailability =
  | { readonly role: ExternalStoreRole; readonly root: string }
  | { readonly role: ExternalStoreRole; readonly absent: true }
  | { readonly role: ExternalStoreRole; readonly unavailable: string; readonly bound: boolean }

/**
 * Report each declared external store as its validated root, absent on this host by choice, or the
 * reason it is unavailable: unbound without a marker, or bound to a path that is not a directory.
 */
export const knowledgeBaseStoreAvailability = async (
  entry: LocalRegistryEntry | undefined,
  roles: readonly ExternalStoreRole[]
): Promise<readonly KnowledgeBaseStoreAvailability[]> => {
  const stores: KnowledgeBaseStoreAvailability[] = []
  for (const role of roles) {
    const path = entry?.stores?.[role]
    if (!path)
      stores.push(
        entry?.absentStores?.includes(role) ? { role, absent: true } : { role, unavailable: 'not bound', bound: false }
      )
    else
      stores.push(
        await repositoryStoreDirectory(role, path).then(
          (root) => ({ role, root }),
          (error: Error) => ({ role, unavailable: error.message, bound: true })
        )
      )
  }
  return stores
}
