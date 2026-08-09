import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { resolveAgora } from '../../core/agora.ts'
import { KiError } from '../../core/errors.ts'

export const createAgoraOpenCommand = (context: KiContext): Command =>
  new Command('open')
    .description('open one Agora through an explicit local target')
    .argument('<agora>', 'Agora name')
    .requiredOption('--target <target>', 'local target to open')
    .action(async (value: string, options: { target: string }) => {
      const profile = await resolveAgora(context.paths.state, value)
      if (options.target !== 'zed') throw new KiError('Agora open --target currently supports only zed', 2)
      if (!profile.targets.includes('zed-workspace'))
        throw new KiError(`Agora ${profile.id} does not permit the zed-workspace target`, 2)
      if (!profile.members[0]) throw new KiError(`Agora ${profile.id} has no members`, 2)
      const window = await context.runner('zed', ['-n'], context.environment)
      if (window.exitCode)
        throw new KiError(
          `could not open Agora ${profile.id}: ${window.output.trim() || 'zed failed'}`,
          window.exitCode
        )
      for (const member of [...profile.members].reverse()) {
        const result = await context.runner('zed', ['-e', member.root], context.environment)
        if (result.exitCode)
          throw new KiError(
            `could not open Agora ${profile.id}: ${result.output.trim() || 'zed failed'}`,
            result.exitCode
          )
      }
      context.stdout.write(`ki agora open ${profile.id} --target zed: opened ${profile.members.length} repositories\n`)
    })
