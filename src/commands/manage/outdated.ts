import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { collectCapabilityStatus } from '../../core/capability-status.ts'

export const createOutdatedCommand = (context: KiContext): Command =>
  new Command('outdated').description('report installed harnesses with comparable newer release evidence').action(async () => {
    const status = await collectCapabilityStatus({
      configurationDirectory: context.paths.config,
      dataDirectory: context.paths.data
    })
    const lines = ['ki manage outdated']
    if (!status.outdatedEvidenceGaps.length) lines.push('No installed harnesses.')
    else {
      lines.push('No comparable newer release evidence.')
      lines.push('Unavailable release evidence:')
      for (const entry of status.outdatedEvidenceGaps) {
        const reason = entry.reason === 'no-configured-release' ? 'no configured immutable release' : 'installed release provenance is not recorded'
        lines.push(`  ${entry.harness}: ${reason}`)
      }
    }
    context.stdout.write(`${lines.join('\n')}\n`)
  })
