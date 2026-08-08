import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { grammarError } from '../../core/errors.ts'
import { renderEstateRoutesDiagram } from '../../core/route-diagram.ts'
import {
  addTradeRoute,
  inspectEstateRoutes,
  inspectRoutes,
  localRegisteredConfiguration,
  localRegisteredRepository,
  removeTradeRoute
} from '../../core/trade-core.ts'
import { count, kind, repository, routeDirection, routeState } from './shared.ts'

interface RouteOptions {
  readonly direction?: string
  readonly kind?: string
}

interface RouteListOptions {
  readonly estate?: boolean
  readonly incomplete?: boolean
  readonly svg?: boolean | string
}

const renderRouteList = (
  local: Awaited<ReturnType<typeof localRegisteredConfiguration>>,
  inspected: Awaited<ReturnType<typeof inspectRoutes>>
): string => {
  const lines = [
    '╭─ KI TRADE ROUTES',
    `│  📁 ${local.configuration.identity}`,
    `│     ${local.configuration.repository}`,
    `│  ✦ ${count(inspected.length, 'route')}`,
    '├─ results'
  ]
  if (!inspected.length) lines.push('│  ╰─ routes: none')
  else {
    const directions = ['export', 'import'] as const
    const groups = directions.flatMap((direction) => {
      const routes = inspected.filter((route) => route.direction === direction)
      return routes.length ? [{ direction, routes }] : []
    })
    lines.push(
      ...groups.flatMap(({ direction, routes }, groupIndex) => {
        const lastGroup = groupIndex === groups.length - 1
        const itemPrefix = `│  ${lastGroup ? '   ' : '│  '}`
        return [
          `│  ${lastGroup ? '╰─' : '├─'} ${direction}`,
          ...routes.map(
            (route, routeIndex) =>
              `${itemPrefix}${routeIndex === routes.length - 1 ? '╰─' : '├─'} ${route.kind} ${route.repository} [${routeState(route.state)}]`
          )
        ]
      })
    )
  }
  lines.push(`╰─ summary: ROUTES=${inspected.length}`)
  return lines.join('\n')
}

const renderEstateRouteList = (
  inspected: Awaited<ReturnType<typeof inspectEstateRoutes>>,
  incomplete: boolean
): string => {
  const selected = incomplete ? inspected.filter((route) => route.state !== 'active') : inspected
  const routeIdentity = (repository: string): string => repository.slice('https://github.com/'.length)
  const endpoints = (route: (typeof selected)[number]): readonly [string, string] =>
    route.direction === 'export'
      ? [route.source.identity, routeIdentity(route.repository)]
      : [routeIdentity(route.repository), route.source.identity]
  const ordered = [...selected].sort((left, right) => {
    const [leftExporter, leftImporter] = endpoints(left)
    const [rightExporter, rightImporter] = endpoints(right)
    return (
      leftExporter.localeCompare(rightExporter) ||
      leftImporter.localeCompare(rightImporter) ||
      left.kind.localeCompare(right.kind) ||
      left.direction.localeCompare(right.direction)
    )
  })
  // A reciprocal route is declared on both sides, so both declarations describe one edge.
  // Collapse them, then group by exporter so each peer is named once carrying its kinds.
  const edges = new Map<string, { exporter: string; importer: string; state: string; kinds: Set<string> }>()
  for (const route of ordered) {
    const [exporter, importer] = endpoints(route)
    const state = routeState(route.state)
    const key = `${exporter} ${importer} ${state}`
    const edge = edges.get(key) ?? { exporter, importer, state, kinds: new Set<string>() }
    edge.kinds.add(route.kind)
    edges.set(key, edge)
  }
  const exporters = [...new Set([...edges.values()].map(({ exporter }) => exporter))]
  // Counted over collapsed edges, so the summary and the listed rows agree.
  const active = [...edges.values()].filter((edge) => edge.state === 'active').length
  const incompleteCount = edges.size - active
  const lines = ['╭─ KI TRADE ROUTES', '│  ◫ registered estate', `│  ✦ ${count(edges.size, 'route')}`, '├─ results']
  if (!edges.size) lines.push(`│  ╰─ ${incomplete ? 'incomplete routes: none' : 'routes: none'}`)
  else
    lines.push(
      ...exporters.flatMap((exporter, exporterIndex) => {
        const lastExporter = exporterIndex === exporters.length - 1
        const peers = [...edges.values()].filter((edge) => edge.exporter === exporter)
        return [
          `│  ${lastExporter ? '╰─' : '├─'} ${exporter}`,
          ...peers.map((edge, peerIndex) => {
            const kinds = [...edge.kinds]
              .sort()
              .map((value) => `${value === 'work' ? '⚒' : '◇'} ${value}`)
              .join(', ')
            return `│  ${lastExporter ? '   ' : '│  '}${peerIndex === peers.length - 1 ? '╰─' : '├─'} → ${edge.importer} · ${kinds} [${edge.state}]`
          })
        ]
      })
    )
  lines.push(`╰─ summary: ROUTES=${edges.size} ACTIVE=${active} INCOMPLETE=${incompleteCount}`)
  return lines.join('\n')
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
          const local = await localRegisteredRepository(context)
          const direction = routeDirection(options.direction)
          const result = await addTradeRoute(
            local.configuration,
            repository(peer, 'trade route repository'),
            direction,
            kind(options.kind)
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
          const local = await localRegisteredConfiguration(context)
          const direction = routeDirection(options.direction)
          const result = await removeTradeRoute(
            local.repository.configuration,
            repository(peer, 'trade route repository'),
            direction,
            kind(options.kind)
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
        .option('--svg [path]', 'render the estate as an SVG diagram, to a file when a path is given')
        .action(async (options: RouteListOptions) => {
          if (options.svg && !options.estate) throw grammarError('trade route --svg requires --estate')
          if (options.estate) {
            const inspected = await inspectEstateRoutes(context)
            const incomplete = Boolean(options.incomplete)
            if (options.svg) {
              const diagram = renderEstateRoutesDiagram(inspected, incomplete)
              if (options.svg === true) context.stdout.write(diagram)
              else {
                const path = resolve(context.workingDirectory, options.svg)
                await writeFile(path, diagram, 'utf8')
                context.stdout.write(`ki trade routes list: estate diagram written to ${path}\n`)
              }
              return
            }
            context.stdout.write(`${renderEstateRouteList(inspected, incomplete)}\n`)
            return
          }
          const local = await localRegisteredConfiguration(context)
          const inspected = await inspectRoutes(context, local.configuration)
          context.stdout.write(
            `${renderRouteList(local, options.incomplete ? inspected.filter((route) => route.state !== 'active') : inspected)}\n`
          )
        })
    )
    .addCommand(
      new Command('check')
        .description('check local typed trade routes and their activation state')
        .argument('[repository]', 'canonical peer HTTPS GitHub repository')
        .option('--direction <export|import>', 'restrict to one route direction')
        .option('--kind <work|knowledge>', 'restrict to one trade kind')
        .action(async (peer: string | undefined, options: RouteOptions) => {
          const local = await localRegisteredConfiguration(context)
          const inspected = await inspectRoutes(context, local.configuration)
          const selected = inspected.filter(
            (route) =>
              (!peer || route.repository === repository(peer, 'trade route repository')) &&
              (!options.direction || route.direction === routeDirection(options.direction)) &&
              (!options.kind || route.kind === kind(options.kind))
          )
          if (peer && !selected.length) throw grammarError(`trade route ${peer} is not declared locally`)
          const active = selected.filter((route) => route.state === 'active').length
          const lines = ['╭─ KI TRADE ROUTE CHECK', `├─ routes (${selected.length})`]
          if (!selected.length) lines.push('│  ╰─ none')
          else
            lines.push(
              ...selected.map(
                (route, index) =>
                  `│  ${index === selected.length - 1 ? '╰─' : '├─'} ${route.direction} ${route.kind} ${route.repository}: ${routeState(route.state)}`
              )
            )
          lines.push(`╰─ summary: ROUTES=${selected.length} ACTIVE=${active}`)
          context.stdout.write(`${lines.join('\n')}\n`)
        })
    )
  return routes
}
