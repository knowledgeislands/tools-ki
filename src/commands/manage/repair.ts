import { lstat, realpath } from 'node:fs/promises'
import { join } from 'node:path'
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
import { canonicalHarnessIdentifier, discoverInstalledHarnesses } from '../../core/harness.ts'
import { canonicalHarnessDevelopmentEnabled, planOrphanRecovery, recoverInstallOrphans } from '../../core/registry.ts'
import { renderTree } from '../../core/tree-rendering.ts'

const managedSkillName = (identity: string): string => identity.slice(identity.indexOf(':') + 1)

const linkedTo = async (path: string, expected: string): Promise<boolean> => {
  const entry = await lstat(path).catch(() => undefined)
  if (!entry) return false
  if (!entry.isSymbolicLink()) throw new Error('skill is not a symbolic link')
  return (await realpath(path).catch(() => undefined)) === expected
}

export const createRepairCommand = (context: KiContext): Command =>
  new Command('repair')
    .description('reconcile configured KI-managed user skill projections')
    .option('--dry-run', 'report repairs without writing')
    .action(async (options: { dryRun?: boolean }) => {
      const dryRun = Boolean(options.dryRun)
      const configuration = await inspectUserConfiguration(context.paths.config)
      const results: string[] = []
      let failed = false

      // Interrupted-install residue is recovered before anything reads the harness tree, so a
      // parked payload is back in place by the time skill projections are resolved against it.
      const orphans = dryRun
        ? await planOrphanRecovery(context.paths.data)
        : await recoverInstallOrphans(context.paths.data)
      for (const recovery of orphans) {
        if (recovery.action === 'refuse') {
          results.push(`✗ Install residue ${recovery.orphan.path}: ${recovery.detail}`)
          failed = true
          continue
        }
        const verb = recovery.action === 'restore' ? 'restore' : 'remove'
        results.push(`${dryRun ? `would ${verb}` : `${verb}d`} ${recovery.orphan.path}: ${recovery.detail}`)
      }

      if (configuration.state === 'missing') {
        results.push('✗ Configuration: missing; run ki bootstrap')
        failed = true
      } else if (configuration.state === 'invalid') {
        results.push(`✗ Configuration: ${configuration.errors.join('; ')}`)
        failed = true
      } else {
        results.push(`✓ Configuration: ${configuration.path}`)
        const [agents, installed] = await Promise.all([
          configuredAgents({ homeDirectory: context.homeDirectory, configurationDirectory: context.paths.config }),
          discoverInstalledHarnesses(context.paths.data)
        ])
        const localSources = new Map<string, string>()
        if (
          configuration.local &&
          (await canonicalHarnessDevelopmentEnabled(context.paths.data, configuration.local))
        ) {
          const local = await localBootstrapHarness(configuration.local)
          for (const skill of local.skills) localSources.set(skill.name, skill.source)
        }

        for (const identity of configuration.skills) {
          const name = managedSkillName(identity)
          const resolved = installed
            .flatMap((harness) => harness.capabilities.map((capability) => ({ harness, capability })))
            .find(({ harness, capability }) => identity === `${harness.id}:${capability.name}`)
          if (!resolved) {
            results.push(
              `✗ User skill ${name}: configured source ${identity.slice(0, identity.indexOf(':'))} is unavailable`
            )
            failed = true
            continue
          }
          const expected =
            (identity.startsWith(`${canonicalHarnessIdentifier}:`) ? localSources.get(name) : undefined) ??
            (await realpath(join(resolved.harness.root, resolved.capability.source)))
          const compatible = agents.filter((agent) => compatibleWithSkill(agent, resolved.capability.supportedRuntimes))
          if (!compatible.length) {
            results.push(`✗ User skill ${name}: no compatible configured agent`)
            failed = true
            continue
          }
          for (const agent of compatible) {
            const target = join(agentSkillDirectory(agent, 'user'), name)
            try {
              if (await linkedTo(target, expected)) {
                results.push(`✓ User skill ${name} for ${agent.descriptor.id}: linked`)
                continue
              }
              results.push(`${dryRun ? 'would link' : 'link'} ${target} -> ${expected}`)
              if (!dryRun) await linkManagedSkill(agent, { scope: 'user' }, { name, source: expected }, true)
            } catch (error) {
              results.push(`✗ User skill ${name} for ${agent.descriptor.id}: ${(error as Error).message}`)
              failed = true
            }
          }
        }
      }

      context.stdout.write(
        `${renderTree({
          title: 'KI MANAGE REPAIR',
          entries: [
            { label: `results (${results.length})`, children: results.map((label) => ({ label })) },
            { label: `summary: ${failed ? 'FAIL' : 'PASS'}` }
          ]
        }).join('\n')}\n`
      )
      if (failed) throw new KiExit(1)
    })
