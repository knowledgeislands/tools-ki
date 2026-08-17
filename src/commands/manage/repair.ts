import { lstat, realpath } from 'node:fs/promises'
import { Command } from 'commander'
import {
  agentSkillDirectory,
  compatibleWithSkill,
  configuredAgents,
  inspectUserConfiguration,
  localBootstrapHarness
} from '../../agents/index.ts'
import { linkManagedSkill } from '../../agents/skills.ts'
import type { KiContext } from '../../context.ts'
import { KiExit } from '../../core/errors.ts'
import { canonicalHarnessIdentifier, discoverInstalledHarnesses } from '../../core/harness/index.ts'
import { type ManageRepairItem, type ManageRepairPort, runManageRepair } from '../../core/manage/index.ts'
import {
  acquireManagedArtifactRecovery,
  canonicalHarnessDevelopmentEnabled,
  planOrphanRecovery,
  recoverInstallOrphans
} from '../../core/storage/index.ts'
import { presentation, renderTree } from '../presentation/index.ts'

const linkedTo = async (path: string, expected: string): Promise<boolean> => {
  const entry = await lstat(path).catch(() => undefined)
  if (!entry) return false
  if (!entry.isSymbolicLink()) throw new Error('skill is not a symbolic link')
  return (await realpath(path).catch(() => undefined)) === expected
}

const repairPort = (context: KiContext): ManageRepairPort => ({
  inspectConfiguration: () => inspectUserConfiguration(context.paths.config),
  acquireArtifactRecovery: () => acquireManagedArtifactRecovery(context.paths.state, context.paths.data),
  planOrphanRecovery: () => planOrphanRecovery(context.paths.data),
  recoverOrphans: (planned) => recoverInstallOrphans(context.paths.data, planned),
  configuredAgents: async () =>
    (
      await configuredAgents({
        homeDirectory: context.homeDirectory,
        configurationDirectory: context.paths.config
      })
    ).map((agent) => ({
      id: agent.descriptor.id,
      home: agent.home,
      userSkills: agentSkillDirectory(agent, 'user'),
      supports: (runtimes) => compatibleWithSkill(agent, runtimes),
      linkSkill: async (name, expected) => {
        await linkManagedSkill(agent, { scope: 'user' }, { name, source: expected }, true)
      }
    })),
  discoverHarnesses: () => discoverInstalledHarnesses(context.paths.data),
  localDevelopmentEnabled: (source) => canonicalHarnessDevelopmentEnabled(context.paths.data, source),
  inspectLocalHarness: (source) => localBootstrapHarness(source),
  realpath,
  linkedTo
})

const renderItem = (item: ManageRepairItem): string => {
  if (item.kind === 'status') {
    return `${presentation(`status.${item.status}`).terminal} ${item.label}: ${item.detail}`
  }
  if (item.kind === 'link') return `${item.dryRun ? 'would link' : 'link'} ${item.target} -> ${item.expected}`
  const verb = item.action === 'restore' ? 'restore' : 'remove'
  return `${item.dryRun ? `would ${verb}` : `${verb}d`} ${item.path}: ${item.detail}`
}

export const createRepairCommand = (context: KiContext): Command =>
  new Command('repair')
    .description('reconcile configured KI-managed user skill projections')
    .option('--dry-run', 'report repairs without writing')
    .action(async (options: { dryRun?: boolean }) => {
      const result = await runManageRepair(repairPort(context), {
        dryRun: Boolean(options.dryRun),
        canonicalHarnessIdentifier
      })
      context.stdout.write(
        `${renderTree({
          title: 'KI MANAGE REPAIR',
          entries: [
            {
              label: `results (${result.items.length})`,
              children: result.items.map((item) => ({ label: renderItem(item) }))
            },
            { label: `summary: ${result.failed ? 'FAIL' : 'PASS'}` }
          ]
        }).join('\n')}\n`
      )
      if (result.failed) throw new KiExit(1)
    })
