import { basename } from 'node:path'
import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { resolveRepositoryTargets } from '../../core/repository.ts'
import { type LocatedTrade, locateTrades } from '../../core/trade-core.ts'
import { readWorkItems, type WorkItem } from '../../core/work-items.ts'

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

const horizonOrder = ['blocking', 'next', 'soon', 'waiting-for', 'parked', 'future'] as const
const statusOrder = ['done', 'acceptance', 'in-progress', 'ready', 'open'] as const

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

const itemCount = (items: readonly WorkItem[]): string => `${items.length} item${items.length === 1 ? '' : 's'}`

const renderTradeContext = (trades: readonly LocatedTrade[], diagnostic?: string): readonly string[] => {
  if (diagnostic) return [`│  ╰─ ❌ unavailable: ${diagnostic}`]
  if (!trades.length) return ['│  ╰─ trades: none']
  const directions = ['inbound', 'outbound'] as const
  const groups = directions.flatMap((direction) => {
    const located = trades.filter((trade) => trade.direction === direction)
    return located.length ? [{ direction, trades: located }] : []
  })
  return groups.flatMap(({ direction, trades: group }, groupIndex) => {
    const lastGroup = groupIndex === groups.length - 1
    const itemPrefix = `│  ${lastGroup ? '   ' : '│  '}`
    return [
      `│  ${lastGroup ? '╰─' : '├─'} ${direction}`,
      ...group.map(
        (trade, tradeIndex) =>
          `${itemPrefix}${tradeIndex === group.length - 1 ? '╰─' : '├─'} ${trade.record.id} [${trade.record.kind}${trade.record.status ? `, ${trade.record.status}` : ''}] ${trade.record.title}`
      )
    ]
  })
}

const renderTextResult = (result: RoadmapResult): string => {
  const items = result.items ?? []
  const groups = textHorizonGroups(items)
  const lines = [`╭─ KI REPO ROADMAP`, `│  📁 ${basename(result.repository)}`, `│     ${result.repository}`, `│  ✦ ${itemCount(items)}`, '├─ roadmap']
  if (result.diagnostic) lines.push(`│  ╰─ ❌ ${result.diagnostic}`)
  else if (!items.length) lines.push('│  ╰─ items: none')
  else
    lines.push(
      ...groups.flatMap(({ horizon, items: group }, groupIndex) => {
        const lastGroup = groupIndex === groups.length - 1
        const itemPrefix = `│  ${lastGroup ? '   ' : '│  '}`
        return [
          `│  ${lastGroup ? '╰─' : '├─'} ${horizon}`,
          ...group.map((item, itemIndex) => `${itemPrefix}${itemIndex === group.length - 1 ? '╰─' : '├─'} ${item.id} [${item.status}] ${item.title}`)
        ]
      })
    )
  lines.push('├─ trades', ...renderTradeContext(result.trades, result.tradeDiagnostic))
  const inbound = result.trades.filter((trade) => trade.direction === 'inbound').length
  const outbound = result.trades.filter((trade) => trade.direction === 'outbound').length
  const tradeSummary = result.tradeDiagnostic ? 'unavailable' : `${result.trades.length} INBOUND=${inbound} OUTBOUND=${outbound}`
  lines.push(`╰─ summary: ITEMS=${items.length} HORIZONS=${groups.length} TRADES=${tradeSummary}`)
  return lines.join('\n')
}

export const createRepoRoadmapCommand = (
  context: KiContext,
  selectedRepositories: () => { readonly repositories: readonly string[]; readonly agora?: string }
): Command =>
  new Command('roadmap').description('inspect governed work items in one or more repositories').addCommand(
    new Command('list')
      .description('list governed work items')
      .option('--horizon <horizon>', 'only items at this horizon')
      .option('--status <status>', 'only items at this status')
      .action(async (options: RoadmapOptions) => {
        const repositories = await resolveRepositoryTargets({
          ...selectedRepositories(),
          configurationDirectory: context.paths.config,
          workingDirectory: context.workingDirectory,
          homeDirectory: context.homeDirectory
        })
        const tradeInventory: { readonly trades: readonly LocatedTrade[]; readonly diagnostic?: string } = await locateTrades(context)
          .then((trades) => ({ trades }))
          .catch((error) => ({
            trades: [] as readonly LocatedTrade[],
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
