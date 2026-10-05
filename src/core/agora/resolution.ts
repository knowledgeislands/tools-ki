import { KiError } from '../errors.ts'
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

import type { AgoraListReport, AgoraMember, AgoraProfile, AgoraRuntime } from './types.ts'

export type {
  AgoraListReport,
  AgoraMember,
  AgoraProfile,
  AgoraRoot,
  AgoraRootKind,
  AgoraRuntime
} from './types.ts'

export const listAgoras = async (stateDirectory: string, runtime: AgoraRuntime): Promise<AgoraListReport> => {
  const repositories = await registeredRepositories(stateDirectory)
  const associations = await requiredReferenceAssociations(stateDirectory)
  const declarations: AgoraCandidate[] = []
  const broken: string[] = []
  for (const home of repositories) {
    for (const [id, value] of homeDeclarationEntries(home)) {
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
      profiles.push(
        await profileFromHome(candidate.home, candidate.declaration, repositories, byId, associations, runtime)
      )
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
  const byId = new Map<string, AgoraCandidate[]>()
  for (const home of repositories) {
    for (const [candidateId, value] of homeDeclarationEntries(home)) {
      try {
        const candidate = { home, declaration: homeDeclaration(home, candidateId, value) }
        byId.set(candidateId, [...(byId.get(candidateId) ?? []), candidate])
      } catch (error) {
        if (candidateId === id) throw error
      }
    }
  }
  const candidates = byId.get(id) ?? []
  if (!candidates.length) throw profileError(id, 'is not declared by a registered Agora home')
  if (candidates.length > 1)
    throw duplicateOwnersError(
      id,
      candidates.map((candidate) => candidate.home.repository)
    )
  const candidate = candidates[0] as AgoraCandidate
  for (const member of candidate.declaration.members) {
    const failure = failuresByRepository.get(member)
    if (failure) throw failure
  }
  return profileFromHome(candidate.home, candidate.declaration, repositories, byId, associations, runtime)
}

export const resolveAgoraMembers = async (stateDirectory: string, id: string): Promise<readonly AgoraMember[]> => {
  if (!AGORA_ID.test(id)) throw new KiError('Agora name must use lower-case letters, numbers, and hyphens', 2)
  if (id === ESTATE_AGORA) return estate(await registeredRepositories(stateDirectory)).members
  const { repositories, failuresByRepository } = await availableRegisteredRepositories(stateDirectory)
  const byId = new Map<string, AgoraCandidate[]>()
  for (const home of repositories) {
    for (const [candidateId, value] of homeDeclarationEntries(home)) {
      try {
        const candidate = { home, declaration: homeDeclaration(home, candidateId, value) }
        byId.set(candidateId, [...(byId.get(candidateId) ?? []), candidate])
      } catch (error) {
        if (candidateId === id) throw error
      }
    }
  }
  const candidates = byId.get(id) ?? []
  if (!candidates.length) throw profileError(id, 'is not declared by a registered Agora home')
  if (candidates.length > 1)
    throw duplicateOwnersError(
      id,
      candidates.map((candidate) => candidate.home.repository)
    )
  const candidate = candidates[0] as AgoraCandidate
  for (const member of candidate.declaration.members) {
    const failure = failuresByRepository.get(member)
    if (failure) throw failure
  }
  const members = [...membersFromHome(candidate.home, candidate.declaration, repositories)]
  for (const inclusion of candidate.declaration.includes) {
    if (inclusion.startsWith('https://')) {
      const included = repositories.find((repository) => repository.repository === inclusion)
      if (included)
        members.push({ key: included.key, root: included.root, repository: included.repository, kind: 'member' })
      continue
    }
    const included = byId.get(inclusion) ?? []
    if (!included.length) throw profileError(id, `included Agora ${inclusion} is not declared locally`)
    if (included.length > 1)
      throw duplicateOwnersError(
        inclusion,
        included.map((entry) => entry.home.repository)
      )
    members.push(
      ...membersFromHome(
        (included[0] as AgoraCandidate).home,
        (included[0] as AgoraCandidate).declaration,
        repositories
      )
    )
  }
  return [...new Map(members.map((member) => [member.repository, member])).values()].sort((left, right) =>
    left.key.localeCompare(right.key, 'en')
  )
}

export const declaredAgoraReferenceIdentities = async (stateDirectory: string): Promise<readonly string[]> => {
  const references = new Set<string>()
  for (const repository of await registeredRepositories(stateDirectory)) {
    for (const [id, value] of homeDeclarationEntries(repository)) {
      const home = homeDeclaration(repository, id, value)
      for (const reference of home.includes.filter((inclusion) => inclusion.startsWith('https://')))
        references.add(reference)
    }
  }
  return [...references].sort((left, right) => left.localeCompare(right, 'en'))
}
