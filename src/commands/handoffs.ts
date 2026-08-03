import { Command } from 'commander'
import type { KiContext } from '../context.ts'
import { grammarError } from '../core/errors.ts'
import {
  addHandoffRoute,
  createOutboundHandoff,
  inspectRoutes,
  isHandoffAddress,
  isHandoffIdentifier,
  localRegisteredConfiguration,
  localRegisteredRepository,
  locateHandoffs,
  pruneHandoff,
  receiveHandoffs,
  releaseHandoff,
  removeHandoffRoute
} from '../core/handoffs.ts'

interface RouteAddOptions {
  readonly identity?: string
}

interface NewOptions {
  readonly to?: string
  readonly title?: string
  readonly sourceRef?: string
  readonly context?: string
  readonly submission?: string
  readonly constraints?: string
}

interface ReceiveOptions {
  readonly from?: string
  readonly id?: string
}

interface ListOptions {
  readonly direction?: string
  readonly status?: string
  readonly repo?: string
}

const address = (value: string | undefined, option: string): string => {
  if (!value || !isHandoffAddress(value)) throw grammarError(`${option} must use canonical lower-case owner/repository form`)
  return value
}

const handoffId = (value: string | undefined, option = 'handoff id'): string => {
  if (!value || !isHandoffIdentifier(value)) throw grammarError(`${option} must use HND- followed by a lower-case UUID`)
  return value
}

const requireText = (value: string | undefined, option: string): string => {
  if (!value?.trim()) throw grammarError(`${option} is required and must be non-empty`)
  return value
}

const routeState = (state: string): string =>
  ({ active: 'active', 'missing-peer': 'missing peer', 'ambiguous-peer': 'ambiguous peer', nonreciprocal: 'nonreciprocal' })[state] ?? state

export const createHandoffsCommand = (context: KiContext): Command => {
  const routes = new Command('routes').description('maintain local reciprocal handoff route declarations')
  routes
    .addCommand(
      new Command('add')
        .description('declare one local handoff peer route')
        .argument('<peer>', 'canonical peer owner/repository address')
        .option('--identity <owner/repository>', 'set the local canonical handoff identity when first configuring routes')
        .action(async (peer: string, options: RouteAddOptions) => {
          const local = await localRegisteredRepository(context)
          const result = await addHandoffRoute(local.configuration, address(peer, 'handoff peer'), options.identity)
          context.stdout.write(`ki handoffs routes add: ${result.identity} -> ${peer}\n`)
        })
    )
    .addCommand(
      new Command('remove')
        .description('remove one local handoff peer route')
        .argument('<peer>', 'canonical peer owner/repository address')
        .action(async (peer: string) => {
          const local = await localRegisteredConfiguration(context)
          const result = await removeHandoffRoute(local.repository.configuration, address(peer, 'handoff peer'))
          context.stdout.write(`ki handoffs routes remove: ${result.identity} -> ${peer}\n`)
        })
    )
    .addCommand(
      new Command('list').description('list locally declared handoff routes and their estate state').action(async () => {
        const local = await localRegisteredConfiguration(context)
        const inspected = await inspectRoutes(context, local.configuration)
        const lines = ['ki handoffs routes list', `Identity: ${local.configuration.identity}`, 'Routes:']
        lines.push(...(inspected.length ? inspected.map((route) => `  ${route.peer} [${routeState(route.state)}]`) : ['  none']))
        context.stdout.write(`${lines.join('\n')}\n`)
      })
    )
    .addCommand(
      new Command('check')
        .description('check locally declared handoff routes against the registered repository estate')
        .argument('[peer]', 'canonical peer owner/repository address')
        .action(async (peer?: string) => {
          const local = await localRegisteredConfiguration(context)
          const inspected = await inspectRoutes(context, local.configuration)
          const selected = peer ? inspected.filter((route) => route.peer === address(peer, 'handoff peer')) : inspected
          if (peer && !selected.length) throw grammarError(`handoff route ${peer} is not declared locally`)
          const lines = ['ki handoffs routes check', ...(selected.length ? selected.map((route) => `  ${route.peer}: ${routeState(route.state)}`) : ['  none'])]
          context.stdout.write(`${lines.join('\n')}\n`)
        })
    )

  const command = new Command('handoffs').description('submit and inspect reciprocal cross-repository handoffs')
  command.addCommand(routes)
  command.addCommand(
    new Command('new')
      .description('create one local outbound handoff submission')
      .requiredOption('--to <owner/repository>', 'receiver canonical address')
      .requiredOption('--title <title>', 'submission title')
      .requiredOption('--source-ref <reference>', 'sender provenance reference')
      .requiredOption('--context <text>', 'submission context')
      .requiredOption('--submission <text>', 'proposed outcome')
      .requiredOption('--constraints <text>', 'receiver constraints')
      .action(async (options: NewOptions) => {
        const record = await createOutboundHandoff(context, {
          to: address(options.to, '--to'),
          title: requireText(options.title, '--title'),
          sourceRef: requireText(options.sourceRef, '--source-ref'),
          context: requireText(options.context, '--context'),
          submission: requireText(options.submission, '--submission'),
          constraints: requireText(options.constraints, '--constraints')
        })
        context.stdout.write(`ki handoffs new: created ${record.id} for ${record.receiver}\n`)
      })
  )
  command.addCommand(
    new Command('receive')
      .description('pull eligible outbound handoffs from one reciprocal peer into this repository')
      .requiredOption('--from <owner/repository>', 'sender canonical address')
      .option('--id <handoff-id>', 'receive one HND handoff only')
      .action(async (options: ReceiveOptions) => {
        const result = await receiveHandoffs(context, address(options.from, '--from'), options.id ? handoffId(options.id, '--id') : undefined)
        const lines = ['ki handoffs receive', ...result.received.map((id) => `  received ${id}`), ...result.existing.map((id) => `  existing ${id}`)]
        context.stdout.write(`${lines.join('\n')}\n`)
      })
  )
  command.addCommand(
    new Command('list')
      .description('list handoffs visible in the registered repository estate')
      .option('--direction <direction>', 'inbound or outbound')
      .option('--status <status>', 'receiver status for inbound handoffs')
      .option('--repo <owner/repository>', 'only one canonical repository')
      .action(async (options: ListOptions) => {
        if (options.direction && options.direction !== 'inbound' && options.direction !== 'outbound')
          throw grammarError('--direction accepts inbound or outbound')
        if (options.repo) address(options.repo, '--repo')
        const handoffs = await locateHandoffs(context, { direction: options.direction as 'inbound' | 'outbound' | undefined, repository: options.repo })
        const selected = handoffs.filter((handoff) => !options.status || handoff.record.status === options.status)
        const lines = ['ki handoffs list']
        lines.push(
          ...(selected.length
            ? selected.map(
                (handoff) =>
                  `  ${handoff.repository} ${handoff.direction} ${handoff.record.id}${handoff.record.status ? ` [${handoff.record.status}]` : ''} ${handoff.record.title}`
              )
            : ['  none'])
        )
        context.stdout.write(`${lines.join('\n')}\n`)
      })
  )
  command.addCommand(
    new Command('show')
      .description('show every visible copy of one handoff')
      .argument('<handoff-id>', 'HND handoff identifier')
      .action(async (id: string) => {
        const selected = await locateHandoffs(context, { id: handoffId(id) })
        if (!selected.length) throw grammarError(`handoff ${id} was not found in the registered repository estate`)
        const lines = [`ki handoffs show ${id}`]
        for (const handoff of selected) lines.push(`Repository: ${handoff.repository} [${handoff.direction}]`, handoff.record.contents.trimEnd())
        context.stdout.write(`${lines.join('\n')}\n`)
      })
  )
  command.addCommand(
    new Command('release')
      .description('remove this repository’s outbound copy after a terminal receiver disposition')
      .argument('<handoff-id>', 'HND handoff identifier')
      .action(async (id: string) => {
        const value = handoffId(id)
        await releaseHandoff(context, value)
        context.stdout.write(`ki handoffs release: released ${value}\n`)
      })
  )
  command.addCommand(
    new Command('prune')
      .description('remove this repository’s terminal inbound copy after observable sender release')
      .argument('<handoff-id>', 'HND handoff identifier')
      .action(async (id: string) => {
        const value = handoffId(id)
        await pruneHandoff(context, value)
        context.stdout.write(`ki handoffs prune: pruned ${value}\n`)
      })
  )
  return command
}
