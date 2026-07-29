import { Command } from 'commander'
import type { KiContext } from '../context.ts'
import {
  addWorkspaceRepository,
  initialiseWorkspaceConfiguration,
  readWorkspaceConfiguration,
  removeWorkspaceRepository,
  workspaceGroup
} from '../core/workspace.ts'

export const createWorkspaceCommand = (context: KiContext): Command =>
  new Command('workspace')
    .description('manage KI repository workspace groups in the current directory')
    .addCommand(
      new Command('init').description('create a .ki-workspace.toml file').action(async () => {
        const path = await initialiseWorkspaceConfiguration(context.workingDirectory)
        context.stdout.write(`ki workspace init: created ${path}\n`)
      })
    )
    .addCommand(
      new Command('list').description('list configured workspace groups').action(async () => {
        const configuration = await readWorkspaceConfiguration(context.workingDirectory)
        const groups = Object.entries(configuration.groups)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([name, repositories]) => `  ${name}${name === configuration.default ? ' (default)' : ''}: ${repositories.length}`)
        context.stdout.write(`ki workspace list\n${groups.join('\n')}\n`)
      })
    )
    .addCommand(
      new Command('show')
        .description('show one workspace group')
        .argument('<group>', 'workspace group name')
        .action(async (group: string) => {
          const selected = await workspaceGroup(context.workingDirectory, group)
          context.stdout.write(
            `ki workspace show ${selected.name}\n${selected.repositories.map((repository) => `  ${repository}`).join('\n')}\n`
          )
        })
    )
    .addCommand(
      new Command('add')
        .description('add a repository path or pattern to a workspace group')
        .argument('<group>', 'workspace group name')
        .argument('<path-or-pattern>', 'repository path or pattern')
        .action(async (group: string, repository: string) => {
          await addWorkspaceRepository(context.workingDirectory, group, repository)
          context.stdout.write(`ki workspace add: added ${repository} to ${group}\n`)
        })
    )
    .addCommand(
      new Command('remove')
        .description('remove a repository path or pattern from a workspace group')
        .argument('<group>', 'workspace group name')
        .argument('<path-or-pattern>', 'repository path or pattern')
        .action(async (group: string, repository: string) => {
          await removeWorkspaceRepository(context.workingDirectory, group, repository)
          context.stdout.write(`ki workspace remove: removed ${repository} from ${group}\n`)
        })
    )
