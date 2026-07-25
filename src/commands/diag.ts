import { Command } from 'commander'
import { inspectUserConfiguration } from '../agents/index.ts'
import type { KiContext } from '../context.ts'
import { KI_VERSION } from '../version.ts'

const field = (label: string, value: string): string => `  ${label.padEnd(14)}${value}`

export const createDiagCommand = (context: KiContext): Command =>
  new Command('diag').description('report CLI installation mode, paths, and configuration').action(async () => {
    const configuration = await inspectUserConfiguration(context.paths.config)
    const lines = [
      'ki diag',
      field('Version', KI_VERSION),
      field('Installation', context.installation),
      field('Executable', context.executable),
      field('Repository', context.repository?.root ?? 'none'),
      '',
      'Configuration',
      field('Status', configuration.state),
      field('File', configuration.path)
    ]
    if (configuration.state !== 'missing') {
      lines.push(
        field(`Agents (${configuration.agents.length})`, configuration.agents.join(', ') || 'none'),
        field(`Harnesses (${configuration.harnesses.length})`, configuration.harnesses.join(', ') || 'none'),
        field(`Skills (${configuration.skills.length})`, configuration.skills.join(', ') || 'none'),
        field('Local source', configuration.local ?? 'none')
      )
    } else lines.push(field('Action', 'run ki bootstrap'))
    lines.push(
      '',
      'Paths',
      field('Data', context.paths.data),
      field('Config', context.paths.config),
      field('Cache', context.paths.cache),
      field('State', context.paths.state)
    )
    if (configuration.warnings.length) {
      lines.push('', 'Warnings', ...configuration.warnings.map((warning) => `  - ${warning}`))
    }
    if (configuration.errors.length) {
      lines.push('', 'Errors', ...configuration.errors.map((error) => `  - ${error}`))
    }
    context.stdout.write(`${lines.join('\n')}\n`)
  })
