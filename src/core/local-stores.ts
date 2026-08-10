import { lstat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { KiError } from './errors.ts'
import type { LocalRegistryEntry } from './local-registry.ts'

export const sourceStoreDirectory = async (path: string): Promise<string> => {
  if (!isAbsolute(path)) throw new KiError('sources store must be an absolute path', 1)
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isDirectory() || state.isSymbolicLink())
    throw new KiError('sources store must be an existing direct directory', 1)
  return path
}

export const registeredKnowledgeBaseStoreRoots = async (
  entry: LocalRegistryEntry | undefined
): Promise<readonly string[]> => {
  const sources = entry?.stores?.sources
  if (!sources) throw new KiError('declared sources store is not registered', 1)
  return [await sourceStoreDirectory(sources)]
}
