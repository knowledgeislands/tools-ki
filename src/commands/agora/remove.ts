import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { removeAgoraProject } from '../../core/agora.ts'

export const createAgoraRemoveCommand = (context: KiContext): Command =>
  new Command('remove')
    .description('remove one named project from an Agora profile')
    .argument('<name>', 'Agora name')
    .argument('<project>', 'profile project name')
    .action(async (name: string, project: string) => {
      const profile = await removeAgoraProject(context.paths.config, name, project)
      context.stdout.write(`ki agora remove: ${profile.id} now has ${profile.projects.length} projects\n`)
    })
