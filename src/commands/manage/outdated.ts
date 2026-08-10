import { Command } from 'commander'
import { collectCapabilityStatus } from '../../agents/capability-status.ts'
import type { KiContext } from '../../context.ts'
import { renderTree } from '../../core/tree-rendering.ts'

export const createOutdatedCommand = (context: KiContext): Command =>
  new Command('outdated')
    .description('report installed harnesses with comparable newer release evidence')
    .action(async () => {
      const status = await collectCapabilityStatus({
        configurationDirectory: context.paths.config,
        dataDirectory: context.paths.data
      })
      const evidenceGaps = status.outdatedEvidenceGaps.length
        ? status.outdatedEvidenceGaps.map((entry) => {
            const reason =
              entry.reason === 'no-configured-release'
                ? 'no configured immutable release'
                : 'installed release provenance is not recorded'
            return { label: `${entry.harness}: ${reason}` }
          })
        : [{ label: 'none' }]
      context.stdout.write(
        `${renderTree({
          title: 'KI MANAGE OUTDATED',
          entries: [
            { label: `evidence gaps (${status.outdatedEvidenceGaps.length})`, children: evidenceGaps },
            { label: `summary: EVIDENCE_GAPS=${status.outdatedEvidenceGaps.length}` }
          ]
        }).join('\n')}\n`
      )
    })
