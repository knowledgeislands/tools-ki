import { Command } from 'commander'
import { addUserSkill, removeUserSkill } from '../agents/index.ts'
import type { KiContext } from '../core/context.ts'

const createUserCommand = (context: KiContext): Command =>
  new Command('user')
    .description('manage KI-managed skills in the user agent skill spaces')
    .addCommand(
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
          context.stdout.write(`ki skill user add: linked ${result.skill} for ${result.agents.join(', ')}\n`)
        })
    )
    .addCommand(
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
          context.stdout.write(`ki skill user remove: ${disposition} ${result.skill} for ${result.agents.join(', ')}\n`)
        })
    )

export const createSkillCommand = (context: KiContext): Command =>
  new Command('skill').description('activate or deactivate harness skills at user scope').addCommand(createUserCommand(context))
