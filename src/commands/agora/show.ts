import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { resolveAgora } from '../../core/agora/index.ts'
import { renderTree } from '../presentation/index.ts'

export const createAgoraShowCommand = (context: KiContext): Command =>
  new Command('show')
    .description('show one declared Agora or the registered estate')
    .argument('<agora>', 'Agora name')
    .option('-v, --verbose', 'show repository URLs and local paths')
    .action(async (value: string, options: { readonly verbose?: boolean }) => {
      const profile = await resolveAgora(context.paths.state, value)
      const members = profile.members.length
        ? profile.members.map((member) => ({
            label: member.key,
            ...(options.verbose
              ? {
                  children: [{ label: `repository: ${member.repository}` }, { label: `path: ${member.root}` }]
                }
              : {})
          }))
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
                ...(profile.home ? [{ label: `home: ${profile.home.repository}` }] : [])
              ]
            },
            { label: `members (${profile.members.length})`, children: members },
            { label: `summary: MEMBERS=${profile.members.length}` }
          ]
        }).join('\n')}\n`
      )
    })
