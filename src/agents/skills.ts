import { lstat, mkdir, readlink, realpath, symlink, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { declareRepositorySkill, readRepositoryDeclaration, undeclareRepositorySkill } from '../core/configuration.ts'
import { KiError } from '../core/errors.ts'
import { discoverInstalledHarnesses, type SupportedRuntime } from '../core/harness/index.ts'
import { resolveRepository } from '../core/repository/index.ts'
import { configuredAgents, inspectUserConfiguration, setConfiguredUserSkills } from './configuration.ts'
import { agentSkillDirectory } from './detection.ts'
import { type InstalledAgent, requiredPhysicalDirectory } from './internal.ts'
import { compatibleWithSkill, repositorySupportedRuntimes, runtimeForAgent } from './runtimes.ts'

// One scope at which a KI-managed skill is linked for an agent: the user's home, or a
// repository root. Carries exactly the data `agentSkillDirectory` needs to resolve the
// target directory, so user and repository linking share one code path.
type SkillScope = { readonly scope: 'user' } | { readonly scope: 'repo'; readonly repository: string }

// Link one KI-managed skill into the agent's skills directory for the given scope,
// returning whether the link changed. Guards a foreign (non-symlink) occupant, and
// re-points an existing KI-managed link only under `replace`.
export const linkManagedSkill = async (
  agent: InstalledAgent,
  scope: SkillScope,
  skill: { readonly name: string; readonly source: string },
  replace = false
): Promise<boolean> => {
  const skillsDirectory = agentSkillDirectory(agent, scope.scope, scope.scope === 'repo' ? scope.repository : undefined)
  const agentId = agent.descriptor.id
  await mkdir(skillsDirectory, { recursive: true })
  await requiredPhysicalDirectory(skillsDirectory, `${agentId} skills directory`)
  const target = join(skillsDirectory, skill.name)
  const targetState = await lstat(target).catch(() => undefined)
  if (!targetState) {
    await symlink(skill.source, target, 'dir')
    return true
  }
  if (!targetState.isSymbolicLink()) throw new KiError(`${agentId} ${skill.name} skill is not KI-managed`, 1)
  const actual = await realpath(target).catch(() => undefined)
  const expected = await realpath(skill.source)
  if (actual === expected) {
    // Development activation deliberately replaces an indirection through the
    // installed payload with a link directly to the local checkout.
    if (
      !replace ||
      (await readlink(target).catch(
        /* v8 ignore next -- After lstat and realpath succeed, only concurrent filesystem replacement can make readlink fail. */
        () => undefined
      )) === skill.source
    )
      return false
  }
  if (!replace) throw new KiError(`${agentId} ${skill.name} skill points elsewhere; pass --replace to re-point`, 1)
  await unlink(target)
  await symlink(skill.source, target, 'dir')
  return true
}

const removeManagedUserSkill = async (agent: InstalledAgent, name: string): Promise<boolean> => {
  const agentHome = await requiredPhysicalDirectory(agent.home, `${agent.descriptor.id} user directory`)
  const target = join(agentHome, 'skills', name)
  const targetState = await lstat(target).catch(() => undefined)
  if (!targetState) return false
  if (!targetState.isSymbolicLink()) throw new KiError(`${agent.descriptor.id} ${name} skill is not KI-managed`, 1)
  await unlink(target)
  return true
}

const removeManagedRepoSkill = async (
  agent: InstalledAgent,
  repositoryRoot: string,
  name: string
): Promise<boolean> => {
  const target = join(agentSkillDirectory(agent, 'repo', repositoryRoot), name)
  const targetState = await lstat(target).catch(() => undefined)
  if (!targetState) return false
  if (!targetState.isSymbolicLink()) throw new KiError(`${agent.descriptor.id} ${name} skill is not KI-managed`, 1)
  await unlink(target)
  return true
}

const installedSkillSource = async (
  dataDirectory: string,
  name: string
): Promise<{
  readonly skill: {
    readonly name: string
    readonly source: string
    readonly supportedRuntimes?: readonly SupportedRuntime[]
  }
  readonly harness: string
}> => {
  const harnesses = await discoverInstalledHarnesses(dataDirectory)
  const matches = harnesses.flatMap((harness) =>
    harness.capabilities
      .filter((capability) => capability.kind === 'skill' && capability.name === name)
      .map((capability) => ({ harness, capability }))
  )
  const [match] = matches
  if (!match) throw new KiError(`no installed harness provides skill ${name}`, 1)
  if (matches.length > 1) throw new KiError(`skill ${name} is provided by multiple installed harnesses`, 1)
  const source = await requiredPhysicalDirectory(
    join(match.harness.root, match.capability.source),
    `installed harness ${match.harness.id} ${name} skill`
  )
  return { skill: { name, source, supportedRuntimes: match.capability.supportedRuntimes }, harness: match.harness.id }
}

const skillNameOf = (identity: string): string => identity.slice(identity.lastIndexOf(':') + 1)

export const addUserSkill = async (options: {
  readonly configurationDirectory: string
  readonly dataDirectory: string
  readonly homeDirectory: string
  readonly skill: string
  readonly replace?: boolean
}): Promise<{ readonly skill: string; readonly agents: readonly string[] }> => {
  const agents = await configuredAgents({
    homeDirectory: options.homeDirectory,
    configurationDirectory: options.configurationDirectory
  })
  const resolved = await installedSkillSource(options.dataDirectory, options.skill)
  const compatible = agents.filter((agent) => compatibleWithSkill(agent, resolved.skill.supportedRuntimes))
  if (compatible.length === 0)
    throw new KiError(`skill ${resolved.skill.name} is incompatible with every configured agent`, 1)
  for (const agent of compatible) await linkManagedSkill(agent, { scope: 'user' }, resolved.skill, options.replace)
  const identity = `${resolved.harness}:${resolved.skill.name}`
  const current = (await inspectUserConfiguration(options.configurationDirectory)).skills
  const next = [...current.filter((entry) => skillNameOf(entry) !== resolved.skill.name), identity].sort(
    (left, right) => left.localeCompare(right)
  )
  await setConfiguredUserSkills(options.configurationDirectory, options.homeDirectory, next)
  return { skill: resolved.skill.name, agents: compatible.map((agent) => agent.descriptor.id) }
}

export const removeUserSkill = async (options: {
  readonly configurationDirectory: string
  readonly homeDirectory: string
  readonly skill: string
}): Promise<{ readonly skill: string; readonly agents: readonly string[]; readonly removed: boolean }> => {
  const agents = await configuredAgents({
    homeDirectory: options.homeDirectory,
    configurationDirectory: options.configurationDirectory
  })
  let removed = false
  for (const agent of agents) {
    if (await removeManagedUserSkill(agent, options.skill)) removed = true
  }
  const current = (await inspectUserConfiguration(options.configurationDirectory)).skills
  const next = current.filter((entry) => skillNameOf(entry) !== options.skill)
  await setConfiguredUserSkills(options.configurationDirectory, options.homeDirectory, next)
  return { skill: options.skill, agents: agents.map((agent) => agent.descriptor.id), removed }
}

export const addRepoSkill = async (options: {
  readonly configurationDirectory: string
  readonly dataDirectory: string
  readonly homeDirectory: string
  readonly workingDirectory: string
  readonly repository?: string
  readonly skill: string
  readonly replace?: boolean
}): Promise<{ readonly skill: string; readonly repository: string; readonly agents: readonly string[] }> => {
  const location = await resolveRepository({
    repository: options.repository,
    workingDirectory: options.workingDirectory,
    homeDirectory: options.homeDirectory
  })
  const agents = await configuredAgents({
    homeDirectory: options.homeDirectory,
    configurationDirectory: options.configurationDirectory
  })
  const resolved = await installedSkillSource(options.dataDirectory, options.skill)
  const runtimes = await repositorySupportedRuntimes(location.configuration)
  const compatible = agents.filter(
    (agent) => runtimes.includes(runtimeForAgent(agent)) && compatibleWithSkill(agent, resolved.skill.supportedRuntimes)
  )
  if (compatible.length === 0)
    throw new KiError(`skill ${resolved.skill.name} is incompatible with this repository's configured agents`, 1)
  for (const agent of compatible)
    await linkManagedSkill(agent, { scope: 'repo', repository: location.root }, resolved.skill, options.replace)
  await declareRepositorySkill(location.configuration, resolved.harness, resolved.skill.name)
  return {
    skill: resolved.skill.name,
    repository: location.root,
    agents: compatible.map((agent) => agent.descriptor.id)
  }
}

export const removeRepoSkill = async (options: {
  readonly configurationDirectory: string
  readonly homeDirectory: string
  readonly workingDirectory: string
  readonly repository?: string
  readonly skill: string
}): Promise<{
  readonly skill: string
  readonly repository: string
  readonly agents: readonly string[]
  readonly removed: boolean
}> => {
  const location = await resolveRepository({
    repository: options.repository,
    workingDirectory: options.workingDirectory,
    homeDirectory: options.homeDirectory
  })
  const declaration = (await readRepositoryDeclaration(location.configuration)).skills.find(
    (candidate) => candidate.name === options.skill
  )
  const agents = await configuredAgents({
    homeDirectory: options.homeDirectory,
    configurationDirectory: options.configurationDirectory
  })
  let removed = false
  for (const agent of agents) {
    if (await removeManagedRepoSkill(agent, location.root, options.skill)) removed = true
  }
  const undeclared = declaration ? await undeclareRepositorySkill(location.configuration, declaration.key) : false
  // A parsed declaration whose table cannot be found in the file's text means the two readings of
  // the same file disagree. Reporting removal here would leave the declaration standing behind a
  // successful exit, with the projections it names already gone.
  if (declaration && !undeclared)
    throw new KiError(`declared skill ${declaration.key} could not be removed from ${location.configuration}`, 1)
  return {
    skill: options.skill,
    repository: location.root,
    agents: agents.map((agent) => agent.descriptor.id),
    removed: removed || undeclared
  }
}
