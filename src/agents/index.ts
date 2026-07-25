import { lstat, mkdir, readdir, readFile, realpath, symlink, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parse } from 'smol-toml'
import { declareRepositorySkill, undeclareRepositorySkill } from '../core/configuration.ts'
import { KiError } from '../core/errors.ts'
import { baseHarnessIdentifier, discoverInstalledHarnesses, type HarnessCapability, readInstalledHarness } from '../core/harness.ts'
import { resolveRepository } from '../core/repository.ts'
import chatgptCodex from './chatgpt-codex.ts'
import claudeCode from './claude-code.ts'
import type { AgentDescriptor } from './types.ts'

export const agentDescriptors = [claudeCode, chatgptCodex] as const satisfies readonly AgentDescriptor[]

export type AgentId = (typeof agentDescriptors)[number]['id']

export const bootstrapUserSkills = ['ki-bootstrap', 'ki-delegate', 'ki-next', 'ki-plan', 'ki-recap'] as const

export interface InstalledAgent {
  readonly descriptor: AgentDescriptor
  readonly home: string
}

export interface BootstrapConfiguration {
  readonly agents: readonly InstalledAgent[]
  readonly disposition: 'created' | 'refreshed' | 'reused'
}

export interface ManagedUserSkill {
  readonly name: (typeof bootstrapUserSkills)[number]
  readonly source: string
}

interface StringListSection {
  readonly ids?: unknown
}

interface HarnessSection {
  readonly ids?: unknown
  readonly releases?: unknown
}

interface LocalSection {
  readonly path?: unknown
}

export interface UserConfigurationInspection {
  readonly path: string
  readonly state: 'missing' | 'valid' | 'invalid'
  readonly agents: readonly string[]
  readonly harnesses: readonly string[]
  readonly skills: readonly string[]
  readonly local: string | null
  readonly warnings: readonly string[]
  readonly errors: readonly string[]
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const physicalDirectory = async (path: string): Promise<boolean> => {
  const state = await lstat(path).catch(() => undefined)
  return Boolean(state?.isDirectory() && !state.isSymbolicLink())
}

const requiredPhysicalDirectory = async (path: string, description: string): Promise<string> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isDirectory() || state.isSymbolicLink()) throw new KiError(`${description} must be a directory`, 1)
  return realpath(path)
}

const descriptor = (id: string): AgentDescriptor => {
  const value = agentDescriptors.find((candidate) => candidate.id === id)
  if (!value) throw new KiError(`unknown agent ${id}; use claude-code or chatgpt-codex`, 2)
  return value
}

const skillCapability = (agent: InstalledAgent): string => {
  if (!agent.descriptor.paths.skills) throw new KiError(`agent ${agent.descriptor.id} has no skill path`, 1)
  return agent.descriptor.paths.skills
}

const bootstrapConfigurationPath = (configurationDirectory: string): string => join(configurationDirectory, 'config.toml')

const renderConfiguration = (
  agents: readonly InstalledAgent[],
  harnesses: readonly string[] = [],
  skills: readonly string[] = [],
  local?: string
): string =>
  [
    'schema = 1',
    '',
    '[agents]',
    'ids = [',
    ...agents.map((agent) => `  ${JSON.stringify(agent.descriptor.id)},`),
    ']',
    '',
    '[harnesses]',
    'ids = [',
    ...harnesses.map((harness) => `  ${JSON.stringify(harness)},`),
    ']',
    '',
    '[skills]',
    'ids = [',
    ...skills.map((skill) => `  ${JSON.stringify(skill)},`),
    ']',
    ...(local ? ['', '[local]', `path = ${JSON.stringify(local)}`] : []),
    ''
  ].join('\n')

const inspectStringList = (value: unknown, key: string, errors: string[]): string[] => {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry)) {
    errors.push(`${key} must be an array of non-empty strings`)
    return []
  }
  if (new Set(value).size !== value.length) errors.push(`${key} repeats a value`)
  return value
}

const inspectSection = (value: unknown, key: string, errors: string[]): Record<string, unknown> => {
  if (isRecord(value)) return value
  errors.push(`${key} must be a TOML table`)
  return {}
}

export const inspectUserConfiguration = async (configurationDirectory: string): Promise<UserConfigurationInspection> => {
  const path = bootstrapConfigurationPath(configurationDirectory)
  const state = await lstat(path).catch(() => undefined)
  if (!state) return { path, state: 'missing', agents: [], harnesses: [], skills: [], local: null, warnings: [], errors: [] }
  if (!state.isFile() || state.isSymbolicLink()) {
    return {
      path,
      state: 'invalid',
      agents: [],
      harnesses: [],
      skills: [],
      local: null,
      warnings: [],
      errors: ['configuration must be a regular file']
    }
  }
  let parsed: unknown
  try {
    parsed = parse(await readFile(path, 'utf8'))
  } catch {
    return {
      path,
      state: 'invalid',
      agents: [],
      harnesses: [],
      skills: [],
      local: null,
      warnings: [],
      errors: ['configuration must be valid TOML']
    }
  }
  if (!isRecord(parsed)) {
    return {
      path,
      state: 'invalid',
      agents: [],
      harnesses: [],
      skills: [],
      local: null,
      warnings: [],
      errors: ['configuration must be a TOML table']
    }
  }

  const configuration = parsed as Record<string, unknown> & {
    schema?: unknown
    agents?: unknown
    harnesses?: unknown
    skills?: unknown
    local?: unknown
  }
  const warnings = Object.keys(configuration)
    .filter((key) => !['schema', 'agents', 'harnesses', 'skills', 'local'].includes(key))
    .map((key) => `unrecognised key ${key}`)
  const errors: string[] = []
  if (configuration.schema !== 1) errors.push('schema must equal 1')
  const agentSection = inspectSection(configuration.agents, 'agents', errors) as StringListSection
  for (const key of Object.keys(agentSection)) {
    if (key !== 'ids') warnings.push(`agents has unrecognised key ${key}`)
  }
  const agents = inspectStringList(agentSection.ids, 'agents.ids', errors)
  for (const agent of agents) {
    if (!agentDescriptors.some((descriptor) => descriptor.id === agent)) warnings.push(`unrecognised agent ${agent}`)
  }
  const skillSection = inspectSection(configuration.skills, 'skills', errors) as StringListSection
  for (const key of Object.keys(skillSection)) {
    if (key !== 'ids') warnings.push(`skills has unrecognised key ${key}`)
  }
  const skills = inspectStringList(skillSection.ids, 'skills.ids', errors)
  const harnessSection = inspectSection(configuration.harnesses, 'harnesses', errors) as HarnessSection
  for (const key of Object.keys(harnessSection)) {
    if (key !== 'ids' && key !== 'releases') warnings.push(`harnesses has unrecognised key ${key}`)
  }
  const harnesses: string[] = []
  if (harnessSection.ids !== undefined) harnesses.push(...inspectStringList(harnessSection.ids, 'harnesses.ids', errors))
  else if (!Array.isArray(harnessSection.releases)) errors.push('harnesses must declare an ids array')
  else {
    for (const [index, harness] of harnessSection.releases.entries()) {
      if (!isRecord(harness)) {
        errors.push(`harnesses[${index}] must be a table`)
        continue
      }
      for (const key of Object.keys(harness)) {
        if (!['id', 'url', 'sha256'].includes(key)) warnings.push(`harnesses[${index}] has unrecognised key ${key}`)
      }
      const release = harness as Record<string, unknown> & { id?: unknown; url?: unknown; sha256?: unknown }
      const id = release.id
      const url = release.url
      const digest = release.sha256
      if (typeof id !== 'string' || !id) errors.push(`harnesses[${index}] id must be a non-empty string`)
      else harnesses.push(id)
      if (typeof url !== 'string' || !url.startsWith('https://')) errors.push(`harnesses[${index}] url must be an HTTPS URL`)
      if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) errors.push(`harnesses[${index}] sha256 must be lowercase SHA-256`)
    }
  }
  const localSection =
    configuration.local === undefined ? undefined : (inspectSection(configuration.local, 'local', errors) as LocalSection)
  if (localSection) {
    for (const key of Object.keys(localSection)) {
      if (key !== 'path') warnings.push(`local has unrecognised key ${key}`)
    }
  }
  const local = localSection === undefined ? null : typeof localSection.path === 'string' && localSection.path ? localSection.path : null
  if (localSection !== undefined && local === null) errors.push('local.path must be a non-empty path string')
  return { path, state: errors.length ? 'invalid' : 'valid', agents, harnesses, skills, local, warnings, errors }
}

const readConfiguration = async (configurationDirectory: string, homeDirectory: string): Promise<readonly InstalledAgent[] | undefined> => {
  const path = bootstrapConfigurationPath(configurationDirectory)
  const state = await lstat(path).catch(() => undefined)
  if (!state) return undefined
  if (!state.isFile() || state.isSymbolicLink()) throw new KiError('agent configuration must be a regular file', 1)
  let parsed: unknown
  try {
    parsed = parse(await readFile(path, 'utf8'))
  } catch {
    throw new KiError('agent configuration must be valid TOML', 1)
  }
  if (!isRecord(parsed)) throw new KiError('agent configuration must use schema 1', 1)
  const configuration = parsed as { schema?: unknown; agents?: unknown; skills?: unknown; local?: unknown }
  const agentSection = isRecord(configuration.agents) ? (configuration.agents as StringListSection) : undefined
  const skillSection = isRecord(configuration.skills) ? (configuration.skills as StringListSection) : undefined
  const localSection =
    configuration.local === undefined ? undefined : isRecord(configuration.local) ? (configuration.local as LocalSection) : null
  if (
    configuration.schema !== 1 ||
    !agentSection ||
    !Array.isArray(agentSection.ids) ||
    agentSection.ids.some((agent) => typeof agent !== 'string') ||
    !skillSection ||
    !Array.isArray(skillSection.ids) ||
    skillSection.ids.some((skill) => typeof skill !== 'string') ||
    (localSection !== undefined && (localSection === null || typeof localSection.path !== 'string' || !localSection.path))
  ) {
    throw new KiError('KI configuration must declare agents.ids and skills.ids string arrays and an optional local.path', 1)
  }
  const agents = agentSection.ids as string[]
  const skills = skillSection.ids as string[]
  if (new Set(agents).size !== agents.length) throw new KiError('agent configuration repeats an agent', 1)
  if (new Set(skills).size !== skills.length) {
    throw new KiError('KI configuration repeats a skill', 1)
  }
  return agents.map((id) => {
    const known = descriptor(id)
    return { descriptor: known, home: resolve(homeDirectory, known.paths.home) }
  })
}

const detectAgents = async (homeDirectory: string): Promise<readonly InstalledAgent[]> => {
  const agents: InstalledAgent[] = []
  for (const candidate of agentDescriptors) {
    const home = resolve(homeDirectory, candidate.paths.home)
    if (await physicalDirectory(home)) agents.push({ descriptor: candidate, home })
  }
  return agents
}

const installManagedUserSkill = async (
  agent: InstalledAgent,
  skill: { readonly name: string; readonly source: string },
  replace = false
): Promise<boolean> => {
  const agentHome = await requiredPhysicalDirectory(agent.home, `${agent.descriptor.id} user directory`)
  skillCapability(agent)
  const skills = join(agentHome, 'skills')
  const state = await lstat(skills).catch(() => undefined)
  if (!state) await mkdir(skills, { recursive: true })
  await requiredPhysicalDirectory(skills, `${agent.descriptor.id} user skills directory`)
  const target = join(skills, skill.name)
  const targetState = await lstat(target).catch(() => undefined)
  if (!targetState) {
    await symlink(skill.source, target, 'dir')
    return true
  }
  if (!targetState.isSymbolicLink()) throw new KiError(`${agent.descriptor.id} ${skill.name} skill is not KI-managed`, 1)
  const actual = await realpath(target).catch(() => undefined)
  const expected = await realpath(skill.source)
  if (actual !== expected) {
    if (!replace) throw new KiError(`${agent.descriptor.id} ${skill.name} skill points to an unfamiliar source`, 1)
    await unlink(target)
    await symlink(skill.source, target, 'dir')
    return true
  }
  return false
}

const bootstrapSkillSources = async (
  harness: { readonly root: string; readonly capabilities: readonly HarnessCapability[] },
  description: string
): Promise<readonly ManagedUserSkill[]> =>
  Promise.all(
    bootstrapUserSkills.map(async (name) => {
      const capability = harness.capabilities.find((candidate) => candidate.kind === 'skill' && candidate.name === name)
      if (!capability) throw new KiError(`${description} does not provide ${name}`, 1)
      return { name, source: await requiredPhysicalDirectory(join(harness.root, capability.source), `${description} ${name} skill`) }
    })
  )

export const installedBootstrapSkillSources = async (
  dataDirectory: string,
  identifier = baseHarnessIdentifier
): Promise<readonly ManagedUserSkill[]> => {
  const [owner, name] = identifier.split('/')
  const root = join(dataDirectory, 'harnesses', owner as string, name as string)
  if (!(await lstat(root).catch(() => undefined))) {
    throw new KiError(`harness ${identifier} is not installed`, 1)
  }
  const harness = await readInstalledHarness(dataDirectory, identifier)
  return bootstrapSkillSources(harness, `installed harness ${identifier}`)
}

export const installedBootstrapSkillSource = async (dataDirectory: string, identifier = baseHarnessIdentifier): Promise<string> => {
  const skill = (await installedBootstrapSkillSources(dataDirectory, identifier))[0]
  if (!skill) throw new KiError(`installed harness ${identifier} does not provide ki-bootstrap`, 1)
  return skill.source
}

export const localBootstrapHarness = async (
  harnessDirectory: string
): Promise<{ readonly harness: string; readonly skills: readonly ManagedUserSkill[] }> => {
  const harness = await requiredPhysicalDirectory(resolve(harnessDirectory), 'local harness')
  const skills = await Promise.all(
    bootstrapUserSkills.map(async (name) => {
      const source = join(harness, 'skills', name === 'ki-bootstrap' ? 'keystone' : 'process', name)
      const entry = await lstat(join(source, 'SKILL.md')).catch(() => undefined)
      if (!entry?.isFile() || entry.isSymbolicLink()) {
        throw new KiError(`local harness must contain ${source.slice(harness.length + 1)}/SKILL.md`, 1)
      }
      return { name, source: await requiredPhysicalDirectory(source, `local harness ${name} skill`) }
    })
  )
  if (!skills[0]) {
    throw new KiError('local harness must contain skills/keystone/ki-bootstrap/SKILL.md', 1)
  }
  return { harness, skills }
}

export const localBootstrapSkillSource = async (harnessDirectory: string): Promise<string> => {
  const skill = (await localBootstrapHarness(harnessDirectory)).skills[0]
  if (!skill) throw new KiError('local harness must contain skills/keystone/ki-bootstrap/SKILL.md', 1)
  return skill.source
}

export const setLocalBootstrapHarness = async (configurationDirectory: string, local?: string): Promise<void> => {
  const path = bootstrapConfigurationPath(configurationDirectory)
  const contents = await readFile(path, 'utf8')
  const expression = /(?:^|\n)\[local\]\npath\s*=.*(?:\n|$)/m
  const updated = local
    ? expression.test(contents)
      ? contents.replace(expression, `\n[local]\npath = ${JSON.stringify(local)}\n`)
      : `${contents.trimEnd()}\n\n[local]\npath = ${JSON.stringify(local)}\n`
    : contents.replace(expression, '')
  await writeFile(path, updated, 'utf8')
}

export const setConfiguredUserSkills = async (configurationDirectory: string, skills: readonly string[]): Promise<void> => {
  const path = bootstrapConfigurationPath(configurationDirectory)
  const contents = await readFile(path, 'utf8')
  const section = ['[skills]', 'ids = [', ...skills.map((skill) => `  ${JSON.stringify(skill)},`), ']'].join('\n')
  const expression = /\[skills\]\nids\s*=\s*\[[\s\S]*?\n\]/m
  if (!expression.test(contents)) throw new KiError('KI configuration must declare a [skills] ids array', 1)
  await writeFile(path, contents.replace(expression, section), 'utf8')
}

export const configureBootstrapAgents = async (options: {
  readonly homeDirectory: string
  readonly configurationDirectory: string
  readonly refresh?: boolean
}): Promise<BootstrapConfiguration> => {
  const path = bootstrapConfigurationPath(options.configurationDirectory)
  const state = await lstat(options.configurationDirectory).catch(() => undefined)
  if (state && (!state.isDirectory() || state.isSymbolicLink())) throw new KiError('KI configuration directory must be a directory', 1)
  const configured = options.refresh ? undefined : await readConfiguration(options.configurationDirectory, options.homeDirectory)
  const agents = options.refresh || !configured ? await detectAgents(options.homeDirectory) : configured
  if (!configured) {
    await mkdir(options.configurationDirectory, { recursive: true })
    await writeFile(path, renderConfiguration(agents), { encoding: 'utf8' })
  }
  return { agents, disposition: options.refresh ? 'refreshed' : !configured ? 'created' : 'reused' }
}

export const refreshUserConfiguration = async (
  configurationDirectory: string,
  dataDirectory: string,
  agents: readonly InstalledAgent[],
  local?: string
): Promise<{ readonly harnesses: number; readonly skills: number }> => {
  const installed = await discoverInstalledHarnesses(dataDirectory)
  const harnesses = installed.map((harness) => harness.id).sort((left, right) => left.localeCompare(right))
  const localSkills = local ? (await localBootstrapHarness(local)).skills : []
  const skills = await discoverManagedUserSkills(agents, installed, localSkills)
  await writeFile(bootstrapConfigurationPath(configurationDirectory), renderConfiguration(agents, harnesses, skills, local), {
    encoding: 'utf8'
  })
  return { harnesses: harnesses.length, skills: skills.length }
}

const discoverManagedUserSkills = async (
  agents: readonly InstalledAgent[],
  harnesses: Awaited<ReturnType<typeof discoverInstalledHarnesses>>,
  localSkills: readonly ManagedUserSkill[] = []
): Promise<readonly string[]> => {
  const identities = new Map<string, string>()
  for (const harness of harnesses) {
    for (const capability of harness.capabilities) {
      const source = await realpath(join(harness.root, capability.source))
      identities.set(source, `${harness.id}:${capability.name}`)
    }
  }
  for (const skill of localSkills) identities.set(skill.source, `${baseHarnessIdentifier}:${skill.name}`)
  const skills = new Set<string>()
  for (const agent of agents) {
    skillCapability(agent)
    const directory = join(agent.home, 'skills')
    const state = await lstat(directory).catch(() => undefined)
    if (!state) continue
    await requiredPhysicalDirectory(directory, `${agent.descriptor.id} user skills directory`)
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isSymbolicLink()) continue
      const source = await realpath(join(directory, entry.name)).catch(() => undefined)
      const identity = source ? identities.get(source) : undefined
      if (identity) skills.add(identity)
    }
  }
  return [...skills].sort((left, right) => left.localeCompare(right))
}

export const installBootstrapSkills = async (
  skills: readonly ManagedUserSkill[],
  agents: readonly InstalledAgent[],
  options: { readonly replace?: boolean } = {}
): Promise<readonly { readonly agent: InstalledAgent; readonly skill: string; readonly installed: boolean }[]> => {
  return Promise.all(
    agents.flatMap((agent) =>
      skills.map(async (skill) => ({
        agent,
        skill: skill.name,
        installed: await installManagedUserSkill(agent, skill, options.replace)
      }))
    )
  )
}

export const bootstrapAgents = async (options: {
  readonly homeDirectory: string
  readonly configurationDirectory: string
  readonly dataDirectory: string
  readonly refresh?: boolean
}): Promise<readonly InstalledAgent[]> => {
  const configuration = await configureBootstrapAgents(options)
  const skills = await installedBootstrapSkillSources(options.dataDirectory)
  await installBootstrapSkills(skills, configuration.agents)
  if (options.refresh) await refreshUserConfiguration(options.configurationDirectory, options.dataDirectory, configuration.agents)
  else
    await setConfiguredUserSkills(
      options.configurationDirectory,
      skills.map((skill) => `${baseHarnessIdentifier}:${skill.name}`)
    )
  return configuration.agents
}

export const configuredAgents = async (options: {
  readonly homeDirectory: string
  readonly configurationDirectory: string
  readonly selected?: readonly string[]
}): Promise<readonly InstalledAgent[]> => {
  const configured = await readConfiguration(options.configurationDirectory, options.homeDirectory)
  if (!configured) throw new KiError('KI environment is not bootstrapped; run `ki bootstrap` first', 1)
  if (!options.selected?.length) return configured
  const selected = options.selected.map(descriptor)
  const byId = new Map(configured.map((agent) => [agent.descriptor.id, agent]))
  const agents = selected.map((candidate) => byId.get(candidate.id))
  if (agents.some((agent) => !agent)) {
    const absent = selected.find((candidate) => !byId.has(candidate.id))
    throw new KiError(`agent ${absent?.id} is not configured; add it to ${bootstrapConfigurationPath(options.configurationDirectory)}`, 1)
  }
  return agents as readonly InstalledAgent[]
}

export const agentSkillDirectory = (agent: InstalledAgent, scope: 'user' | 'repo', repository?: string): string => {
  const skillPath = skillCapability(agent)
  if (scope === 'user') return join(agent.home, 'skills')
  if (repository) return join(repository, skillPath)
  throw new KiError('repository scope requires a repository', 2)
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

const installedSkillSource = async (
  dataDirectory: string,
  name: string
): Promise<{ readonly skill: { readonly name: string; readonly source: string }; readonly harness: string }> => {
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
  return { skill: { name, source }, harness: match.harness.id }
}

const skillNameOf = (identity: string): string => (identity.includes(':') ? identity.slice(identity.lastIndexOf(':') + 1) : identity)

export const addUserSkill = async (options: {
  readonly configurationDirectory: string
  readonly dataDirectory: string
  readonly homeDirectory: string
  readonly skill: string
  readonly replace?: boolean
}): Promise<{ readonly skill: string; readonly agents: readonly string[] }> => {
  const agents = await configuredAgents({ homeDirectory: options.homeDirectory, configurationDirectory: options.configurationDirectory })
  const resolved = await installedSkillSource(options.dataDirectory, options.skill)
  for (const agent of agents) await installManagedUserSkill(agent, resolved.skill, options.replace)
  const identity = `${resolved.harness}:${resolved.skill.name}`
  const current = (await inspectUserConfiguration(options.configurationDirectory)).skills
  const next = [...current.filter((entry) => skillNameOf(entry) !== resolved.skill.name), identity].sort((left, right) =>
    left.localeCompare(right)
  )
  await setConfiguredUserSkills(options.configurationDirectory, next)
  return { skill: resolved.skill.name, agents: agents.map((agent) => agent.descriptor.id) }
}

export const removeUserSkill = async (options: {
  readonly configurationDirectory: string
  readonly homeDirectory: string
  readonly skill: string
}): Promise<{ readonly skill: string; readonly agents: readonly string[]; readonly removed: boolean }> => {
  const agents = await configuredAgents({ homeDirectory: options.homeDirectory, configurationDirectory: options.configurationDirectory })
  let removed = false
  for (const agent of agents) {
    if (await removeManagedUserSkill(agent, options.skill)) removed = true
  }
  const current = (await inspectUserConfiguration(options.configurationDirectory)).skills
  const next = current.filter((entry) => skillNameOf(entry) !== options.skill)
  await setConfiguredUserSkills(options.configurationDirectory, next)
  return { skill: options.skill, agents: agents.map((agent) => agent.descriptor.id), removed }
}

const installManagedRepoSkill = async (
  agent: InstalledAgent,
  repositoryRoot: string,
  skill: { readonly name: string; readonly source: string },
  replace = false
): Promise<boolean> => {
  const skills = agentSkillDirectory(agent, 'repo', repositoryRoot)
  await mkdir(skills, { recursive: true })
  await requiredPhysicalDirectory(skills, `${agent.descriptor.id} repository skills directory`)
  const target = join(skills, skill.name)
  const targetState = await lstat(target).catch(() => undefined)
  if (!targetState) {
    await symlink(skill.source, target)
    return true
  }
  if (!targetState.isSymbolicLink()) throw new KiError(`${agent.descriptor.id} ${skill.name} skill is not KI-managed`, 1)
  const expected = await realpath(skill.source)
  const actual = await realpath(target).catch(() => undefined)
  if (actual === expected) return false
  if (!replace) throw new KiError(`${agent.descriptor.id} ${skill.name} skill points elsewhere; pass --replace to re-point`, 1)
  await unlink(target)
  await symlink(skill.source, target)
  return true
}

const removeManagedRepoSkill = async (agent: InstalledAgent, repositoryRoot: string, name: string): Promise<boolean> => {
  const target = join(agentSkillDirectory(agent, 'repo', repositoryRoot), name)
  const targetState = await lstat(target).catch(() => undefined)
  if (!targetState) return false
  if (!targetState.isSymbolicLink()) throw new KiError(`${agent.descriptor.id} ${name} skill is not KI-managed`, 1)
  await unlink(target)
  return true
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
  const agents = await configuredAgents({ homeDirectory: options.homeDirectory, configurationDirectory: options.configurationDirectory })
  const resolved = await installedSkillSource(options.dataDirectory, options.skill)
  for (const agent of agents) await installManagedRepoSkill(agent, location.root, resolved.skill, options.replace)
  await declareRepositorySkill(location.configuration, resolved.skill.name)
  return { skill: resolved.skill.name, repository: location.root, agents: agents.map((agent) => agent.descriptor.id) }
}

export const removeRepoSkill = async (options: {
  readonly configurationDirectory: string
  readonly homeDirectory: string
  readonly workingDirectory: string
  readonly repository?: string
  readonly skill: string
}): Promise<{ readonly skill: string; readonly repository: string; readonly agents: readonly string[]; readonly removed: boolean }> => {
  const location = await resolveRepository({
    repository: options.repository,
    workingDirectory: options.workingDirectory,
    homeDirectory: options.homeDirectory
  })
  const agents = await configuredAgents({ homeDirectory: options.homeDirectory, configurationDirectory: options.configurationDirectory })
  let removed = false
  for (const agent of agents) {
    if (await removeManagedRepoSkill(agent, location.root, options.skill)) removed = true
  }
  const undeclared = await undeclareRepositorySkill(location.configuration, options.skill)
  return {
    skill: options.skill,
    repository: location.root,
    agents: agents.map((agent) => agent.descriptor.id),
    removed: removed || undeclared
  }
}
