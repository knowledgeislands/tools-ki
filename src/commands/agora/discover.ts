import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { discoverAgoraProjects } from '../../core/agora.ts'

export const createAgoraDiscoverCommand = (context: KiContext): Command =>
  new Command('discover')
    .description('add KI repositories discovered beneath one physical directory')
    .argument('<name>', 'Agora name')
    .argument('<directory>', 'physical directory to scan')
    .action(async (name: string, directory: string) => {
      const profile = await discoverAgoraProjects(context.paths.config, context.workingDirectory, name, directory)
      context.stdout.write(`ki agora discover: ${profile.id} now has ${profile.projects.length} projects\n`)
    })
