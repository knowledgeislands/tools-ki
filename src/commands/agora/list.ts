import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { listAgoras } from '../../core/agora.ts'

export const createAgoraListCommand = (context: KiContext): Command =>
  new Command('list').description('list available Agora profiles').action(async () => {
    const profiles = await listAgoras(context.homeDirectory)
    context.stdout.write(
      `ki agora list${profiles.length ? `\n${profiles.map((profile) => `  ${profile.id} — ${profile.name} (${profile.projects.length} projects)`).join('\n')}` : ''}\n`
    )
  })
