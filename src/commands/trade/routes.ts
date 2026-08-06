import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { grammarError } from '../../core/errors.ts'
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
}

const renderRouteList = (local: Awaited<ReturnType<typeof localRegisteredConfiguration>>, inspected: Awaited<ReturnType<typeof inspectRoutes>>): string => {
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

const renderEstateRouteList = (inspected: Awaited<ReturnType<typeof inspectEstateRoutes>>, incomplete: boolean): string => {
  const selected = incomplete ? inspected.filter((route) => route.state !== 'active') : inspected
  const routeIdentity = (repository: string): string => repository.slice('https://github.com/'.length)
  const endpoints = (route: (typeof selected)[number]): readonly [string, string] =>
    route.direction === 'export' ? [route.source.identity, routeIdentity(route.repository)] : [routeIdentity(route.repository), route.source.identity]
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
  const active = selected.filter((route) => route.state === 'active').length
  const incompleteCount = selected.length - active
  const directedRoute = (route: (typeof selected)[number]): string => {
    const [exporter, importer] = endpoints(route)
    return `${route.kind === 'work' ? '⚒' : '◇'} ${exporter} → ${importer} [${routeState(route.state)}]`
  }
  const lines = ['╭─ KI TRADE ROUTES', '│  ◫ registered estate', `│  ✦ ${count(selected.length, 'route')}`, '├─ results']
  if (!selected.length) lines.push(`│  ╰─ ${incomplete ? 'incomplete routes: none' : 'routes: none'}`)
  else lines.push(...ordered.map((route, index) => `│  ${index === ordered.length - 1 ? '╰─' : '├─'} ${directedRoute(route)}`))
  lines.push(`╰─ summary: ROUTES=${selected.length} ACTIVE=${active} INCOMPLETE=${incompleteCount}`)
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
          const result = await addTradeRoute(local.configuration, repository(peer, 'trade route repository'), direction, kind(options.kind))
          context.stdout.write(`ki trade routes add: ${direction} ${kind(options.kind)} ${result.repository} -> ${peer}\n`)
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
          const result = await removeTradeRoute(local.repository.configuration, repository(peer, 'trade route repository'), direction, kind(options.kind))
          context.stdout.write(`ki trade routes remove: ${direction} ${kind(options.kind)} ${result.repository} -> ${peer}\n`)
        })
    )
    .addCommand(
      new Command('list')
        .description('list local routes or every registered route and its estate state')
        .option('--estate', 'list route declarations across the registered repository estate')
        .option('--incomplete', 'show only routes that are not active')
        .action(async (options: RouteListOptions) => {
          if (options.estate) {
            context.stdout.write(`${renderEstateRouteList(await inspectEstateRoutes(context), Boolean(options.incomplete))}\n`)
            return
          }
          const local = await localRegisteredConfiguration(context)
          const inspected = await inspectRoutes(context, local.configuration)
          context.stdout.write(`${renderRouteList(local, options.incomplete ? inspected.filter((route) => route.state !== 'active') : inspected)}\n`)
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
