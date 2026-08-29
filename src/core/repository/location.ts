import { lstat, realpath } from 'node:fs/promises'
import { KiError } from '../errors.ts'
import { requireCanonicalRepositoryDeclaration } from './declaration.ts'

export interface RepositoryLocation {
  readonly root: string
  readonly declaration: string
}

export const physicalDirectory = async (path: string, error: string): Promise<string> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isDirectory() || state.isSymbolicLink()) throw new KiError(error, 2)
  return realpath(path)
}

export const targetFromDirectory = async (
  directory: string,
  directoryMessage: string,
  declarationMessage = directoryMessage
): Promise<RepositoryLocation> => {
  const root = await physicalDirectory(directory, directoryMessage)
  return { root, declaration: await requireCanonicalRepositoryDeclaration(root, declarationMessage) }
}
