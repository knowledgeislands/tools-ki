import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { resolveAgora } from '../../core/agora.ts'
import { KiError } from '../../core/errors.ts'

export const createAgoraRootsCommand = (context: KiContext): Command =>
  new Command('roots')
    .description('write resolved Agora roots for machine consumption')
    .argument('<agora>', 'Agora name')
    .option('-0, --null', 'write roots terminated with NUL instead of line feeds')
    .action(async (value: string, options: { null?: boolean }) => {
      const profile = await resolveAgora(context.paths.state, value)
      if (!profile.members.length) throw new KiError(`Agora ${profile.id} has no members`, 2)
      const separator = options.null ? '\0' : '\n'
      context.stdout.write(`${profile.members.map((member) => member.root).join(separator)}${separator}`)
    })
