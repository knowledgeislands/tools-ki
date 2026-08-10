import { Command } from 'commander'
import { collectCapabilityStatus } from '../../agents/capability-status.ts'
import type { KiContext } from '../../context.ts'
import { renderTree } from '../../core/tree-rendering.ts'

export const createMissingCommand = (context: KiContext): Command =>
  new Command('missing').description('report desired capabilities without an installed provider').action(async () => {
    const status = await collectCapabilityStatus({
      configurationDirectory: context.paths.config,
      dataDirectory: context.paths.data
    })
    const capabilities = status.missing.length
      ? status.missing.map((entry) => ({ label: `user skill ${entry.name}` }))
      : [{ label: 'none' }]
    context.stdout.write(
      `${renderTree({
        title: 'KI MANAGE MISSING',
        entries: [
          { label: `capabilities (${status.missing.length})`, children: capabilities },
          { label: `summary: MISSING=${status.missing.length}` }
        ]
      }).join('\n')}\n`
    )
  })
