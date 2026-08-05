import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { collectCapabilityStatus } from '../../core/capability-status.ts'

export const createOutdatedCommand = (context: KiContext): Command =>
  new Command('outdated').description('report installed harnesses with comparable newer release evidence').action(async () => {
    const status = await collectCapabilityStatus({
      configurationDirectory: context.paths.config,
      dataDirectory: context.paths.data
    })
    const lines = ['╭─ KI MANAGE OUTDATED', `├─ evidence gaps (${status.outdatedEvidenceGaps.length})`]
    if (!status.outdatedEvidenceGaps.length) lines.push('│  ╰─ none')
    else
      lines.push(
        ...status.outdatedEvidenceGaps.map((entry, index) => {
          const reason = entry.reason === 'no-configured-release' ? 'no configured immutable release' : 'installed release provenance is not recorded'
          return `│  ${index === status.outdatedEvidenceGaps.length - 1 ? '╰─' : '├─'} ${entry.harness}: ${reason}`
        })
      )
    lines.push(`╰─ summary: EVIDENCE_GAPS=${status.outdatedEvidenceGaps.length}`)
    context.stdout.write(`${lines.join('\n')}\n`)
  })
