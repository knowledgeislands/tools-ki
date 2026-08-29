import { lstat, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import {
  REPOSITORY_DECLARATION_FILE,
  type RepositoryDeclaration,
  readRepositoryDeclaration
} from '../configuration/index.ts'
import { KiError } from '../errors.ts'
import { canonicalRepositoryIdentity, requiredLocalRegistry } from '../storage/index.ts'

export const ESTATE_AGORA = 'estate'

const AGORA_ID = /^[a-z][a-z0-9-]*[a-z0-9]$/
const ROLE = /^[a-z][a-z0-9-]*[a-z0-9]$/
export interface AgoraMember {
  readonly key: string
  readonly root: string
  readonly repository: string
  readonly role?: string
}

export interface AgoraProfile {
  readonly id: string
  readonly name: string
  readonly purpose: string
  readonly home?: AgoraMember
  readonly members: readonly AgoraMember[]
  readonly system: boolean
}

export interface AgoraListReport {
  readonly profiles: readonly AgoraProfile[]
  readonly broken: readonly string[]
}

interface Membership {
  readonly home: string
  readonly role: string
}

interface AgoraHome {
  readonly id: string
  readonly owner: string
  readonly purpose: string
  readonly order: readonly string[]
  readonly members: Readonly<Record<string, string>>
}

interface RegisteredRepository extends AgoraMember {
  readonly declaration: RepositoryDeclaration
}

interface AgoraCandidate {
  readonly home: RegisteredRepository
  readonly declaration: AgoraHome
}

const table = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

const agoraError = (root: string, message: string): KiError =>
  new KiError(`registered repository ${root} ${message}`, 2)

const profileError = (id: string, message: string): KiError => new KiError(`Agora ${id} ${message}`, 2)

const kiErrorMessage = (error: unknown): string => {
  // Every caller catches only the KiError outcomes emitted by this module's private declaration and profile resolvers.
  /* v8 ignore next */
  if (!(error instanceof KiError)) throw error
  return error.message
}

const skillConfiguration = (
  declaration: RepositoryDeclaration,
  name: string
): Readonly<Record<string, unknown>> | undefined =>
  declaration.skills.find((skill) => skill.name === name)?.configuration

const canonicalRepository = (root: string, declaration: RepositoryDeclaration): string => {
  const configuration = skillConfiguration(declaration, 'ki-repo')
  const repository = configuration?.['repository']
  if (!canonicalRepositoryIdentity(repository))
    throw agoraError(root, '[skills.ki-repo].repository must be a canonical HTTPS GitHub repository')
  return repository
}

const registeredRepositories = async (stateDirectory: string): Promise<readonly RegisteredRepository[]> => {
  const repositories: RegisteredRepository[] = []
  for (const registered of await requiredLocalRegistry(stateDirectory)) {
    const state = await lstat(registered.path).catch(() => undefined)
    if (!state?.isDirectory() || state.isSymbolicLink())
      throw agoraError(registered.path, 'must be an existing physical directory')
    const root = await realpath(registered.path)
    const declarationPath = join(root, REPOSITORY_DECLARATION_FILE)
    const declarationState = await lstat(declarationPath).catch(() => undefined)
    if (!declarationState?.isFile() || declarationState.isSymbolicLink())
      throw agoraError(root, `must contain a physical ${REPOSITORY_DECLARATION_FILE}`)
    let declaration: RepositoryDeclaration
    try {
      declaration = await readRepositoryDeclaration(declarationPath)
    } catch (error) {
      throw agoraError(root, `has invalid ${REPOSITORY_DECLARATION_FILE}: ${(error as Error).message}`)
    }
    const identity = canonicalRepository(root, declaration)
    if (identity !== registered.repository)
      throw agoraError(root, `declares ${identity}, but its local registry identity is ${registered.repository}`)
    repositories.push({ key: registered.key, root, repository: identity, declaration })
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

const homeDeclarationEntries = (repository: RegisteredRepository): readonly (readonly [string, unknown])[] => {
  const configuration = skillConfiguration(repository.declaration, 'ki-agora')
  if (!configuration || configuration['homes'] === undefined) return []
  const homes = table(configuration['homes'])
  if (!homes) throw agoraError(repository.root, '[skills.ki-agora].homes must be a table')
  return Object.entries(homes)
}

const homeDeclaration = (repository: RegisteredRepository, id: string, value: unknown): AgoraHome => {
  if (!AGORA_ID.test(id)) throw profileError(id, 'must use a stable lower-case hyphenated identifier')
  const home = table(value)
  if (!home) throw profileError(id, 'home declaration must be a table')
  if (!canonicalRepositoryIdentity(home['owner']))
    throw profileError(id, 'owner must be a canonical HTTPS GitHub repository')
  if (home['owner'] !== repository.repository)
    throw profileError(id, 'owner must match its declaring registered repository')
  if (typeof home['purpose'] !== 'string' || !home['purpose'].trim())
    throw profileError(id, 'home requires a non-empty purpose')
  const members = table(home['members'])
  if (!members) throw profileError(id, 'members must be a repository-to-role table')
  const roles: Record<string, string> = {}
  for (const [identity, role] of Object.entries(members)) {
    if (!canonicalRepositoryIdentity(identity))
      throw profileError(id, `member ${identity} must be a canonical HTTPS GitHub repository`)
    if (identity === repository.repository) throw profileError(id, 'must not list its home repository as a member')
    if (typeof role !== 'string' || !ROLE.test(role)) throw profileError(id, `member ${identity} has an invalid role`)
    roles[identity] = role
  }
  const declaredOrder = home['order']
  if (declaredOrder !== undefined && !Array.isArray(declaredOrder))
    throw profileError(id, 'order must be an array of canonical HTTPS GitHub repositories')
  const order: string[] = []
  const participants = new Set([home['owner'], ...Object.keys(roles)])
  for (const identity of declaredOrder ?? []) {
    if (!canonicalRepositoryIdentity(identity))
      throw profileError(id, 'order entries must be canonical HTTPS GitHub repositories')
    if (order.includes(identity)) throw profileError(id, `order repeats participant ${identity}`)
    if (!participants.has(identity))
      throw profileError(id, `order participant ${identity} is not the owner or a member`)
    order.push(identity)
  }
  return { id, owner: home['owner'], purpose: home['purpose'], order, members: roles }
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
  if (typeof membership['role'] !== 'string' || !ROLE.test(membership['role']))
    throw profileError(id, `membership in ${repository.repository} has an invalid role`)
  return { home: membership['home'], role: membership['role'] }
}

const profileFromHome = (
  home: RegisteredRepository,
  declaration: AgoraHome,
  repositories: readonly RegisteredRepository[]
): AgoraProfile => {
  const members = [
    { key: home.key, root: home.root, repository: declaration.owner, role: 'owner' },
    ...Object.entries(declaration.members).map(([identity, role]) => {
      const member = repositories.find((candidate) => candidate.repository === identity)
      if (!member) throw profileError(declaration.id, `member ${identity} is not registered locally`)
      const consent = membershipDeclaration(member, declaration.id)
      if (!consent || consent.home !== home.repository || consent.role !== role)
        throw profileError(declaration.id, `member ${identity} does not declare matching consent`)
      return { key: member.key, root: member.root, repository: member.repository, role }
    })
  ]
  const byRepository = new Map(members.map((member) => [member.repository, member]))
  const ordered = declaration.order.map((identity) => byRepository.get(identity) as AgoraMember)
  const orderedIdentities = new Set(declaration.order)
  const remainder = members
    .filter((member) => !orderedIdentities.has(member.repository))
    .sort((left, right) => left.key.localeCompare(right.key, 'en'))
  return {
    id: declaration.id,
    name: declaration.id,
    purpose: declaration.purpose,
    home: { key: home.key, root: home.root, repository: home.repository },
    members: [...ordered, ...remainder],
    system: false
  }
}

const duplicateOwnersError = (id: string, owners: readonly string[]): KiError =>
  profileError(
    id,
    `is declared by multiple owners: ${[...owners].sort((left, right) => left.localeCompare(right, 'en')).join(', ')}`
  )

const estate = (repositories: readonly RegisteredRepository[]): AgoraProfile => ({
  id: ESTATE_AGORA,
  name: 'Registered estate',
  purpose: 'Every locally registered canonical KI repository.',
  members: repositories.map(({ key, root, repository }) => ({ key, root, repository })),
  system: true
})

export const listAgoras = async (stateDirectory: string): Promise<AgoraListReport> => {
  const repositories = await registeredRepositories(stateDirectory)
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
      profiles.push(profileFromHome(candidate.home, candidate.declaration, repositories))
    } catch (error) {
      broken.push(kiErrorMessage(error))
    }
  }

  return {
    profiles: [estate(repositories), ...profiles.sort((left, right) => left.id.localeCompare(right.id, 'en'))],
    broken: broken.sort((left, right) => left.localeCompare(right, 'en'))
  }
}

export const resolveAgora = async (stateDirectory: string, id: string): Promise<AgoraProfile> => {
  if (!AGORA_ID.test(id)) throw new KiError('Agora name must use lower-case letters, numbers, and hyphens', 2)
  const repositories = await registeredRepositories(stateDirectory)
  if (id === ESTATE_AGORA) return estate(repositories)
  const candidates = repositories.flatMap((home): AgoraCandidate[] =>
    homeDeclarationEntries(home)
      .filter(([candidateId]) => candidateId === id)
      .map(([candidateId, value]) => ({ home, declaration: homeDeclaration(home, candidateId, value) }))
  )
  if (!candidates.length) throw profileError(id, 'is not declared by a registered Agora home')
  if (candidates.length > 1)
    throw duplicateOwnersError(
      id,
      candidates.map((candidate) => candidate.home.repository)
    )
  const candidate = candidates[0] as AgoraCandidate
  return profileFromHome(candidate.home, candidate.declaration, repositories)
}
