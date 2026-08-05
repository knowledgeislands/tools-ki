import { basename } from 'node:path'
import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { KiError } from '../../core/errors.ts'
import { resolveRepositoryTargets } from '../../core/repository.ts'
import { type LocatedTrade, locateTrades } from '../../core/trade-core.ts'
import { pruneDoneWorkItems, readWorkItems, updateWorkItemHorizon, type WorkItem, type WorkItemHorizon, workItemHorizons } from '../../core/work-items.ts'

interface RoadmapOptions {
  readonly horizon?: string
  readonly status?: string
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
  items.filter((item) => (!options.horizon || item.horizon === options.horizon) && (!options.status || item.status === options.status))

const orderItemsForText = (items: readonly WorkItem[]): readonly WorkItem[] =>
  [...items].sort(
    (left, right) =>
      horizonOrder.indexOf(left.horizon as (typeof horizonOrder)[number]) - horizonOrder.indexOf(right.horizon as (typeof horizonOrder)[number]) ||
      statusOrder.indexOf(left.status) - statusOrder.indexOf(right.status) ||
      left.id.localeCompare(right.id)
  )

const textHorizonGroups = (items: readonly WorkItem[]): readonly { readonly horizon: string; readonly items: readonly WorkItem[] }[] =>
  horizonOrder.flatMap((horizon) => {
    const group = orderItemsForText(items.filter((item) => item.horizon === horizon))
    return group.length ? [{ horizon, items: group }] : []
  })

const renderTradeContext = (trades: readonly LocatedTrade[], diagnostic?: string): readonly string[] => {
  if (diagnostic) return [`│  ╰─ ❌ unavailable: ${diagnostic}`]
  const directions = [
    ['import', 'inbound'],
    ['export', 'outbound']
  ] as const
  const kinds = ['work', 'knowledge'] as const
  return directions.flatMap(([label, direction], directionIndex) => {
    const selected = trades.filter((trade) => trade.direction === direction)
    const lastDirection = directionIndex === directions.length - 1
    return [
      `│  ${lastDirection ? '╰─' : '├─'} ${label} (${selected.length})`,
      ...kinds.flatMap((kind, kindIndex) => {
        const group = selected.filter((trade) => trade.record.kind === kind)
        const lastKind = kindIndex === kinds.length - 1
        const prefix = `│  ${lastDirection ? '   ' : '│  '}`
        return [
          `${prefix}${lastKind ? '╰─' : '├─'} ${kind} (${group.length})`,
          ...group.map((trade, tradeIndex) => {
            // The trade parser supplies sent when a sender record has no explicit disposition.
            /* v8 ignore next */
            const status = trade.record.status ?? 'sent'
            return `${prefix}${lastKind ? '   ' : '│  '}${tradeIndex === group.length - 1 ? '╰─' : '├─'} ${trade.record.id} [${status}] ${trade.record.title}`
          })
        ]
      })
    ]
  })
}

const renderTextResult = (result: RoadmapResult): string => {
  const items = result.items ?? []
  const groups = textHorizonGroups(items)
  const lines = [`╭─ KI REPO ROADMAP`, `│  📁 ${basename(result.repository)}`, `│     ${result.repository}`, `├─ roadmap (${items.length})`]
  if (result.diagnostic) lines.push(`│  ╰─ ❌ ${result.diagnostic}`)
  else if (!items.length) lines.push('│  ╰─ items: none')
  else
    lines.push(
      ...groups.flatMap(({ horizon, items: group }, groupIndex) => {
        const lastGroup = groupIndex === groups.length - 1
        const itemPrefix = `│  ${lastGroup ? '   ' : '│  '}`
        return [
          `│  ${lastGroup ? '╰─' : '├─'} ${horizon} (${group.length})`,
          ...group.map((item, itemIndex) => `${itemPrefix}${itemIndex === group.length - 1 ? '╰─' : '├─'} ${item.id} [${item.status}] ${item.title}`)
        ]
      })
    )
  lines.push(`├─ trades (${result.trades.length})`, ...renderTradeContext(result.trades, result.tradeDiagnostic))
  const inbound = result.trades.filter((trade) => trade.direction === 'inbound').length
  const outbound = result.trades.filter((trade) => trade.direction === 'outbound').length
  const tradeSummary = result.tradeDiagnostic ? 'unavailable' : `${result.trades.length} IMPORTS=${inbound} EXPORTS=${outbound}`
  lines.push(`╰─ summary: ITEMS=${items.length} HORIZONS=${groups.length} TRADES=${tradeSummary}`)
  return lines.join('\n')
}

const resolveTargets = async (context: KiContext, selectedRepositories: () => { readonly repositories: readonly string[]; readonly agora?: string }) =>
  resolveRepositoryTargets({
    ...selectedRepositories(),
    configurationDirectory: context.paths.config,
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
  if (repositories.length !== 1 || !repository) throw new KiError(`ki repo roadmap ${operation} requires exactly one repository target`, 2)
  return repository
}

const moveHorizon = (item: WorkItem, operation: 'promote' | 'demote', requested?: string): WorkItemHorizon => {
  const current = horizonOrder.indexOf(item.horizon)
  const direction = operation === 'promote' ? -1 : 1
  const target = requested === undefined ? current + direction : horizonOrder.indexOf(requested as WorkItemHorizon)
  if (requested !== undefined && target === -1) throw new KiError(`roadmap ${operation} horizon must be one of ${horizonOrder.join(', ')}`, 2)
  if (target < 0 || target >= horizonOrder.length) throw new KiError(`work item ${item.id} is already at the ${operation} limit`, 2)
  if ((operation === 'promote' && target >= current) || (operation === 'demote' && target <= current))
    throw new KiError(`roadmap ${operation} must move ${item.id} ${operation === 'promote' ? 'toward now' : 'toward future'}`, 2)
  return horizonOrder[target] as WorkItemHorizon
}

const selectedItem = async (repository: string, id: string): Promise<WorkItem> => {
  const items = (await readWorkItems(repository)).filter((item) => item.id === id)
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
        .action(async (options: RoadmapOptions) => {
          const repositories = await resolveTargets(context, selectedRepositories)
          const tradeInventory: { readonly trades: readonly LocatedTrade[]; readonly diagnostic?: string } = await locateTrades(context)
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
                return {
                  repository: repository.root,
                  trades: tradeInventory.trades.filter((trade) => trade.root === repository.root),
                  ...(tradeInventory.diagnostic ? { tradeDiagnostic: tradeInventory.diagnostic } : {}),
                  items: filterItems(await readWorkItems(repository.root), options)
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
          context.stdout.write(`${results.map(renderTextResult).join('\n\n')}\n`)
        })
    )
    .addCommand(
      new Command('prune')
        .description('delete completed governed work items')
        .argument('[id]', 'canonical completed work-item identifier')
        .action(async (id: string | undefined) => {
          const repositories =
            id === undefined ? await resolveTargets(context, selectedRepositories) : [await oneMutationTarget(context, selectedRepositories, 'prune')]
          await Promise.all(repositories.map((repository) => readWorkItems(repository.root)))
          const removed = await Promise.all(repositories.map(async (repository) => ({ repository, items: await pruneDoneWorkItems(repository.root, id) })))
          const entries = removed.flatMap(({ repository, items }) => items.map((item) => `${repository.root}: ${item.id} [done] ${item.title}`))
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
          const item = await selectedItem(repository.root, id)
          const destination = moveHorizon(item, 'promote', horizon)
          await updateWorkItemHorizon(repository.root, id, destination)
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
          const item = await selectedItem(repository.root, id)
          const destination = moveHorizon(item, 'demote', horizon)
          await updateWorkItemHorizon(repository.root, id, destination)
          context.stdout.write(`ki repo roadmap demote: ${id} ${item.horizon} -> ${destination}\n`)
        })
    )
