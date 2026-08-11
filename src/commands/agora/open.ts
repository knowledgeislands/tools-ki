import { Command, Option } from 'commander'
import type { KiContext } from '../../context.ts'
import { resolveAgora } from '../../core/agora.ts'
import { KiError } from '../../core/errors.ts'

type OpenTarget = 'zed' | 'vscode'

export const createAgoraOpenCommand = (context: KiContext): Command =>
  new Command('open')
    .description('open one Agora through an explicit local target')
    .argument('<agora>', 'Agora name')
    .addOption(new Option('--target <target>', 'local target to open').choices(['zed', 'vscode']).makeOptionMandatory())
    .action(async (value: string, options: { target: OpenTarget }) => {
      const profile = await resolveAgora(context.paths.state, value)
      if (!profile.members[0]) throw new KiError(`Agora ${profile.id} has no members`, 2)
      if (options.target === 'zed') {
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
      } else {
        const result = await context.runner(
          'code',
          ['--new-window', ...profile.members.map((member) => member.root)],
          context.environment
        )
        if (result.exitCode)
          throw new KiError(
            `could not open Agora ${profile.id}: ${result.output.trim() || 'code failed'}`,
            result.exitCode
          )
      }
      context.stdout.write(
        `ki agora open ${profile.id} --target ${options.target}: opened ${profile.members.length} repositories\n`
      )
    })
