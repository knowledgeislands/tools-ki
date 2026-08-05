import { Command } from 'commander'
import { inspectUserConfiguration } from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
import { KiExit } from '../../core/errors.ts'
import { canonicalHarnessDevelopmentEnabled } from '../../core/registry.ts'
import { KI_VERSION } from '../../version.ts'
import { inspectDirectRepositoryHealth } from '../repo/repository-health.ts'

const field = (label: string, value: string): string => `${label.padEnd(14)}${label.length >= 14 ? ' ' : ''}${value}`

const branches = (prefix: string, entries: readonly string[]): readonly string[] =>
  entries.length ? entries.map((entry, index) => `${prefix}${index === entries.length - 1 ? '╰─' : '├─'} ${entry}`) : [`${prefix}╰─ none`]

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
    const configurationEntries = [`│  ├─ ${field('Status', configuration.state)}`, `│  ├─ ${field('File', configuration.path)}`]
    if (configuration.state !== 'missing') {
      const localMode = configuration.local
        ? (await canonicalHarnessDevelopmentEnabled(context.paths.data, configuration.local))
          ? 'on'
          : 'off'
        : 'not configured'
      configurationEntries.push(
        `│  ├─ agents (${configuration.agents.length})`,
        ...branches('│  │  ', configuration.agents),
        `│  ├─ harnesses (${configuration.harnesses.length})`,
        ...branches('│  │  ', configuration.harnesses),
        `│  ├─ skills (${configuration.skills.length})`,
        ...branches('│  │  ', configuration.skills),
        `│  ├─ repositories (${configuration.repositories.length})`,
        ...branches('│  │  ', configuration.repositories),
        '│  ╰─ local',
        `│     ├─ source: ${configuration.local ?? 'none'}`,
        `│     ╰─ mode: ${localMode}`
      )
    } else configurationEntries.push(`│  ╰─ ${field('Action', 'run ki bootstrap')}`)
    lines.push(`├─ configuration (${configuration.state})`, ...configurationEntries)
    lines.push(
      '├─ paths',
      ...branches('│  ', [
        field('Data', context.paths.data),
        field('Config', context.paths.config),
        field('Cache', context.paths.cache),
        field('State', context.paths.state)
      ])
    )
    if (configuration.warnings.length) {
      lines.push(
        `├─ warnings (${configuration.warnings.length})`,
        ...branches(
          '│  ',
          configuration.warnings.map((warning) => `! ${warning}`)
        )
      )
    }
    if (configuration.errors.length) {
      lines.push(
        `├─ errors (${configuration.errors.length})`,
        ...branches(
          '│  ',
          configuration.errors.map((error) => `× ${error}`)
        )
      )
    }
    const repository = await inspectDirectRepositoryHealth(context)
    if (repository)
      lines.push(
        `├─ repository (${repository.health})`,
        ...branches(
          '│  ',
          repository.lines.map((line) => line.trimStart())
        )
      )
    lines.push(
      `╰─ summary: CONFIGURATION=${configuration.state} WARNINGS=${configuration.warnings.length} ERRORS=${configuration.errors.length}${repository ? ` REPOSITORY=${repository.health}` : ''}`
    )
    context.stdout.write(`${lines.join('\n')}\n`)
    if (repository?.health === 'unrepairable') throw new KiExit(1)
  })
