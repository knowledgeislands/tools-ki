import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { resolveAgora } from '../../core/agora.ts'
import { KiError } from '../../core/errors.ts'

export const createAgoraOpenCommand = (context: KiContext): Command =>
  new Command('open')
    .description('open one Agora profile')
    .argument('<agora>', 'Agora name or profile path')
    .action(async (value: string) => {
      const profile = await resolveAgora(context.homeDirectory, context.workingDirectory, value)
      if (!profile.projects[0]) throw new KiError(`Agora ${profile.id} has no projects`, 2)
      const window = await context.runner('zed', ['-n'], context.environment)
      if (window.exitCode) throw new KiError(`could not open Agora ${profile.id}: ${window.output.trim() || 'zed failed'}`, window.exitCode)
      for (const project of [...profile.projects].reverse()) {
        const result = await context.runner('zed', ['-e', project], context.environment)
        if (result.exitCode) throw new KiError(`could not open Agora ${profile.id}: ${result.output.trim() || 'zed failed'}`, result.exitCode)
      }
      context.stdout.write(`ki agora open ${profile.id}: opened ${profile.projects.length} Zed projects\n`)
    })
