import { lstat, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import {
  REPOSITORY_DECLARATION_FILE,
  type RepositoryDeclaration,
  readRepositoryDeclaration
} from '../configuration/index.ts'
import { KiError } from '../errors.ts'
import { canonicalRepositoryIdentity, type LocalRegistryEntry, requiredLocalRegistry } from '../storage/index.ts'

export interface RegisteredRepository {
  readonly key: string
  readonly root: string
  readonly repository: string
  readonly declaration: RepositoryDeclaration
}

export interface RegisteredRepositoryInventory {
  readonly repositories: readonly RegisteredRepository[]
  readonly failuresByRepository: ReadonlyMap<string, KiError>
}

type RegisteredRepositoryInspection =
  | { readonly state: 'available'; readonly repository: RegisteredRepository }
  | { readonly state: 'unavailable'; readonly error: KiError }

export const agoraError = (root: string, message: string): KiError =>
  new KiError(`registered repository ${root} ${message}`, 2)

export const skillConfiguration = (
  declaration: RepositoryDeclaration,
  name: string
): Readonly<Record<string, unknown>> | undefined =>
  declaration.skills.find((skill) => skill.name === name)?.configuration

const inspectRegisteredRepository = async (registered: LocalRegistryEntry): Promise<RegisteredRepositoryInspection> => {
  const state = await lstat(registered.path).catch(() => undefined)
  if (!state?.isDirectory() || state.isSymbolicLink())
    return { state: 'unavailable', error: agoraError(registered.path, 'must be an existing physical directory') }
  const root = await realpath(registered.path)
  const declarationPath = join(root, REPOSITORY_DECLARATION_FILE)
  const declarationState = await lstat(declarationPath).catch(() => undefined)
  if (!declarationState?.isFile() || declarationState.isSymbolicLink())
    return {
      state: 'unavailable',
      error: agoraError(root, `must contain a physical ${REPOSITORY_DECLARATION_FILE}`)
    }
  let declaration: RepositoryDeclaration
  try {
    declaration = await readRepositoryDeclaration(declarationPath)
  } catch (error) {
    return {
      state: 'unavailable',
      error: agoraError(root, `has invalid ${REPOSITORY_DECLARATION_FILE}: ${(error as Error).message}`)
    }
  }
  const configuration = skillConfiguration(declaration, 'ki-repo')
  const identity = configuration?.['repository']
  if (!canonicalRepositoryIdentity(identity))
    return {
      state: 'unavailable',
      error: agoraError(root, '[skills.ki-repo].repository must be a canonical HTTPS GitHub repository')
    }
  if (identity !== registered.repository)
    return {
      state: 'unavailable',
      error: agoraError(root, `declares ${identity}, but its local registry identity is ${registered.repository}`)
    }
  return {
    state: 'available',
    repository: { key: registered.key, root, repository: identity, declaration }
  }
}

export const registeredRepositories = async (stateDirectory: string): Promise<readonly RegisteredRepository[]> => {
  const repositories: RegisteredRepository[] = []
  for (const registered of await requiredLocalRegistry(stateDirectory)) {
    const inspection = await inspectRegisteredRepository(registered)
    if (inspection.state === 'unavailable') throw inspection.error
    repositories.push(inspection.repository)
  }

  const keys = new Set<string>()
  const identities = new Set<string>()
  for (const repository of repositories) {
    // requiredLocalRegistry rejects duplicate keys and identities before this resolver runs.
    /* v8 ignore next */
    if (keys.has(repository.key))
      throw new KiError(`registered estate repeats local repository key ${repository.key}`, 2)
    // requiredLocalRegistry rejects duplicate keys and identities before this resolver runs.
    /* v8 ignore next */
    if (identities.has(repository.repository))
      throw new KiError(`registered estate repeats canonical repository ${repository.repository}`, 2)
    keys.add(repository.key)
    identities.add(repository.repository)
  }
  return repositories.sort((left, right) => left.key.localeCompare(right.key, 'en'))
}

export const availableRegisteredRepositories = async (
  stateDirectory: string
): Promise<RegisteredRepositoryInventory> => {
  const repositories: RegisteredRepository[] = []
  const failuresByRepository = new Map<string, KiError>()
  for (const registered of await requiredLocalRegistry(stateDirectory)) {
    const inspection = await inspectRegisteredRepository(registered)
    if (inspection.state === 'available') repositories.push(inspection.repository)
    else failuresByRepository.set(registered.repository, inspection.error)
  }
  return {
    repositories: repositories.sort((left, right) => left.key.localeCompare(right.key, 'en')),
    failuresByRepository
  }
}
