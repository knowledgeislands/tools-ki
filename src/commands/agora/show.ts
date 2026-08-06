import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { resolveAgora } from '../../core/agora.ts'

export const createAgoraShowCommand = (context: KiContext): Command =>
  new Command('show')
    .description('show one Agora profile')
    .argument('<agora>', 'Agora name or profile path')
    .action(async (value: string) => {
      const profile = await resolveAgora(context.paths.config, context.workingDirectory, value)
      const lines = [
        '╭─ KI AGORA',
        `├─ ${profile.id}`,
        `│  ├─ name: ${profile.name}`,
        `│  ╰─ tool: ${profile.tool}`,
        `├─ projects (${profile.projects.length})`
      ]
      if (!profile.projects.length) lines.push('│  ╰─ none')
      else
        lines.push(
          ...profile.projects.map(
            (project, index) => `│  ${index === profile.projects.length - 1 ? '╰─' : '├─'} ${project}`
          )
        )
      lines.push(`╰─ summary: PROJECTS=${profile.projects.length}`)
      context.stdout.write(`${lines.join('\n')}\n`)
    })
