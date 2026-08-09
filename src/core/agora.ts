import { lstat, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { type RepositoryDeclaration, readRepositoryDeclaration } from './configuration.ts'
import { KiError } from './errors.ts'
import { canonicalRepositoryIdentity, requiredLocalRegistry } from './local-registry.ts'

export const ESTATE_AGORA = 'estate'

const REPOSITORY_CONFIGURATION_FILE = '.ki-config.toml'
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

interface Membership {
  readonly home: string
  readonly role: string
}

interface AgoraHome {
  readonly id: string
  readonly owner: string
  readonly purpose: string
  readonly members: Readonly<Record<string, string>>
}

interface RegisteredRepository extends AgoraMember {
  readonly declaration: RepositoryDeclaration
}

const table = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

const agoraError = (root: string, message: string): KiError =>
  new KiError(`registered repository ${root} ${message}`, 2)

const profileError = (id: string, message: string): KiError => new KiError(`Agora ${id} ${message}`, 2)

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
    const configurationPath = join(root, REPOSITORY_CONFIGURATION_FILE)
    const declarationState = await lstat(configurationPath).catch(() => undefined)
    if (!declarationState?.isFile() || declarationState.isSymbolicLink())
      throw agoraError(root, `must contain a physical ${REPOSITORY_CONFIGURATION_FILE}`)
    let declaration: RepositoryDeclaration
    try {
      declaration = await readRepositoryDeclaration(configurationPath)
    } catch (error) {
      throw agoraError(root, `has invalid ${REPOSITORY_CONFIGURATION_FILE}: ${(error as Error).message}`)
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

const homeDeclarations = (repository: RegisteredRepository): readonly AgoraHome[] => {
  const configuration = skillConfiguration(repository.declaration, 'ki-agora')
  if (!configuration || configuration['homes'] === undefined) return []
  const homes = table(configuration['homes'])
  if (!homes) throw agoraError(repository.root, '[skills.ki-agora].homes must be a table')
  return Object.entries(homes).map(([id, value]) => {
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
    return { id, owner: home['owner'], purpose: home['purpose'], members: roles }
  })
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
  return {
    id: declaration.id,
    name: declaration.id,
    purpose: declaration.purpose,
    home: { key: home.key, root: home.root, repository: home.repository },
    members: members.sort((left, right) => left.key.localeCompare(right.key, 'en')),
    system: false
  }
}

const profileCandidates = (repositories: readonly RegisteredRepository[]): AgoraProfile[] =>
  repositories.flatMap((home) =>
    homeDeclarations(home).map((declaration) => profileFromHome(home, declaration, repositories))
  )

const uniqueProfiles = (profiles: readonly AgoraProfile[]): AgoraProfile[] => {
  const byId = new Map<string, AgoraProfile[]>()
  for (const profile of profiles) byId.set(profile.id, [...(byId.get(profile.id) ?? []), profile])
  for (const [id, candidates] of byId) {
    if (candidates.length < 2) continue
    throw profileError(
      id,
      `is declared by multiple owners: ${candidates
        .map((profile) => profile.home?.repository)
        .filter((owner): owner is string => Boolean(owner))
        .sort((left, right) => left.localeCompare(right, 'en'))
        .join(', ')}`
    )
  }
  return [...profiles]
}

const estate = (repositories: readonly RegisteredRepository[]): AgoraProfile => ({
  id: ESTATE_AGORA,
  name: 'Registered estate',
  purpose: 'Every locally registered canonical KI repository.',
  members: repositories.map(({ key, root, repository }) => ({ key, root, repository })),
  system: true
})

export const listAgoras = async (stateDirectory: string): Promise<readonly AgoraProfile[]> => {
  const repositories = await registeredRepositories(stateDirectory)
  return [
    estate(repositories),
    ...uniqueProfiles(profileCandidates(repositories)).sort((left, right) => left.id.localeCompare(right.id, 'en'))
  ]
}

export const resolveAgora = async (stateDirectory: string, id: string): Promise<AgoraProfile> => {
  if (!AGORA_ID.test(id)) throw new KiError('Agora name must use lower-case letters, numbers, and hyphens', 2)
  const repositories = await registeredRepositories(stateDirectory)
  if (id === ESTATE_AGORA) return estate(repositories)
  const profiles = uniqueProfiles(profileCandidates(repositories))
  const candidates = profiles.filter((profile) => profile.id === id)
  if (!candidates.length) throw profileError(id, 'is not declared by a registered Agora home')
  return candidates[0] as AgoraProfile
}
