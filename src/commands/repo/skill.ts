import { Command } from 'commander'
import { addRepoSkill, removeRepoSkill } from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
import { resolveRepositoryTargets } from '../../core/repository/index.ts'

export const createRepoSkillCommand = (
  context: KiContext,
  selectedRepositories: () => { readonly repositories: readonly string[]; readonly agora?: string }
): Command =>
  new Command('skill')
    .description('manage KI-managed skills in one or more repositories')
    .addCommand(
      new Command('add')
        .description('link a harness skill into a repository and declare it in .ki.toml')
        .argument('<skill>', 'skill capability name to link')
        .option('--replace', 're-point an existing KI-managed link at the resolved harness source')
        .action(async (skill: string, options: { replace?: boolean }) => {
          const repositories = await resolveRepositoryTargets({
            ...selectedRepositories(),
            configurationDirectory: context.paths.config,
            stateDirectory: context.paths.state,
            workingDirectory: context.workingDirectory,
            homeDirectory: context.homeDirectory
          })
          for (const repository of repositories) {
            const result = await addRepoSkill({
              configurationDirectory: context.paths.config,
              dataDirectory: context.paths.data,
              homeDirectory: context.homeDirectory,
              workingDirectory: context.workingDirectory,
              repository: repository.root,
              skill,
              replace: options.replace
            })
            context.stdout.write(
              `ki repo skill add: linked ${result.skill} into ${result.repository} for ${result.agents.join(', ')}\n`
            )
          }
        })
    )
    .addCommand(
      new Command('remove')
        .description('unlink a KI-managed skill from a repository and undeclare it')
        .argument('<skill>', 'skill capability name to unlink')
        .action(async (skill: string) => {
          const repositories = await resolveRepositoryTargets({
            ...selectedRepositories(),
            configurationDirectory: context.paths.config,
            stateDirectory: context.paths.state,
            workingDirectory: context.workingDirectory,
            homeDirectory: context.homeDirectory
          })
          for (const repository of repositories) {
            const result = await removeRepoSkill({
              configurationDirectory: context.paths.config,
              homeDirectory: context.homeDirectory,
              workingDirectory: context.workingDirectory,
              repository: repository.root,
              skill
            })
            const disposition = result.removed ? 'removed' : 'no KI-managed link or declaration for'
            context.stdout.write(
              `ki repo skill remove: ${disposition} ${result.skill} in ${result.repository} for ${result.agents.join(', ')}\n`
            )
          }
        })
    )
