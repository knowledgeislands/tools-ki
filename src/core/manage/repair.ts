import { join } from 'node:path'
import type { ManagedArtifactRecoveryControl, OrphanRecovery } from '../storage/index.ts'
import type { ManageAgent, ManageConfiguration, ManageHarness, ManageLocalHarness } from './doctor.ts'

export type ManageRepairItem =
  | { readonly kind: 'status'; readonly status: 'pass' | 'fail'; readonly label: string; readonly detail: string }
  | {
      readonly kind: 'recovery'
      readonly action: 'restore' | 'remove'
      readonly path: string
      readonly detail: string
      readonly dryRun: boolean
    }
  | { readonly kind: 'link'; readonly target: string; readonly expected: string; readonly dryRun: boolean }

export interface ManageRepairResult {
  readonly items: readonly ManageRepairItem[]
  readonly failed: boolean
}

export interface ManageRepairAgent extends ManageAgent {
  readonly linkSkill: (name: string, expected: string) => Promise<void>
}

export interface ManageRepairPort {
  readonly inspectConfiguration: () => Promise<ManageConfiguration>
  readonly acquireArtifactRecovery: () => Promise<ManagedArtifactRecoveryControl>
  readonly planOrphanRecovery: () => Promise<readonly OrphanRecovery[]>
  readonly recoverOrphans: (planned: readonly OrphanRecovery[]) => Promise<readonly OrphanRecovery[]>
  readonly configuredAgents: () => Promise<readonly ManageRepairAgent[]>
  readonly discoverHarnesses: () => Promise<readonly ManageHarness[]>
  readonly localDevelopmentEnabled: (source: string) => Promise<boolean>
  readonly inspectLocalHarness: (source: string) => Promise<ManageLocalHarness>
  readonly realpath: (path: string) => Promise<string>
  readonly linkedTo: (path: string, expected: string) => Promise<boolean>
}

export interface ManageRepairOptions {
  readonly dryRun: boolean
  readonly canonicalHarnessIdentifier: string
}

const managedSkillName = (identity: string): string => identity.slice(identity.indexOf(':') + 1)

const recoverInstallResidue = async (
  port: ManageRepairPort,
  dryRun: boolean,
  items: ManageRepairItem[]
): Promise<boolean> => {
  let failed = false
  const managed = await port.acquireArtifactRecovery()
  try {
    const protectedPaths = new Set(managed.protected.map((artifact) => artifact.path))
    const planned = (await port.planOrphanRecovery()).filter((recovery) => !protectedPaths.has(recovery.orphan.path))
    const orphans = dryRun ? planned : await port.recoverOrphans(planned)
    for (const artifact of managed.protected) {
      items.push({ kind: 'status', status: 'fail', label: `Install residue ${artifact.path}`, detail: artifact.detail })
      failed = true
    }
    for (const recovery of orphans) {
      if (recovery.action === 'refuse') {
        items.push({
          kind: 'status',
          status: 'fail',
          label: `Install residue ${recovery.orphan.path}`,
          detail: recovery.detail
        })
        failed = true
        continue
      }
      items.push({
        kind: 'recovery',
        action: recovery.action,
        path: recovery.orphan.path,
        detail: recovery.detail,
        dryRun
      })
    }
    if (!dryRun) {
      const recoveredPaths = new Set(
        orphans.filter((recovery) => recovery.action !== 'refuse').map((recovery) => recovery.orphan.path)
      )
      await Promise.all(
        managed.leases.map(async (lease) => {
          if (recoveredPaths.has(lease.path)) await lease.retire()
          else await lease.release()
        })
      )
    }
  } finally {
    await Promise.all(managed.leases.map((lease) => lease.release()))
  }
  return failed
}

export const runManageRepair = async (
  port: ManageRepairPort,
  options: ManageRepairOptions
): Promise<ManageRepairResult> => {
  const configuration = await port.inspectConfiguration()
  const items: ManageRepairItem[] = []
  let failed = await recoverInstallResidue(port, options.dryRun, items)

  if (configuration.state === 'missing') {
    items.push({ kind: 'status', status: 'fail', label: 'Configuration', detail: 'missing; run ki bootstrap' })
    failed = true
  } else if (configuration.state === 'invalid') {
    items.push({ kind: 'status', status: 'fail', label: 'Configuration', detail: configuration.errors.join('; ') })
    failed = true
  } else {
    items.push({ kind: 'status', status: 'pass', label: 'Configuration', detail: configuration.path })
    const [agents, installed] = await Promise.all([port.configuredAgents(), port.discoverHarnesses()])
    const localSources = new Map<string, string>()
    if (configuration.local && (await port.localDevelopmentEnabled(configuration.local))) {
      const local = await port.inspectLocalHarness(configuration.local)
      for (const skill of local.skills) localSources.set(skill.name, skill.source)
    }

    for (const identity of configuration.skills) {
      const name = managedSkillName(identity)
      const resolved = installed
        .flatMap((harness) => harness.capabilities.map((capability) => ({ harness, capability })))
        .find(({ harness, capability }) => identity === `${harness.id}:${capability.name}`)
      if (!resolved) {
        items.push({
          kind: 'status',
          status: 'fail',
          label: `User skill ${name}`,
          detail: `configured source ${identity.slice(0, identity.indexOf(':'))} is unavailable`
        })
        failed = true
        continue
      }
      const expected =
        (identity.startsWith(`${options.canonicalHarnessIdentifier}:`) ? localSources.get(name) : undefined) ??
        (await port.realpath(join(resolved.harness.root, resolved.capability.source)))
      const compatible = agents.filter((agent) => agent.supports(resolved.capability.supportedRuntimes))
      if (!compatible.length) {
        items.push({
          kind: 'status',
          status: 'fail',
          label: `User skill ${name}`,
          detail: 'no compatible configured agent'
        })
        failed = true
        continue
      }
      for (const agent of compatible) {
        const target = join(agent.userSkills, name)
        try {
          if (await port.linkedTo(target, expected)) {
            items.push({
              kind: 'status',
              status: 'pass',
              label: `User skill ${name} for ${agent.id}`,
              detail: 'linked'
            })
            continue
          }
          items.push({ kind: 'link', target, expected, dryRun: options.dryRun })
          if (!options.dryRun) await agent.linkSkill(name, expected)
        } catch (error) {
          items.push({
            kind: 'status',
            status: 'fail',
            label: `User skill ${name} for ${agent.id}`,
            detail: (error as Error).message
          })
          failed = true
        }
      }
    }
  }
  return { items, failed }
}
