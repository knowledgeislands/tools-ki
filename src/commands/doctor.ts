import { Command } from 'commander'
import { inspectUserConfiguration } from '../agents/index.ts'
import type { KiContext } from '../core/context.ts'
import { KI_VERSION } from '../version.ts'
import { formatPaths } from './paths.ts'

export const createDoctorCommand = (context: KiContext): Command =>
  new Command('doctor')
    .description('report CLI installation mode and resolved XDG paths')
    .option('--json', 'emit a versioned JSON result')
    .action(async (options: { json?: boolean }) => {
      const configuration = await inspectUserConfiguration(context.paths.config)
      if (options.json) {
        context.stdout.write(
          `${JSON.stringify({
            version: 1,
            ki_version: KI_VERSION,
            installation: context.installation,
            ...context.paths,
            working_directory: context.workingDirectory,
            repository: context.repository?.root ?? null,
            configuration
          })}\n`
        )
        return
      }
      const lines = [
        `ki version: ${KI_VERSION}`,
        `installation: ${context.installation}`,
        formatPaths(context).trimEnd(),
        `configuration: ${configuration.state} (${configuration.path})`
      ]
      if (configuration.state !== 'missing') {
        lines.push(
          `configuration agents: ${configuration.agents.join(', ') || 'none'}`,
          `configuration harnesses: ${configuration.harnesses.join(', ') || 'none'}`,
          `configuration skills: ${configuration.skills.join(', ') || 'none'}`,
          `configuration local: ${configuration.local ?? 'none'}`
        )
      }
      for (const warning of configuration.warnings) lines.push(`configuration warning: ${warning}`)
      for (const error of configuration.errors) lines.push(`configuration error: ${error}`)
      context.stdout.write(`${lines.join('\n')}\n`)
    })
