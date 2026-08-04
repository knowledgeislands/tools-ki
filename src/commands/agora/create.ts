import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { createAgora } from '../../core/agora.ts'

export const createAgoraCreateCommand = (context: KiContext): Command =>
  new Command('create')
    .description('create an empty named Agora profile')
    .argument('<name>', 'lower-case Agora name')
    .action(async (name: string) => {
      const profile = await createAgora(context.paths.config, name)
      context.stdout.write(`ki agora create: created ${profile.id}\n`)
    })
