import { Command } from 'commander'
import type { KiContext } from '../context.ts'
import { grammarError } from '../core/errors.ts'
import {
  addTradeRoute,
  createOutboundTrade,
  inspectRoutes,
  isTradeIdentifier,
  isTradeKind,
  isTradeRepository,
  localRegisteredConfiguration,
  localRegisteredRepository,
  locateTrades,
  pruneTrade,
  type RouteDirection,
  type RouteState,
  receiveTrades,
  releaseTrade,
  removeTradeRoute,
  type TradeDirection,
  type TradeKind
} from '../core/trade-core.ts'

interface RouteOptions {
  readonly direction?: string
  readonly kind?: string
}

interface NewOptions {
  readonly to?: string
  readonly kind?: string
  readonly title?: string
  readonly sourceRef?: string
  readonly context?: string
  readonly submission?: string
  readonly constraints?: string
}

interface ReceiveOptions {
  readonly from?: string
  readonly kind?: string
  readonly id?: string
}

interface ListOptions {
  readonly direction?: string
  readonly status?: string
  readonly kind?: string
  readonly repo?: string
}

const repository = (value: string | undefined, option: string): string => {
  if (!value || !isTradeRepository(value)) throw grammarError(`${option} must use canonical HTTPS GitHub repository form`)
  return value
}

const kind = (value: string | undefined, option = '--kind'): TradeKind => {
  if (!value || !isTradeKind(value)) throw grammarError(`${option} accepts work or knowledge`)
  return value
}

const routeDirection = (value: string | undefined): RouteDirection => {
  if (value !== 'export' && value !== 'import') throw grammarError('--direction accepts export or import')
  return value
}

const tradeId = (value: string | undefined, option = 'trade id'): string => {
  if (!value || !isTradeIdentifier(value)) throw grammarError(`${option} must use TRD- followed by a lower-case UUID`)
  return value
}

const requireText = (value: string | undefined, option: string): string => {
  if (!value?.trim()) throw grammarError(`${option} is required and must be non-empty`)
  return value
}

const routeState = (state: RouteState): string =>
  ({ active: 'active', 'missing-repository': 'missing repository', 'ambiguous-repository': 'ambiguous repository', nonreciprocal: 'nonreciprocal' })[state]

export const createTradesCommand = (context: KiContext): Command => {
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
          context.stdout.write(`ki trades routes add: ${direction} ${kind(options.kind)} ${result.repository} -> ${peer}\n`)
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
          context.stdout.write(`ki trades routes remove: ${direction} ${kind(options.kind)} ${result.repository} -> ${peer}\n`)
        })
    )
    .addCommand(
      new Command('list').description('list locally declared typed trade routes and their estate state').action(async () => {
        const local = await localRegisteredConfiguration(context)
        const inspected = await inspectRoutes(context, local.configuration)
        const lines = ['ki trades routes list', `Repository: ${local.configuration.repository}`, 'Routes:']
        lines.push(
          ...(inspected.length ? inspected.map((route) => `  ${route.direction} ${route.kind} ${route.repository} [${routeState(route.state)}]`) : ['  none'])
        )
        context.stdout.write(`${lines.join('\n')}\n`)
      })
    )
    .addCommand(
      new Command('check')
        .description('check local typed trade routes against the registered repository estate')
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
            'ki trades routes check',
            ...(selected.length ? selected.map((route) => `  ${route.direction} ${route.kind} ${route.repository}: ${routeState(route.state)}`) : ['  none'])
          ]
          context.stdout.write(`${lines.join('\n')}\n`)
        })
    )

  const command = new Command('trades').description('submit and inspect typed cross-repository work and knowledge trades')
  command.addCommand(routes)
  command.addCommand(
    new Command('new')
      .description('create one local outbound trade')
      .requiredOption('--to <repository>', 'receiver canonical HTTPS GitHub repository')
      .requiredOption('--kind <work|knowledge>', 'trade kind')
      .requiredOption('--title <title>', 'trade title')
      .requiredOption('--source-ref <reference>', 'sender provenance reference')
      .requiredOption('--context <text>', 'trade context')
      .requiredOption('--submission <text>', 'proposed outcome')
      .requiredOption('--constraints <text>', 'receiver constraints')
      .action(async (options: NewOptions) => {
        const record = await createOutboundTrade(context, {
          to: repository(options.to, '--to'),
          kind: kind(options.kind),
          title: requireText(options.title, '--title'),
          sourceRef: requireText(options.sourceRef, '--source-ref'),
          context: requireText(options.context, '--context'),
          submission: requireText(options.submission, '--submission'),
          constraints: requireText(options.constraints, '--constraints')
        })
        context.stdout.write(`ki trades new: created ${record.id} for ${record.receiver}\n`)
      })
  )
  command.addCommand(
    new Command('receive')
      .description('pull one kind of eligible outbound trade from a reciprocal sender')
      .requiredOption('--from <repository>', 'sender canonical HTTPS GitHub repository')
      .requiredOption('--kind <work|knowledge>', 'trade kind')
      .option('--id <trade-id>', 'receive one HND trade only')
      .action(async (options: ReceiveOptions) => {
        const result = await receiveTrades(
          context,
          repository(options.from, '--from'),
          kind(options.kind),
          options.id ? tradeId(options.id, '--id') : undefined
        )
        const lines = ['ki trades receive', ...result.received.map((id) => `  received ${id}`), ...result.existing.map((id) => `  existing ${id}`)]
        context.stdout.write(`${lines.join('\n')}\n`)
      })
  )
  command.addCommand(
    new Command('list')
      .description('list trades visible in the registered repository estate')
      .option('--direction <direction>', 'inbound or outbound')
      .option('--status <status>', 'receiver status for inbound trades')
      .option('--kind <work|knowledge>', 'trade kind')
      .option('--repo <repository>', 'only one canonical HTTPS GitHub repository')
      .action(async (options: ListOptions) => {
        if (options.direction && options.direction !== 'inbound' && options.direction !== 'outbound')
          throw grammarError('--direction accepts inbound or outbound')
        const trades = await locateTrades(context, {
          direction: options.direction as TradeDirection | undefined,
          ...(options.repo ? { repository: repository(options.repo, '--repo') } : {})
        })
        const selected = trades.filter(
          (trade) => (!options.status || trade.record.status === options.status) && (!options.kind || trade.record.kind === kind(options.kind))
        )
        const lines = ['ki trades list']
        lines.push(
          ...(selected.length
            ? selected.map(
                (trade) =>
                  `  ${trade.repository} ${trade.direction} ${trade.record.id} [${trade.record.kind}${trade.record.status ? `, ${trade.record.status}` : ''}] ${trade.record.title}`
              )
            : ['  none'])
        )
        context.stdout.write(`${lines.join('\n')}\n`)
      })
  )
  command.addCommand(
    new Command('show')
      .description('show every visible copy of one trade')
      .argument('<trade-id>', 'HND trade identifier')
      .action(async (id: string) => {
        const selected = await locateTrades(context, { id: tradeId(id) })
        if (!selected.length) throw grammarError(`trade ${id} was not found in the registered repository estate`)
        const lines = [`ki trades show ${id}`]
        for (const trade of selected) lines.push(`Repository: ${trade.repository} [${trade.direction}]`, trade.record.contents.trimEnd())
        context.stdout.write(`${lines.join('\n')}\n`)
      })
  )
  command.addCommand(
    new Command('release')
      .description('remove this repository’s outbound copy after a terminal receiver disposition')
      .argument('<trade-id>', 'HND trade identifier')
      .action(async (id: string) => {
        const value = tradeId(id)
        await releaseTrade(context, value)
        context.stdout.write(`ki trades release: released ${value}\n`)
      })
  )
  command.addCommand(
    new Command('prune')
      .description('remove this repository’s terminal inbound copy after observable sender release')
      .argument('<trade-id>', 'HND trade identifier')
      .action(async (id: string) => {
        const value = tradeId(id)
        await pruneTrade(context, value)
        context.stdout.write(`ki trades prune: pruned ${value}\n`)
      })
  )
  return command
}
