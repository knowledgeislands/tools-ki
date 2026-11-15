import { lstat, readdir, readlink, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { discoverInstalledBackpacks } from '../core/backpack/index.ts'
import {
  type DeclaredSkill,
  type ResolvedSkill,
  readRepositoryDeclaration,
  resolveRepositoryDeclaredSkills
} from '../core/configuration/index.ts'
import { VENDORED_SKILL_ROOT } from '../core/repository/vendored-skills.ts'
import { configuredAgents } from './configuration.ts'
import type { InstalledAgent } from './internal.ts'
import { compatibleWithSkill, repositorySupportedRuntimes, runtimeForAgent } from './runtimes.ts'
import { agentSkillDirectory } from './shared/index.ts'
import { currentLinkText } from './skills.ts'

type Health = 'healthy' | 'repairable' | 'unrepairable'

export interface RepositoryProjection {
  readonly agent: InstalledAgent
  readonly skill: ResolvedSkill
  readonly expected: string
  readonly state: 'linked' | 'missing' | 'dangling' | 'stale' | 'foreign'
  readonly path: string
}

/** A dangling `ki-` link in a projection directory that no declared skill accounts for. */
export interface RepositoryOrphan {
  readonly agent: InstalledAgent
  readonly name: string
  readonly path: string
}

export interface RepositoryHealth {
  readonly root: string
  readonly declaration: string
  readonly health: Health
  readonly diagnostic?: string
  readonly localProviders: readonly ResolvedSkill[]
  /** Skills declared `mode = "vendored"`: committed copies that ki neither links nor repairs. */
  readonly vendored: readonly (DeclaredSkill & { readonly present: boolean })[]
  readonly projections: readonly RepositoryProjection[]
  readonly orphans: readonly RepositoryOrphan[]
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
  // A link still spelt through the retired harness layout resolves, but is stale until re-pointed.
  const current = actual === expected && currentLinkText(await readlink(path), expected)
  return { agent, skill, expected, state: current ? 'linked' : 'stale', path }
}

// A retired or renamed skill leaves its old link behind, outside every declared
// projection. Only dangling `ki-` links are KI's to report: other tools may own the
// remaining entries, and a resolving link may be a deliberate local addition.
const inspectOrphans = async (
  agents: readonly InstalledAgent[],
  root: string,
  declared: ReadonlySet<string>
): Promise<RepositoryOrphan[]> => {
  const orphans: RepositoryOrphan[] = []
  // Agents sharing one projection directory report it once, under the first of them.
  const directories = new Map([...agents].reverse().map((agent) => [agentSkillDirectory(agent, 'repo', root), agent]))
  for (const [directory, agent] of directories) {
    if (!(await lstat(directory).catch(() => undefined))?.isDirectory()) continue
    for (const name of (await readdir(directory)).sort()) {
      if (!name.startsWith('ki-') || declared.has(name)) continue
      const path = join(directory, name)
      if (!(await lstat(path)).isSymbolicLink()) continue
      if (!(await realpath(path).catch(() => undefined))) orphans.push({ agent, name, path })
    }
  }
  return orphans
}

const failure = (root: string, declaration: string, detail: string): RepositoryHealth => ({
  root,
  declaration,
  health: 'unrepairable',
  diagnostic: detail,
  localProviders: [],
  vendored: [],
  projections: [],
  orphans: []
})

/** Inspect one resolved physical declaration and every compatible repository projection. */
export const inspectRepositoryHealth = async (
  options: RepositoryHealthOptions,
  location: RepositoryLocation
): Promise<RepositoryHealth> => {
  try {
    const declarations = await readRepositoryDeclaration(location.declaration)
    const [backpacks, agents, runtimes] = await Promise.all([
      discoverInstalledBackpacks(options.dataDirectory),
      configuredAgents({
        homeDirectory: options.homeDirectory,
        configurationDirectory: options.configurationDirectory
      }),
      repositorySupportedRuntimes(location.declaration)
    ])
    const skills = await resolveRepositoryDeclaredSkills(location.root, declarations, backpacks, options.dataDirectory)
    const localProviders = skills.filter((skill) => skill.provider.kind === 'repository-local')
    const repositoryAgents = agents.filter((agent) => runtimes.includes(runtimeForAgent(agent)))
    const projections = (
      await Promise.all(
        skills
          .filter((skill) => skill.provider.kind === 'installed-backpack')
          .flatMap((skill) =>
            repositoryAgents
              .filter((agent) => compatibleWithSkill(agent, skill.capability.supportedRuntimes))
              .map((agent) => inspectProjection(agent, location.root, skill))
          )
      )
    ).sort((left, right) => left.path.localeCompare(right.path))
    // A vendored skill's committed links are the repository's, never an orphan to remove.
    const orphans = await inspectOrphans(
      repositoryAgents,
      location.root,
      new Set(declarations.skills.map((skill) => skill.name))
    )
    const broken = projections.filter((projection) => projection.state !== 'linked')
    const health: Health = broken.some((projection) => projection.state === 'foreign')
      ? 'unrepairable'
      : broken.length || orphans.length
        ? 'repairable'
        : 'healthy'
    return {
      root: location.root,
      declaration: location.declaration,
      health,
      localProviders,
      vendored: await Promise.all(
        declarations.skills
          .filter((skill) => skill.mode === 'vendored')
          .map(async (skill) => ({
            ...skill,
            present: Boolean(
              (
                await lstat(join(location.root, VENDORED_SKILL_ROOT, skill.name, 'SKILL.md')).catch(() => undefined)
              )?.isFile()
            )
          }))
      ),
      projections,
      orphans
    }
  } catch (error) {
    return failure(location.root, location.declaration, (error as Error).message)
  }
}
