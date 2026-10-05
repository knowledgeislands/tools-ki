import { KiError } from '../errors.ts'
import {
  AGORA_ID,
  type AgoraCandidate,
  homeDeclaration,
  homeDeclarationEntries,
  kiErrorMessage,
  profileError
} from './declarations.ts'
import { duplicateOwnersError, ESTATE_AGORA, profileFromHome } from './profiles.ts'
import { requiredReferenceAssociations } from './reference-associations.ts'
import { availableRegisteredRepositories } from './repository-inventory.ts'
import type { AgoraHealthReport, AgoraRuntime } from './types.ts'

const addHealthFinding = (findings: Map<string, string[]>, id: string, message: string): void => {
  findings.set(id, [...(findings.get(id) ?? []), message])
}

const healthProfiles = async (stateDirectory: string, runtime: AgoraRuntime): Promise<AgoraHealthReport> => {
  const { repositories, failuresByRepository } = await availableRegisteredRepositories(stateDirectory)
  const associations = await requiredReferenceAssociations(stateDirectory)
  const candidatesById = new Map<string, AgoraCandidate[]>()
  const findingsById = new Map<string, string[]>()
  const estateFindings: string[] = []
  const associatedFailures = new Set<string>()

  for (const home of repositories) {
    for (const [id, value] of homeDeclarationEntries(home)) {
      try {
        const candidate = { home, declaration: homeDeclaration(home, id, value) }
        candidatesById.set(id, [...(candidatesById.get(id) ?? []), candidate])
      } catch (error) {
        addHealthFinding(findingsById, id, kiErrorMessage(error))
      }
    }
  }

  const ids = new Set([...candidatesById.keys(), ...findingsById.keys()])
  for (const id of ids) {
    const candidates = candidatesById.get(id) ?? []
    if (candidates.length > 1) {
      addHealthFinding(
        findingsById,
        id,
        duplicateOwnersError(
          id,
          candidates.map((candidate) => candidate.home.repository)
        ).message
      )
      continue
    }
    const candidate = candidates[0]
    if (!candidate) continue
    let unavailable = false
    for (const member of candidate.declaration.members) {
      const failure = failuresByRepository.get(member)
      if (!failure) continue
      addHealthFinding(findingsById, id, failure.message)
      associatedFailures.add(failure.message)
      unavailable = true
    }
    if (unavailable) continue
    try {
      const profile = await profileFromHome(
        candidate.home,
        candidate.declaration,
        repositories,
        candidatesById,
        associations,
        runtime
      )
      for (const diagnostic of profile.referenceDiagnostics)
        addHealthFinding(
          findingsById,
          id,
          `inclusion ${diagnostic.repository} [${diagnostic.status}]: ${diagnostic.detail}`
        )
    } catch (error) {
      addHealthFinding(findingsById, id, kiErrorMessage(error))
    }
  }

  for (const failure of failuresByRepository.values())
    if (!associatedFailures.has(failure.message)) estateFindings.push(failure.message)

  return {
    profiles: [...ids]
      .sort((left, right) => left.localeCompare(right, 'en'))
      .map((id) => ({
        id,
        findings: [...(findingsById.get(id) ?? [])].sort((left, right) => left.localeCompare(right, 'en'))
      })),
    estateFindings: estateFindings.sort((left, right) => left.localeCompare(right, 'en'))
  }
}

export const auditAgoras = async (
  stateDirectory: string,
  runtime: AgoraRuntime,
  id?: string
): Promise<AgoraHealthReport> => {
  if (id !== undefined && !AGORA_ID.test(id))
    throw new KiError('Agora name must use lower-case letters, numbers, and hyphens', 2)

  if (id === ESTATE_AGORA) {
    const { failuresByRepository } = await availableRegisteredRepositories(stateDirectory)
    return {
      profiles: [
        {
          id: ESTATE_AGORA,
          findings: [...failuresByRepository.values()]
            .map((failure) => failure.message)
            .sort((left, right) => left.localeCompare(right, 'en'))
        }
      ],
      estateFindings: []
    }
  }

  const report = await healthProfiles(stateDirectory, runtime)
  if (id === undefined) return report
  const profile = report.profiles.find((candidate) => candidate.id === id)
  if (!profile) throw profileError(id, 'is not declared by a registered Agora home')
  return { profiles: [profile], estateFindings: [] }
}
