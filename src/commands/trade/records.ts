import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { grammarError } from '../../core/errors.ts'
import { createOutboundTrade, locateTrades, pruneTrade, receiveTrades, releaseTrade, type TradeDirection } from '../../core/trade-core.ts'
import { count, kind, repository, requireText, tradeId } from './shared.ts'

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

const renderTradeList = (trades: Awaited<ReturnType<typeof locateTrades>>): string => {
  const lines = ['╭─ KI TRADES', `│  ✦ ${count(trades.length, 'trade')}`, '├─ results']
  if (!trades.length) lines.push('│  ╰─ trades: none')
  else {
    const directions = [
      ['import', 'inbound'],
      ['export', 'outbound']
    ] as const
    const groups = directions.flatMap(([label, direction]) => {
      const located = trades.filter((trade) => trade.direction === direction)
      return located.length ? [{ label, trades: located }] : []
    })
    lines.push(
      ...groups.flatMap(({ label, trades: group }, groupIndex) => {
        const lastGroup = groupIndex === groups.length - 1
        const itemPrefix = `│  ${lastGroup ? '   ' : '│  '}`
        return [
          `│  ${lastGroup ? '╰─' : '├─'} ${label}`,
          ...group.map(
            (trade, tradeIndex) =>
              `${itemPrefix}${tradeIndex === group.length - 1 ? '╰─' : '├─'} ${trade.repository} ${trade.record.id} [${trade.record.kind}${trade.record.status ? `, ${trade.record.status}` : ''}] ${trade.record.title}`
          )
        ]
      })
    )
  }
  lines.push(
    `╰─ summary: TRADES=${trades.length} IMPORTS=${trades.filter((trade) => trade.direction === 'inbound').length} EXPORTS=${trades.filter((trade) => trade.direction === 'outbound').length}`
  )
  return lines.join('\n')
}

export const createTradeRecordCommands = (context: KiContext): readonly Command[] => [
  new Command('new')
    .description('create one local export trade')
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
      context.stdout.write(`ki trade new: created ${record.id} for ${record.receiver}\n`)
    }),
  new Command('receive')
    .description('import one kind of eligible trade from a reciprocal sender')
    .requiredOption('--from <repository>', 'sender canonical HTTPS GitHub repository')
    .requiredOption('--kind <work|knowledge>', 'trade kind')
    .option('--id <trade-id>', 'receive one HND trade only')
    .action(async (options: ReceiveOptions) => {
      const result = await receiveTrades(context, repository(options.from, '--from'), kind(options.kind), options.id ? tradeId(options.id, '--id') : undefined)
      const lines = ['ki trade receive', ...result.received.map((id) => `  received ${id}`), ...result.existing.map((id) => `  existing ${id}`)]
      context.stdout.write(`${lines.join('\n')}\n`)
    }),
  new Command('list')
    .description('list trades visible in the registered repository estate')
    .option('--direction <direction>', 'import or export')
    .option('--status <status>', 'receiver status for imported trades')
    .option('--kind <work|knowledge>', 'trade kind')
    .option('--repo <repository>', 'only one canonical HTTPS GitHub repository')
    .action(async (options: ListOptions) => {
      if (options.direction && options.direction !== 'import' && options.direction !== 'export') throw grammarError('--direction accepts import or export')
      const trades = await locateTrades(context, {
        direction: ({ import: 'inbound', export: 'outbound' } as const)[options.direction as 'import' | 'export'] as TradeDirection | undefined,
        ...(options.repo ? { repository: repository(options.repo, '--repo') } : {})
      })
      const selected = trades.filter(
        (trade) => (!options.status || trade.record.status === options.status) && (!options.kind || trade.record.kind === kind(options.kind))
      )
      context.stdout.write(`${renderTradeList(selected)}\n`)
    }),
  new Command('show')
    .description('show every visible copy of one trade')
    .argument('<trade-id>', 'HND trade identifier')
    .action(async (id: string) => {
      const selected = await locateTrades(context, { id: tradeId(id) })
      if (!selected.length) throw grammarError(`trade ${id} was not found in the registered repository estate`)
      const lines = [`ki trade show ${id}`]
      for (const trade of selected)
        lines.push(`Repository: ${trade.repository} [${trade.direction === 'inbound' ? 'import' : 'export'}]`, trade.record.contents.trimEnd())
      context.stdout.write(`${lines.join('\n')}\n`)
    }),
  new Command('release')
    .description('remove this repository’s export copy after a terminal receiver disposition')
    .argument('<trade-id>', 'HND trade identifier')
    .action(async (id: string) => {
      const value = tradeId(id)
      await releaseTrade(context, value)
      context.stdout.write(`ki trade release: released ${value}\n`)
    }),
  new Command('prune')
    .description('remove this repository’s terminal import copy after observable sender release')
    .argument('<trade-id>', 'HND trade identifier')
    .action(async (id: string) => {
      const value = tradeId(id)
      await pruneTrade(context, value)
      context.stdout.write(`ki trade prune: pruned ${value}\n`)
    })
]
