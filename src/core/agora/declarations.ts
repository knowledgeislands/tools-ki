import { KiError } from '../errors.ts'
import { canonicalRepositoryIdentity } from '../storage/local-registry.ts'
import { type RegisteredRepository, skillConfiguration } from './repository-inventory.ts'
import type { AgoraMember } from './types.ts'

export const AGORA_ID = /^[a-z][a-z0-9-]*[a-z0-9]$/
export interface AgoraHome {
  readonly id: string
  readonly owner: string
  readonly purpose: string
  readonly includes: readonly string[]
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
  return Object.entries(configuration ?? {})
}

export const homeDeclaration = (repository: RegisteredRepository, id: string, value: unknown): AgoraHome => {
  if (!AGORA_ID.test(id) || id === 'estate')
    throw profileError(id, 'must use a stable lower-case hyphenated identifier')
  const home = table(value)
  if (!home) throw profileError(id, 'home declaration must be a table')
  for (const key of Object.keys(home))
    if (!['purpose', 'members', 'includes'].includes(key)) throw profileError(id, `has unrecognised key ${key}`)
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
  const declaredIncludes = home['includes']
  if (declaredIncludes !== undefined && !Array.isArray(declaredIncludes))
    throw profileError(id, 'includes must be an array of Agora identifiers or canonical HTTPS GitHub repositories')
  const includes: string[] = []
  for (const inclusion of declaredIncludes ?? []) {
    if (typeof inclusion !== 'string' || !(AGORA_ID.test(inclusion) || canonicalRepositoryIdentity(inclusion)))
      throw profileError(id, `include ${inclusion} must be an Agora identifier or canonical HTTPS GitHub repository`)
    if (inclusion === id) throw profileError(id, 'must not include itself')
    if (inclusion === repository.repository || identities.includes(inclusion))
      throw profileError(id, `include ${inclusion} must not also be the owner or a direct member`)
    if (includes.includes(inclusion)) throw profileError(id, `includes repeats ${inclusion}`)
    includes.push(inclusion)
  }
  return { id, owner: repository.repository, purpose: home['purpose'], includes, members: identities }
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
      return { key: member.key, root: member.root, repository: member.repository, kind: 'member' as const }
    })
  ]
  return members.sort((left, right) => left.key.localeCompare(right.key, 'en'))
}
