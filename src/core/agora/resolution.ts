import { KiError } from '../errors.ts'
import type { Environment } from '../paths.ts'
import type { Runner } from '../runtime/runner.ts'
import {
  AGORA_ID,
  type AgoraCandidate,
  homeDeclaration,
  homeDeclarationEntries,
  kiErrorMessage,
  membersFromHome,
  profileError
} from './declarations.ts'
import { duplicateOwnersError, ESTATE_AGORA, estate, profileFromHome } from './profiles.ts'
import { requiredReferenceAssociations } from './reference-associations.ts'
import { availableRegisteredRepositories, registeredRepositories } from './repository-inventory.ts'

export { auditAgoras } from './health.ts'

export type AgoraRootKind = 'owner' | 'member' | 'reference'

export interface AgoraRoot {
  readonly key: string
  readonly root: string
  readonly repository: string
  readonly kind: AgoraRootKind
}

export interface AgoraMember extends AgoraRoot {
  readonly kind: 'owner' | 'member'
  readonly role?: string
}

export interface AgoraReference extends AgoraRoot {
  readonly kind: 'reference'
}

export type AgoraReferenceDiagnosticStatus = 'unassociated' | 'missing' | 'ambiguous' | 'remote-mismatch'

export interface AgoraReferenceDiagnostic {
  readonly repository: string
  readonly status: AgoraReferenceDiagnosticStatus
  readonly detail: string
}

export interface AgoraRuntime {
  readonly runner: Runner
  readonly environment: Environment
}

export interface AgoraProfile {
  readonly id: string
  readonly name: string
  readonly purpose: string
  readonly home?: AgoraMember
  readonly members: readonly AgoraMember[]
  readonly references: readonly AgoraReference[]
  readonly roots: readonly AgoraRoot[]
  readonly referenceDiagnostics: readonly AgoraReferenceDiagnostic[]
  readonly system: boolean
}

export interface AgoraListReport {
  readonly profiles: readonly AgoraProfile[]
  readonly broken: readonly string[]
}

export interface AgoraHealthProfile {
  readonly id: string
  readonly findings: readonly string[]
}

export interface AgoraHealthReport {
  readonly profiles: readonly AgoraHealthProfile[]
  readonly estateFindings: readonly string[]
}

export const listAgoras = async (stateDirectory: string, runtime: AgoraRuntime): Promise<AgoraListReport> => {
  const repositories = await registeredRepositories(stateDirectory)
  const associations = await requiredReferenceAssociations(stateDirectory)
  const declarations: AgoraCandidate[] = []
  const broken: string[] = []
  for (const home of repositories) {
    let entries: readonly (readonly [string, unknown])[]
    try {
      entries = homeDeclarationEntries(home)
    } catch (error) {
      broken.push(kiErrorMessage(error))
      continue
    }
    for (const [id, value] of entries) {
      try {
        declarations.push({ home, declaration: homeDeclaration(home, id, value) })
      } catch (error) {
        broken.push(kiErrorMessage(error))
      }
    }
  }

  const byId = new Map<string, typeof declarations>()
  for (const candidate of declarations)
    byId.set(candidate.declaration.id, [...(byId.get(candidate.declaration.id) ?? []), candidate])

  const profiles: AgoraProfile[] = []
  for (const [id, candidates] of byId) {
    if (candidates.length > 1) {
      broken.push(
        duplicateOwnersError(
          id,
          candidates.map((candidate) => candidate.home.repository)
        ).message
      )
      continue
    }
    const candidate = candidates[0] as AgoraCandidate
    try {
      profiles.push(await profileFromHome(candidate.home, candidate.declaration, repositories, associations, runtime))
    } catch (error) {
      broken.push(kiErrorMessage(error))
    }
  }

  return {
    profiles: [estate(repositories), ...profiles.sort((left, right) => left.id.localeCompare(right.id, 'en'))],
    broken: broken.sort((left, right) => left.localeCompare(right, 'en'))
  }
}

export const resolveAgora = async (
  stateDirectory: string,
  id: string,
  runtime: AgoraRuntime
): Promise<AgoraProfile> => {
  if (!AGORA_ID.test(id)) throw new KiError('Agora name must use lower-case letters, numbers, and hyphens', 2)
  if (id === ESTATE_AGORA) return estate(await registeredRepositories(stateDirectory))
  const { repositories, failuresByRepository } = await availableRegisteredRepositories(stateDirectory)
  const associations = await requiredReferenceAssociations(stateDirectory)
  const candidates: AgoraCandidate[] = []
  for (const home of repositories) {
    let entries: readonly (readonly [string, unknown])[]
    try {
      entries = homeDeclarationEntries(home)
    } catch (error) {
      kiErrorMessage(error)
      continue
    }
    for (const [candidateId, value] of entries) {
      if (candidateId === id) candidates.push({ home, declaration: homeDeclaration(home, candidateId, value) })
    }
  }
  if (!candidates.length) throw profileError(id, 'is not declared by a registered Agora home')
  if (candidates.length > 1)
    throw duplicateOwnersError(
      id,
      candidates.map((candidate) => candidate.home.repository)
    )
  const candidate = candidates[0] as AgoraCandidate
  for (const member of Object.keys(candidate.declaration.members)) {
    const failure = failuresByRepository.get(member)
    if (failure) throw failure
  }
  return profileFromHome(candidate.home, candidate.declaration, repositories, associations, runtime)
}

export const resolveAgoraMembers = async (stateDirectory: string, id: string): Promise<readonly AgoraMember[]> => {
  if (!AGORA_ID.test(id)) throw new KiError('Agora name must use lower-case letters, numbers, and hyphens', 2)
  if (id === ESTATE_AGORA) return estate(await registeredRepositories(stateDirectory)).members
  const { repositories, failuresByRepository } = await availableRegisteredRepositories(stateDirectory)
  const candidates: AgoraCandidate[] = []
  for (const home of repositories) {
    let entries: readonly (readonly [string, unknown])[]
    try {
      entries = homeDeclarationEntries(home)
    } catch (error) {
      kiErrorMessage(error)
      continue
    }
    for (const [candidateId, value] of entries)
      if (candidateId === id) candidates.push({ home, declaration: homeDeclaration(home, candidateId, value) })
  }
  if (!candidates.length) throw profileError(id, 'is not declared by a registered Agora home')
  if (candidates.length > 1)
    throw duplicateOwnersError(
      id,
      candidates.map((candidate) => candidate.home.repository)
    )
  const candidate = candidates[0] as AgoraCandidate
  for (const member of Object.keys(candidate.declaration.members)) {
    const failure = failuresByRepository.get(member)
    if (failure) throw failure
  }
  return membersFromHome(candidate.home, candidate.declaration, repositories)
}

export const declaredAgoraReferenceIdentities = async (stateDirectory: string): Promise<readonly string[]> => {
  const references = new Set<string>()
  for (const repository of await registeredRepositories(stateDirectory)) {
    for (const [id, value] of homeDeclarationEntries(repository)) {
      const home = homeDeclaration(repository, id, value)
      for (const reference of home.references) references.add(reference)
    }
  }
  return [...references].sort((left, right) => left.localeCompare(right, 'en'))
}
