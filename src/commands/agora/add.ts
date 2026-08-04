import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { addAgoraProject } from '../../core/agora.ts'

export const createAgoraAddCommand = (context: KiContext): Command =>
  new Command('add')
    .description('add one physical project directory to an Agora profile')
    .argument('<name>', 'Agora name')
    .argument('<directory>', 'physical project directory')
    .action(async (name: string, directory: string) => {
      const profile = await addAgoraProject(context.paths.config, context.workingDirectory, name, directory)
      context.stdout.write(`ki agora add: ${profile.id} now has ${profile.projects.length} projects\n`)
    })
