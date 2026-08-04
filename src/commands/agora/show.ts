import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { resolveAgora } from '../../core/agora.ts'

export const createAgoraShowCommand = (context: KiContext): Command =>
  new Command('show')
    .description('show one Agora profile')
    .argument('<agora>', 'Agora name or profile path')
    .action(async (value: string) => {
      const profile = await resolveAgora(context.paths.config, context.workingDirectory, value)
      context.stdout.write(
        `ki agora show ${profile.id}\n  ${profile.name}\n  tool ${profile.tool}\n${profile.projects.map((project) => `  project ${project}`).join('\n')}${profile.projects.length ? '\n' : ''}`
      )
    })
