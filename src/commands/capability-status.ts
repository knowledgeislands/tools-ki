import { Command } from 'commander'
import type { KiContext } from '../context.ts'
import { collectCapabilityStatus } from '../core/capability-status.ts'

const scopeLabel = (scope: 'user' | 'repository'): string => `${scope} skill`

export const createMissingCommand = (context: KiContext): Command =>
  new Command('missing').description('report desired capabilities without an installed provider').action(async () => {
    const status = await collectCapabilityStatus({
      configurationDirectory: context.paths.config,
      dataDirectory: context.paths.data,
      repositoryConfiguration: context.repository?.configuration
    })
    const lines = ['ki missing']
    if (!status.missing.length) lines.push('No missing capabilities.')
    else lines.push('Missing capabilities:', ...status.missing.map((entry) => `  ${scopeLabel(entry.scope)} ${entry.name}`))
    if (status.ambiguous.length) {
      lines.push('Ambiguous repository capabilities:')
      for (const entry of status.ambiguous) lines.push(`  repository skill ${entry.name}: ${entry.providers.join(', ')}`)
    }
    context.stdout.write(`${lines.join('\n')}\n`)
  })

export const createOutdatedCommand = (context: KiContext): Command =>
  new Command('outdated').description('report installed harnesses with comparable newer release evidence').action(async () => {
    const status = await collectCapabilityStatus({
      configurationDirectory: context.paths.config,
      dataDirectory: context.paths.data,
      repositoryConfiguration: context.repository?.configuration
    })
    const lines = ['ki outdated']
    if (!status.outdatedEvidenceGaps.length) lines.push('No installed harnesses.')
    else {
      lines.push('No comparable newer release evidence.')
      lines.push('Unavailable release evidence:')
      for (const entry of status.outdatedEvidenceGaps) {
        const reason =
          entry.reason === 'no-configured-release' ? 'no configured immutable release' : 'installed release provenance is not recorded'
        lines.push(`  ${entry.harness}: ${reason}`)
      }
    }
    context.stdout.write(`${lines.join('\n')}\n`)
  })
