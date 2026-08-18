import { KiError } from '../../errors.ts'
import type {
  DevelopmentSourceResult,
  DisableDevelopmentPort,
  DisabledDevelopmentResult,
  EnableDevelopmentPort,
  EnabledDevelopmentResult,
  SetDevelopmentSourcePort
} from './types.ts'

export const setDevelopmentSource = async <Agent, Skill>(
  port: SetDevelopmentSourcePort<Agent, Skill>,
  identifier: string,
  path: string
): Promise<DevelopmentSourceResult> => {
  if (await port.developmentEnabled()) {
    throw new KiError('local development is active; run ki dev local off before setting a new source', 1)
  }
  const installed = await port.requireInstalledHarness(identifier)
  const local = await port.inspectLocalHarness(path, identifier)
  if (local.prefix !== installed.prefix)
    throw new KiError(
      `local harness ${identifier} declares prefix ${local.prefix}; installed harness declares ${installed.prefix}`,
      1
    )
  const agents = await port.configuredAgents()
  await port.setLocalHarness({ harness: identifier, path: local.harness })
  return { identifier, harness: local.harness, agents: agents.length }
}

const selectedSkills = <Skill extends { readonly name: string }>(
  skills: readonly Skill[],
  configured: readonly string[],
  identifier: string
): readonly Skill[] => {
  const active = new Set(
    configured.filter((skill) => skill.startsWith(`${identifier}:`)).map((skill) => skill.slice(identifier.length + 1))
  )
  return skills.filter((skill) => active.has(skill.name))
}

export const enableDevelopment = async <Agent, Skill extends { readonly name: string }, Projection>(
  port: EnableDevelopmentPort<Agent, Skill, Projection>
): Promise<EnabledDevelopmentResult> => {
  const configuration = await port.inspectConfiguration()
  if (!configuration.local) {
    throw new KiError('no local development source is configured; run ki dev local set <harness-id> <path>', 1)
  }
  const local = await port.inspectLocalHarness(configuration.local.path, configuration.local.harness)
  const agents = await port.configuredAgents()
  const harness = await port.enableDevelopment(configuration.local.harness, local.harness)
  const projections = await port.installSkills(
    selectedSkills(local.skills, configuration.skills, configuration.local.harness),
    agents
  )
  const refreshed = await port.refreshConfiguration(agents, configuration.local)
  return {
    identifier: configuration.local.harness,
    harness,
    agents: agents.length,
    ...refreshed,
    projections: projections.map(port.projectionView)
  }
}

export const disableDevelopment = async <Agent, Skill extends { readonly name: string }, Projection>(
  port: DisableDevelopmentPort<Agent, Skill, Projection>
): Promise<DisabledDevelopmentResult> => {
  const agents = await port.configuredAgents()
  const configuration = await port.inspectConfiguration()
  if (!configuration.local) {
    throw new KiError('no local development source is configured; run ki dev local set <harness-id> <path>', 1)
  }
  const installation = await port.restoreHarness(configuration.local.harness)
  const skills = selectedSkills(
    await port.installedSkills(configuration.local.harness),
    configuration.skills,
    configuration.local.harness
  )
  const projections = await port.installSkills(skills, agents)
  const refreshed = await port.refreshConfiguration(agents, configuration.local)
  return {
    identifier: configuration.local.harness,
    agents: agents.length,
    ...installation,
    ...refreshed,
    projections: projections.map(port.projectionView)
  }
}
