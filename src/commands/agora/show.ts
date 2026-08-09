import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { resolveAgora } from '../../core/agora.ts'
import { renderTree } from '../../core/tree-rendering.ts'

export const createAgoraShowCommand = (context: KiContext): Command =>
  new Command('show')
    .description('show one declared Agora or the registered estate')
    .argument('<agora>', 'Agora name')
    .action(async (value: string) => {
      const profile = await resolveAgora(context.paths.config, value)
      const members = profile.members.length
        ? profile.members.map((member) => ({ label: `${member.key}: ${member.repository} (${member.root})` }))
        : [{ label: 'none' }]
      context.stdout.write(
        `${renderTree({
          title: 'KI AGORA',
          entries: [
            {
              label: profile.id,
              children: [
                { label: `name: ${profile.name}` },
                { label: `purpose: ${profile.purpose}` },
                { label: `targets: ${profile.targets.join(', ') || 'none'}` },
                ...(profile.home ? [{ label: `home: ${profile.home.repository}` }] : [])
              ]
            },
            { label: `members (${profile.members.length})`, children: members },
            { label: `summary: MEMBERS=${profile.members.length}` }
          ]
        }).join('\n')}\n`
      )
    })
