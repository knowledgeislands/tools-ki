import { readFile } from 'node:fs/promises'
import { policyParticipants, type TerritoryPolicy } from './configuration.ts'
import { type DeclaredRepository, inspectEstateRoutes, localTerritoryPolicy, type RouteInspection } from './estate.ts'
import { type TradeContext, tradeError } from './model.ts'

export type TerritoryMemberState = 'conforming' | 'warning' | 'failing' | 'unverifiable'

export interface TerritoryMemberInspection {
  readonly repository: string
  readonly member: boolean
  readonly state: TerritoryMemberState
  readonly finding?: string
}

const TRADES_TABLE = '[skills.ki-trades]'

const inspectMember = (
  policy: TerritoryPolicy,
  participants: ReadonlySet<string>,
  declared: readonly DeclaredRepository[],
  repository: string
): TerritoryMemberInspection => {
  const candidates = declared.filter((candidate) => candidate.repository === repository)
  const result = (state: TerritoryMemberState, finding?: string): TerritoryMemberInspection =>
    finding ? { repository, member: true, state, finding } : { repository, member: true, state }
  if (!candidates.length) return result('unverifiable', 'not checked out here')
  if (candidates.length > 1) return result('failing', 'registered more than once')
  const { declaration, error } = candidates[0] as DeclaredRepository
  if (!declaration) return result('failing', error)
  if (declaration.capital !== policy.capital) return result('failing', `declares Capital ${declaration.capital}`)
  if (participants.has(repository) && !declaration.trades)
    return result('failing', `named by a channel but does not declare ${TRADES_TABLE}`)
  if (!participants.has(repository) && declaration.trades)
    return result('warning', `declares ${TRADES_TABLE} but no channel names it`)
  return result('conforming')
}

/**
 * Sweeps the local repository's territory from its Capital's policy: every listed member is
 * resolved through the local registry, and any registered repository claiming the Capital without
 * being listed fails the agreement check.
 */
export const inspectTerritory = async (
  context: TradeContext
): Promise<{ readonly policy: TerritoryPolicy; readonly members: readonly TerritoryMemberInspection[] }> => {
  const { policy, declared } = await localTerritoryPolicy(context)
  const participants = policyParticipants(policy)
  const members = policy.members.map((repository) => inspectMember(policy, participants, declared, repository))
  const claimants = [
    ...new Set(
      declared
        .filter(
          (candidate) =>
            candidate.declaration?.capital === policy.capital && !policy.members.includes(candidate.repository)
        )
        .map((candidate) => candidate.repository)
    )
  ]
    .sort((left, right) => left.localeCompare(right))
    .map((repository) => ({
      repository,
      member: false,
      state: 'failing' as const,
      finding: 'claims this Capital but is not a listed member'
    }))
  return { policy, members: [...members, ...claimants] }
}

export interface RouteComparison {
  readonly covered: readonly string[]
  readonly lost: readonly string[]
  readonly added: readonly string[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const edge = (exporter: string, importer: string, kind: string): string => `${exporter} -> ${importer} ${kind}`

const inspectedEdge = (source: string, route: Pick<RouteInspection, 'repository' | 'direction' | 'kind'>): string =>
  route.direction === 'export' ? edge(source, route.repository, route.kind) : edge(route.repository, source, route.kind)

const baselineEdges = (contents: string, path: string): ReadonlySet<string> => {
  let report: unknown
  try {
    report = JSON.parse(contents)
  } catch {
    throw tradeError(`${path} must be valid JSON`)
  }
  if (!isRecord(report) || report['schema'] !== 'ki/trade-routes/v1' || !Array.isArray(report['routes']))
    throw tradeError(`${path} must be a ki/trade-routes/v1 report`)
  const edges = new Set<string>()
  for (const route of report['routes'] as unknown[]) {
    if (!isRecord(route) || !isRecord(route['source']) || !isRecord(route['peer']))
      throw tradeError(`${path} contains a malformed route`)
    if (route['state'] !== 'active') continue
    const direction = route['direction'] === 'import' ? 'import' : 'export'
    edges.add(
      inspectedEdge(String(route['source']['repository']), {
        repository: String(route['peer']['repository']),
        direction,
        kind: route['kind'] === 'knowledge' ? 'knowledge' : 'work'
      })
    )
  }
  return edges
}

/**
 * Compares the active directed edges of a saved `ki/trade-routes/v1` report with the edges the
 * current registry and Capital policies make active, so a policy change can be checked for lost or
 * newly granted routes before it lands.
 */
export const compareRoutes = async (context: TradeContext, baselinePath: string): Promise<RouteComparison> => {
  const contents = await readFile(baselinePath, 'utf8').catch(() => {
    throw tradeError(`${baselinePath} cannot be read`)
  })
  const baseline = baselineEdges(contents, baselinePath)
  const current = new Set(
    (await inspectEstateRoutes(context))
      .filter((route) => route.state === 'active')
      .map((route) => inspectedEdge(route.source.repository, route))
  )
  const sorted = (values: Iterable<string>): readonly string[] =>
    [...values].sort((left, right) => left.localeCompare(right))
  return {
    covered: sorted([...baseline].filter((value) => current.has(value))),
    lost: sorted([...baseline].filter((value) => !current.has(value))),
    added: sorted([...current].filter((value) => !baseline.has(value)))
  }
}
