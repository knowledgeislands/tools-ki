import {
  configuredAgents,
  inspectUserConfiguration,
  installBootstrapSkills,
  installedBootstrapSkillSources,
  localBootstrapHarness,
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
  canonicalHarnessDevelopmentEnabled,
  enableCanonicalHarnessDevelopment,
  restoreCanonicalHarness
} from '../../core/storage/index.ts'

type DevelopmentAgent = Awaited<ReturnType<typeof configuredAgents>>[number]
type DevelopmentSkill = Awaited<ReturnType<typeof installedBootstrapSkillSources>>[number]
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
  developmentEnabled: () => canonicalHarnessDevelopmentEnabled(context.paths.data),
  inspectLocalHarness: localBootstrapHarness,
  configuredAgents: () => agents(context),
  setLocalHarness: (harness) => setLocalBootstrapHarness(context.paths.config, context.homeDirectory, harness)
})

export const enableDevelopmentPort = (
  context: KiContext
): EnableDevelopmentPort<DevelopmentAgent, DevelopmentSkill, DevelopmentProjection> => ({
  inspectConfiguration: () => inspectUserConfiguration(context.paths.config),
  inspectLocalHarness: localBootstrapHarness,
  configuredAgents: () => agents(context),
  enableDevelopment: (harness) => enableCanonicalHarnessDevelopment(context.paths.data, harness),
  installSkills: (skills, configured) => installBootstrapSkills(skills, configured, { replace: true }),
  refreshConfiguration: (configured, local) =>
    refreshUserConfiguration(context.paths.config, context.paths.data, configured, local),
  projectionView
})

export const disableDevelopmentPort = (
  context: KiContext
): DisableDevelopmentPort<DevelopmentAgent, DevelopmentSkill, DevelopmentProjection> => ({
  configuredAgents: () => agents(context),
  inspectConfiguration: () => inspectUserConfiguration(context.paths.config),
  restoreCanonicalHarness: () =>
    restoreCanonicalHarness(
      context.paths.config,
      context.paths.data,
      context.paths.state,
      context.fetcher,
      context.runner,
      context.environment
    ),
  installedSkills: () => installedBootstrapSkillSources(context.paths.data),
  installSkills: (skills, configured) => installBootstrapSkills(skills, configured, { replace: true }),
  refreshConfiguration: (configured, local) =>
    refreshUserConfiguration(context.paths.config, context.paths.data, configured, local),
  projectionView
})

export const developmentRubricPort = (context: KiContext): DevelopmentRubricPort => ({
  resolveSkill: async (skill) => resolveInstalledSkill(await discoverInstalledHarnesses(context.paths.data), skill),
  preparePublication: async (skill) =>
    prepareRubricPublication(skill, await loadRubricDefinition(skill), undefined, context.lstat),
  lstat: context.lstat,
  publish: async (root, write) => publishWrites(await prepareWrites(root, [write]), false)
})
