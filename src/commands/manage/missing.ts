import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { collectCapabilityStatus } from '../../core/capability-status.ts'

export const createMissingCommand = (context: KiContext): Command =>
  new Command('missing').description('report desired capabilities without an installed provider').action(async () => {
    const status = await collectCapabilityStatus({
      configurationDirectory: context.paths.config,
      dataDirectory: context.paths.data
    })
    const lines = ['╭─ KI MANAGE MISSING', `├─ capabilities (${status.missing.length})`]
    if (!status.missing.length) lines.push('│  ╰─ none')
    else lines.push(...status.missing.map((entry, index) => `│  ${index === status.missing.length - 1 ? '╰─' : '├─'} user skill ${entry.name}`))
    lines.push(`╰─ summary: MISSING=${status.missing.length}`)
    context.stdout.write(`${lines.join('\n')}\n`)
  })
