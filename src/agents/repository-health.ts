import { lstat, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type ResolvedSkill,
  readRepositoryDeclaration,
  resolveRepositoryDeclaredSkills
} from '../core/configuration/index.ts'
import { discoverInstalledHarnesses } from '../core/harness/index.ts'
import { configuredAgents } from './configuration.ts'
import type { InstalledAgent } from './internal.ts'
import { compatibleWithSkill, repositorySupportedRuntimes, runtimeForAgent } from './runtimes.ts'
import { agentSkillDirectory } from './shared/index.ts'

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
  readonly declaration: string
  readonly health: Health
  readonly diagnostic?: string
  readonly localProviders: readonly ResolvedSkill[]
  readonly projections: readonly RepositoryProjection[]
}

export interface RepositoryLocation {
  readonly root: string
  readonly declaration: string
}

export interface RepositoryHealthOptions {
  readonly configurationDirectory: string
  readonly dataDirectory: string
  readonly homeDirectory: string
}

const inspectProjection = async (
  agent: InstalledAgent,
  root: string,
  skill: ResolvedSkill
): Promise<RepositoryProjection> => {
  const expected = await realpath(join(skill.provider.root, skill.capability.source))
  const path = join(agentSkillDirectory(agent, 'repo', root), skill.declaration.name)
  const state = await lstat(path).catch(() => undefined)
  if (!state) return { agent, skill, expected, state: 'missing', path }
  if (!state.isSymbolicLink()) return { agent, skill, expected, state: 'foreign', path }
  const actual = await realpath(path).catch(() => undefined)
  if (!actual) return { agent, skill, expected, state: 'dangling', path }
  return { agent, skill, expected, state: actual === expected ? 'linked' : 'stale', path }
}

const failure = (root: string, declaration: string, detail: string): RepositoryHealth => ({
  root,
  declaration,
  health: 'unrepairable',
  diagnostic: detail,
  localProviders: [],
  projections: []
})

/** Inspect one resolved physical declaration and every compatible repository projection. */
export const inspectRepositoryHealth = async (
  options: RepositoryHealthOptions,
  location: RepositoryLocation
): Promise<RepositoryHealth> => {
  try {
    const declarations = await readRepositoryDeclaration(location.declaration)
    const [harnesses, agents, runtimes] = await Promise.all([
      discoverInstalledHarnesses(options.dataDirectory),
      configuredAgents({
        homeDirectory: options.homeDirectory,
        configurationDirectory: options.configurationDirectory
      }),
      repositorySupportedRuntimes(location.declaration)
    ])
    const skills = await resolveRepositoryDeclaredSkills(location.root, declarations, harnesses)
    const localProviders = skills.filter((skill) => skill.provider.kind === 'repository-local')
    const projections = (
      await Promise.all(
        skills
          .filter((skill) => skill.provider.kind === 'installed-harness')
          .flatMap((skill) =>
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
      declaration: location.declaration,
      health,
      localProviders,
      projections
    }
  } catch (error) {
    return failure(location.root, location.declaration, (error as Error).message)
  }
}
