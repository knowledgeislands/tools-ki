import {
  configuredAgents,
  inspectUserConfiguration,
  installBootstrapSkills,
  installedHarnessSkillSources,
  localHarness,
  refreshUserConfiguration,
  rememberedCheckout,
  requireLocalSources,
  setLocalBootstrapHarness
} from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
import { resolveInstalledSkill } from '../../core/configuration/index.ts'
import { prepareWrites, publishWrites } from '../../core/filesystem/index.ts'
import {
  type DevelopmentGenerationPort,
  type DevelopmentRubricPort,
  type DisableDevelopmentPort,
  discoverInstalledHarnesses,
  type EnableDevelopmentPort,
  prepareSkillGeneration,
  type SetDevelopmentSourcePort
} from '../../core/harness/index.ts'
import { loadRubricDefinition } from '../../core/rubric/loader.ts'
import { prepareRubricPublication } from '../../core/rubric/publication.ts'
import { gitPrimaryWorkingTreeRoot, gitWorkingTreeRoot } from '../../core/runtime/git.ts'
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
  developmentEnabled: (identifier) => harnessDevelopmentEnabled(context.paths.data, identifier),
  requireInstalledHarness: (identifier) => installedHarnessSlot(context.paths.data, identifier),
  inspectLocalHarness: localHarness,
  configuredAgents: () => agents(context),
  setLocalHarness: (harness) =>
    setLocalBootstrapHarness(context.paths.config, context.paths.state, context.homeDirectory, harness)
})

export const enableDevelopmentPort = (
  context: KiContext
): EnableDevelopmentPort<DevelopmentAgent, DevelopmentSkill, DevelopmentProjection> => ({
  inspectConfiguration: () => developmentConfiguration(context),
  inspectLocalHarness: async (path, identifier) =>
    localHarness(await rememberedCheckout({ harness: identifier, path }), identifier),
  configuredAgents: () => agents(context),
  enableDevelopment: (identifier, harness) => enableHarnessDevelopment(context.paths.data, identifier, harness),
  installSkills: (skills, configured) => installBootstrapSkills(skills, configured, { replace: true }),
  refreshConfiguration: (configured) => refreshUserConfiguration(context.paths.config, context.paths.data, configured),
  projectionView
})

export const disableDevelopmentPort = (
  context: KiContext
): DisableDevelopmentPort<DevelopmentAgent, DevelopmentSkill, DevelopmentProjection> => ({
  configuredAgents: () => agents(context),
  inspectConfiguration: () => developmentConfiguration(context),
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
  refreshConfiguration: (configured) => refreshUserConfiguration(context.paths.config, context.paths.data, configured),
  projectionView
})

export const developmentSkillRubricPort = (context: KiContext): DevelopmentRubricPort => ({
  resolveSkill: async (skill) => resolveInstalledSkill(await discoverInstalledHarnesses(context.paths.data), skill),
  preparePublication: async (skill) =>
    prepareRubricPublication(skill, await loadRubricDefinition(skill), undefined, context.lstat),
  developmentLinked: (identifier) => isHarnessDevelopmentLinked(context.paths.data, identifier),
  repositoryRoot: (path) => gitWorkingTreeRoot(path, context.runner, context.environment),
  publish: async (root, write) => publishWrites(await prepareWrites(root, [write]), false)
})

export const developmentSkillGenerationPort = (context: KiContext): DevelopmentGenerationPort => ({
  resolveSkill: async (skill) => {
    const resolved = resolveInstalledSkill(await discoverInstalledHarnesses(context.paths.data), skill)
    if (
      context.workingDirectory === resolved.provider.root ||
      !(await isHarnessDevelopmentLinked(context.paths.data, resolved.identity.split(':')[0] as string))
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
  developmentLinked: (identifier) => isHarnessDevelopmentLinked(context.paths.data, identifier),
  repositoryRoot: (path) => gitWorkingTreeRoot(path, context.runner, context.environment),
  publish: async (root, writes) => publishWrites(await prepareWrites(root, writes), false)
})
