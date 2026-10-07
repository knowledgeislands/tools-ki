import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { createRegistryAddCommand } from './add.ts'
import { createRegistryListCommand } from './list.ts'
import { createRegistryRemoveCommand } from './remove.ts'

import type { RegistrySelection } from './types.ts'

export const createRegistryCommand = (context: KiContext): Command => {
  const command = new Command('registry')
    .description('manage the local KI repository registry')
    .option(
      '--repo <path-or-pattern>',
      'repository root or pattern',
      (value: string, previous: readonly string[] = []) => [...previous, value],
      []
    )
    .option('-t, --territory <handle>', 'select a registered territory')
    .option(
      '-f, --filter <prefix>',
      'literal directory-name prefix (repeatable alternatives)',
      (value: string, previous: readonly string[] = []) => [...previous, value],
      []
    )
    .option('--estate', 'select every repository in the registered estate')
  const selectedRepositories = (): RegistrySelection => {
    const options = command.opts<{
      repo: readonly string[]
      territory?: string
      filter?: readonly string[]
      estate?: boolean
    }>()
    return { repositories: options.repo, territory: options.territory, filters: options.filter, estate: options.estate }
  }
  return command
    .addCommand(createRegistryAddCommand(context, selectedRepositories))
    .addCommand(createRegistryListCommand(context, selectedRepositories))
    .addCommand(createRegistryRemoveCommand(context, selectedRepositories))
}
