import { basename } from 'node:path'
import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { KiError, KiExit } from '../../core/errors.ts'
import { readRepositoryPlanningSource, type WorkItemDirectory } from '../../core/planning.ts'
import { presentation, renderTree, type TreeEntry } from '../../core/presentation/index.ts'
import { resolveRepositoryTargets } from '../../core/repository/index.ts'
import { type LocatedTrade, locateTrades, tradeLifecycle } from '../../core/trade/index.ts'
import {
  pruneDoneWorkItems,
  readWorkItems,
  updateWorkItemHorizon,
  type WorkItem,
  type WorkItemHorizon,
  workItemHorizons
} from '../../core/work-items.ts'
import { renderTradeRelation } from '../trade/shared.ts'

interface RoadmapOptions {
  readonly horizon?: string
  readonly status?: string
  readonly icons?: boolean
}

interface RoadmapResult {
  readonly repository: string
  readonly trades: readonly LocatedTrade[]
  readonly tradeDiagnostic?: string
  readonly items?: readonly WorkItem[]
  readonly diagnostic?: string
}

const horizonOrder = workItemHorizons
const statusOrder = ['done', 'awaiting-review', 'in-progress', 'ready', 'draft'] as const

const filterItems = (items: readonly WorkItem[], options: RoadmapOptions): readonly WorkItem[] =>
  items.filter(
    (item) =>
      (!options.horizon || item.horizon === options.horizon) && (!options.status || item.status === options.status)
  )

const orderItemsForText = (items: readonly WorkItem[]): readonly WorkItem[] =>
  [...items].sort(
    (left, right) =>
      horizonOrder.indexOf(left.horizon as (typeof horizonOrder)[number]) -
        horizonOrder.indexOf(right.horizon as (typeof horizonOrder)[number]) ||
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

const renderTextResult = (result: RoadmapResult, estate: readonly LocatedTrade[], icons = true): string => {
  const context = [
    { label: `${presentation('entity.repository').terminal} ${basename(result.repository)} (${result.repository})` }
  ]
  const items = result.items ?? []
  const groups = textHorizonGroups(items)
  const roadmap = result.diagnostic
    ? [{ label: `${presentation('status.unavailable').terminal} ${result.diagnostic}` }]
    : groups.map(({ horizon, items: group }) => ({
        label: `${horizon} (${group.length})`,
        children: group.map((item) => ({ label: `${item.id} [${item.status}] ${item.title}` }))
      }))
  const { inbound, outbound } = countTradeDirections(result.trades)
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
      { label: `summary: ITEMS=${items.length} HORIZONS=${groups.length} TRADES=${tradeSummary}` }
    ]
  }).join('\n')
}

const resolveTargets = async (
  context: KiContext,
  selectedRepositories: () => { readonly repositories: readonly string[]; readonly agora?: string }
) =>
  resolveRepositoryTargets({
    ...selectedRepositories(),
    configurationDirectory: context.paths.config,
    stateDirectory: context.paths.state,
    workingDirectory: context.workingDirectory,
    homeDirectory: context.homeDirectory
  })

const oneMutationTarget = async (
  context: KiContext,
  selectedRepositories: () => { readonly repositories: readonly string[]; readonly agora?: string },
  operation: 'prune' | 'promote' | 'demote'
) => {
  const repositories = await resolveTargets(context, selectedRepositories)
  const repository = repositories[0]
  if (repositories.length !== 1 || !repository)
    throw new KiError(`ki repo roadmap ${operation} requires exactly one repository target`, 2)
  return repository
}

const moveHorizon = (item: WorkItem, operation: 'promote' | 'demote', requested?: string): WorkItemHorizon => {
  const current = horizonOrder.indexOf(item.horizon)
  const direction = operation === 'promote' ? -1 : 1
  const target = requested === undefined ? current + direction : horizonOrder.indexOf(requested as WorkItemHorizon)
  if (requested !== undefined && target === -1)
    throw new KiError(`roadmap ${operation} horizon must be one of ${horizonOrder.join(', ')}`, 2)
  if (target < 0 || target >= horizonOrder.length)
    throw new KiError(`work item ${item.id} is already at the ${operation} limit`, 2)
  if ((operation === 'promote' && target >= current) || (operation === 'demote' && target <= current))
    throw new KiError(
      `roadmap ${operation} must move ${item.id} ${operation === 'promote' ? 'toward now' : 'toward future'}`,
      2
    )
  return horizonOrder[target] as WorkItemHorizon
}

const selectedItem = async (repository: string, directory: WorkItemDirectory, id: string): Promise<WorkItem> => {
  const items = (await readWorkItems(repository, directory)).filter((item) => item.id === id)
  if (items.length !== 1) throw new KiError(`repository ${repository} must contain exactly one work item ${id}`, 2)
  return items[0] as WorkItem
}

export const createRepoRoadmapCommand = (
  context: KiContext,
  selectedRepositories: () => { readonly repositories: readonly string[]; readonly agora?: string }
): Command =>
  new Command('roadmap')
    .description('inspect and mechanically maintain governed work items')
    .addCommand(
      new Command('list')
        .description('list governed work items')
        .option('--horizon <horizon>', 'only items at this horizon')
        .option('--status <status>', 'only items at this status')
        .option('--no-icons', 'omit decorative trade badge icons')
        .action(async (options: RoadmapOptions) => {
          const repositories = await resolveTargets(context, selectedRepositories)
          const tradeInventory: { readonly trades: readonly LocatedTrade[]; readonly diagnostic?: string } =
            await locateTrades(context)
              .then((trades) => ({ trades }))
              .catch((error) => ({
                trades: [] as readonly LocatedTrade[],
                // locateTrades normalizes every failure to a KiError before this boundary.
                /* v8 ignore next */
                diagnostic: error instanceof Error ? error.message : String(error)
              }))
          const results = await Promise.all(
            repositories.map(async (repository) => {
              try {
                const planning = await readRepositoryPlanningSource(repository.configuration)
                return {
                  repository: repository.root,
                  trades: tradeInventory.trades.filter((trade) => trade.root === repository.root),
                  ...(tradeInventory.diagnostic ? { tradeDiagnostic: tradeInventory.diagnostic } : {}),
                  items: filterItems(await readWorkItems(repository.root, planning.directory), options)
                }
              } catch (error) {
                /* v8 ignore next -- inventory failures are always KiError instances. */
                const message = error instanceof Error ? error.message : String(error)
                return {
                  repository: repository.root,
                  trades: tradeInventory.trades.filter((trade) => trade.root === repository.root),
                  ...(tradeInventory.diagnostic ? { tradeDiagnostic: tradeInventory.diagnostic } : {}),
                  diagnostic: message
                }
              }
            })
          )
          context.stdout.write(
            `${results.map((result) => renderTextResult(result, tradeInventory.trades, options.icons !== false)).join('\n\n')}\n`
          )
          if (results.some((result) => result.tradeDiagnostic || ('diagnostic' in result && result.diagnostic)))
            throw new KiExit(1)
        })
    )
    .addCommand(
      new Command('prune')
        .description('delete completed governed work items')
        .argument('[id]', 'canonical completed work-item identifier')
        .action(async (id: string | undefined) => {
          const repositories =
            id === undefined
              ? await resolveTargets(context, selectedRepositories)
              : [await oneMutationTarget(context, selectedRepositories, 'prune')]
          const sources = await Promise.all(
            repositories.map(async (repository) => ({
              repository,
              planning: await readRepositoryPlanningSource(repository.configuration)
            }))
          )
          await Promise.all(
            sources.map(({ repository, planning }) => readWorkItems(repository.root, planning.directory))
          )
          const removed = await Promise.all(
            sources.map(async ({ repository, planning }) => ({
              repository,
              items: await pruneDoneWorkItems(repository.root, planning.directory, id)
            }))
          )
          const entries = removed.flatMap(({ repository, items }) =>
            items.map((item) => `${repository.root}: ${item.id} [done] ${item.title}`)
          )
          if (!entries.length) context.stdout.write('ki repo roadmap prune: no done work items\n')
          else
            context.stdout.write(
              `${entries.map((entry) => `pruned ${entry}`).join('\n')}\nki repo roadmap prune: removed ${entries.length} done work item(s)\n`
            )
        })
    )
    .addCommand(
      new Command('promote')
        .description('move one work item toward now')
        .argument('<id>', 'canonical work-item identifier')
        .argument('[horizon]', 'direct destination horizon toward now')
        .action(async (id: string, horizon: string | undefined) => {
          const repository = await oneMutationTarget(context, selectedRepositories, 'promote')
          const planning = await readRepositoryPlanningSource(repository.configuration)
          const item = await selectedItem(repository.root, planning.directory, id)
          const destination = moveHorizon(item, 'promote', horizon)
          await updateWorkItemHorizon(repository.root, planning.directory, id, destination)
          context.stdout.write(`ki repo roadmap promote: ${id} ${item.horizon} -> ${destination}\n`)
        })
    )
    .addCommand(
      new Command('demote')
        .description('move one work item toward future')
        .argument('<id>', 'canonical work-item identifier')
        .argument('[horizon]', 'direct destination horizon toward future')
        .action(async (id: string, horizon: string | undefined) => {
          const repository = await oneMutationTarget(context, selectedRepositories, 'demote')
          const planning = await readRepositoryPlanningSource(repository.configuration)
          const item = await selectedItem(repository.root, planning.directory, id)
          const destination = moveHorizon(item, 'demote', horizon)
          await updateWorkItemHorizon(repository.root, planning.directory, id, destination)
          context.stdout.write(`ki repo roadmap demote: ${id} ${item.horizon} -> ${destination}\n`)
        })
    )
