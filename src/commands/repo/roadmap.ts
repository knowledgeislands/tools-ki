import { basename } from 'node:path'
import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { resolveRepositoryTargets } from '../../core/repository.ts'
import { readWorkItems, type WorkItem } from '../../core/work-items.ts'

interface RoadmapOptions {
  readonly horizon?: string
  readonly status?: string
}

interface RoadmapResult {
  readonly repository: string
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

const renderTextResult = (result: RoadmapResult): string => {
  const items = result.items ?? []
  const groups = textHorizonGroups(items)
  const lines = [`╭─ KI REPO ROADMAP`, `│  📁 ${basename(result.repository)}`, `│     ${result.repository}`, `│  ✦ ${itemCount(items)}`, '├─ results']
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
  lines.push(`╰─ summary: ITEMS=${items.length} HORIZONS=${groups.length}`)
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
        const results = await Promise.all(
          repositories.map(async (repository) => {
            try {
              return { repository: repository.root, items: filterItems(await readWorkItems(repository.root), options) }
            } catch (error) {
              /* v8 ignore next -- inventory failures are always KiError instances. */
              const message = error instanceof Error ? error.message : String(error)
              return { repository: repository.root, diagnostic: message }
            }
          })
        )
        context.stdout.write(`${results.map(renderTextResult).join('\n\n')}\n`)
      })
  )
