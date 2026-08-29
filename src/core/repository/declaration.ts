import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { REPOSITORY_DECLARATION_FILE } from '../configuration/index.ts'
import { KiError } from '../errors.ts'

export type RepositoryDeclarationState =
  | { readonly state: 'canonical'; readonly path: string }
  | { readonly state: 'unsafe'; readonly path: string }
  | { readonly state: 'absent' }

export const inspectRepositoryDeclarationState = async (root: string): Promise<RepositoryDeclarationState> => {
  const path = join(root, REPOSITORY_DECLARATION_FILE)
  const state = await lstat(path).catch(() => undefined)
  if (!state) return { state: 'absent' }
  return state.isFile() && !state.isSymbolicLink() ? { state: 'canonical', path } : { state: 'unsafe', path }
}

export const repositoryDeclarationError = (
  _root: string,
  state: Exclude<RepositoryDeclarationState, { readonly state: 'canonical' }>,
  absentMessage: string
): KiError =>
  state.state === 'unsafe' ? new KiError(`${state.path} must be a regular file`, 2) : new KiError(absentMessage, 2)

export const requireCanonicalRepositoryDeclaration = async (root: string, absentMessage: string): Promise<string> => {
  const state = await inspectRepositoryDeclarationState(root)
  if (state.state === 'canonical') return state.path
  throw repositoryDeclarationError(root, state, absentMessage)
}
