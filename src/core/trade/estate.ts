import { lstat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import { REPOSITORY_DECLARATION_FILE } from '../configuration/index.ts'
import { type RepositoryLocation, resolveRepository } from '../repository/index.ts'
import { requiredLocalRegistry } from '../storage/index.ts'
import {
  isTradeRepository,
  type RouteDirection,
  readTradeConfiguration,
  type TradeConfiguration,
  type TradeKind,
  tradeKinds
} from './configuration.ts'
import { type ActiveRegisteredRepository, type RegisteredRepository, type TradeContext, tradeError } from './model.ts'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** One skill's table under the `[skills]` namespace, or undefined where the file declares neither. */
const skillTable = (parsed: Record<string, unknown>, name: string): unknown => {
  const skills = parsed['skills']
  return isRecord(skills) ? skills[name] : undefined
}

const hasRepository = (value: unknown): value is { readonly repository: unknown } =>
  isRecord(value) && 'repository' in value

const repositoryIdentity = (repository: string): string => repository.slice('https://github.com/'.length)

const registeredRoots = async (context: TradeContext): Promise<readonly string[]> => {
  return (await requiredLocalRegistry(context.paths.state)).map((repository) => repository.path)
}

export const registeredRepositories = async (context: TradeContext): Promise<readonly RegisteredRepository[]> => {
  const repositories: RegisteredRepository[] = []
  for (const root of await registeredRoots(context)) {
    const path = join(root, REPOSITORY_DECLARATION_FILE)
    const state = await lstat(path).catch(() => undefined)
    if (!state?.isFile()) continue
    try {
      const contents = await readFile(path, 'utf8')
      const parsed = parse(contents)
      /* v8 ignore next -- smol-toml parses valid configuration input as a document object. */
      const repositoryDeclaration = isRecord(parsed) ? skillTable(parsed, 'ki-repo') : undefined
      if (
        !hasRepository(repositoryDeclaration) ||
        typeof repositoryDeclaration.repository !== 'string' ||
        !isTradeRepository(repositoryDeclaration.repository)
      )
        continue
      const repository = repositoryDeclaration.repository
      try {
        repositories.push({ root, repository, configuration: await readTradeConfiguration(path) })
      } catch {
        repositories.push({ root, repository })
      }
    } catch {
      // Invalid registered entries cannot identify a trade endpoint.
    }
  }
  return repositories
}

export const localRepository = async (context: TradeContext): Promise<RepositoryLocation> =>
  resolveRepository({ workingDirectory: context.workingDirectory, homeDirectory: context.homeDirectory })

export const localRegisteredRepository = async (context: TradeContext): Promise<RepositoryLocation> => {
  const repository = await localRepository(context)
  if (!(await registeredRoots(context)).includes(repository.root))
    throw tradeError('current KI repository is not registered in the local KI repository estate')
  return repository
}

export const localRegisteredConfiguration = async (
  context: TradeContext
): Promise<{ readonly repository: RepositoryLocation; readonly configuration: TradeConfiguration }> => {
  const repository = await localRegisteredRepository(context)
  return { repository, configuration: await readTradeConfiguration(repository.declaration) }
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
    if (!peer.configuration) return { ...route, state: pending, peer }
    const reciprocal =
      route.direction === 'export'
        ? peer.configuration.importsFrom[route.kind]
        : peer.configuration.exportsTo[route.kind]
    if (!reciprocal.includes(local.repository)) return { ...route, state: pending, peer }
    return { ...route, state: 'active', peer }
  })

export const inspectRoutes = async (
  context: TradeContext,
  local: TradeConfiguration
): Promise<readonly RouteInspection[]> => inspectRoutesInEstate(await registeredRepositories(context), local)

export const inspectEstateRoutes = async (context: TradeContext): Promise<readonly EstateRouteInspection[]> => {
  const repositories = await registeredRepositories(context)
  return repositories.flatMap((source) => {
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
}

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
      `${direction} ${kind} trade route ${repository} is ${route?.state?.replace('-', ' ') ?? 'not declared locally'}`
    )
  return route.peer as ActiveRegisteredRepository
}

export const requireDeclaredExportRoute = (local: TradeConfiguration, repository: string, kind: TradeKind): string => {
  /* v8 ignore next -- public CLI grammar validates canonical repository URLs before core trade creation. */
  if (!isTradeRepository(repository))
    throw tradeError('trade route repository must use canonical HTTPS GitHub repository form')
  if (!local.exportsTo[kind].includes(repository))
    throw tradeError(`export ${kind} trade route ${repository} is not declared locally`)
  return repositoryIdentity(repository)
}
