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
  path: string
): Promise<DevelopmentSourceResult> => {
  if (await port.developmentEnabled()) {
    throw new KiError('local development is active; run ki dev local off before setting a new source', 1)
  }
  const local = await port.inspectLocalHarness(path)
  const agents = await port.configuredAgents()
  await port.setLocalHarness(local.harness)
  return { harness: local.harness, agents: agents.length }
}

export const enableDevelopment = async <Agent, Skill, Projection>(
  port: EnableDevelopmentPort<Agent, Skill, Projection>
): Promise<EnabledDevelopmentResult> => {
  const configuration = await port.inspectConfiguration()
  if (!configuration.local) {
    throw new KiError('no local development source is configured; run ki dev local set <path>', 1)
  }
  const local = await port.inspectLocalHarness(configuration.local)
  const agents = await port.configuredAgents()
  const harness = await port.enableDevelopment(local.harness)
  const projections = await port.installSkills(local.skills, agents)
  const refreshed = await port.refreshConfiguration(agents, harness)
  return {
    harness,
    agents: agents.length,
    ...refreshed,
    projections: projections.map(port.projectionView)
  }
}

export const disableDevelopment = async <Agent, Skill, Projection>(
  port: DisableDevelopmentPort<Agent, Skill, Projection>
): Promise<DisabledDevelopmentResult> => {
  const agents = await port.configuredAgents()
  const configuration = await port.inspectConfiguration()
  const installation = await port.restoreCanonicalHarness()
  const skills = await port.installedSkills()
  const projections = await port.installSkills(skills, agents)
  const refreshed = await port.refreshConfiguration(agents, configuration.local ?? undefined)
  return {
    agents: agents.length,
    ...installation,
    ...refreshed,
    projections: projections.map(port.projectionView)
  }
}
