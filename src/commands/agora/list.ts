import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { listAgoras } from '../../core/agora/index.ts'
import { renderTree } from '../../core/presentation/index.ts'

export const createAgoraListCommand = (context: KiContext): Command =>
  new Command('list').description('list the registered estate and declared Agoras').action(async () => {
    const profiles = await listAgoras(context.paths.state)
    const members = new Set(profiles.flatMap((profile) => profile.members.map((member) => member.repository))).size
    const entries = profiles.map((profile) => ({
      label: `${profile.id} [${profile.system ? 'system' : 'declared'}] ${profile.name} (${profile.members.length} members)`
    }))
    context.stdout.write(
      `${renderTree({
        title: 'KI AGORAS',
        entries: [
          { label: `agoras (${profiles.length})`, children: entries },
          { label: `summary: AGORAS=${profiles.length} MEMBERS=${members}` }
        ]
      }).join('\n')}\n`
    )
  })
