import { basename } from 'node:path'
import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { KiExit } from '../../core/errors.ts'
import { type LocatedTrade, locateTrades, tradeLifecycle } from '../../core/trade/index.ts'
import {
  listRoadmap,
  moveRoadmapItem,
  pruneRoadmap,
  type RoadmapListResult,
  type RoadmapOperationContext,
  type WorkItem,
  workItemHorizons
} from '../../core/work/index.ts'
import { presentation, renderTradeRelation, renderTree, type TreeEntry } from '../presentation/index.ts'

interface RoadmapOptions {
  readonly horizon?: string
  readonly status?: string
  readonly aggregate?: boolean
  readonly icons?: boolean
}

type RepositorySelection = () => {
  readonly repositories: readonly string[]
  readonly agora?: string
  readonly estate?: boolean
}

const horizonOrder = workItemHorizons
const statusOrder = ['done', 'awaiting-review', 'in-progress', 'ready', 'draft'] as const

const operationContext = (context: KiContext): RoadmapOperationContext => ({
  configurationDirectory: context.paths.config,
  stateDirectory: context.paths.state,
  workingDirectory: context.workingDirectory,
  homeDirectory: context.homeDirectory,
  locateTrades: () => locateTrades(context)
})

const orderItemsForText = (items: readonly WorkItem[]): readonly WorkItem[] =>
  [...items].sort(
    (left, right) =>
      horizonOrder.indexOf(left.horizon) - horizonOrder.indexOf(right.horizon) ||
      statusOrder.indexOf(left.status) - statusOrder.indexOf(right.status) ||
      left.id.localeCompare(right.id)
  )

const textHorizonGroups = (
  items: readonly WorkItem[]
): readonly { readonly horizon: string; readonly items: readonly WorkItem[] }[] =>
  horizonOrder.flatMap((horizon) => {
    const group = orderItemsForText(items.filter((item) => item.horizon === horizon))
    return group.length ? [{ horizon, items: group }] : []
  })

const renderTradeEntries = (
  trades: readonly LocatedTrade[],
  estate: readonly LocatedTrade[],
  diagnostic?: string,
  icons = true
): readonly TreeEntry[] => {
  if (diagnostic) return [{ label: `${presentation('status.unavailable').terminal} unavailable: ${diagnostic}` }]
  const directions = [
    ['import', 'inbound'],
    ['export', 'outbound']
  ] as const
  return directions.map(([label, direction]) => {
    const selected = trades.filter((trade) => trade.direction === direction)
    return {
      label: `${label} (${selected.length})`,
      children: selected.map((trade) => {
        const lifecycle = tradeLifecycle(trade, estate)
        return {
          label: `${trade.record.id} ${renderTradeRelation(trade.record, direction, lifecycle, icons)} ${trade.record.title}`
        }
      })
    }
  })
}

const countTradeDirections = (
  trades: readonly LocatedTrade[]
): { readonly inbound: number; readonly outbound: number } => {
  let inbound = 0
  let outbound = 0
  for (const trade of trades) {
    if (trade.direction === 'inbound') inbound += 1
    else outbound += 1
  }
  return { inbound, outbound }
}

const renderTextResult = (result: RoadmapListResult, estate: readonly LocatedTrade[], icons = true): string => {
  const context = [
    { label: `${presentation('entity.repository').terminal} ${basename(result.repository)} (${result.repository})` }
  ]
  const items = result.items ?? []
  const groups = textHorizonGroups(items)
  const roadmap = result.diagnostic
    ? [{ label: `${presentation('status.unavailable').terminal} ${result.diagnostic}` }]
    : result.roadmap === 'absent'
      ? [{ label: `${presentation('status.skip').terminal} no roadmap` }]
      : groups.map(({ horizon, items: group }) => ({
          label: `${horizon} (${group.length})`,
          children: group.map((item) => ({ label: `${item.id} [${item.status}] ${item.title}` }))
        }))
  const { inbound, outbound } = countTradeDirections(result.trades)
  const done = items.filter((item) => item.status === 'done').length
  const active = items.length - done
  const tradeSummary = result.tradeDiagnostic
    ? 'unavailable'
    : `${result.trades.length} IMPORTS=${inbound} EXPORTS=${outbound}`
  return renderTree({
    title: 'KI REPO ROADMAP',
    context,
    entries: [
      { label: `roadmap (${items.length})`, children: roadmap },
      {
        label: `trades (${result.trades.length})`,
        children: renderTradeEntries(result.trades, estate, result.tradeDiagnostic, icons)
      },
      { label: `summary: ITEMS=${items.length} ACTIVE=${active} DONE=${done} TRADES=${tradeSummary}` }
    ]
  }).join('\n')
}

const renderAggregateResult = (
  results: readonly RoadmapListResult[],
  estate: readonly LocatedTrade[],
  icons = true
): string => {
  const entries: TreeEntry[] = []
  const items = results.flatMap((result) => result.items ?? [])
  const absent = results.filter((result) => result.roadmap === 'absent')
  const diagnostics = results.filter((result) => result.diagnostic)
  const horizonEntries = horizonOrder.flatMap((horizon) => {
    const grouped = orderItemsForText(
      results.flatMap((result) => result.items ?? []).filter((item) => item.horizon === horizon)
    )
    return grouped.length
      ? [
          {
            label: `${horizon} (${grouped.length})`,
            children: grouped.map((item) => ({ label: `${item.id} [${item.status}] ${item.title}` }))
          }
        ]
      : []
  })
  entries.push({ label: `roadmap (${items.length})`, children: horizonEntries })
  if (absent.length)
    entries.push({
      label: `no roadmap (${absent.length})`,
      children: absent.map((result) => ({
        label: `${presentation('entity.repository').terminal} ${basename(result.repository)}`
      }))
    })
  if (diagnostics.length)
    entries.push({
      label: `diagnostics (${diagnostics.length})`,
      children: diagnostics.map((result) => ({
        label: `${presentation('status.unavailable').terminal} ${basename(result.repository)}: ${result.diagnostic}`
      }))
    })
  const tradeResults = results.filter((result) => result.trades.length || result.tradeDiagnostic)
  const tradeCount = results.reduce((total, result) => total + result.trades.length, 0)
  if (tradeResults.length)
    entries.push({
      label: `trades (${tradeCount})`,
      children: tradeResults.map((result) => ({
        label: `${presentation('entity.repository').terminal} ${basename(result.repository)} (${result.trades.length})`,
        children: renderTradeEntries(result.trades, estate, result.tradeDiagnostic, icons)
      }))
    })
  const done = items.filter((item) => item.status === 'done').length
  const active = items.length - done
  const tradeDiagnostic = results.some((result) => result.tradeDiagnostic)
  entries.push({
    label:
      `summary: REPOSITORIES=${results.length} ROADMAPS=${results.length - absent.length} ` +
      `NO_ROADMAP=${absent.length} ITEMS=${items.length} ACTIVE=${active} DONE=${done} ` +
      `TRADES=${tradeDiagnostic ? 'unavailable' : tradeCount}`
  })
  return renderTree({ title: 'KI AGGREGATE ROADMAP', entries }).join('\n')
}

const listCommand = (context: KiContext, selectedRepositories: RepositorySelection): Command =>
  new Command('list')
    .description('list governed work items')
    .option('--aggregate', 'render one selected-set roadmap inventory')
    .option('--horizon <horizon>', 'only items at this horizon')
    .option('--status <status>', 'only items at this status')
    .option('--no-icons', 'omit decorative trade badge icons')
    .action(async (options: RoadmapOptions) => {
      const { estate, results } = await listRoadmap(operationContext(context), selectedRepositories(), options)
      const output = options.aggregate
        ? renderAggregateResult(results, estate, options.icons !== false)
        : results.map((result) => renderTextResult(result, estate, options.icons !== false)).join('\n\n')
      context.stdout.write(`${output}\n`)
      if (results.some((result) => result.tradeDiagnostic || result.diagnostic)) throw new KiExit(1)
    })

const pruneCommand = (context: KiContext, selectedRepositories: RepositorySelection): Command =>
  new Command('prune')
    .description('delete completed governed work items')
    .argument('[id]', 'canonical completed work-item identifier')
    .action(async (id: string | undefined) => {
      const removed = await pruneRoadmap(operationContext(context), selectedRepositories(), id)
      const entries = removed.flatMap(({ repository, items }) =>
        items.map((item) => `${repository}: ${item.id} [done] ${item.title}`)
      )
      if (!entries.length) context.stdout.write('ki repo roadmap prune: no done work items\n')
      else
        context.stdout.write(
          `${entries.map((entry) => `pruned ${entry}`).join('\n')}\nki repo roadmap prune: removed ${entries.length} done work item(s)\n`
        )
    })

const moveCommand = (
  context: KiContext,
  selectedRepositories: RepositorySelection,
  operation: 'promote' | 'demote'
): Command =>
  new Command(operation)
    .description(operation === 'promote' ? 'move one work item toward now' : 'move one work item toward future')
    .argument('<id>', 'canonical work-item identifier')
    .argument(
      '[horizon]',
      operation === 'promote' ? 'direct destination horizon toward now' : 'direct destination horizon toward future'
    )
    .action(async (id: string, horizon: string | undefined) => {
      const result = await moveRoadmapItem(operationContext(context), selectedRepositories(), operation, id, horizon)
      context.stdout.write(`ki repo roadmap ${operation}: ${result.id} ${result.from} -> ${result.to}\n`)
    })

export const createRepoRoadmapCommand = (context: KiContext, selectedRepositories: RepositorySelection): Command =>
  new Command('roadmap')
    .description('inspect and mechanically maintain governed work items')
    .addCommand(listCommand(context, selectedRepositories))
    .addCommand(pruneCommand(context, selectedRepositories))
    .addCommand(moveCommand(context, selectedRepositories, 'promote'))
    .addCommand(moveCommand(context, selectedRepositories, 'demote'))
