import {
  configuredAgents,
  inspectUserConfiguration,
  installBootstrapSkills,
  installedBackpackSkillSources,
  localBackpack,
  refreshUserConfiguration,
  rememberedCheckout,
  requireLocalSources,
  setLocalBootstrapBackpack
} from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
import {
  type DevelopmentGenerationPort,
  type DevelopmentRubricPort,
  type DisableDevelopmentPort,
  discoverInstalledBackpacks,
  type EnableDevelopmentPort,
  prepareSkillGeneration,
  type SetDevelopmentSourcePort
} from '../../core/backpack/index.ts'
import { resolveInstalledSkill } from '../../core/configuration/index.ts'
import { prepareWrites, publishWrites } from '../../core/filesystem/index.ts'
import { loadRubricDefinition } from '../../core/rubric/loader.ts'
import { prepareRubricPublication } from '../../core/rubric/publication.ts'
import { gitPrimaryWorkingTreeRoot, gitWorkingTreeRoot } from '../../core/runtime/git.ts'
import {
  backpackDevelopmentEnabled,
  enableBackpackDevelopment,
  installedBackpackSlot,
  isBackpackDevelopmentLinked,
  restoreBackpack
} from '../../core/storage/index.ts'

type DevelopmentAgent = Awaited<ReturnType<typeof configuredAgents>>[number]
type DevelopmentSkill = Awaited<ReturnType<typeof installedBackpackSkillSources>>[number]
type DevelopmentProjection = Awaited<ReturnType<typeof installBootstrapSkills>>[number]

const agents = (context: KiContext): Promise<readonly DevelopmentAgent[]> =>
  configuredAgents({ homeDirectory: context.homeDirectory, configurationDirectory: context.paths.config })

/** Configured skills from `config.toml` and remembered checkouts from their host-local file. */
const developmentConfiguration = async (context: KiContext) => ({
  skills: (await inspectUserConfiguration(context.paths.config)).skills,
  locals: await requireLocalSources(context.paths.config, context.paths.state)
})

const projectionView = ({ agent, skill, installed }: DevelopmentProjection) => ({
  agentId: agent.descriptor.id,
  skill,
  installed
})

export const setDevelopmentSourcePort = (
  context: KiContext
): SetDevelopmentSourcePort<DevelopmentAgent, DevelopmentSkill> => ({
  developmentEnabled: (identifier) => backpackDevelopmentEnabled(context.paths.data, identifier),
  requireInstalledBackpack: (identifier) => installedBackpackSlot(context.paths.data, identifier),
  inspectLocalBackpack: localBackpack,
  configuredAgents: () => agents(context),
  setLocalBackpack: (backpack) =>
    setLocalBootstrapBackpack(context.paths.config, context.paths.state, context.homeDirectory, backpack)
})

export const enableDevelopmentPort = (
  context: KiContext
): EnableDevelopmentPort<DevelopmentAgent, DevelopmentSkill, DevelopmentProjection> => ({
  inspectConfiguration: () => developmentConfiguration(context),
  inspectLocalBackpack: async (path, identifier) =>
    localBackpack(await rememberedCheckout({ backpack: identifier, path }), identifier),
  configuredAgents: () => agents(context),
  enableDevelopment: (identifier, backpack) => enableBackpackDevelopment(context.paths.data, identifier, backpack),
  installSkills: (skills, configured) => installBootstrapSkills(skills, configured, { replace: true }),
  refreshConfiguration: (configured) => refreshUserConfiguration(context.paths.config, context.paths.data, configured),
  projectionView
})

export const disableDevelopmentPort = (
  context: KiContext
): DisableDevelopmentPort<DevelopmentAgent, DevelopmentSkill, DevelopmentProjection> => ({
  configuredAgents: () => agents(context),
  inspectConfiguration: () => developmentConfiguration(context),
  restoreBackpack: (identifier) =>
    restoreBackpack(
      context.paths.config,
      context.paths.data,
      context.paths.state,
      identifier,
      context.fetcher,
      context.runner,
      context.environment
    ),
  installedSkills: (identifier) => installedBackpackSkillSources(context.paths.data, identifier),
  installSkills: (skills, configured) => installBootstrapSkills(skills, configured, { replace: true }),
  refreshConfiguration: (configured) => refreshUserConfiguration(context.paths.config, context.paths.data, configured),
  projectionView
})

export const developmentSkillRubricPort = (context: KiContext): DevelopmentRubricPort => ({
  resolveSkill: async (skill) => resolveInstalledSkill(await discoverInstalledBackpacks(context.paths.data), skill),
  preparePublication: async (skill) =>
    prepareRubricPublication(skill, await loadRubricDefinition(skill), undefined, context.lstat),
  developmentLinked: (identifier) => isBackpackDevelopmentLinked(context.paths.data, identifier),
  repositoryRoot: (path) => gitWorkingTreeRoot(path, context.runner, context.environment),
  publish: async (root, write) => publishWrites(await prepareWrites(root, [write]), false)
})

export const developmentSkillGenerationPort = (context: KiContext): DevelopmentGenerationPort => ({
  resolveSkill: async (skill) => {
    const resolved = resolveInstalledSkill(await discoverInstalledBackpacks(context.paths.data), skill)
    if (
      context.workingDirectory === resolved.provider.root ||
      !(await isBackpackDevelopmentLinked(context.paths.data, resolved.identity.split(':')[0] as string))
    )
      return resolved
    const caller = await gitWorkingTreeRoot(context.workingDirectory, context.runner, context.environment)
    if (caller === undefined || caller === resolved.provider.root) return resolved
    const [current, original] = await Promise.all(
      [caller, resolved.provider.root].map((root) =>
        gitPrimaryWorkingTreeRoot(root, context.runner, context.environment)
      )
    )
    return current !== undefined && current === original
      ? { ...resolved, provider: { ...resolved.provider, root: caller } }
      : resolved
  },
  prepareGeneration: prepareSkillGeneration,
  developmentLinked: (identifier) => isBackpackDevelopmentLinked(context.paths.data, identifier),
  repositoryRoot: (path) => gitWorkingTreeRoot(path, context.runner, context.environment),
  publish: async (root, writes) => publishWrites(await prepareWrites(root, writes), false)
})
