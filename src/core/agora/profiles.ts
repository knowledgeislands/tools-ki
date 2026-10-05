import type { KiError } from '../errors.ts'
import { type AgoraCandidate, type AgoraHome, membersFromHome, profileError } from './declarations.ts'
import { inspectReferenceCheckout, type ReferenceAssociation } from './reference-associations.ts'
import type { RegisteredRepository } from './repository-inventory.ts'
import type {
  AgoraMember,
  AgoraProfile,
  AgoraReference,
  AgoraReferenceDiagnostic,
  AgoraRoot,
  AgoraRuntime
} from './types.ts'

export const ESTATE_AGORA = 'estate' as const

const resolveReferences = async (
  declaration: AgoraHome,
  repositories: readonly RegisteredRepository[],
  candidatesById: ReadonlyMap<string, readonly AgoraCandidate[]>,
  associations: readonly ReferenceAssociation[],
  runtime: AgoraRuntime
): Promise<{
  readonly references: readonly AgoraReference[]
  readonly diagnostics: readonly AgoraReferenceDiagnostic[]
}> => {
  const references: AgoraReference[] = []
  const diagnostics: AgoraReferenceDiagnostic[] = []
  for (const inclusion of declaration.includes) {
    if (!inclusion.startsWith('https://')) {
      const candidates = candidatesById.get(inclusion) ?? []
      if (!candidates.length) throw profileError(declaration.id, `included Agora ${inclusion} is not declared locally`)
      if (candidates.length > 1)
        throw duplicateOwnersError(
          inclusion,
          candidates.map((candidate) => candidate.home.repository)
        )
      const included = candidates[0] as AgoraCandidate
      for (const member of membersFromHome(included.home, included.declaration, repositories))
        references.push({ ...member, kind: 'reference' })
      continue
    }
    const repository = inclusion
    const registered = repositories.find((candidate) => candidate.repository === repository)
    if (registered) {
      references.push({ key: registered.key, root: registered.root, repository, kind: 'reference' })
      continue
    }
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

export const profileFromHome = async (
  home: RegisteredRepository,
  declaration: AgoraHome,
  repositories: readonly RegisteredRepository[],
  candidatesById: ReadonlyMap<string, readonly AgoraCandidate[]>,
  associations: readonly ReferenceAssociation[],
  runtime: AgoraRuntime
): Promise<AgoraProfile> => {
  const members = membersFromHome(home, declaration, repositories)
  const referenceResult = await resolveReferences(declaration, repositories, candidatesById, associations, runtime)
  const allRoots: readonly AgoraRoot[] = [...members, ...referenceResult.references]
  const byRepository = new Map<string, AgoraRoot>()
  for (const root of allRoots) if (!byRepository.has(root.repository)) byRepository.set(root.repository, root)
  const roots = [...byRepository.values()].sort((left, right) => left.key.localeCompare(right.key, 'en'))
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

export const duplicateOwnersError = (id: string, owners: readonly string[]): KiError =>
  profileError(
    id,
    `is declared by multiple owners: ${[...owners].sort((left, right) => left.localeCompare(right, 'en')).join(', ')}`
  )

export const estate = (repositories: readonly RegisteredRepository[]): AgoraProfile => ({
  id: ESTATE_AGORA,
  name: 'Registered estate',
  purpose: 'Every locally registered canonical KI repository.',
  members: repositories.map(({ key, root, repository }) => ({ key, root, repository, kind: 'member' })),
  references: [],
  roots: repositories.map(({ key, root, repository }) => ({ key, root, repository, kind: 'member' })),
  referenceDiagnostics: [],
  system: true
})
