import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { collectCapabilityStatus } from '../../core/capability-status.ts'

export const createMissingCommand = (context: KiContext): Command =>
  new Command('missing').description('report desired capabilities without an installed provider').action(async () => {
    const status = await collectCapabilityStatus({
      configurationDirectory: context.paths.config,
      dataDirectory: context.paths.data
    })
    const lines = ['ki manage missing']
    if (!status.missing.length) lines.push('No missing capabilities.')
    else lines.push('Missing capabilities:', ...status.missing.map((entry) => `  user skill ${entry.name}`))
    context.stdout.write(`${lines.join('\n')}\n`)
  })
