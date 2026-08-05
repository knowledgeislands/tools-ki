import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { listAgoras } from '../../core/agora.ts'

export const createAgoraListCommand = (context: KiContext): Command =>
  new Command('list').description('list available Agora profiles').action(async () => {
    const profiles = await listAgoras(context.paths.config)
    const projects = profiles.reduce((total, profile) => total + profile.projects.length, 0)
    const lines = ['╭─ KI AGORAS', `├─ profiles (${profiles.length})`]
    if (!profiles.length) lines.push('│  ╰─ none')
    else
      lines.push(
        ...profiles.map(
          (profile, index) => `│  ${index === profiles.length - 1 ? '╰─' : '├─'} ${profile.id} — ${profile.name} (${profile.projects.length} projects)`
        )
      )
    lines.push(`╰─ summary: PROFILES=${profiles.length} PROJECTS=${projects}`)
    context.stdout.write(`${lines.join('\n')}\n`)
  })
