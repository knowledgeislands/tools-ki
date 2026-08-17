import { lstat, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { agentSkillDirectory, compatibleWithSkill, configuredAgents } from '../../agents/index.ts'
import type { InstalledAgent } from '../../agents/internal.ts'
import { repositorySupportedRuntimes, runtimeForAgent } from '../../agents/runtimes.ts'
import type { KiContext } from '../../context.ts'
import { type ResolvedSkill, readRepositoryDeclaration, resolveDeclaredSkills } from '../../core/configuration/index.ts'
import { discoverInstalledHarnesses } from '../../core/harness/index.ts'
import { presentation } from '../presentation/index.ts'

type Health = 'healthy' | 'repairable' | 'unrepairable'

export interface RepositoryProjection {
  readonly agent: InstalledAgent
  readonly skill: ResolvedSkill
  readonly expected: string
  readonly state: 'linked' | 'missing' | 'dangling' | 'stale' | 'foreign'
  readonly path: string
}

export interface RepositoryHealth {
  readonly root: string
  readonly configuration: string
  readonly health: Health
  readonly diagnostic?: string
  readonly projections: readonly RepositoryProjection[]
}

interface RepositoryLocation {
  readonly root: string
  readonly configuration: string
}

const stateDescription: Record<RepositoryProjection['state'], string> = {
  linked: 'linked',
  missing: 'projection is missing',
  dangling: 'projection is dangling',
  stale: 'projection target is stale',
  foreign: 'projection is not a KI-managed link'
}

export const describeRepositoryProjection = (projection: RepositoryProjection): string =>
  `${presentation(projection.state === 'linked' ? 'status.pass' : 'status.fail').terminal} ${projection.agent.descriptor.id} ${projection.skill.declaration.name}: ${stateDescription[projection.state]}`

const inspectProjection = async (
  agent: InstalledAgent,
  root: string,
  skill: ResolvedSkill
): Promise<RepositoryProjection> => {
  const expected = await realpath(join(skill.harness.root, skill.capability.source))
  const path = join(agentSkillDirectory(agent, 'repo', root), skill.declaration.name)
  const state = await lstat(path).catch(() => undefined)
  if (!state) return { agent, skill, expected, state: 'missing', path }
  if (!state.isSymbolicLink()) return { agent, skill, expected, state: 'foreign', path }
  const actual = await realpath(path).catch(() => undefined)
  if (!actual) return { agent, skill, expected, state: 'dangling', path }
  return { agent, skill, expected, state: actual === expected ? 'linked' : 'stale', path }
}

const failure = (root: string, configuration: string, detail: string): RepositoryHealth => ({
  root,
  configuration,
  health: 'unrepairable',
  diagnostic: detail,
  projections: []
})

/** Inspect one resolved physical declaration and every compatible repository projection. */
export const inspectRepositoryHealth = async (
  context: KiContext,
  location: RepositoryLocation
): Promise<RepositoryHealth> => {
  try {
    const declarations = await readRepositoryDeclaration(location.configuration)
    const [harnesses, agents, runtimes] = await Promise.all([
      discoverInstalledHarnesses(context.paths.data),
      configuredAgents({ homeDirectory: context.homeDirectory, configurationDirectory: context.paths.config }),
      repositorySupportedRuntimes(location.configuration)
    ])
    const skills = resolveDeclaredSkills(declarations, harnesses)
    const projections = (
      await Promise.all(
        skills.flatMap((skill) =>
          agents
            .filter(
              (agent) =>
                runtimes.includes(runtimeForAgent(agent)) &&
                compatibleWithSkill(agent, skill.capability.supportedRuntimes)
            )
            .map((agent) => inspectProjection(agent, location.root, skill))
        )
      )
    ).sort((left, right) => left.path.localeCompare(right.path))
    const broken = projections.filter((projection) => projection.state !== 'linked')
    const health: Health = broken.some((projection) => projection.state === 'foreign')
      ? 'unrepairable'
      : broken.length
        ? 'repairable'
        : 'healthy'
    return {
      root: location.root,
      configuration: location.configuration,
      health,
      projections
    }
  } catch (error) {
    return failure(location.root, location.configuration, (error as Error).message)
  }
}
