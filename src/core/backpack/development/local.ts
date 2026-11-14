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
  if (await port.developmentEnabled(identifier)) {
    throw new KiError(`local development is active for ${identifier}; run ki dev local off ${identifier} first`, 1)
  }
  const installed = await port.requireInstalledBackpack(identifier)
  const local = await port.inspectLocalBackpack(path, identifier)
  if (installed.prefix && local.prefix !== installed.prefix)
    throw new KiError(
      `local backpack ${identifier} declares prefix ${local.prefix}; installed backpack declares ${installed.prefix}`,
      1
    )
  const agents = await port.configuredAgents()
  await port.setLocalBackpack({ backpack: identifier, path: local.backpack })
  return { identifier, backpack: local.backpack, agents: agents.length }
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

const mergedConfiguredSkills = (before: readonly string[], after: readonly string[]): readonly string[] => [
  ...new Set([...before, ...after])
]

export const enableDevelopment = async <Agent, Skill extends { readonly name: string }, Projection>(
  port: EnableDevelopmentPort<Agent, Skill, Projection>,
  identifier: string
): Promise<EnabledDevelopmentResult> => {
  const configuration = await port.inspectConfiguration()
  const source = configuration.locals.find((local) => local.backpack === identifier)
  if (!source) {
    throw new KiError(`no local development source is configured for ${identifier}; run ki dev local set first`, 1)
  }
  const local = await port.inspectLocalBackpack(source.path, source.backpack)
  const agents = await port.configuredAgents()
  const backpack = await port.enableDevelopment(source.backpack, local.backpack)
  await port.refreshConfiguration(agents)
  const activeConfiguration = await port.inspectConfiguration()
  const projections = await port.installSkills(
    selectedSkills(
      local.skills,
      mergedConfiguredSkills(configuration.skills, activeConfiguration.skills),
      source.backpack
    ),
    agents
  )
  const refreshed = await port.refreshConfiguration(agents)
  return {
    identifier: source.backpack,
    backpack,
    agents: agents.length,
    ...refreshed,
    projections: projections.map(port.projectionView)
  }
}

export const disableDevelopment = async <Agent, Skill extends { readonly name: string }, Projection>(
  port: DisableDevelopmentPort<Agent, Skill, Projection>,
  identifier: string
): Promise<DisabledDevelopmentResult> => {
  const agents = await port.configuredAgents()
  const configuration = await port.inspectConfiguration()
  const source = configuration.locals.find((local) => local.backpack === identifier)
  if (!source) {
    throw new KiError(`no local development source is configured for ${identifier}; run ki dev local set first`, 1)
  }
  const installation = await port.restoreBackpack(source.backpack)
  await port.refreshConfiguration(agents)
  const activeConfiguration = await port.inspectConfiguration()
  const skills = selectedSkills(
    await port.installedSkills(source.backpack),
    mergedConfiguredSkills(configuration.skills, activeConfiguration.skills),
    source.backpack
  )
  const projections = await port.installSkills(skills, agents)
  const refreshed = await port.refreshConfiguration(agents)
  return {
    identifier: source.backpack,
    agents: agents.length,
    ...installation,
    ...refreshed,
    projections: projections.map(port.projectionView)
  }
}
