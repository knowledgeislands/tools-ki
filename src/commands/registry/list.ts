import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { requiredLocalRegistry } from '../../core/storage/index.ts'

export const createRegistryListCommand = (context: KiContext): Command =>
  new Command('list').description('list KI repositories registered on this machine').action(async () => {
    const repositories = await requiredLocalRegistry(context.paths.state)
    if (repositories.length) context.stdout.write(`${repositories.map((repository) => repository.path).join('\n')}\n`)
  })
