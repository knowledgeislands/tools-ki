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

export const registeredKnowledgeBaseStoreRoots = async (
  entry: LocalRegistryEntry | undefined,
  roles: readonly ExternalStoreRole[]
): Promise<readonly string[]> => {
  const roots: string[] = []
  for (const role of roles) {
    const path = entry?.stores?.[role]
    if (!path) throw new KiError(`declared ${role} store is not bound`, 1)
    roots.push(await repositoryStoreDirectory(role, path))
  }
  return roots
}
