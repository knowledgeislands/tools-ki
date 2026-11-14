import { lstat, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { Command } from 'commander'
import { agentSkillDirectory, compatibleWithSkill, configuredAgents, localBackpack } from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
import { canonicalBackpackIdentifier, discoverInstalledBackpacks } from '../../core/backpack/index.ts'
import { declaredKnowledgeBaseStoreRoles, readRepositoryDeclaration } from '../../core/configuration/index.ts'
import { KiExit } from '../../core/errors.ts'
import {
  inspectManageDoctor,
  type ManageCheckStatus,
  type ManageConfiguration,
  type ManageDoctorCheck,
  type ManageDoctorPort,
  type ManageStoreState
} from '../../core/manage/index.ts'
import {
  backpackDevelopmentEnabled,
  externalStoreRoles,
  knowledgeBaseStoreAvailability,
  requiredLocalRegistry
} from '../../core/storage/index.ts'
import { repositoryStoreFix } from '../../core/territory/index.ts'
import { presentation, renderTree } from '../presentation/index.ts'
import { diagnosticContext } from './diagnostic-context.ts'
import { manageConfiguration } from './manage-configuration.ts'

const mark = (status: ManageCheckStatus): string => presentation(`status.${status}`).terminal

/** Each registered Knowledge Base's declared external stores; an unreadable declaration is another check's finding. */
const registeredStores = async (context: KiContext): Promise<readonly ManageStoreState[]> => {
  const stores: ManageStoreState[] = []
  for (const entry of await requiredLocalRegistry(context.paths.state)) {
    const declaration = await readRepositoryDeclaration(join(entry.path, '.ki.toml')).catch(() => undefined)
    if (!declaration) continue
    for (const store of await knowledgeBaseStoreAvailability(
      entry,
      externalStoreRoles(declaredKnowledgeBaseStoreRoles(declaration)),
      context.platform
    ))
      stores.push(
        'unavailable' in store
          ? {
              repository: entry.path,
              role: store.role,
              state: 'unavailable',
              reason: store.unavailable,
              fix: await repositoryStoreFix(
                context.homeDirectory,
                entry.path,
                entry.key,
                store.role,
                Boolean(entry.stores?.[store.role])
              )
            }
          : { repository: entry.path, role: store.role, state: 'absent' in store ? 'absent' : 'available' }
      )
  }
  return stores
}

const doctorPort = (context: KiContext, configuration: ManageConfiguration): ManageDoctorPort => ({
  inspectConfiguration: async () => configuration,
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
      supports: (runtimes) => compatibleWithSkill(agent, runtimes)
    })),
  discoverBackpacks: () => discoverInstalledBackpacks(context.paths.data),
  localDevelopmentEnabled: (identifier, source) => backpackDevelopmentEnabled(context.paths.data, identifier, source),
  inspectLocalBackpack: (source, identifier) => localBackpack(source, identifier),
  readRepositorySkills: async (path) => (await readRepositoryDeclaration(path)).skills,
  lstat: (path) => lstat(path).catch(() => undefined),
  realpath: (path) => realpath(path).catch(() => undefined),
  inspectStores: () => registeredStores(context)
})

const report = (context: KiContext, configuration: string, checks: readonly ManageDoctorCheck[]): void => {
  const totals = {
    pass: checks.filter((check) => check.status === 'pass').length,
    warn: checks.filter((check) => check.status === 'warn').length,
    fail: checks.filter((check) => check.status === 'fail').length,
    skip: checks.filter((check) => check.status === 'skip').length
  }
  context.stdout.write(
    `${renderTree({
      title: 'KI DOCTOR',
      entries: [
        ...diagnosticContext(context, configuration),
        {
          label:
            'Scope: read-only local configuration, agents, backpacks, skills, and direct-CWD state; freshness not checked'
        },
        {
          label: `checks (${checks.length})`,
          children: checks.map((check) => ({ label: `${mark(check.status)} ${check.label}: ${check.detail}` }))
        },
        { label: `Verdict: ${totals.fail ? 'unhealthy' : 'healthy'}` },
        { label: `Checks: pass=${totals.pass} warn=${totals.warn} fail=${totals.fail} skipped=${totals.skip}` }
      ]
    }).join('\n')}\n`
  )
  if (checks.some((check) => check.status === 'fail')) throw new KiExit(1)
}

export const createDoctorCommand = (context: KiContext): Command =>
  new Command('doctor')
    .description('report diagnostic context and read-only KI health checks, verdict, and counts')
    .action(async () => {
      const configuration = await manageConfiguration(context)
      const checks = await inspectManageDoctor(doctorPort(context, configuration), {
        workingDirectory: context.workingDirectory,
        canonicalBackpackIdentifier
      })
      report(context, configuration.state, checks)
    })
