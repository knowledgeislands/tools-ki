import {
  configuredAgents,
  inspectUserConfiguration,
  installBootstrapSkills,
  installedHarnessSkillSources,
  localHarness,
  refreshUserConfiguration,
  setLocalBootstrapHarness
} from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
import { resolveInstalledSkill } from '../../core/configuration/index.ts'
import { prepareWrites, publishWrites } from '../../core/filesystem/index.ts'
import {
  type DevelopmentRubricPort,
  type DisableDevelopmentPort,
  discoverInstalledHarnesses,
  type EnableDevelopmentPort,
  type SetDevelopmentSourcePort
} from '../../core/harness/index.ts'
import { loadRubricDefinition } from '../../core/rubric/loader.ts'
import { prepareRubricPublication } from '../../core/rubric/publication.ts'
import {
  enableHarnessDevelopment,
  harnessDevelopmentEnabled,
  installedHarnessSlot,
  isHarnessDevelopmentLinked,
  restoreHarness
} from '../../core/storage/index.ts'

type DevelopmentAgent = Awaited<ReturnType<typeof configuredAgents>>[number]
type DevelopmentSkill = Awaited<ReturnType<typeof installedHarnessSkillSources>>[number]
type DevelopmentProjection = Awaited<ReturnType<typeof installBootstrapSkills>>[number]

const agents = (context: KiContext): Promise<readonly DevelopmentAgent[]> =>
  configuredAgents({ homeDirectory: context.homeDirectory, configurationDirectory: context.paths.config })

const projectionView = ({ agent, skill, installed }: DevelopmentProjection) => ({
  agentId: agent.descriptor.id,
  skill,
  installed
})

export const setDevelopmentSourcePort = (
  context: KiContext
): SetDevelopmentSourcePort<DevelopmentAgent, DevelopmentSkill> => ({
  developmentEnabled: (identifier) => harnessDevelopmentEnabled(context.paths.data, identifier),
  requireInstalledHarness: (identifier) => installedHarnessSlot(context.paths.data, identifier),
  inspectLocalHarness: localHarness,
  configuredAgents: () => agents(context),
  setLocalHarness: (harness) => setLocalBootstrapHarness(context.paths.config, context.homeDirectory, harness)
})

export const enableDevelopmentPort = (
  context: KiContext
): EnableDevelopmentPort<DevelopmentAgent, DevelopmentSkill, DevelopmentProjection> => ({
  inspectConfiguration: () => inspectUserConfiguration(context.paths.config),
  inspectLocalHarness: localHarness,
  configuredAgents: () => agents(context),
  enableDevelopment: (identifier, harness) => enableHarnessDevelopment(context.paths.data, identifier, harness),
  installSkills: (skills, configured) => installBootstrapSkills(skills, configured, { replace: true }),
  refreshConfiguration: (configured, locals) =>
    refreshUserConfiguration(context.paths.config, context.paths.data, configured, locals),
  projectionView
})

export const disableDevelopmentPort = (
  context: KiContext
): DisableDevelopmentPort<DevelopmentAgent, DevelopmentSkill, DevelopmentProjection> => ({
  configuredAgents: () => agents(context),
  inspectConfiguration: () => inspectUserConfiguration(context.paths.config),
  restoreHarness: (identifier) =>
    restoreHarness(
      context.paths.config,
      context.paths.data,
      context.paths.state,
      identifier,
      context.fetcher,
      context.runner,
      context.environment
    ),
  installedSkills: (identifier) => installedHarnessSkillSources(context.paths.data, identifier),
  installSkills: (skills, configured) => installBootstrapSkills(skills, configured, { replace: true }),
  refreshConfiguration: (configured, locals) =>
    refreshUserConfiguration(context.paths.config, context.paths.data, configured, locals),
  projectionView
})

export const developmentRubricPort = (context: KiContext): DevelopmentRubricPort => ({
  resolveSkill: async (skill) => resolveInstalledSkill(await discoverInstalledHarnesses(context.paths.data), skill),
  preparePublication: async (skill) =>
    prepareRubricPublication(skill, await loadRubricDefinition(skill), undefined, context.lstat),
  developmentLinked: (identifier) => isHarnessDevelopmentLinked(context.paths.data, identifier),
  publish: async (root, write) => publishWrites(await prepareWrites(root, [write]), false)
})
