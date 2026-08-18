import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { createRegistryAddCommand } from './add.ts'
import { createRegistryListCommand } from './list.ts'

export interface RegistrySelection {
  readonly repositories: readonly string[]
  readonly agora?: string
  readonly estate?: boolean
}

export const createRegistryCommand = (context: KiContext): Command => {
  const command = new Command('registry')
    .description('manage the local KI repository registry')
    .option(
      '--repo <path-or-pattern>',
      'repository root or pattern',
      (value: string, previous: readonly string[] = []) => [...previous, value],
      []
    )
    .option('--agora <name>', 'declared named Agora or the registered estate')
    .option('--estate', 'select every repository in the registered estate')
  const selectedRepositories = (): RegistrySelection => {
    const options = command.opts<{ repo: readonly string[]; agora?: string; estate?: boolean }>()
    return { repositories: options.repo, agora: options.agora, estate: options.estate }
  }
  return command
    .addCommand(createRegistryAddCommand(context, selectedRepositories))
    .addCommand(createRegistryListCommand(context))
}
