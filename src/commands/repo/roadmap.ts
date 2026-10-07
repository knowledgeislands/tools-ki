import { basename } from 'node:path'
import { Command, Option } from 'commander'
import type { KiContext } from '../../context.ts'
import { grammarError, KiExit } from '../../core/errors.ts'
import { type LocatedTrade, locateTrades, tradeLifecycle } from '../../core/trade/index.ts'
import {
  holdReasons,
  listRoadmap,
  listRoadmapItems,
  migrateRoadmap,
  moveRoadmapItem,
  pruneRoadmap,
  type RoadmapGrouping,
  type RoadmapItemResult,
  type RoadmapListResult,
  type RoadmapOperationContext,
  type RoadmapStatisticsResult,
  roadmapReport,
  roadmapStatisticsForSelection,
  UNASSIGNED_GROUP,
  type WorkItem,
  type WorkItemHold,
  workItemHorizons,
  workItemLane,
  workItemLanes,
  workItemStatuses
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
  readonly by?: string
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

/** Within one lane, the furthest-advanced lifecycle first. */
const statusOrder = ['awaiting-review', 'in-progress', 'ready', 'draft', 'triage', 'done', 'cancelled'] as const

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
      workItemLanes.indexOf(workItemLane(left)) - workItemLanes.indexOf(workItemLane(right)) ||
      statusOrder.indexOf(left.status) - statusOrder.indexOf(right.status) ||
      left.id.localeCompare(right.id)
  )

/** Lane groups in report order: now, next, soon, future, hold, triage, then done and cancelled. */
const laneEntries = (items: readonly WorkItem[], options: RoadmapTextOptions): readonly TreeEntry[] =>
  workItemLanes.flatMap((lane) => {
    const group = orderItemsForText(items.filter((item) => workItemLane(item) === lane))
    return group.length
      ? [{ label: `${lane} (${group.length})`, children: group.map((item) => renderRoadmapItem(item, options)) }]
      : []
  })

/** Project or Initiative groups, named groups first and the explicit unassigned group last. */
const groupedEntries = (
  results: readonly RoadmapListResult[],
  by: RoadmapGrouping,
  options: RoadmapTextOptions
): readonly TreeEntry[] => {
  const groups = new Map<string, WorkItem[]>()
  for (const { grouping, items } of results) {
    // A repository without a roadmap carries no grouping; a grouping covers every listed item.
    if (!grouping) continue
    for (const item of items as readonly WorkItem[]) {
      const { group } = grouping.groups.get(item.id) as { readonly group: string }
      groups.set(group, [...(groups.get(group) ?? []), item])
    }
  }
  const names = [...groups.keys()].sort(
    (left, right) => Number(left === UNASSIGNED_GROUP) - Number(right === UNASSIGNED_GROUP) || left.localeCompare(right)
  )
  return names.map((name) => {
    const group = orderItemsForText(groups.get(name) as WorkItem[])
    return {
      label: `${name === UNASSIGNED_GROUP ? name : `${by} ${name}`} (${group.length})`,
      children: group.map((item) => renderRoadmapItem(item, { ...options, lane: true }))
    }
  })
}

/** Registry warnings for grouped output; they never change the exit status. */
const groupingWarnings = (results: readonly RoadmapListResult[]): readonly TreeEntry[] => {
  const warnings = [
    ...new Set(
      results.flatMap((result) => [
        ...(result.grouping?.registryWarnings ?? []),
        ...[...(result.grouping?.groups.entries() ?? [])].flatMap(([id, group]) =>
          group.warning ? [`${id}: ${group.warning}`] : []
        )
      ])
    )
  ]
  return warnings.length
    ? [
        {
          label: `warnings (${warnings.length})`,
          children: warnings.map((warning) => ({ label: `${presentation('status.warn').terminal} ${warning}` }))
        }
      ]
    : []
}

/** Counts shared by every list summary; the Now count is a signal, never a cap. */
const itemSummary = (items: readonly WorkItem[]): string => {
  const count = (predicate: (item: WorkItem) => boolean) => items.filter(predicate).length
  const done = count((item) => item.status === 'done')
  const cancelled = count((item) => item.status === 'cancelled')
  const legacy = count((item) => Boolean(item.legacy))
  return (
    `ITEMS=${items.length} NOW=${count((item) => workItemLane(item) === 'now')} ` +
    `NOT_DONE=${items.length - done - cancelled} DONE=${done}` +
    (cancelled ? ` CANCELLED=${cancelled}` : '') +
    (legacy ? ` LEGACY=${legacy}` : '')
  )
}

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
  const roadmap = result.diagnostic
    ? [{ label: `${presentation('status.unavailable').terminal} ${result.diagnostic}` }]
    : result.roadmap === 'absent'
      ? [{ label: `${presentation('status.skip').terminal} no roadmap` }]
      : [
          ...(result.grouping ? groupedEntries([result], result.grouping.by, options) : laneEntries(items, options)),
          ...faults.map((fault) => ({
            label: `${presentation('status.unavailable').terminal} ${fault.message}`
          }))
        ]
  const { inbound, outbound } = countTradeDirections(trades)
  const tradeSummary = result.tradeDiagnostic
    ? 'unavailable'
    : `${trades.length} IMPORTS=${inbound} EXPORTS=${outbound}`
  return renderTree({
    title: 'KI REPO ROADMAP',
    context,
    entries: [
      { label: `roadmap (${items.length})`, children: roadmap },
      ...groupingWarnings([result]),
      ...roadmapLinkLegend(items, options),
      {
        label: `trades (${trades.length})`,
        children: renderTradeEntries(trades, estate, result.tradeDiagnostic, options.icons)
      },
      { label: `summary: ${itemSummary(items)} TRADES=${tradeSummary}` }
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
  const by = results.find((result) => result.grouping)?.grouping?.by
  entries.push({
    label: `roadmap (${items.length})`,
    children: by ? groupedEntries(results, by, options) : laneEntries(items, options)
  })
  entries.push(...groupingWarnings(results))
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
  const tradeDiagnostic = results.some((result) => result.tradeDiagnostic)
  entries.push({
    label:
      `summary: REPOSITORIES=${results.length} ROADMAPS=${results.length - absent.length} ` +
      `NO_ROADMAP=${absent.length} ${itemSummary(items)} ` +
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
  const statusLabels = {
    triage: 't',
    draft: 'd',
    ready: 'r',
    'in-progress': 'ip',
    'awaiting-review': 'ar',
    done: 'x',
    cancelled: 'c'
  } as const
  const cell = (items: readonly WorkItem[]): string => {
    const counts = workItemStatuses.flatMap((status) => {
      const value = items.filter((item) => item.status === status).length
      return value ? [`${statusLabels[status]}=${value}`] : []
    })
    return items.length ? [...counts, `Σ=${items.length}`].join(' ') : '—'
  }
  const rows = results.map((result, index) => {
    const unavailable = Boolean(result.diagnostic)
    const absent = result.roadmap === 'absent'
    const items = result.items ?? []
    return [
      labels[index] as string,
      ...workItemLanes.map((lane) =>
        unavailable ? '?' : absent ? '—' : cell(items.filter((item) => workItemLane(item) === lane))
      ),
      unavailable ? '?' : absent ? '—' : cell(items)
    ]
  })
  const items = results.flatMap((result) => result.items ?? [])
  const table = renderMatrixTable('KI REPO ROADMAP SUMMARY', ['Repository', ...workItemLanes, 'Σ'], rows, [
    'Σ',
    ...workItemLanes.map((lane) => cell(items.filter((item) => workItemLane(item) === lane))),
    cell(items)
  ])
  const diagnostics = results.flatMap((result, index) => [
    ...(result.diagnostic ? [`  ${labels[index]}: ${result.diagnostic}`] : []),
    ...(result.faults ?? []).map((fault) => `  ${labels[index]}: ${fault.message}`)
  ])
  const absent = results.flatMap((result, index) => (result.roadmap === 'absent' ? [labels[index]] : []))
  return [
    ...table,
    't=triage d=draft r=ready ip=in-progress ar=awaiting-review x=done c=cancelled; Σ=total',
    '— no items; ? unavailable',
    ...(absent.length ? [`No roadmap: ${absent.join(', ')}`] : []),
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
    .addOption(
      new Option(
        '--by <grouping>',
        'group text output by Project or by Initiative from the Project registry, or by fixed area'
      ).choices(['project', 'initiative', 'area'])
    )
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
      if (options.status && !workItemStatuses.includes(options.status as (typeof workItemStatuses)[number]))
        throw grammarError(`roadmap list --status must be one of ${workItemStatuses.join(', ')}`)
      if (options.by && options.format === 'json') throw grammarError('roadmap list --by applies only to text output')
      const { estate, results } = await listRoadmap(operationContext(context), selectedRepositories(), {
        horizon: options.horizon,
        status: options.status,
        includeProjection: options.format === 'json',
        ...(options.by ? { by: options.by as RoadmapGrouping } : {})
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
    .description('delete done or cancelled governed work items and commit the deletions')
    .argument('[id]', 'canonical done or cancelled work-item identifier')
    .option('--no-commit', 'delete the records without staging or committing them')
    .option('--dry-run', 'report the records and commits a prune would make without changing anything')
    .addHelpText(
      'after',
      '\nBy default each repository with records to prune gets one commit containing\n' +
        'exactly their deletions, with the subject\n' +
        '"chore(roadmap): prune <N> done work record(s)" and one "- <ID>" body line per\n' +
        'record. Commit hooks run. Before deleting anything, the command refuses when a\n' +
        'repository is not a Git work tree, has staged changes, or holds a selected\n' +
        'record that is untracked or modified. A failed commit restores the records,\n' +
        'and a commit that a hook widened with other paths is reported as an error.\n' +
        '--no-commit only deletes the records and skips those Git checks. --dry-run\n' +
        'makes the same selection and checks, then reports without deleting or\n' +
        'committing.'
    )
    .action(async (id: string | undefined, options: { readonly commit: boolean; readonly dryRun?: boolean }) => {
      const dryRun = Boolean(options.dryRun)
      const removed = await pruneRoadmap(
        { ...operationContext(context), runner: context.runner, environment: context.environment },
        selectedRepositories(),
        id,
        { commit: options.commit, dryRun }
      )
      const entries = removed.flatMap(({ repository, items }) =>
        items.map(
          (item) => `${dryRun ? 'would prune' : 'pruned'} ${repository}: ${item.id} [${item.status}] ${item.title}`
        )
      )
      if (!entries.length) {
        context.stdout.write('ki repo roadmap prune: no done or cancelled work items\n')
        return
      }
      const commits = removed.flatMap(({ repository, commit, plannedCommit }) =>
        commit
          ? [`committed ${repository}: ${commit.id.slice(0, 12)} ${commit.message.subject}`]
          : plannedCommit
            ? [`would commit ${repository}: ${plannedCommit.subject}`]
            : []
      )
      const summary = dryRun
        ? `would remove ${entries.length} terminal work item(s)${options.commit ? '' : ' without committing'}`
        : `removed ${entries.length} terminal work item(s)${options.commit ? '' : ' without committing'}`
      context.stdout.write(`${[...entries, ...commits].join('\n')}\nki repo roadmap prune: ${summary}\n`)
    })

interface MoveOptions {
  readonly reason?: string
  readonly condition?: string
  readonly review?: string
}

/** Builds the Hold mapping a move into Hold records; any option without the others is a grammar error. */
const holdOption = (options: MoveOptions): WorkItemHold | undefined => {
  if (options.reason === undefined && options.condition === undefined && options.review === undefined) return undefined
  if (!holdReasons.includes(options.reason as WorkItemHold['reason']))
    throw grammarError(`roadmap --reason must be one of ${holdReasons.join(', ')}`)
  if (!options.condition?.trim()) throw grammarError('roadmap --condition must name the release condition')
  if (options.review !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(options.review))
    throw grammarError('roadmap --review must be an ISO date (YYYY-MM-DD)')
  return {
    reason: options.reason as WorkItemHold['reason'],
    condition: options.condition.trim(),
    ...(options.review ? { review: options.review } : {})
  }
}

const moveCommand = (
  context: KiContext,
  selectedRepositories: RepositorySelection,
  operation: 'promote' | 'demote'
): Command => {
  const command = new Command(operation)
    .description(operation === 'promote' ? 'move one work item toward now' : 'move one work item toward hold')
    .argument('<id>', 'canonical work-item identifier')
    .argument(
      '[horizon]',
      operation === 'promote' ? 'direct destination horizon toward now' : 'direct destination horizon toward hold'
    )
  if (operation === 'demote')
    command
      .addOption(new Option('--reason <reason>', 'why the item is held').choices([...holdReasons]))
      .option('--condition <text>', 'the release condition that ends the hold')
      .option('--review <date>', 'optional ISO date on which to review the hold')
  return command.action(async (id: string, horizon: string | undefined, options: MoveOptions) => {
    const result = await moveRoadmapItem(
      operationContext(context),
      selectedRepositories(),
      operation,
      id,
      horizon,
      holdOption(options)
    )
    context.stdout.write(`ki repo roadmap ${operation}: ${result.id} ${result.from} -> ${result.to}\n`)
  })
}

const migrateCommand = (context: KiContext, selectedRepositories: RepositorySelection): Command =>
  new Command('migrate')
    .description('preview or apply the mechanical roadmap model migration')
    .option('--apply', 'write the migrated records in exactly one repository without committing')
    .addHelpText(
      'after',
      '\nThe mechanical pass moves the Triage horizon to status triage, Waiting for and\n' +
        'Parked to the Hold horizon with a hold reason and a condition lifted from the\n' +
        'record prose or a REVIEW placeholder, waiting_on_trades to hold.trades, and a\n' +
        'terminal Triage disposition to status cancelled with its resolution. It\n' +
        'advances updated_at, never touches theme, kind, project or purpose, and never\n' +
        'stages or commits. Without --apply it only prints the comparison.'
    )
    .action(async (options: { readonly apply?: boolean }) => {
      const apply = Boolean(options.apply)
      const results = await migrateRoadmap(operationContext(context), selectedRepositories(), { apply })
      const entries: TreeEntry[] = results.map((result) => ({
        label: result.repository,
        children:
          result.roadmap === 'absent'
            ? [{ label: `${presentation('status.skip').terminal} no roadmap` }]
            : [
                ...result.migrations.map((migration) => ({
                  label: `${migration.id} ${migration.file}`,
                  children: [
                    ...migration.before.map((line) => ({ label: `- ${line}` })),
                    ...migration.after.map((line) => ({ label: `+ ${line}` })),
                    ...migration.notes.map((note) => ({ label: `${presentation('status.warn').terminal} ${note}` }))
                  ]
                })),
                ...result.faults.map((fault) => ({
                  label: `${presentation('status.unavailable').terminal} ${fault.message}`
                }))
              ]
      }))
      const count = results.reduce((total, result) => total + result.migrations.length, 0)
      entries.push({
        label: `summary: ${apply ? 'MIGRATED' : 'WOULD_MIGRATE'}=${count} REPOSITORIES=${results.length}`
      })
      context.stdout.write(`${renderTree({ title: 'KI REPO ROADMAP MIGRATE', entries }).join('\n')}\n`)
      if (results.some((result) => result.faults.length)) throw new KiExit(1)
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
    .addCommand(migrateCommand(context, selectedRepositories))
