import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { KiError } from '../../core/errors.ts'
import { resolveRepositoryTargets } from '../../core/repository.ts'
import { readWorkItems, type WorkItem } from '../../core/work-items.ts'

interface PlanOptions {
  readonly format?: string
  readonly horizon?: string
  readonly status?: string
}

const filterItems = (items: readonly WorkItem[], options: PlanOptions): readonly WorkItem[] =>
  items.filter((item) => (!options.horizon || item.horizon === options.horizon) && (!options.status || item.status === options.status))

export const createRepoPlanCommand = (
  context: KiContext,
  selectedRepositories: () => { readonly repositories: readonly string[]; readonly agora?: string }
): Command =>
  new Command('plan').description('inspect governed work items in one or more repositories').addCommand(
    new Command('list')
      .description('list governed work items')
      .option('--format <format>', 'output format: text or json (default: text)')
      .option('--horizon <horizon>', 'only items at this horizon')
      .option('--status <status>', 'only items at this status')
      .action(async (options: PlanOptions) => {
        if (options.format && options.format !== 'text' && options.format !== 'json') throw new KiError('--format accepts text or json', 2)
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
        if (options.format === 'json') {
          context.stdout.write(`${JSON.stringify({ repositories: results }, null, 2)}\n`)
          return
        }
        const lines = ['ki repo plan list']
        for (const result of results) {
          lines.push(`Repository: ${result.repository}`)
          if ('diagnostic' in result) lines.push(`Diagnostic: ${result.diagnostic}`)
          else if (!result.items.length) lines.push('Items: none')
          else lines.push('Items:', ...result.items.map((item) => `  ${item.id} [${item.horizon}/${item.status}] ${item.title}`))
        }
        context.stdout.write(`${lines.join('\n')}\n`)
      })
  )
