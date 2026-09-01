import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { repoHelpCommandNames } from '../root/catalogue.ts'
import { createRepoAuditCommand } from './audit.ts'
import { createRepoConformCommand } from './conform.ts'
import { createRepoDiagCommand } from './diag.ts'
import { createRepoEducateCommand } from './educate.ts'
import { createRepoInitCommand } from './init.ts'
import { createRepoOpenCommand } from './open.ts'
import { createRepairCommand } from './repair.ts'
import { createRepoRoadmapCommand } from './roadmap.ts'
import type { RepositorySelection } from './selection.ts'
import { createRepoSkillCommand } from './skill.ts'
import { createUpgradeCommand } from './upgrade.ts'

export const createRepoCommand = (context: KiContext): Command => {
  const command = new Command('repo')
    .description('run operations for one or more KI repositories')
    .option(
      '--repo <path-or-pattern>',
      'repository root or pattern',
      (value: string, previous: readonly string[] = []) => [...previous, value],
      []
    )
    .option('--agora <name>', 'declared named Agora or the registered estate')
    .option('--estate', 'select every repository in the registered estate')
  const selectedRepositories = (): RepositorySelection => {
    const options = command.opts<{ repo: readonly string[]; agora?: string; estate?: boolean }>()
    return { repositories: options.repo, agora: options.agora, estate: options.estate }
  }

  command
    .addCommand(createRepoOpenCommand(context, selectedRepositories))
    .addCommand(createRepoRoadmapCommand(context, selectedRepositories))
    .addCommand(createRepoDiagCommand(context, selectedRepositories))
    .addCommand(createRepairCommand(context, selectedRepositories))
    .addCommand(createRepoSkillCommand(context, selectedRepositories))
    .addCommand(createUpgradeCommand(context, selectedRepositories))
    .addCommand(createRepoInitCommand(context, selectedRepositories))
    .addCommand(createRepoEducateCommand(context, selectedRepositories))
    .addCommand(createRepoAuditCommand(context, selectedRepositories))
    .addCommand(createRepoConformCommand(context, selectedRepositories))

  ;(command.commands as Command[]).sort(
    (left, right) =>
      repoHelpCommandNames.indexOf(left.name() as (typeof repoHelpCommandNames)[number]) -
      repoHelpCommandNames.indexOf(right.name() as (typeof repoHelpCommandNames)[number])
  )
  return command
}
