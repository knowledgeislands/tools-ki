import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { listAgoras } from '../../core/agora.ts'
import { renderTree } from '../../core/tree-rendering.ts'

export const createAgoraListCommand = (context: KiContext): Command =>
  new Command('list').description('list available Agora profiles').action(async () => {
    const profiles = await listAgoras(context.paths.config)
    const projects = profiles.reduce((total, profile) => total + profile.projects.length, 0)
    const entries = profiles.length
      ? profiles.map((profile) => ({ label: `${profile.id} — ${profile.name} (${profile.projects.length} projects)` }))
      : [{ label: 'none' }]
    context.stdout.write(
      `${renderTree({
        title: 'KI AGORAS',
        entries: [
          { label: `profiles (${profiles.length})`, children: entries },
          { label: `summary: PROFILES=${profiles.length} PROJECTS=${projects}` }
        ]
      }).join('\n')}\n`
    )
  })
