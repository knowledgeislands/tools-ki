import {
  configureBootstrapAgents,
  inspectUserConfiguration,
  installBootstrapSkills,
  installedBootstrapSkillSources,
  installedHarnessSkillSources,
  localBootstrapHarness,
  localSourcesPath,
  migrateLegacyRepositoryRegistry,
  migrateLocalSources,
  refreshUserConfiguration,
  requireLocalSources,
  setConfiguredUserSkills
} from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
import { type BootstrapOperationPort, canonicalHarnessIdentifier } from '../../core/harness/index.ts'
import { harnessDevelopmentBinding, restoreCanonicalHarness } from '../../core/storage/index.ts'

type BootstrapAgent = Awaited<ReturnType<typeof configureBootstrapAgents>>['agents'][number]
type BootstrapSkill = Awaited<ReturnType<typeof installedBootstrapSkillSources>>[number]
type BootstrapProjection = Awaited<ReturnType<typeof installBootstrapSkills>>[number]

export const bootstrapPort = (
  context: KiContext
): BootstrapOperationPort<BootstrapAgent, BootstrapSkill, BootstrapProjection> => {
  return {
    canonicalHarnessIdentifier,
    inspectConfiguration: async () => ({
      ...(await inspectUserConfiguration(context.paths.config)),
      locals: await requireLocalSources(context.paths.config, context.paths.state)
    }),
    developmentBinding: (local) =>
      harnessDevelopmentBinding(context.paths.data, canonicalHarnessIdentifier, local?.path),
    inspectLocalHarness: (local) => localBootstrapHarness(local.path),
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
    installedSkills: () => installedBootstrapSkillSources(context.paths.data, canonicalHarnessIdentifier),
    // Only a lost binding reads the full inventory, after restoring the pinned canonical archive that no sandbox can verify.
    /* v8 ignore next */
    installedHarnessSkills: () => installedHarnessSkillSources(context.paths.data, canonicalHarnessIdentifier),
    refreshConfiguration: (agents, options) =>
      refreshUserConfiguration(context.paths.config, context.paths.data, agents, options),
    setConfiguredSkills: (skills) => setConfiguredUserSkills(context.paths.config, context.homeDirectory, skills),
    installSkills: (skills, agents, options) => installBootstrapSkills(skills, agents, options),
    restoreCanonicalHarness: () =>
      restoreCanonicalHarness(
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
