import { lstat, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import {
  REPOSITORY_DECLARATION_FILE,
  type RepositoryDeclaration,
  readRepositoryDeclaration
} from '../configuration/index.ts'
import { KiError } from '../errors.ts'
import type { Environment } from '../paths.ts'
import type { Runner } from '../runtime/runner.ts'
import { canonicalRepositoryIdentity, type LocalRegistryEntry, requiredLocalRegistry } from '../storage/index.ts'
import {
  inspectReferenceCheckout,
  type ReferenceAssociation,
  requiredReferenceAssociations
} from './reference-associations.ts'

export const ESTATE_AGORA = 'estate' as const

const AGORA_ID = /^[a-z][a-z0-9-]*[a-z0-9]$/
const ROLE = /^[a-z][a-z0-9-]*[a-z0-9]$/
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

interface Membership {
  readonly home: string
  readonly role: string
}

interface AgoraHome {
  readonly id: string
  readonly owner: string
  readonly purpose: string
  readonly order: readonly string[]
  readonly references: readonly string[]
  readonly members: Readonly<Record<string, string>>
}

interface RegisteredRepository {
  readonly key: string
  readonly root: string
  readonly repository: string
  readonly declaration: RepositoryDeclaration
}

interface RegisteredRepositoryInventory {
  readonly repositories: readonly RegisteredRepository[]
  readonly failuresByRepository: ReadonlyMap<string, KiError>
}

type RegisteredRepositoryInspection =
  | { readonly state: 'available'; readonly repository: RegisteredRepository }
  | { readonly state: 'unavailable'; readonly error: KiError }

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

const registeredRepositories = async (stateDirectory: string): Promise<readonly RegisteredRepository[]> => {
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

const availableRegisteredRepositories = async (stateDirectory: string): Promise<RegisteredRepositoryInventory> => {
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
  const declaredReferences = home['references']
  if (declaredReferences !== undefined && !Array.isArray(declaredReferences))
    throw profileError(id, 'references must be an array of canonical HTTPS GitHub repositories')
  const references: string[] = []
  for (const identity of declaredReferences ?? []) {
    if (!canonicalRepositoryIdentity(identity))
      throw profileError(id, 'reference entries must be canonical HTTPS GitHub repositories')
    if (identity === repository.repository || roles[identity])
      throw profileError(id, `reference ${identity} must not also be the owner or a member`)
    if (references.includes(identity)) throw profileError(id, `references repeats repository ${identity}`)
    references.push(identity)
  }
  const declaredOrder = home['order']
  if (declaredOrder !== undefined && !Array.isArray(declaredOrder))
    throw profileError(id, 'order must be an array of canonical HTTPS GitHub repositories')
  const order: string[] = []
  const participants = new Set([home['owner'], ...Object.keys(roles), ...references])
  for (const identity of declaredOrder ?? []) {
    if (!canonicalRepositoryIdentity(identity))
      throw profileError(id, 'order entries must be canonical HTTPS GitHub repositories')
    if (order.includes(identity)) throw profileError(id, `order repeats participant ${identity}`)
    if (!participants.has(identity))
      throw profileError(id, `order participant ${identity} is not the owner or a member or reference`)
    order.push(identity)
  }
  return { id, owner: home['owner'], purpose: home['purpose'], order, references, members: roles }
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

const membersFromHome = (
  home: RegisteredRepository,
  declaration: AgoraHome,
  repositories: readonly RegisteredRepository[]
): readonly AgoraMember[] => {
  const members: AgoraMember[] = [
    { key: home.key, root: home.root, repository: declaration.owner, kind: 'owner', role: 'owner' },
    ...Object.entries(declaration.members).map(([identity, role]) => {
      const member = repositories.find((candidate) => candidate.repository === identity)
      if (!member) throw profileError(declaration.id, `member ${identity} is not registered locally`)
      const consent = membershipDeclaration(member, declaration.id)
      if (!consent || consent.home !== home.repository || consent.role !== role)
        throw profileError(declaration.id, `member ${identity} does not declare matching consent`)
      return { key: member.key, root: member.root, repository: member.repository, kind: 'member' as const, role }
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

const resolveReferences = async (
  declaration: AgoraHome,
  associations: readonly ReferenceAssociation[],
  runtime: AgoraRuntime
): Promise<{
  readonly references: readonly AgoraReference[]
  readonly diagnostics: readonly AgoraReferenceDiagnostic[]
}> => {
  const references: AgoraReference[] = []
  const diagnostics: AgoraReferenceDiagnostic[] = []
  for (const repository of declaration.references) {
    const candidates = associations.filter((association) => association.repository === repository)
    if (!candidates.length) {
      diagnostics.push({ repository, status: 'unassociated', detail: 'no local checkout is associated' })
      continue
    }
    if (candidates.length > 1) {
      diagnostics.push({
        repository,
        status: 'ambiguous',
        detail: `${candidates.length} local checkouts are associated; select exactly one`
      })
      continue
    }
    const checkout = await inspectReferenceCheckout(
      (candidates[0] as ReferenceAssociation).path,
      repository,
      runtime.runner,
      runtime.environment
    )
    if (checkout.state !== 'available') {
      diagnostics.push({ repository, status: checkout.state, detail: checkout.detail })
      continue
    }
    references.push({
      key: repository.slice('https://github.com/'.length),
      root: checkout.root as string,
      repository,
      kind: 'reference'
    })
  }
  return { references, diagnostics }
}

const profileFromHome = async (
  home: RegisteredRepository,
  declaration: AgoraHome,
  repositories: readonly RegisteredRepository[],
  associations: readonly ReferenceAssociation[],
  runtime: AgoraRuntime
): Promise<AgoraProfile> => {
  const members = membersFromHome(home, declaration, repositories)
  const referenceResult = await resolveReferences(declaration, associations, runtime)
  const allRoots: readonly AgoraRoot[] = [...members, ...referenceResult.references]
  const byRepository = new Map(allRoots.map((root) => [root.repository, root]))
  const orderedRoots = declaration.order
    .map((identity) => byRepository.get(identity))
    .filter((root): root is AgoraRoot => Boolean(root))
  const orderedIdentities = new Set(declaration.order)
  const remainingRoots = allRoots
    .filter((root) => !orderedIdentities.has(root.repository))
    .sort((left, right) => left.key.localeCompare(right.key, 'en'))
  const roots = [...orderedRoots, ...remainingRoots]
  return {
    id: declaration.id,
    name: declaration.id,
    purpose: declaration.purpose,
    home: { key: home.key, root: home.root, repository: home.repository, kind: 'owner' },
    members: roots.filter((root): root is AgoraMember => root.kind !== 'reference'),
    references: roots.filter((root): root is AgoraReference => root.kind === 'reference'),
    roots,
    referenceDiagnostics: referenceResult.diagnostics,
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
  members: repositories.map(({ key, root, repository }) => ({ key, root, repository, kind: 'member' })),
  references: [],
  roots: repositories.map(({ key, root, repository }) => ({ key, root, repository, kind: 'member' })),
  referenceDiagnostics: [],
  system: true
})

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
    let entries: readonly (readonly [string, unknown])[]
    try {
      entries = homeDeclarationEntries(home)
    } catch (error) {
      estateFindings.push(kiErrorMessage(error))
      continue
    }
    for (const [id, value] of entries) {
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
    for (const member of Object.keys(candidate.declaration.members)) {
      const failure = failuresByRepository.get(member)
      if (!failure) continue
      addHealthFinding(findingsById, id, failure.message)
      associatedFailures.add(failure.message)
      unavailable = true
    }
    if (unavailable) continue
    try {
      const profile = await profileFromHome(candidate.home, candidate.declaration, repositories, associations, runtime)
      for (const diagnostic of profile.referenceDiagnostics)
        addHealthFinding(
          findingsById,
          id,
          `reference ${diagnostic.repository} [${diagnostic.status}]: ${diagnostic.detail}`
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
