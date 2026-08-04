import { Command } from 'commander'
import { addUserSkill, removeUserSkill } from '../agents/index.ts'
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

export const createSkillCommand = (context: KiContext): Command => {
  const command = new Command('skill').description('activate or deactivate KI-managed user skills')
  for (const userCommand of createUserCommands(context)) command.addCommand(userCommand)
  return command
}
