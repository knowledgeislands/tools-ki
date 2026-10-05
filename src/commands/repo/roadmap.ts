import { basename } from 'node:path'
import { Command, Option } from 'commander'
import type { KiContext } from '../../context.ts'
import { grammarError, KiExit } from '../../core/errors.ts'
import { type LocatedTrade, locateTrades, tradeLifecycle } from '../../core/trade/index.ts'
import {
  listRoadmap,
  listRoadmapItems,
  moveRoadmapItem,
  pruneRoadmap,
  type RoadmapItemResult,
  type RoadmapListResult,
  type RoadmapOperationContext,
  type RoadmapStatisticsResult,
  roadmapReport,
  roadmapStatisticsForSelection,
  type WorkItem,
  workItemHorizons
} from '../../core/work/index.ts'
import {
  presentation,
  renderMatrixTable,
  renderTradeRelation,
  renderTree,
  type TreeEntry
} from '../presentation/index.ts'
import { type RoadmapTextOptions, renderRoadmapItem, roadmapLinkLegend } from './roadmap-links.ts'

interface RoadmapOptions {
  readonly horizon?: string
  readonly status?: string
  readonly aggregate?: boolean
  readonly icons?: boolean
  readonly format?: string
  readonly links: 'compact' | 'all'
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
  now: context.now,
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

const renderTextResult = (
  result: RoadmapListResult,
  estate: readonly LocatedTrade[],
  options: RoadmapTextOptions
): string => {
  const context = [
    { label: `${presentation('entity.repository').terminal} ${basename(result.repository)} (${result.repository})` }
  ]
  const trades = result.trades
  const items = result.items ?? []
  const faults = result.faults ?? []
  const groups = textHorizonGroups(items)
  const roadmap = result.diagnostic
    ? [{ label: `${presentation('status.unavailable').terminal} ${result.diagnostic}` }]
    : result.roadmap === 'absent'
      ? [{ label: `${presentation('status.skip').terminal} no roadmap` }]
      : [
          ...groups.map(({ horizon, items: group }) => ({
            label: `${horizon} (${group.length})`,
            children: group.map((item) => renderRoadmapItem(item, options))
          })),
          ...faults.map((fault) => ({
            label: `${presentation('status.unavailable').terminal} ${fault.message}`
          }))
        ]
  const { inbound, outbound } = countTradeDirections(trades)
  const done = items.filter((item) => item.status === 'done').length
  const notDone = items.length - done
  const tradeSummary = result.tradeDiagnostic
    ? 'unavailable'
    : `${trades.length} IMPORTS=${inbound} EXPORTS=${outbound}`
  return renderTree({
    title: 'KI REPO ROADMAP',
    context,
    entries: [
      { label: `roadmap (${items.length})`, children: roadmap },
      ...roadmapLinkLegend(items, options),
      {
        label: `trades (${trades.length})`,
        children: renderTradeEntries(trades, estate, result.tradeDiagnostic, options.icons)
      },
      { label: `summary: ITEMS=${items.length} NOT_DONE=${notDone} DONE=${done} TRADES=${tradeSummary}` }
    ]
  }).join('\n')
}

const renderAggregateResult = (
  results: readonly RoadmapListResult[],
  estate: readonly LocatedTrade[],
  options: RoadmapTextOptions
): string => {
  const entries: TreeEntry[] = []
  const items = results.flatMap((result) => result.items ?? [])
  const absent = results.filter((result) => result.roadmap === 'absent')
  const diagnostics = results.filter((result) => result.diagnostic)
  const faultEntries = results.flatMap((result) =>
    (result.faults ?? []).map((fault) => ({
      label: `${presentation('status.unavailable').terminal} ${basename(result.repository)}: ${fault.message}`
    }))
  )
  const horizonEntries = horizonOrder.flatMap((horizon) => {
    const grouped = orderItemsForText(
      results.flatMap((result) => result.items ?? []).filter((item) => item.horizon === horizon)
    )
    return grouped.length
      ? [
          {
            label: `${horizon} (${grouped.length})`,
            children: grouped.map((item) => renderRoadmapItem(item, options))
          }
        ]
      : []
  })
  entries.push({ label: `roadmap (${items.length})`, children: horizonEntries })
  entries.push(...roadmapLinkLegend(items, options))
  if (absent.length)
    entries.push({
      label: `no roadmap (${absent.length})`,
      children: absent.map((result) => ({
        label: `${presentation('entity.repository').terminal} ${basename(result.repository)}`
      }))
    })
  if (diagnostics.length || faultEntries.length)
    entries.push({
      label: `diagnostics (${diagnostics.length + faultEntries.length})`,
      children: [
        ...diagnostics.map((result) => ({
          label: `${presentation('status.unavailable').terminal} ${basename(result.repository)}: ${result.diagnostic}`
        })),
        ...faultEntries
      ]
    })
  const tradeResults = results.filter((result) => result.trades.length || result.tradeDiagnostic)
  const tradeCount = results.reduce((total, result) => total + result.trades.length, 0)
  if (tradeResults.length)
    entries.push({
      label: `trades (${tradeCount})`,
      children: tradeResults.map((result) => ({
        label: `${presentation('entity.repository').terminal} ${basename(result.repository)} (${result.trades.length})`,
        children: renderTradeEntries(result.trades, estate, result.tradeDiagnostic, options.icons)
      }))
    })
  const done = items.filter((item) => item.status === 'done').length
  const notDone = items.length - done
  const tradeDiagnostic = results.some((result) => result.tradeDiagnostic)
  entries.push({
    label:
      `summary: REPOSITORIES=${results.length} ROADMAPS=${results.length - absent.length} ` +
      `NO_ROADMAP=${absent.length} ITEMS=${items.length} NOT_DONE=${notDone} DONE=${done} ` +
      `TRADES=${tradeDiagnostic ? 'unavailable' : tradeCount}`
  })
  return renderTree({ title: 'KI AGGREGATE ROADMAP', entries }).join('\n')
}

const renderSummaryResult = (results: readonly RoadmapItemResult[]): string => {
  const names = results.map((result) => basename(result.repository))
  const labels = results.map((result, index) =>
    names.indexOf(names[index] as string) === names.lastIndexOf(names[index] as string)
      ? (names[index] as string)
      : result.repository
  )
  const count = (items: readonly WorkItem[], horizon: string): number =>
    items.filter((item) => item.horizon === horizon).length
  const rows = results.map((result, index) => {
    const unavailable = Boolean(result.diagnostic)
    const absent = result.roadmap === 'absent'
    const items = result.items ?? []
    return [
      labels[index] as string,
      ...horizonOrder.map((horizon) => (unavailable ? '?' : absent ? '—' : String(count(items, horizon)))),
      unavailable ? '?' : absent ? '—' : String(items.length)
    ]
  })
  const items = results.flatMap((result) => result.items ?? [])
  const table = renderMatrixTable('KI REPO ROADMAP SUMMARY', ['Repository', ...horizonOrder, 'Total'], rows, [
    'TOTAL',
    ...horizonOrder.map((horizon) => String(count(items, horizon))),
    String(items.length)
  ])
  const statuses = results.flatMap((result, index) => {
    const items = result.items ?? []
    const counts = [...statusOrder].reverse().flatMap((status) => {
      const value = items.filter((item) => item.status === status).length
      return value ? [`${status}=${value}`] : []
    })
    return counts.length ? [`  ${labels[index]}: ${counts.join(' ')}`] : []
  })
  const diagnostics = results.flatMap((result, index) => [
    ...(result.diagnostic ? [`  ${labels[index]}: ${result.diagnostic}`] : []),
    ...(result.faults ?? []).map((fault) => `  ${labels[index]}: ${fault.message}`)
  ])
  return [
    ...table,
    '— no roadmap; ? unavailable',
    ...(statuses.length ? ['Statuses', ...statuses] : []),
    ...(diagnostics.length ? ['Diagnostics (counts include valid items only)', ...diagnostics] : [])
  ].join('\n')
}

const parseDuration = (value: string): number => {
  const match = /^(\d+)([smhd])$/.exec(value)
  if (!match || Number(match[1]) < 1) throw grammarError('stale-after must be a positive duration such as 7d')
  const multipliers: Readonly<Record<string, number>> = { s: 1, m: 60, h: 3600, d: 86400 }
  return Number(match[1]) * (multipliers[match[2] as string] as number)
}

const metric = (value: number | undefined): string => {
  if (value === undefined) return 'n/a'
  const days = Math.floor(value / 86_400)
  const hours = Math.floor((value % 86_400) / 3_600)
  const minutes = Math.floor((value % 3_600) / 60)
  const seconds = value % 60
  return (
    [days ? `${days}d` : '', hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', seconds ? `${seconds}s` : '']
      .filter(Boolean)
      .join(' ') || '0s'
  )
}

const renderStatisticsText = (
  generatedAt: string,
  staleAfterSeconds: number | undefined,
  results: readonly RoadmapStatisticsResult[],
  aggregate: NonNullable<RoadmapStatisticsResult['statistics']>
): string => {
  const renderedResults: readonly RoadmapStatisticsResult[] =
    results.length > 1 ? [...results, { repository: 'aggregate', statistics: aggregate, faults: [] }] : results
  return renderTree({
    title: 'KI REPO ROADMAP STATISTICS',
    context: [
      { label: `generated ${generatedAt}` },
      ...(staleAfterSeconds ? [{ label: `stale after ${metric(staleAfterSeconds)}` }] : [])
    ],
    entries: renderedResults.map((result) => {
      if (result.roadmap) return { label: `${basename(result.repository)}: no roadmap` }
      /* v8 ignore next -- target resolution fails before a statistics report can receive a repository diagnostic. */
      if (result.diagnostic)
        return {
          label: `${presentation('status.unavailable').terminal} ${basename(result.repository)}: ${result.diagnostic}`
        }
      const statistics = result.statistics
      /* v8 ignore next -- roadmapStatisticsForSelection always projects statistics when a result is neither absent nor diagnostic. */
      if (!statistics)
        return { label: `${presentation('status.unavailable').terminal} ${basename(result.repository)}: unavailable` }
      return {
        label: `${basename(result.repository)}: ITEMS=${statistics.items} NOT_DONE=${statistics.active}`,
        children: [
          { label: `age: MEDIAN=${metric(statistics.medianAgeSeconds)} MAX=${metric(statistics.maximumAgeSeconds)}` },
          {
            label: `inactivity: MEDIAN=${metric(statistics.medianInactivitySeconds)} MAX=${metric(statistics.maximumInactivitySeconds)}`
          },
          ...(staleAfterSeconds === undefined
            ? []
            : [{ label: `stale (${statistics.stale.length}): ${statistics.stale.join(', ') || 'none'}` }]),
          ...(statistics.futureTimestamps.length
            ? [
                {
                  label: `${presentation('status.unavailable').terminal} future timestamps: ${statistics.futureTimestamps.join(', ')}`
                }
              ]
            : []),
          ...result.faults.map((fault) => ({
            label: `${presentation('status.unavailable').terminal} ${fault.message}`
          }))
        ]
      }
    })
  }).join('\n')
}

const listCommand = (context: KiContext, selectedRepositories: RepositorySelection): Command =>
  new Command('list')
    .description('list governed work items')
    .option('--aggregate', 'render one selected-set roadmap inventory')
    .option('--horizon <horizon>', 'only items at this horizon')
    .option('--status <status>', 'only items at this status')
    .option('--no-icons', 'omit decorative trade badge icons')
    .option('--format <text|json>', 'render roadmap evidence as text or versioned JSON', 'text')
    .addOption(
      new Option('--links <compact|all>', 'show compact task references or nested tasks and URLs in text output')
        .choices(['compact', 'all'])
        .default('compact')
    )
    .action(async (options: RoadmapOptions) => {
      if (options.format !== 'text' && options.format !== 'json')
        throw grammarError('roadmap list --format must be text or json')
      if (options.horizon && !workItemHorizons.includes(options.horizon as (typeof workItemHorizons)[number]))
        throw grammarError(`roadmap list --horizon must be one of ${workItemHorizons.join(', ')}`)
      if (options.status && !statusOrder.includes(options.status as (typeof statusOrder)[number]))
        throw grammarError(`roadmap list --status must be one of ${statusOrder.join(', ')}`)
      const { estate, results } = await listRoadmap(operationContext(context), selectedRepositories(), {
        horizon: options.horizon,
        status: options.status,
        includeProjection: options.format === 'json'
      })
      const textOptions: RoadmapTextOptions = {
        links: options.links,
        icons: options.icons !== false,
        dim: Boolean(context.stdout.isTTY && !context.environment['NO_COLOR'] && context.environment['TERM'] !== 'dumb')
      }
      const output =
        options.format === 'json'
          ? JSON.stringify(roadmapReport(results), null, 2)
          : options.aggregate
            ? renderAggregateResult(results, estate, textOptions)
            : results.map((result) => renderTextResult(result, estate, textOptions)).join('\n\n')
      context.stdout.write(`${output}\n`)
      if (results.some((result) => result.tradeDiagnostic || result.diagnostic || result.faults?.length))
        throw new KiExit(1)
    })

const summaryCommand = (context: KiContext, selectedRepositories: RepositorySelection): Command =>
  new Command('summary').description('summarize roadmap item counts').action(async () => {
    const { results } = await listRoadmapItems(operationContext(context), selectedRepositories(), {})
    context.stdout.write(`${renderSummaryResult(results)}\n`)
    if (results.some((result) => result.diagnostic || result.faults?.length)) throw new KiExit(1)
  })

const statsCommand = (context: KiContext, selectedRepositories: RepositorySelection): Command =>
  new Command('stats')
    .description('report roadmap age and inactivity')
    .option('--stale-after <duration>', 'report not-done records inactive for at least this duration')
    .option('--format <format>', 'output format: text or json', 'text')
    .action(async (options: { readonly staleAfter?: string; readonly format: string }) => {
      if (options.format !== 'text' && options.format !== 'json') throw grammarError('format must be text or json')
      const staleAfterSeconds = options.staleAfter ? parseDuration(options.staleAfter) : undefined
      const report = await roadmapStatisticsForSelection(
        operationContext(context),
        selectedRepositories(),
        staleAfterSeconds
      )
      if (options.format === 'json') context.stdout.write(`${JSON.stringify({ version: 1, ...report })}\n`)
      else
        context.stdout.write(
          `${renderStatisticsText(report.generatedAt, report.staleAfterSeconds, report.results, report.aggregate)}\n`
        )
      if (
        report.results.some(
          (result) => result.diagnostic || result.faults.length || result.statistics?.futureTimestamps.length
        )
      )
        throw new KiExit(1)
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
    .addCommand(summaryCommand(context, selectedRepositories))
    .addCommand(statsCommand(context, selectedRepositories))
    .addCommand(pruneCommand(context, selectedRepositories))
    .addCommand(moveCommand(context, selectedRepositories, 'promote'))
    .addCommand(moveCommand(context, selectedRepositories, 'demote'))
