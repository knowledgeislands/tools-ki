import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { createRegistryAddCommand } from './add.ts'
import { createRegistryListCommand } from './list.ts'

export interface RegistrySelection {
  readonly repositories: readonly string[]
  readonly agora?: string
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
    .option('--agora <name>', 'named Agora profile from XDG KI configuration')
  const selectedRepositories = (): RegistrySelection => {
    const options = command.opts<{ repo: readonly string[]; agora?: string }>()
    return { repositories: options.repo, agora: options.agora }
  }
  return command
    .addCommand(createRegistryAddCommand(context, selectedRepositories))
    .addCommand(createRegistryListCommand(context))
}
