import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  configureBootstrapAgents,
  inspectUserConfiguration,
  installBootstrapSkills,
  installedBootstrapSkillSources,
  localBootstrapHarness,
  migrateLegacyRepositoryRegistry,
  refreshUserConfiguration,
  setConfiguredUserSkills
} from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
import { type BootstrapOperationPort, canonicalHarnessIdentifier } from '../../core/harness/index.ts'
import { harnessDevelopmentEnabled, restoreCanonicalHarness } from '../../core/storage/index.ts'

type BootstrapAgent = Awaited<ReturnType<typeof configureBootstrapAgents>>['agents'][number]
type BootstrapSkill = Awaited<ReturnType<typeof installedBootstrapSkillSources>>[number]
type BootstrapProjection = Awaited<ReturnType<typeof installBootstrapSkills>>[number]

export const bootstrapPort = (
  context: KiContext
): BootstrapOperationPort<BootstrapAgent, BootstrapSkill, BootstrapProjection> => {
  const configurationPath = join(context.paths.config, 'config.toml')
  return {
    canonicalHarnessIdentifier,
    inspectConfiguration: () => inspectUserConfiguration(context.paths.config),
    readConfiguration: () => readFile(configurationPath, 'utf8'),
    restoreConfiguration: (contents) => writeFile(configurationPath, contents, 'utf8'),
    developmentEnabled: (local) => harnessDevelopmentEnabled(context.paths.data, local.harness, local.path),
    inspectLocalHarness: (local) => localBootstrapHarness(local.path),
    migrateLegacyRepositories: () =>
      migrateLegacyRepositoryRegistry(context.paths.config, context.paths.state, context.runner, context.environment),
    configureAgents: (options) =>
      configureBootstrapAgents({
        homeDirectory: context.homeDirectory,
        configurationDirectory: context.paths.config,
        ...options
      }),
    installedSkills: (options) =>
      installedBootstrapSkillSources(context.paths.data, canonicalHarnessIdentifier, options),
    refreshConfiguration: (agents, locals, options) =>
      refreshUserConfiguration(context.paths.config, context.paths.data, agents, locals, options),
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
