import { Command } from 'commander'
import type { KiContext } from '../context.ts'
import { listAgoras, resolveAgora } from '../core/agora.ts'
import { KiError } from '../core/errors.ts'
export const createAgoraCommand = (context: KiContext): Command =>
  new Command('agora')
    .description('manage named multi-project workspace profiles')
    .addCommand(
      new Command('list').description('list available Agora profiles').action(async () => {
        const profiles = await listAgoras(context.homeDirectory)
        context.stdout.write(
          `ki agora list${profiles.length ? `\n${profiles.map((profile) => `  ${profile.id} — ${profile.name} (${profile.projects.length} projects)`).join('\n')}` : ''}\n`
        )
      })
    )
    .addCommand(
      new Command('show')
        .description('show one Agora profile')
        .argument('<agora>', 'Agora name or profile path')
        .action(async (value: string) => {
          const profile = await resolveAgora(context.homeDirectory, context.workingDirectory, value)
          context.stdout.write(
            `ki agora show ${profile.id}\n  ${profile.name}\n  tool ${profile.tool}\n${profile.projects.map((project) => `  project ${project}`).join('\n')}${profile.projects.length ? '\n' : ''}`
          )
        })
    )
    .addCommand(
      new Command('open')
        .description('open one Agora profile')
        .argument('<agora>', 'Agora name or profile path')
        .action(async (value: string) => {
          const profile = await resolveAgora(context.homeDirectory, context.workingDirectory, value)
          if (!profile.projects[0]) throw new KiError(`Agora ${profile.id} has no projects`, 2)
          for (const [index, project] of profile.projects.entries()) {
            const result = await context.runner('zed', [index ? '-a' : '-n', project], context.environment)
            if (result.exitCode) throw new KiError(`could not open Agora ${profile.id}: ${result.output.trim() || 'zed failed'}`, result.exitCode)
          }
          context.stdout.write(`ki agora open ${profile.id}: opened ${profile.projects.length} projects in Zed\n`)
        })
    )
