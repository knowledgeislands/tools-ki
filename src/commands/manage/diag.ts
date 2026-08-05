import { Command } from 'commander'
import { inspectUserConfiguration } from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
import { KiExit } from '../../core/errors.ts'
import { canonicalHarnessDevelopmentEnabled } from '../../core/registry.ts'
import { KI_VERSION } from '../../version.ts'
import { inspectDirectRepositoryHealth } from '../repo/repository-health.ts'

const field = (label: string, value: string): string => `${label.padEnd(14)}${label.length >= 14 ? ' ' : ''}${value}`

const branches = (entries: readonly string[]): readonly string[] => entries.map((entry, index) => `│  ${index === entries.length - 1 ? '╰─' : '├─'} ${entry}`)

export const createDiagCommand = (context: KiContext): Command =>
  new Command('diag').description('report CLI installation mode, paths, configuration, and direct repository health').action(async () => {
    const configuration = await inspectUserConfiguration(context.paths.config)
    const lines = [
      '╭─ KI MANAGE DIAG',
      '├─ installation',
      `│  ${field('Version', KI_VERSION)}`,
      `│  ${field('Installation', context.installation)}`,
      `│  ${field('Executable', context.executable)}`
    ]
    const configurationEntries = [field('Status', configuration.state), field('File', configuration.path)]
    if (configuration.state !== 'missing') {
      const localMode = configuration.local
        ? (await canonicalHarnessDevelopmentEnabled(context.paths.data, configuration.local))
          ? 'on'
          : 'off'
        : 'not configured'
      configurationEntries.push(
        field(`Agents (${configuration.agents.length})`, configuration.agents.join(', ') || 'none'),
        field(`Harnesses (${configuration.harnesses.length})`, configuration.harnesses.join(', ') || 'none'),
        field(`Skills (${configuration.skills.length})`, configuration.skills.join(', ') || 'none'),
        field(`Repositories (${configuration.repositories.length})`, configuration.repositories.join(', ') || 'none'),
        field('Local source', configuration.local ?? 'none'),
        field('Local mode', localMode)
      )
    } else configurationEntries.push(field('Action', 'run ki bootstrap'))
    lines.push(`├─ configuration (${configuration.state})`, ...branches(configurationEntries))
    lines.push(
      '├─ paths',
      ...branches([
        field('Data', context.paths.data),
        field('Config', context.paths.config),
        field('Cache', context.paths.cache),
        field('State', context.paths.state)
      ])
    )
    if (configuration.warnings.length) {
      lines.push(`├─ warnings (${configuration.warnings.length})`, ...branches(configuration.warnings.map((warning) => `! ${warning}`)))
    }
    if (configuration.errors.length) {
      lines.push(`├─ errors (${configuration.errors.length})`, ...branches(configuration.errors.map((error) => `× ${error}`)))
    }
    const repository = await inspectDirectRepositoryHealth(context)
    if (repository) lines.push(`├─ repository (${repository.health})`, ...branches(repository.lines.map((line) => line.trimStart())))
    lines.push(
      `╰─ summary: CONFIGURATION=${configuration.state} WARNINGS=${configuration.warnings.length} ERRORS=${configuration.errors.length}${repository ? ` REPOSITORY=${repository.health}` : ''}`
    )
    context.stdout.write(`${lines.join('\n')}\n`)
    if (repository?.health === 'unrepairable') throw new KiExit(1)
  })
