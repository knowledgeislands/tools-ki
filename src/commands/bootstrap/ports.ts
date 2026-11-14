import {
  configureBootstrapAgents,
  inspectUserConfiguration,
  installBootstrapSkills,
  installedBackpackSkillSources,
  installedBootstrapSkillSources,
  localBootstrapBackpack,
  localSourcesPath,
  migrateLegacyRepositoryRegistry,
  migrateLocalSources,
  refreshUserConfiguration,
  requireLocalSources,
  setConfiguredUserSkills
} from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
import { type BootstrapOperationPort, canonicalBackpackIdentifier } from '../../core/backpack/index.ts'
import { backpackDevelopmentBinding, restoreCanonicalBackpack } from '../../core/storage/index.ts'

type BootstrapAgent = Awaited<ReturnType<typeof configureBootstrapAgents>>['agents'][number]
type BootstrapSkill = Awaited<ReturnType<typeof installedBootstrapSkillSources>>[number]
type BootstrapProjection = Awaited<ReturnType<typeof installBootstrapSkills>>[number]

export const bootstrapPort = (
  context: KiContext
): BootstrapOperationPort<BootstrapAgent, BootstrapSkill, BootstrapProjection> => {
  return {
    canonicalBackpackIdentifier,
    inspectConfiguration: async () => ({
      ...(await inspectUserConfiguration(context.paths.config)),
      locals: await requireLocalSources(context.paths.config, context.paths.state)
    }),
    developmentBinding: (local) =>
      backpackDevelopmentBinding(context.paths.data, canonicalBackpackIdentifier, local?.path),
    inspectLocalBackpack: (local) => localBootstrapBackpack(local.path),
    migrateLegacyRepositories: () =>
      migrateLegacyRepositoryRegistry(context.paths.config, context.paths.state, context.runner, context.environment),
    migrateLocalSources: () => migrateLocalSources(context.paths.config, context.paths.state),
    localSourcesPath: localSourcesPath(context.paths.state),
    configureAgents: (options) =>
      configureBootstrapAgents({
        homeDirectory: context.homeDirectory,
        configurationDirectory: context.paths.config,
        ...options
      }),
    installedSkills: () => installedBootstrapSkillSources(context.paths.data, canonicalBackpackIdentifier),
    // Only a lost binding reads the full inventory, after restoring the pinned canonical archive that no sandbox can verify.
    /* v8 ignore next */
    installedBackpackSkills: () => installedBackpackSkillSources(context.paths.data, canonicalBackpackIdentifier),
    refreshConfiguration: (agents, options) =>
      refreshUserConfiguration(context.paths.config, context.paths.data, agents, options),
    setConfiguredSkills: (skills) => setConfiguredUserSkills(context.paths.config, context.homeDirectory, skills),
    installSkills: (skills, agents, options) => installBootstrapSkills(skills, agents, options),
    restoreCanonicalBackpack: () =>
      restoreCanonicalBackpack(
        context.paths.config,
        context.paths.data,
        context.paths.state,
        context.fetcher,
        context.runner,
        context.environment
      ),
    agentId: (agent) => agent.descriptor.id,
    skillName: (skill) => skill.name,
    projectionView: ({ agent, skill, installed }) => ({ agentId: agent.descriptor.id, skill, installed })
  }
}
