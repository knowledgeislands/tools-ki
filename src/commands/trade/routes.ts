import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { grammarError } from '../../core/errors.ts'
import { addTradeRoute, inspectRoutes, localRegisteredConfiguration, localRegisteredRepository, removeTradeRoute } from '../../core/trade-core.ts'
import { count, kind, repository, routeDirection, routeState } from './shared.ts'

interface RouteOptions {
  readonly direction?: string
  readonly kind?: string
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
      new Command('list').description('list locally declared typed trade routes and their estate state').action(async () => {
        const local = await localRegisteredConfiguration(context)
        const inspected = await inspectRoutes(context, local.configuration)
        context.stdout.write(`${renderRouteList(local, inspected)}\n`)
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
          const lines = [
            'ki trade routes check',
            ...(selected.length ? selected.map((route) => `  ${route.direction} ${route.kind} ${route.repository}: ${routeState(route.state)}`) : ['  none'])
          ]
          context.stdout.write(`${lines.join('\n')}\n`)
        })
    )
  return routes
}
