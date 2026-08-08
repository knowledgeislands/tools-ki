import { Command } from 'commander'
import { inspectUserConfiguration } from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
import { KiExit } from '../../core/errors.ts'
import { canonicalHarnessDevelopmentEnabled } from '../../core/registry.ts'
import { renderTree, type TreeEntry } from '../../core/tree-rendering.ts'
import { KI_VERSION } from '../../version.ts'
import { describeRepositoryProjection, inspectDirectRepositoryHealth } from '../repo/repository-health.ts'

const field = (label: string, value: string): string => `${label}: ${value}`

const treeEntries = (entries: readonly string[]): readonly TreeEntry[] =>
  entries.length ? entries.map((label) => ({ label })) : [{ label: 'none' }]

export const createDiagCommand = (context: KiContext): Command =>
  new Command('diag')
    .description('report CLI installation mode, paths, configuration, and direct repository health')
    .action(async () => {
      const configuration = await inspectUserConfiguration(context.paths.config)
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
            label: `repositories (${configuration.repositories.length})`,
            children: treeEntries(configuration.repositories)
          },
          {
            label: 'local',
            children: [{ label: field('source', configuration.local ?? 'none') }, { label: field('mode', localMode) }]
          }
        )
      } else configurationEntries.push({ label: field('Action', 'run ki bootstrap') })

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
          children: treeEntries(configuration.warnings.map((warning) => `! ${warning}`))
        })
      }
      if (configuration.errors.length) {
        entries.push({
          label: `errors (${configuration.errors.length})`,
          children: treeEntries(configuration.errors.map((error) => `× ${error}`))
        })
      }

      const repository = await inspectDirectRepositoryHealth(context)
      if (repository) {
        entries.push({
          label: `repository (${repository.health})`,
          children: repository.diagnostic
            ? [{ label: `✗ Repository: ${repository.diagnostic}` }]
            : [
                { label: field('Root', repository.root) },
                { label: field('Configuration', repository.configuration) },
                { label: field('Status', repository.health) },
                ...repository.projections.map((projection) => ({ label: describeRepositoryProjection(projection) }))
              ]
        })
      }
      entries.push({
        label: `summary: CONFIGURATION=${configuration.state} WARNINGS=${configuration.warnings.length} ERRORS=${configuration.errors.length}${repository ? ` REPOSITORY=${repository.health}` : ''}`
      })

      context.stdout.write(`${renderTree({ title: 'KI MANAGE DIAG', entries }).join('\n')}\n`)
      if (repository?.health === 'unrepairable') throw new KiExit(1)
    })
