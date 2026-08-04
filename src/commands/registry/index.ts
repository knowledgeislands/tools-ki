import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { createRegistryAddCommand } from './add.ts'
import { createRegistryListCommand } from './list.ts'

export interface RegistrySelection {
  readonly repositories: readonly string[]
  readonly workspace?: string
}

export const createRegistryCommand = (context: KiContext): Command => {
  const command = new Command('registry')
    .description('manage the local KI repository registry')
    .option('--repo <path-or-pattern>', 'repository root or pattern', (value: string, previous: readonly string[] = []) => [...previous, value], [])
    .option('--workspace <group>', 'workspace group from .ki-workspace.toml in the current directory')
  const selectedRepositories = (): RegistrySelection => {
    const options = command.opts<{ repo: readonly string[]; workspace?: string }>()
    return { repositories: options.repo, workspace: options.workspace }
  }
  return command.addCommand(createRegistryAddCommand(context, selectedRepositories)).addCommand(createRegistryListCommand(context))
}
