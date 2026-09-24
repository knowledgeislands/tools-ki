import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { grammarError, KiExit } from '../../core/errors.ts'
import { registryReport, requiredLocalRegistry } from '../../core/storage/index.ts'

export const createRegistryListCommand = (context: KiContext): Command =>
  new Command('list')
    .description('list KI repositories registered on this machine')
    .option('--format <text|json>', 'render registry evidence as text or versioned JSON', 'text')
    .action(async (options: { readonly format?: string }) => {
      if (options.format !== 'text' && options.format !== 'json')
        throw grammarError('registry list --format must be text or json')
      const repositories = await requiredLocalRegistry(context.paths.state)
      if (options.format === 'text') {
        if (repositories.length)
          context.stdout.write(`${repositories.map((repository) => repository.path).join('\n')}\n`)
        return
      }
      const result = await registryReport(repositories)
      context.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`)
      if (result.unavailable) throw new KiExit(1)
    })
