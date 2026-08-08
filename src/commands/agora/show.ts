import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { resolveAgora } from '../../core/agora.ts'
import { renderTree } from '../../core/tree-rendering.ts'

export const createAgoraShowCommand = (context: KiContext): Command =>
  new Command('show')
    .description('show one Agora profile')
    .argument('<agora>', 'Agora name or profile path')
    .action(async (value: string) => {
      const profile = await resolveAgora(context.paths.config, context.workingDirectory, value)
      const projects = profile.projects.length ? profile.projects.map((label) => ({ label })) : [{ label: 'none' }]
      context.stdout.write(
        `${renderTree({
          title: 'KI AGORA',
          entries: [
            {
              label: profile.id,
              children: [{ label: `name: ${profile.name}` }, { label: `tool: ${profile.tool}` }]
            },
            { label: `projects (${profile.projects.length})`, children: projects },
            { label: `summary: PROJECTS=${profile.projects.length}` }
          ]
        }).join('\n')}\n`
      )
    })
