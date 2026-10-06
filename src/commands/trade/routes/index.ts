import { Command } from 'commander'
import type { KiContext } from '../../../context.ts'
import { grammarError } from '../../../core/errors.ts'
import { registeredRepositories } from '../../../core/trade/estate.ts'
import {
  type EstateRouteInspection,
  estateRouteReport,
  inspectEstateRoutes,
  inspectRoutes,
  localRegisteredConfiguration
} from '../../../core/trade/index.ts'
import type { RegisteredRepository } from '../../../core/trade/model.ts'
import {
  checkTradeRoutes,
  inspectEstateTradeRoutes,
  inspectLocalTradeRoutes
} from '../../../core/trade/operations/index.ts'
import { type PairTableRow, renderPairTable, renderTree, routeState, tradeKindText } from '../../presentation/index.ts'
import type { TradeSelection } from '../selection.ts'
import { kind, repository, routeDirection, skipLine } from '../shared.ts'

interface RouteOptions {
  readonly direction?: string
  readonly kind?: string
}

interface RouteListOptions {
  readonly incomplete?: boolean
  readonly format?: string
}

const renderRouteList = (inspected: Awaited<ReturnType<typeof inspectRoutes>>): string => {
  const directions = ['export', 'import'] as const
  const groups = directions.flatMap((direction) => {
    const routes = inspected.filter((route) => route.direction === direction)
    return routes.length ? [{ direction, routes }] : []
  })
  const results = groups.length
    ? groups.map(({ direction, routes }) => ({
        label: direction,
        children: routes.map((route) => ({
          label: `${route.kind} ${route.repository} [${routeState(route.state)}]`
        }))
      }))
    : [{ label: 'routes: none' }]
  return renderTree({
    title: 'KI TRADE ROUTES',
    entries: [{ label: 'results', children: results }, { label: `summary: ROUTES=${inspected.length}` }]
  }).join('\n')
}

const renderEstateRouteList = (
  inspected: readonly EstateRouteInspection[],
  skipped: readonly RegisteredRepository[],
  incomplete: boolean,
  columns?: number
): string => {
  const selected = incomplete ? inspected.filter((route) => route.state !== 'active') : inspected
  const routeIdentity = (repository: string): string => repository.slice('https://github.com/'.length)
  const endpoints = (route: (typeof selected)[number]): readonly [string, string] =>
    route.direction === 'export'
      ? [route.source.identity, routeIdentity(route.repository)]
      : [routeIdentity(route.repository), route.source.identity]
  // One policy edge appears twice, as the exporter's export view and the importer's import view;
  // collapse both endpoint views into one directed route before pairing endpoints.
  const edges = new Map<
    string,
    {
      exporter: string
      importer: string
      state: string
      kinds: Set<'work' | 'knowledge'>
    }
  >()
  for (const route of selected) {
    const [exporter, importer] = endpoints(route)
    const state = routeState(route.state)
    const key = `${exporter} ${importer} ${state}`
    const edge = edges.get(key) ?? { exporter, importer, state, kinds: new Set<'work' | 'knowledge'>() }
    edge.kinds.add(route.kind)
    edges.set(key, edge)
  }
  const pairs = new Map<string, { left: string; right: string; forward: Set<string>; reverse: Set<string> }>()
  for (const edge of edges.values()) {
    const left = edge.exporter.localeCompare(edge.importer) <= 0 ? edge.exporter : edge.importer
    const right = edge.exporter === left ? edge.importer : edge.exporter
    const key = `${left}\n${right}`
    const pair = pairs.get(key) ?? { left, right, forward: new Set<string>(), reverse: new Set<string>() }
    const target = edge.exporter === left ? pair.forward : pair.reverse
    for (const value of edge.kinds) target.add(`${tradeKindText(value)} [${edge.state}]`)
    pairs.set(key, pair)
  }
  const active = [...edges.values()].filter((edge) => edge.state === 'active').length
  const incompleteCount = edges.size - active
  const rows: PairTableRow[] = [...pairs.values()]
    .sort((a, b) => a.left.localeCompare(b.left) || a.right.localeCompare(b.right))
    .map((pair) => ({
      left: pair.left,
      right: pair.right,
      forward: `→ ${[...pair.forward].sort().join(', ') || '—'}`,
      reverse: `← ${[...pair.reverse].sort().join(', ') || '—'}`
    }))
  return [
    ...renderPairTable('KI TRADE ROUTES', rows, columns),
    ...skipped.map(skipLine),
    `summary: ROUTES=${edges.size} ACTIVE=${active} INCOMPLETE=${incompleteCount}${skipped.length ? ` SKIPPED=${skipped.length}` : ''}`
  ].join('\n')
}

export const createTradeRoutesCommand = (context: KiContext, selection: TradeSelection): Command => {
  const routes = new Command('routes').description('inspect typed trade routes granted by the territory Capital policy')
  routes
    .addCommand(
      new Command('list')
        .description('list local routes or every registered route and its estate state')
        .option('--incomplete', 'show only routes that are not active')
        .option('--format <text|json>', 'render estate route evidence as text or versioned JSON', 'text')
        .action(async (options: RouteListOptions) => {
          if (options.format !== 'text' && options.format !== 'json')
            throw grammarError('trade route --format must be text or json')
          const repositories = await selection.selected()
          const aggregate = repositories.length !== 1 || selection.aggregate()
          if (options.format === 'json' && !aggregate)
            throw grammarError('trade route --format json requires an aggregate repository selection')
          if (aggregate) {
            const incomplete = Boolean(options.incomplete)
            const roots = new Set(repositories.map((repository) => repository.root))
            const selected = (await registeredRepositories(context)).filter((repository) => roots.has(repository.root))
            const identities = new Set(
              selected.filter((repository) => repository.configuration).map((repository) => repository.repository)
            )
            const skipped = selected.filter((repository) => repository.skipped)
            const inspected = await inspectEstateTradeRoutes(incomplete, async () =>
              (await inspectEstateRoutes(context)).filter((route) => identities.has(route.source.repository))
            )
            if (options.format === 'json') {
              // The versioned contract stays byte-stable; skips are diagnostics on standard error.
              for (const repository of skipped) context.stderr.write(`${skipLine(repository)}\n`)
              context.stdout.write(`${JSON.stringify(estateRouteReport(inspected, incomplete), null, 2)}\n`)
              return
            }
            context.stdout.write(
              `${renderEstateRouteList(inspected, skipped, incomplete, context.stdout.isTTY ? context.stdout.columns : undefined)}\n`
            )
            return
          }
          const selectedContext = await selection.one()
          const inspected = await inspectLocalTradeRoutes(Boolean(options.incomplete), {
            configuration: async () => (await localRegisteredConfiguration(selectedContext)).configuration,
            inspect: (configuration) => inspectRoutes(selectedContext, configuration)
          })
          context.stdout.write(`${renderRouteList(inspected)}\n`)
        })
    )
    .addCommand(
      new Command('check')
        .description('check local typed trade routes and their activation state')
        .argument('[repository]', 'canonical peer HTTPS GitHub repository')
        .option('--direction <export|import>', 'restrict to one route direction')
        .option('--kind <work|knowledge>', 'restrict to one trade kind')
        .action(async (peer: string | undefined, options: RouteOptions) => {
          const selectedContext = await selection.one()
          const result = await checkTradeRoutes(
            {
              repository: peer ? repository(peer, 'trade route repository') : undefined,
              direction: options.direction ? routeDirection(options.direction) : undefined,
              kind: options.kind ? kind(options.kind) : undefined
            },
            {
              configuration: async () => (await localRegisteredConfiguration(selectedContext)).configuration,
              inspect: (configuration) => inspectRoutes(selectedContext, configuration)
            }
          )
          if (peer && !result.routes.length)
            throw grammarError(`trade route ${peer} is not granted by the territory policy`)
          const routes = result.routes.length
            ? result.routes.map((route) => ({
                label: `${route.direction} ${route.kind} ${route.repository}: ${routeState(route.state)}`
              }))
            : [{ label: 'none' }]
          context.stdout.write(
            `${renderTree({
              title: 'KI TRADE ROUTE CHECK',
              entries: [
                { label: `routes (${result.routes.length})`, children: routes },
                { label: `summary: ROUTES=${result.routes.length} ACTIVE=${result.active}` }
              ]
            }).join('\n')}\n`
          )
        })
    )
  return routes
}
