import { KiError } from '../errors.ts'
import { canonicalRepositoryIdentity } from '../storage/index.ts'
import { agoraError, type RegisteredRepository, skillConfiguration } from './repository-inventory.ts'
import type { AgoraMember } from './resolution.ts'

export const AGORA_ID = /^[a-z][a-z0-9-]*[a-z0-9]$/
interface Membership {
  readonly home: string
}

export interface AgoraHome {
  readonly id: string
  readonly owner: string
  readonly purpose: string
  readonly order: readonly string[]
  readonly references: readonly string[]
  readonly members: readonly string[]
}

export interface AgoraCandidate {
  readonly home: RegisteredRepository
  readonly declaration: AgoraHome
}

const table = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

export const profileError = (id: string, message: string): KiError => new KiError(`Agora ${id} ${message}`, 2)

export const kiErrorMessage = (error: unknown): string => {
  // Every caller catches only the KiError outcomes emitted by this module's private declaration and profile resolvers.
  /* v8 ignore next */
  if (!(error instanceof KiError)) throw error
  return error.message
}

export const homeDeclarationEntries = (repository: RegisteredRepository): readonly (readonly [string, unknown])[] => {
  const configuration = skillConfiguration(repository.declaration, 'ki-agora')
  if (!configuration || configuration['homes'] === undefined) return []
  const homes = table(configuration['homes'])
  if (!homes) throw agoraError(repository.root, '[skills.ki-agora].homes must be a table')
  return Object.entries(homes)
}

export const homeDeclaration = (repository: RegisteredRepository, id: string, value: unknown): AgoraHome => {
  if (!AGORA_ID.test(id)) throw profileError(id, 'must use a stable lower-case hyphenated identifier')
  const home = table(value)
  if (!home) throw profileError(id, 'home declaration must be a table')
  if (!canonicalRepositoryIdentity(home['owner']))
    throw profileError(id, 'owner must be a canonical HTTPS GitHub repository')
  if (home['owner'] !== repository.repository)
    throw profileError(id, 'owner must match its declaring registered repository')
  if (typeof home['purpose'] !== 'string' || !home['purpose'].trim())
    throw profileError(id, 'home requires a non-empty purpose')
  const members = home['members']
  if (!Array.isArray(members)) throw profileError(id, 'members must be an array of canonical HTTPS GitHub repositories')
  const identities: string[] = []
  for (const identity of members) {
    if (!canonicalRepositoryIdentity(identity))
      throw profileError(id, `member ${identity} must be a canonical HTTPS GitHub repository`)
    if (identity === repository.repository) throw profileError(id, 'must not list its home repository as a member')
    if (identities.includes(identity)) throw profileError(id, `members repeats repository ${identity}`)
    identities.push(identity)
  }
  const declaredReferences = home['references']
  if (declaredReferences !== undefined && !Array.isArray(declaredReferences))
    throw profileError(id, 'references must be an array of canonical HTTPS GitHub repositories')
  const references: string[] = []
  for (const identity of declaredReferences ?? []) {
    if (!canonicalRepositoryIdentity(identity))
      throw profileError(id, 'reference entries must be canonical HTTPS GitHub repositories')
    if (identity === repository.repository || identities.includes(identity))
      throw profileError(id, `reference ${identity} must not also be the owner or a member`)
    if (references.includes(identity)) throw profileError(id, `references repeats repository ${identity}`)
    references.push(identity)
  }
  const declaredOrder = home['order']
  if (declaredOrder !== undefined && !Array.isArray(declaredOrder))
    throw profileError(id, 'order must be an array of canonical HTTPS GitHub repositories')
  const order: string[] = []
  const participants = new Set([home['owner'], ...identities, ...references])
  for (const identity of declaredOrder ?? []) {
    if (!canonicalRepositoryIdentity(identity))
      throw profileError(id, 'order entries must be canonical HTTPS GitHub repositories')
    if (order.includes(identity)) throw profileError(id, `order repeats participant ${identity}`)
    if (!participants.has(identity))
      throw profileError(id, `order participant ${identity} is not the owner or a member or reference`)
    order.push(identity)
  }
  return { id, owner: home['owner'], purpose: home['purpose'], order, references, members: identities }
}

const membershipDeclaration = (repository: RegisteredRepository, id: string): Membership | undefined => {
  const configuration = skillConfiguration(repository.declaration, 'ki-agora')
  if (!configuration || configuration['memberships'] === undefined) return undefined
  const memberships = table(configuration['memberships'])
  if (!memberships) throw agoraError(repository.root, '[skills.ki-agora].memberships must be a table')
  const value = memberships[id]
  if (value === undefined) return undefined
  const membership = table(value)
  if (!membership) throw profileError(id, `membership in ${repository.repository} must be a table`)
  if (!canonicalRepositoryIdentity(membership['home']))
    throw profileError(id, `membership in ${repository.repository} has an invalid home`)
  if (Object.keys(membership).some((key) => key !== 'home'))
    throw profileError(id, `membership in ${repository.repository} must contain only home`)
  return { home: membership['home'] }
}

export const membersFromHome = (
  home: RegisteredRepository,
  declaration: AgoraHome,
  repositories: readonly RegisteredRepository[]
): readonly AgoraMember[] => {
  const members: AgoraMember[] = [
    { key: home.key, root: home.root, repository: declaration.owner, kind: 'owner' },
    ...declaration.members.map((identity) => {
      const member = repositories.find((candidate) => candidate.repository === identity)
      if (!member) throw profileError(declaration.id, `member ${identity} is not registered locally`)
      const consent = membershipDeclaration(member, declaration.id)
      if (!consent || consent.home !== home.repository)
        throw profileError(declaration.id, `member ${identity} does not declare matching consent`)
      return { key: member.key, root: member.root, repository: member.repository, kind: 'member' as const }
    })
  ]
  const order = new Map(declaration.order.map((identity, index) => [identity, index]))
  return members.sort((left, right) => {
    const leftOrder = order.get(left.repository)
    const rightOrder = order.get(right.repository)
    if (leftOrder !== undefined || rightOrder !== undefined)
      return (leftOrder ?? Number.POSITIVE_INFINITY) - (rightOrder ?? Number.POSITIVE_INFINITY)
    return left.key.localeCompare(right.key, 'en')
  })
}
