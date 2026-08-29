import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { grammarError } from '../../core/errors.ts'
import { addTradeRoute, removeTradeRoute } from '../../core/trade/configuration.ts'
import {
  inspectEstateRoutes,
  inspectRoutes,
  localRegisteredConfiguration,
  localRegisteredRepository
} from '../../core/trade/index.ts'
import {
  checkTradeRoutes,
  inspectEstateTradeRoutes,
  inspectLocalTradeRoutes,
  mutateTradeRoute
} from '../../core/trade/operations/index.ts'
import { estateNetwork } from '../../core/trade/routes.ts'
import { type PairTableRow, renderPairTable, renderTree } from '../presentation/index.ts'
import { renderEstateRoutesPage } from './presentation/estate-page.ts'
import { kind, repository, routeDirection, routeState, tradeKindText } from './shared.ts'

interface RouteOptions {
  readonly direction?: string
  readonly kind?: string
}

interface RouteListOptions {
  readonly estate?: boolean
  readonly incomplete?: boolean
  readonly html?: boolean
  readonly table?: boolean
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
  inspected: Awaited<ReturnType<typeof inspectEstateRoutes>>,
  incomplete: boolean,
  columns?: number
): string => {
  const selected = incomplete ? inspected.filter((route) => route.state !== 'active') : inspected
  const routeIdentity = (repository: string): string => repository.slice('https://github.com/'.length)
  const endpoints = (route: (typeof selected)[number]): readonly [string, string] =>
    route.direction === 'export'
      ? [route.source.identity, routeIdentity(route.repository)]
      : [routeIdentity(route.repository), route.source.identity]
  // A reciprocal declaration describes the same directed route; collapse it before pairing endpoints.
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
    `summary: ROUTES=${edges.size} ACTIVE=${active} INCOMPLETE=${incompleteCount}`
  ].join('\n')
}

/**
 * Hands the page to the desktop's own opener. A failure to open is reported rather than fatal:
 * the file is already written, so the caller can open it themselves.
 */
const openInBrowser = async (context: KiContext, path: string): Promise<void> => {
  const opener = context.environment['KI_BROWSER_OPENER'] ?? (context.platform === 'darwin' ? 'open' : 'xdg-open')
  const result = await context.runner(opener, [path], context.environment)
  if (result.exitCode !== 0) context.stderr.write(`ki trade routes list: could not open ${path} with ${opener}\n`)
}

export const createTradeRoutesCommand = (context: KiContext): Command => {
  const routes = new Command('routes').description('maintain local typed trade-route declarations')
  routes
    .addCommand(
      new Command('add')
        .description('declare one local typed trade route')
        .argument('<repository>', 'canonical peer HTTPS GitHub repository')
        .requiredOption('--direction <export|import>', 'whether this repository exports or imports the trade kind')
        .requiredOption('--kind <work|knowledge>', 'trade kind')
        .action(async (peer: string, options: RouteOptions) => {
          const direction = routeDirection(options.direction)
          const result = await mutateTradeRoute(
            repository(peer, 'trade route repository'),
            direction,
            kind(options.kind),
            {
              configurationPath: async () => (await localRegisteredRepository(context)).declaration,
              mutate: addTradeRoute
            }
          )
          context.stdout.write(
            `ki trade routes add: ${direction} ${kind(options.kind)} ${result.repository} -> ${peer}\n`
          )
        })
    )
    .addCommand(
      new Command('remove')
        .description('remove one local typed trade route')
        .argument('<repository>', 'canonical peer HTTPS GitHub repository')
        .requiredOption('--direction <export|import>', 'whether this repository exports or imports the trade kind')
        .requiredOption('--kind <work|knowledge>', 'trade kind')
        .action(async (peer: string, options: RouteOptions) => {
          const direction = routeDirection(options.direction)
          const result = await mutateTradeRoute(
            repository(peer, 'trade route repository'),
            direction,
            kind(options.kind),
            {
              configurationPath: async () => (await localRegisteredConfiguration(context)).repository.declaration,
              mutate: removeTradeRoute
            }
          )
          context.stdout.write(
            `ki trade routes remove: ${direction} ${kind(options.kind)} ${result.repository} -> ${peer}\n`
          )
        })
    )
    .addCommand(
      new Command('list')
        .description('list local routes or every registered route and its estate state')
        .option('--estate', 'list route declarations across the registered repository estate')
        .option('--incomplete', 'show only routes that are not active')
        .option('--table', 'render estate routes as repository pairs')
        .option('--html', 'render the estate as an interactive network page and open it')
        .action(async (options: RouteListOptions) => {
          if (options.table && !options.estate) throw grammarError('trade route --table requires --estate')
          if (options.html && !options.estate) throw grammarError('trade route --html requires --estate')
          if (options.table && options.html) throw grammarError('trade route --table cannot be combined with --html')
          if (options.estate) {
            const incomplete = Boolean(options.incomplete)
            const inspected = await inspectEstateTradeRoutes(incomplete, () => inspectEstateRoutes(context))
            if (options.html) {
              // The page is regenerable from the estate at any moment, so it lives in the cache
              // under a fixed name and is rewritten in place rather than accumulating copies.
              const path = join(context.paths.cache, 'estate-routes.html')
              await mkdir(context.paths.cache, { recursive: true })
              await writeFile(path, renderEstateRoutesPage(estateNetwork(inspected, incomplete)), 'utf8')
              context.stdout.write(`ki trade routes list: estate network written to ${path}\n`)
              await openInBrowser(context, path)
              return
            }
            context.stdout.write(
              `${renderEstateRouteList(inspected, incomplete, context.stdout.isTTY ? context.stdout.columns : undefined)}\n`
            )
            return
          }
          const inspected = await inspectLocalTradeRoutes(Boolean(options.incomplete), {
            configuration: async () => (await localRegisteredConfiguration(context)).configuration,
            inspect: (configuration) => inspectRoutes(context, configuration)
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
          const result = await checkTradeRoutes(
            {
              repository: peer ? repository(peer, 'trade route repository') : undefined,
              direction: options.direction ? routeDirection(options.direction) : undefined,
              kind: options.kind ? kind(options.kind) : undefined
            },
            {
              configuration: async () => (await localRegisteredConfiguration(context)).configuration,
              inspect: (configuration) => inspectRoutes(context, configuration)
            }
          )
          if (peer && !result.routes.length) throw grammarError(`trade route ${peer} is not declared locally`)
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
