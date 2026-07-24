import { lstat, mkdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parse } from 'smol-toml'
import { KiError } from '../core/errors.ts'
import { baseHarnessIdentifier, readInstalledHarness } from '../core/harness.ts'
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
  readonly disposition: 'created' | 'redetected' | 'reused'
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

const agentsPath = (configurationDirectory: string): string => join(configurationDirectory, 'agents.toml')

const renderConfiguration = (agents: readonly InstalledAgent[]): string =>
  ['schema = 1', `agents = [${agents.map((agent) => JSON.stringify(agent.descriptor.id)).join(', ')}]`, ''].join('\n')

const readConfiguration = async (configurationDirectory: string, homeDirectory: string): Promise<readonly InstalledAgent[] | undefined> => {
  const path = agentsPath(configurationDirectory)
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
  const configuration = parsed as { schema?: unknown; agents?: unknown }
  if (
    configuration.schema !== 1 ||
    !Array.isArray(configuration.agents) ||
    configuration.agents.some((agent) => typeof agent !== 'string')
  ) {
    throw new KiError('agent configuration must declare a string agents array', 1)
  }
  if (new Set(configuration.agents).size !== configuration.agents.length) throw new KiError('agent configuration repeats an agent', 1)
  return configuration.agents.map((id) => {
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

export const localBootstrapSkillSource = async (harnessDirectory: string): Promise<string> => {
  const harness = await requiredPhysicalDirectory(resolve(harnessDirectory), 'local harness')
  const source = join(harness, 'skills', 'keystone', 'ki-bootstrap')
  const sourceState = await lstat(source).catch(() => undefined)
  const entry = await lstat(join(source, 'SKILL.md')).catch(() => undefined)
  if (!sourceState?.isDirectory() || sourceState.isSymbolicLink() || !entry?.isFile() || entry.isSymbolicLink()) {
    throw new KiError('local harness must contain skills/keystone/ki-bootstrap/SKILL.md', 1)
  }
  return realpath(source)
}

export const configureBootstrapAgents = async (options: {
  readonly homeDirectory: string
  readonly configurationDirectory: string
  readonly redetect?: boolean
}): Promise<BootstrapConfiguration> => {
  const path = agentsPath(options.configurationDirectory)
  const state = await lstat(options.configurationDirectory).catch(() => undefined)
  if (state && (!state.isDirectory() || state.isSymbolicLink())) throw new KiError('KI configuration directory must be a directory', 1)
  const configured = await readConfiguration(options.configurationDirectory, options.homeDirectory)
  const agents = options.redetect || !configured ? await detectAgents(options.homeDirectory) : configured
  if (!configured || options.redetect) {
    await mkdir(options.configurationDirectory, { recursive: true })
    await writeFile(path, renderConfiguration(agents), { encoding: 'utf8' })
  }
  return { agents, disposition: !configured ? 'created' : options.redetect ? 'redetected' : 'reused' }
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
  readonly redetect?: boolean
}): Promise<readonly InstalledAgent[]> => {
  const configuration = await configureBootstrapAgents(options)
  await installBootstrapSkills(await installedBootstrapSkillSource(options.dataDirectory), configuration.agents)
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
    throw new KiError(`agent ${absent?.id} is not configured; add it to ${agentsPath(options.configurationDirectory)}`, 1)
  }
  return agents as readonly InstalledAgent[]
}

export const agentSkillDirectory = (agent: InstalledAgent, scope: 'user' | 'repo', repository?: string): string => {
  const skillPath = skillCapability(agent)
  if (scope === 'user') return join(agent.home, 'skills')
  if (repository) return join(repository, skillPath)
  throw new KiError('repository scope requires a repository', 2)
}
