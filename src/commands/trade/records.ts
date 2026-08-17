import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { grammarError } from '../../core/errors.ts'
import {
  abandonTrade,
  createTradePreparation,
  eligibleTradeCleanup,
  locateTrades,
  observeTradePreparation,
  previewReceivableTrades,
  pruneTrade,
  receiveTrade,
  releaseTrade,
  submitTrade,
  tradeLifecycle
} from '../../core/trade/index.ts'
import {
  cleanupTradeBatch,
  listTradeRecords,
  receiveTradeBatch,
  type TradeCleanupOperation,
  type TradeListResult
} from '../../core/trade/operations/index.ts'
import { renderTree } from '../presentation/index.ts'
import { count, kind, observation, renderTradeRelation, repository, requireText, tradeId } from './shared.ts'

interface PrepareOptions {
  readonly kind?: string
  readonly observation?: string
  readonly title?: string
  readonly sourceRef?: string
  readonly context?: string
  readonly submission?: string
  readonly constraints?: string
}

interface BatchOptions {
  readonly all?: boolean
  readonly eligible?: boolean
  readonly yes?: boolean
}

interface ListOptions {
  readonly direction?: string
  readonly status?: string
  readonly kind?: string
  readonly repo?: string
  readonly icons?: boolean
}

const directionLabel = { preparation: 'prepare', inbound: 'import', outbound: 'export' } as const

const renderTradeList = async (result: TradeListResult, icons: boolean): Promise<string> => {
  const { trades, receivable } = result
  const pending = receivable.map((record) => ({
    label: `${record.id} import ${renderTradeRelation(
      record,
      'inbound',
      {
        publicationStatus: 'submitted',
        deliveryStatus: 'awaiting-receipt',
        releaseEligible: false,
        pruneEligible: false
      },
      icons
    )} ${record.title}`
  }))
  const results = trades.map(({ trade, lifecycle }) => ({
    label: `${trade.record.id} ${directionLabel[trade.direction]} ${renderTradeRelation(trade.record, trade.direction, lifecycle, icons)} ${trade.record.title}`
  }))
  const visible = trades.map(({ trade }) => trade)
  return renderTree({
    title: 'KI TRADES',
    entries: [
      {
        label: 'results',
        children: [...pending, ...results].length ? [...pending, ...results] : [{ label: 'trades: none' }]
      },
      {
        label: `summary: TRADES=${visible.length + receivable.length} PREPARATIONS=${visible.filter((trade) => trade.direction === 'preparation').length} IMPORTS=${visible.filter((trade) => trade.direction === 'inbound').length} AWAITING_RECEIPT=${receivable.length} EXPORTS=${visible.filter((trade) => trade.direction === 'outbound').length}`
      }
    ]
  }).join('\n')
}

const renderPreview = (label: string, records: readonly { readonly id: string; readonly title: string }[]): string => {
  const lines = [`ki trade ${label}: ${count(records.length, 'eligible trade')}`]
  lines.push(...records.map((record) => `  ${record.id} ${record.title}`))
  return lines.join('\n')
}

const receiveAll = async (context: KiContext, options: BatchOptions): Promise<void> => {
  const records = await previewReceivableTrades(context)
  context.stdout.write(`${renderPreview('receive --all', records)}\n`)
  if (!options.yes) return
  await receiveTradeBatch(records, (id) => receiveTrade(context, id))
  context.stdout.write(`ki trade receive: received ${count(records.length, 'trade')}\n`)
}

const cleanup = async (
  context: KiContext,
  operation: TradeCleanupOperation,
  id: string | undefined,
  options: BatchOptions
): Promise<void> => {
  if (id && options.eligible) throw grammarError(`ki trade ${operation} accepts either one trade id or --eligible`)
  if (!id && !options.eligible) throw grammarError(`ki trade ${operation} requires one trade id or --eligible`)
  if (id) {
    const value = tradeId(id)
    await (operation === 'release' ? releaseTrade(context, value) : pruneTrade(context, value))
    context.stdout.write(`ki trade ${operation}: ${operation === 'release' ? 'released' : 'pruned'} ${value}\n`)
    return
  }
  const trades = await eligibleTradeCleanup(context, operation)
  context.stdout.write(
    `${renderPreview(
      `${operation} --eligible`,
      trades.map((trade) => trade.record)
    )}\n`
  )
  if (!options.yes) return
  await cleanupTradeBatch(operation, trades, (selected, trade) =>
    selected === 'release' ? releaseTrade(context, trade) : pruneTrade(context, trade)
  )
  context.stdout.write(
    `ki trade ${operation}: ${operation === 'release' ? 'released' : 'pruned'} ${count(trades.length, 'trade')}\n`
  )
}

export const createTradeRecordCommands = (context: KiContext): readonly Command[] => [
  new Command('prepare')
    .description('create one mutable local trade preparation')
    .argument('<repository>', 'receiver canonical HTTPS GitHub repository')
    .requiredOption('--kind <work|knowledge>', 'trade kind')
    .requiredOption('--observation <policy>', 'unattended, receipt, decision, or completion')
    .requiredOption('--title <title>', 'trade title')
    .requiredOption('--source-ref <reference>', 'sender provenance reference')
    .requiredOption('--context <text>', 'trade context')
    .requiredOption('--submission <text>', 'proposed outcome')
    .requiredOption('--constraints <text>', 'receiver constraints')
    .action(async (peer: string, options: PrepareOptions) => {
      const record = await createTradePreparation(context, {
        to: repository(peer, 'trade receiver'),
        kind: kind(options.kind),
        observation: observation(options.observation),
        title: requireText(options.title, '--title'),
        sourceRef: requireText(options.sourceRef, '--source-ref'),
        context: requireText(options.context, '--context'),
        submission: requireText(options.submission, '--submission'),
        constraints: requireText(options.constraints, '--constraints')
      })
      context.stdout.write(`ki trade prepare: created ${record.id} for ${record.receiver} [${record.observation}]\n`)
    }),
  new Command('observe')
    .description('inspect one sender’s committed mutable preparation')
    .argument('<trade-id>', 'trade identifier')
    .action(async (id: string) => {
      const observed = await observeTradePreparation(context, tradeId(id))
      const note = observed.reason ? ` (${observed.reason})` : ''
      context.stdout.write(
        `ki trade observe ${observed.record.id}: ${observed.mode} ${observed.ref}${note}\n${observed.output}`
      )
    }),
  new Command('submit')
    .description('freeze one local preparation as an outbound submission')
    .argument('<trade-id>', 'trade identifier')
    .action(async (id: string) => {
      const record = await submitTrade(context, tradeId(id))
      context.stdout.write(`ki trade submit: submitted ${record.id} for ${record.receiver} [${record.observation}]\n`)
    }),
  new Command('abandon')
    .description('remove one local mutable preparation')
    .argument('<trade-id>', 'trade identifier')
    .requiredOption('--yes', 'confirm removal of the mutable preparation')
    .action(async (id: string) => {
      const value = tradeId(id)
      await abandonTrade(context, value)
      context.stdout.write(`ki trade abandon: abandoned ${value}\n`)
    }),
  new Command('receive')
    .description('receive one committed submission, or preview an explicit batch')
    .argument('[trade-id]', 'trade identifier')
    .option('--all', 'preview every currently receivable trade')
    .option('--yes', 'confirm the previewed batch')
    .action(async (id: string | undefined, options: BatchOptions) => {
      if (Boolean(id) === Boolean(options.all)) throw grammarError('ki trade receive requires one trade id or --all')
      if (options.all) return receiveAll(context, options)
      const result = await receiveTrade(context, tradeId(id))
      context.stdout.write(`ki trade receive: ${result.existing ? 'existing' : 'received'} ${result.id}\n`)
    }),
  new Command('list')
    .description('list trade records in the registered estate and imports awaiting local receipt')
    .option('--direction <direction>', 'prepare, import, or export')
    .option('--status <status>', 'receiver decision status')
    .option('--kind <work|knowledge>', 'trade kind')
    .option('--repo <repository>', 'only one canonical HTTPS GitHub repository')
    .option('--no-icons', 'omit decorative badge icons')
    .action(async (options: ListOptions) => {
      if (options.direction && !['prepare', 'import', 'export'].includes(options.direction))
        throw grammarError('--direction accepts prepare, import, or export')
      const selectedRepository = options.repo ? repository(options.repo, '--repo') : undefined
      const result = await listTradeRecords(
        {
          direction: options.direction
            ? ({ prepare: 'preparation', import: 'inbound', export: 'outbound' } as const)[
                options.direction as 'prepare'
              ]
            : undefined,
          repository: selectedRepository,
          status: options.status,
          kind: options.kind ? kind(options.kind) : undefined
        },
        {
          locate: () => locateTrades(context),
          previewReceivable: () => previewReceivableTrades(context),
          lifecycle: tradeLifecycle
        }
      )
      context.stdout.write(`${await renderTradeList(result, options.icons !== false)}\n`)
    }),
  new Command('show')
    .description('show every visible copy of one trade')
    .argument('<trade-id>', 'trade identifier')
    .action(async (id: string) => {
      const selected = await locateTrades(context, { id: tradeId(id) })
      if (!selected.length) throw grammarError(`trade ${id} was not found in the registered repository estate`)
      const lines = [`ki trade show ${id}`]
      for (const trade of selected)
        lines.push(
          `Repository: ${trade.repository} [${directionLabel[trade.direction]}]`,
          trade.record.contents.trimEnd()
        )
      context.stdout.write(`${lines.join('\n')}\n`)
    }),
  new Command('release')
    .description('remove eligible local outbound submissions')
    .argument('[trade-id]', 'trade identifier')
    .option('--eligible', 'preview every release-eligible local trade')
    .option('--yes', 'confirm the previewed eligible batch')
    .action((id: string | undefined, options: BatchOptions) => cleanup(context, 'release', id, options)),
  new Command('prune')
    .description('remove eligible local inbound copies after sender release')
    .argument('[trade-id]', 'trade identifier')
    .option('--eligible', 'preview every prune-eligible local trade')
    .option('--yes', 'confirm the previewed eligible batch')
    .action((id: string | undefined, options: BatchOptions) => cleanup(context, 'prune', id, options))
]
