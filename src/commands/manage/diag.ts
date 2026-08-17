import { Command } from 'commander'
import { inspectUserConfiguration } from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
import { KiExit } from '../../core/errors.ts'
import { canonicalHarnessDevelopmentEnabled, inspectLocalRegistry } from '../../core/storage/index.ts'
import { KI_VERSION } from '../../version.ts'
import { presentation, renderTree, type TreeEntry } from '../presentation/index.ts'

const field = (label: string, value: string): string => `${label}: ${value}`

const treeEntries = (entries: readonly string[]): readonly TreeEntry[] =>
  entries.length ? entries.map((label) => ({ label })) : [{ label: 'none' }]

export const createDiagCommand = (context: KiContext): Command =>
  new Command('diag')
    .description('report CLI installation mode, paths, and managed local configuration')
    .action(async () => {
      const [configuration, registry] = await Promise.all([
        inspectUserConfiguration(context.paths.config),
        inspectLocalRegistry(context.paths.state)
      ])
      const configurationEntries: TreeEntry[] = [
        { label: field('Status', configuration.state) },
        { label: field('File', configuration.path) }
      ]

      if (configuration.state !== 'missing') {
        const localMode = configuration.local
          ? (await canonicalHarnessDevelopmentEnabled(context.paths.data, configuration.local))
            ? 'on'
            : 'off'
          : 'not configured'
        configurationEntries.push(
          { label: `agents (${configuration.agents.length})`, children: treeEntries(configuration.agents) },
          { label: `harnesses (${configuration.harnesses.length})`, children: treeEntries(configuration.harnesses) },
          { label: `skills (${configuration.skills.length})`, children: treeEntries(configuration.skills) },
          {
            label: 'local',
            children: [{ label: field('source', configuration.local ?? 'none') }, { label: field('mode', localMode) }]
          }
        )
      } else configurationEntries.push({ label: field('Action', 'run ki bootstrap') })

      const registryEntries: TreeEntry[] = [
        { label: field('Status', registry.state) },
        { label: field('File', registry.path) },
        {
          label: `repositories (${registry.repositories.length})`,
          children: treeEntries(registry.repositories.map((repository) => `${repository.key}: ${repository.path}`))
        }
      ]
      if (registry.errors.length)
        registryEntries.push({ label: `errors (${registry.errors.length})`, children: treeEntries(registry.errors) })

      const entries: TreeEntry[] = [
        {
          label: 'installation',
          children: [
            { label: field('Version', KI_VERSION) },
            { label: field('Installation', context.installation) },
            { label: field('Executable', context.executable) }
          ]
        },
        { label: `configuration (${configuration.state})`, children: configurationEntries },
        { label: 'registry', children: registryEntries },
        {
          label: 'paths',
          children: treeEntries([
            field('Data', context.paths.data),
            field('Config', context.paths.config),
            field('Cache', context.paths.cache),
            field('State', context.paths.state)
          ])
        }
      ]

      if (configuration.warnings.length) {
        entries.push({
          label: `warnings (${configuration.warnings.length})`,
          children: treeEntries(
            configuration.warnings.map((warning) => `${presentation('status.warn').terminal} ${warning}`)
          )
        })
      }
      if (configuration.errors.length) {
        entries.push({
          label: `errors (${configuration.errors.length})`,
          children: treeEntries(
            configuration.errors.map((error) => `${presentation('status.audit-fail').terminal} ${error}`)
          )
        })
      }

      entries.push({
        label: `summary: CONFIGURATION=${configuration.state} REGISTRY=${registry.state} WARNINGS=${configuration.warnings.length} ERRORS=${configuration.errors.length}`
      })

      context.stdout.write(`${renderTree({ title: 'KI MANAGE DIAG', entries }).join('\n')}\n`)
      if (configuration.errors.length || registry.errors.length) throw new KiExit(1)
    })
