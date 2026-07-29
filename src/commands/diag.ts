import { Command } from 'commander'
import { inspectUserConfiguration } from '../agents/index.ts'
import type { KiContext } from '../context.ts'
import { resolveRepository } from '../core/repository.ts'
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

export const createRepoDiagCommand = (context: KiContext, selectedRepository: () => string | undefined): Command =>
  new Command('diag').description('report one KI repository resolution').action(async () => {
    const repo = selectedRepository()
    const repository = await resolveRepository({
      repository: repo,
      workingDirectory: context.workingDirectory,
      homeDirectory: context.homeDirectory
    })
    const source = repo ? `explicit path ${repo}` : 'current working directory'
    context.stdout.write(`ki repo diag\nRepository: ${repository.root}\nConfiguration: ${repository.configuration}\nSource: ${source}\n`)
  })
