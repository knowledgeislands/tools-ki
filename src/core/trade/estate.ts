import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import { REPOSITORY_DECLARATION_FILE } from '../configuration/index.ts'
import { type RepositoryLocation, resolveRepository } from '../repository/index.ts'
import { requiredLocalRegistry } from '../storage/index.ts'
import {
  claimedRepository,
  effectiveConfiguration,
  isTradeRepository,
  type RepositoryDeclaration,
  type RouteDirection,
  readRepositoryDeclaration,
  repositoryDeclarationFrom,
  repositoryIdentity,
  type TerritoryPolicy,
  type TradeConfiguration,
  type TradeKind,
  tradeKinds
} from './configuration.ts'
import { type ActiveRegisteredRepository, type RegisteredRepository, type TradeContext, tradeError } from './model.ts'

/** One registered checkout with its claimed identity and, where it validates, its declaration. */
export interface DeclaredRepository {
  readonly root: string
  readonly repository: string
  readonly declaration?: RepositoryDeclaration
  readonly error?: string
}

const registeredRoots = async (context: TradeContext): Promise<readonly string[]> => {
  return (await requiredLocalRegistry(context.paths.state)).map((repository) => repository.path)
}

export const declaredRepositories = async (context: TradeContext): Promise<readonly DeclaredRepository[]> => {
  const repositories: DeclaredRepository[] = []
  for (const root of await registeredRoots(context)) {
    const path = join(root, REPOSITORY_DECLARATION_FILE)
    const state = await lstat(path).catch(() => undefined)
    if (!state?.isFile()) continue
    let document: Record<string, unknown>
    try {
      document = parse(await readFile(path, 'utf8'))
    } catch {
      continue
    }
    const repository = claimedRepository(document)
    // A declaration without a canonical identity cannot be a trade endpoint.
    if (!repository) continue
    try {
      repositories.push({ root, repository, declaration: repositoryDeclarationFrom(document, path) })
    } catch (error) {
      repositories.push({ root, repository, error: (error as Error).message })
    }
  }
  return repositories
}

export type CapitalResolution =
  | { readonly state: 'resolved'; readonly capital: DeclaredRepository; readonly policy: TerritoryPolicy }
  | {
      readonly state: 'unavailable' | 'ambiguous' | 'invalid' | 'not-capital' | 'not-member'
      readonly message: string
    }

/**
 * Resolves a repository's territory policy through its own declared `capital`: the unique
 * registered checkout declaring that repository, which must be a Capital listing the repository.
 * Several territories may share one registry; no other declaration is ever consulted.
 */
export const resolveCapital = (
  declared: readonly DeclaredRepository[],
  local: Pick<RepositoryDeclaration, 'repository' | 'capital'>
): CapitalResolution => {
  const candidates = declared.filter((candidate) => candidate.repository === local.capital)
  if (!candidates.length)
    return { state: 'unavailable', message: `territory policy lives in ${local.capital}, not available here` }
  if (candidates.length > 1)
    return { state: 'ambiguous', message: `territory Capital ${local.capital} is registered more than once` }
  const capital = candidates[0] as DeclaredRepository
  if (!capital.declaration)
    return { state: 'invalid', message: `territory Capital ${local.capital} is invalid: ${capital.error}` }
  if (!capital.declaration.policy)
    return { state: 'not-capital', message: `${local.capital} does not declare itself a territory Capital` }
  if (!capital.declaration.policy.members.includes(local.repository))
    return {
      state: 'not-member',
      message: `territory Capital ${local.capital} does not list ${local.repository} as a member`
    }
  return { state: 'resolved', capital, policy: capital.declaration.policy }
}

/**
 * Projects one declared checkout into the estate. A repository that trades but whose Capital does
 * not resolve keeps the resolution message, so aggregate views can state the skip instead of
 * silently dropping it.
 */
const registeredRepository = (
  declared: readonly DeclaredRepository[],
  entry: DeclaredRepository
): RegisteredRepository => {
  const located = { root: entry.root, repository: entry.repository }
  const declaration = entry.declaration
  if (!declaration?.trades) return located
  const resolution = resolveCapital(declared, declaration)
  return resolution.state === 'resolved'
    ? {
        ...located,
        configuration: effectiveConfiguration({ ...declaration, trades: declaration.trades }, resolution.policy)
      }
    : { ...located, skipped: resolution.message }
}

export const registeredRepositories = async (context: TradeContext): Promise<readonly RegisteredRepository[]> => {
  const declared = await declaredRepositories(context)
  return declared.map((entry) => registeredRepository(declared, entry))
}

export const localRepository = async (context: TradeContext): Promise<RepositoryLocation> =>
  resolveRepository({ workingDirectory: context.workingDirectory, homeDirectory: context.homeDirectory })

export const localRegisteredRepository = async (context: TradeContext): Promise<RepositoryLocation> => {
  const repository = await localRepository(context)
  if (!(await registeredRoots(context)).includes(repository.root))
    throw tradeError('current KI repository is not registered in the local KI repository estate')
  return repository
}

/** The local repository's declaration and the Capital policy it resolves to, failing closed. */
export const localTerritoryPolicy = async (
  context: TradeContext
): Promise<{
  readonly repository: RepositoryLocation
  readonly declaration: RepositoryDeclaration
  readonly declared: readonly DeclaredRepository[]
  readonly policy: TerritoryPolicy
}> => {
  const repository = await localRegisteredRepository(context)
  const declaration = await readRepositoryDeclaration(repository.declaration)
  const declared = await declaredRepositories(context)
  const resolution = resolveCapital(declared, declaration)
  if (resolution.state !== 'resolved') throw tradeError(resolution.message)
  return { repository, declaration, declared, policy: resolution.policy }
}

export const localRegisteredConfiguration = async (
  context: TradeContext
): Promise<{ readonly repository: RepositoryLocation; readonly configuration: TradeConfiguration }> => {
  const repository = await localRegisteredRepository(context)
  const declaration = await readRepositoryDeclaration(repository.declaration)
  if (!declaration.trades) throw tradeError(`${repository.declaration} does not declare [skills.ki-trades]`)
  const resolution = resolveCapital(await declaredRepositories(context), declaration)
  if (resolution.state !== 'resolved') throw tradeError(resolution.message)
  return {
    repository,
    configuration: effectiveConfiguration({ ...declaration, trades: declaration.trades }, resolution.policy)
  }
}

export type RouteState = 'active' | 'awaiting-receiver' | 'awaiting-sender' | 'ambiguous-repository'

export interface RouteInspection {
  readonly repository: string
  readonly direction: RouteDirection
  readonly kind: TradeKind
  readonly state: RouteState
  readonly peer?: RegisteredRepository
}

export interface EstateRouteInspection extends RouteInspection {
  readonly source: Pick<TradeConfiguration, 'identity' | 'repository' | 'mapBonus'>
}

const declaredRoutes = (
  configuration: TradeConfiguration
): readonly Pick<RouteInspection, 'repository' | 'direction' | 'kind'>[] =>
  tradeKinds.flatMap((kind) => [
    ...configuration.exportsTo[kind].map((repository) => ({ repository, direction: 'export' as const, kind })),
    ...configuration.importsFrom[kind].map((repository) => ({ repository, direction: 'import' as const, kind }))
  ])

const inspectRoutesInEstate = (
  repositories: readonly RegisteredRepository[],
  local: TradeConfiguration
): readonly RouteInspection[] =>
  declaredRoutes(local).map((route) => {
    const candidates = repositories.filter((candidate) => candidate.repository === route.repository)
    const pending = route.direction === 'export' ? 'awaiting-receiver' : 'awaiting-sender'
    if (!candidates.length) return { ...route, state: pending }
    if (candidates.length > 1) return { ...route, state: 'ambiguous-repository' }
    const peer = candidates[0] as RegisteredRepository
    // One Capital's policy grants both directions of an edge, so a peer that trades and resolves
    // the same Capital is reciprocal by construction.
    if (peer.configuration?.capital !== local.capital) return { ...route, state: pending, peer }
    return { ...route, state: 'active', peer }
  })

export const inspectRoutes = async (
  context: TradeContext,
  local: TradeConfiguration
): Promise<readonly RouteInspection[]> => inspectRoutesInEstate(await registeredRepositories(context), local)

/** Every route each trading repository in `repositories` resolves, inspected against that same estate. */
export const estateRoutes = (repositories: readonly RegisteredRepository[]): readonly EstateRouteInspection[] =>
  repositories.flatMap((source) => {
    const configuration = source.configuration
    return configuration
      ? inspectRoutesInEstate(repositories, configuration).map((route) => ({
          ...route,
          source: {
            identity: configuration.identity,
            repository: configuration.repository,
            mapBonus: configuration.mapBonus
          }
        }))
      : []
  })

export const inspectEstateRoutes = async (context: TradeContext): Promise<readonly EstateRouteInspection[]> =>
  estateRoutes(await registeredRepositories(context))

export const requireActiveRoute = async (
  context: TradeContext,
  local: TradeConfiguration,
  repository: string,
  direction: RouteDirection,
  kind: TradeKind
): Promise<ActiveRegisteredRepository> => {
  /* v8 ignore next -- public CLI grammar validates canonical repository URLs before route inspection. */
  if (!isTradeRepository(repository))
    throw tradeError('trade route repository must use canonical HTTPS GitHub repository form')
  const route = (await inspectRoutes(context, local)).find(
    (candidate) => candidate.repository === repository && candidate.direction === direction && candidate.kind === kind
  )
  if (route?.state !== 'active')
    throw tradeError(
      `${direction} ${kind} trade route ${repository} is ${route?.state?.replaceAll('-', ' ') ?? 'not granted by the territory policy'}`
    )
  return route.peer as ActiveRegisteredRepository
}

export const requireDeclaredExportRoute = (local: TradeConfiguration, repository: string, kind: TradeKind): string => {
  /* v8 ignore next -- public CLI grammar validates canonical repository URLs before core trade creation. */
  if (!isTradeRepository(repository))
    throw tradeError('trade route repository must use canonical HTTPS GitHub repository form')
  if (!local.exportsTo[kind].includes(repository))
    throw tradeError(`export ${kind} trade route ${repository} is not granted by the territory policy`)
  return repositoryIdentity(repository)
}
