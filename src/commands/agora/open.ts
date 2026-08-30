import { Command, Option } from 'commander'
import type { KiContext } from '../../context.ts'
import { resolveAgora } from '../../core/agora/index.ts'
import { KiError } from '../../core/errors.ts'
import { type OpenTargetName, openLocalTarget, openTargetNames } from '../../core/open-target/index.ts'

export const createAgoraOpenCommand = (context: KiContext): Command =>
  new Command('open')
    .description('open one Agora through an explicit local target')
    .argument('<agora>', 'Agora name')
    .addOption(new Option('--target <target>', 'local target to open').choices(openTargetNames).makeOptionMandatory())
    .action(async (value: string, options: { target: OpenTargetName }) => {
      const profile = await resolveAgora(context.paths.state, value)
      if (!profile.members[0]) throw new KiError(`Agora ${profile.id} has no members`, 2)

      const result = await openLocalTarget(
        options.target,
        profile.members.map((member) => member.root),
        { runner: context.runner, environment: context.environment },
        { preserveProjectionOrder: true }
      )
      if (result.exitCode)
        throw new KiError(
          `could not open Agora ${profile.id}: ${result.output.trim() || result.failureMessage}`,
          result.exitCode
        )

      context.stdout.write(
        `ki agora open ${profile.id} --target ${options.target}: opened ${profile.members.length} repositories\n`
      )
    })
