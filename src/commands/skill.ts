import { Command } from 'commander'
import { addRepoSkill, addUserSkill, removeRepoSkill, removeUserSkill } from '../agents/index.ts'
import type { KiContext } from '../context.ts'

const createUserCommands = (context: KiContext): readonly Command[] => [
  new Command('add')
    .description('link a harness skill into the configured user agent skill spaces')
    .argument('<skill>', 'skill capability name to link')
    .option('--replace', 're-point an existing KI-managed link at the resolved harness source')
    .action(async (skill: string, options: { replace?: boolean }) => {
      const result = await addUserSkill({
        configurationDirectory: context.paths.config,
        dataDirectory: context.paths.data,
        homeDirectory: context.homeDirectory,
        skill,
        replace: options.replace
      })
      context.stdout.write(`ki skill add: linked ${result.skill} for ${result.agents.join(', ')}\n`)
    }),
  new Command('remove')
    .description('unlink a KI-managed skill from the user agent skill spaces')
    .argument('<skill>', 'skill capability name to unlink')
    .action(async (skill: string) => {
      const result = await removeUserSkill({
        configurationDirectory: context.paths.config,
        homeDirectory: context.homeDirectory,
        skill
      })
      const disposition = result.removed ? 'unlinked' : 'no KI-managed link for'
      context.stdout.write(`ki skill remove: ${disposition} ${result.skill} for ${result.agents.join(', ')}\n`)
    })
]

export const createRepoSkillCommand = (context: KiContext, selectedRepository: () => string | undefined): Command =>
  new Command('skill')
    .description('manage KI-managed skills in one repository')
    .addCommand(
      new Command('add')
        .description('link a harness skill into a repository and declare it in .ki-config.toml')
        .argument('<skill>', 'skill capability name to link')
        .option('--replace', 're-point an existing KI-managed link at the resolved harness source')
        .action(async (skill: string, options: { replace?: boolean }) => {
          const result = await addRepoSkill({
            configurationDirectory: context.paths.config,
            dataDirectory: context.paths.data,
            homeDirectory: context.homeDirectory,
            workingDirectory: context.workingDirectory,
            repository: selectedRepository(),
            skill,
            replace: options.replace
          })
          context.stdout.write(`ki repo skill add: linked ${result.skill} into ${result.repository} for ${result.agents.join(', ')}\n`)
        })
    )
    .addCommand(
      new Command('remove')
        .description('unlink a KI-managed skill from a repository and undeclare it')
        .argument('<skill>', 'skill capability name to unlink')
        .action(async (skill: string) => {
          const result = await removeRepoSkill({
            configurationDirectory: context.paths.config,
            homeDirectory: context.homeDirectory,
            workingDirectory: context.workingDirectory,
            repository: selectedRepository(),
            skill
          })
          const disposition = result.removed ? 'removed' : 'no KI-managed link or declaration for'
          context.stdout.write(
            `ki repo skill remove: ${disposition} ${result.skill} in ${result.repository} for ${result.agents.join(', ')}\n`
          )
        })
    )

export const createSkillCommand = (context: KiContext): Command => {
  const command = new Command('skill').description('activate or deactivate KI-managed user skills')
  for (const userCommand of createUserCommands(context)) command.addCommand(userCommand)
  return command
}
