import { lstat, mkdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parse } from 'smol-toml'
import { KiError } from '../core/errors.ts'
import { baseHarnessIdentifier, discoverInstalledHarnesses, readInstalledHarness } from '../core/harness.ts'
import chatgptCodex from './chatgpt-codex.ts'
import claudeCode from './claude-code.ts'
import type { AgentDescriptor } from './types.ts'

export const agentDescriptors = [claudeCode, chatgptCodex] as const satisfies readonly AgentDescriptor[]

export type AgentId = (typeof agentDescriptors)[number]['id']

export interface InstalledAgent {
  readonly descriptor: AgentDescriptor
  readonly home: string
}

export interface BootstrapConfiguration {
  readonly agents: readonly InstalledAgent[]
  readonly disposition: 'created' | 'refreshed' | 'reused'
}

interface ConfiguredHarness {
  readonly id: string
  readonly url: string
  readonly sha256: string
}

interface StringListSection {
  readonly ids?: unknown
}

interface HarnessSection {
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
  harnesses: readonly ConfiguredHarness[] = [],
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
    'releases = [',
    ...harnesses.map(
      (harness) =>
        `  { id = ${JSON.stringify(harness.id)}, url = ${JSON.stringify(harness.url)}, sha256 = ${JSON.stringify(harness.sha256)} },`
    ),
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
    if (key !== 'releases') warnings.push(`harnesses has unrecognised key ${key}`)
  }
  const harnesses: string[] = []
  if (!Array.isArray(harnessSection.releases)) errors.push('harnesses.releases must be an array')
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

const installBootstrapSkill = async (agent: InstalledAgent, source: string): Promise<boolean> => {
  const agentHome = await requiredPhysicalDirectory(agent.home, `${agent.descriptor.id} user directory`)
  skillCapability(agent)
  const skills = join(agentHome, 'skills')
  const state = await lstat(skills).catch(() => undefined)
  if (!state) await mkdir(skills)
  await requiredPhysicalDirectory(skills, `${agent.descriptor.id} user skills directory`)
  const target = join(skills, 'ki-bootstrap')
  const targetState = await lstat(target).catch(() => undefined)
  if (!targetState) {
    await symlink(source, target, 'dir')
    return true
  }
  if (!targetState.isSymbolicLink()) throw new KiError(`${agent.descriptor.id} ki-bootstrap skill is not KI-managed`, 1)
  const actual = await realpath(target).catch(() => undefined)
  if (actual !== source) throw new KiError(`${agent.descriptor.id} ki-bootstrap skill points to an unfamiliar source`, 1)
  return false
}

export const installedBootstrapSkillSource = async (dataDirectory: string, identifier = baseHarnessIdentifier): Promise<string> => {
  const [owner, name] = identifier.split('/')
  const root = join(dataDirectory, 'harnesses', owner as string, name as string, 'latest')
  if (!(await lstat(root).catch(() => undefined))) {
    throw new KiError(`harness ${identifier} is not installed`, 1)
  }
  const harness = await readInstalledHarness(dataDirectory, identifier)
  const capability = harness.lock.capabilities.find((candidate) => candidate.kind === 'skill' && candidate.name === 'ki-bootstrap')
  if (!capability) throw new KiError(`installed harness ${identifier} does not provide ki-bootstrap`, 1)
  return requiredPhysicalDirectory(join(harness.root, capability.source), 'installed ki-bootstrap skill')
}

export const localBootstrapHarness = async (harnessDirectory: string): Promise<{ readonly harness: string; readonly skill: string }> => {
  const harness = await requiredPhysicalDirectory(resolve(harnessDirectory), 'local harness')
  const source = join(harness, 'skills', 'keystone', 'ki-bootstrap')
  const sourceState = await lstat(source).catch(() => undefined)
  const entry = await lstat(join(source, 'SKILL.md')).catch(() => undefined)
  if (!sourceState?.isDirectory() || sourceState.isSymbolicLink() || !entry?.isFile() || entry.isSymbolicLink()) {
    throw new KiError('local harness must contain skills/keystone/ki-bootstrap/SKILL.md', 1)
  }
  return { harness, skill: await realpath(source) }
}

export const localBootstrapSkillSource = async (harnessDirectory: string): Promise<string> =>
  (await localBootstrapHarness(harnessDirectory)).skill

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
  const harnesses = installed
    .map(({ lock }) => ({ id: lock.id, url: lock.archive.url, sha256: lock.archive.sha256 }))
    .sort((left, right) => left.id.localeCompare(right.id))
  const skills = installed
    .flatMap(({ lock }) => lock.capabilities.map((capability) => `${lock.id}:${capability.name}`))
    .sort((left, right) => left.localeCompare(right))
  await writeFile(bootstrapConfigurationPath(configurationDirectory), renderConfiguration(agents, harnesses, skills, local), {
    encoding: 'utf8'
  })
  return { harnesses: harnesses.length, skills: skills.length }
}

export const installBootstrapSkills = async (
  source: string,
  agents: readonly InstalledAgent[]
): Promise<readonly { readonly agent: InstalledAgent; readonly installed: boolean }[]> => {
  return Promise.all(agents.map(async (agent) => ({ agent, installed: await installBootstrapSkill(agent, source) })))
}

export const bootstrapAgents = async (options: {
  readonly homeDirectory: string
  readonly configurationDirectory: string
  readonly dataDirectory: string
  readonly refresh?: boolean
}): Promise<readonly InstalledAgent[]> => {
  const configuration = await configureBootstrapAgents(options)
  await installBootstrapSkills(await installedBootstrapSkillSource(options.dataDirectory), configuration.agents)
  if (options.refresh) await refreshUserConfiguration(options.configurationDirectory, options.dataDirectory, configuration.agents)
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
