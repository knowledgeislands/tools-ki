import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parse } from 'smol-toml'
import { KiError } from '../core/errors.ts'

export const agentDescriptors = [
  { id: 'claude-code', home: '.claude', skills: join('.claude', 'skills') },
  { id: 'chatgpt-codex', home: '.agents', skills: join('.agents', 'skills') }
] as const

export type AgentId = (typeof agentDescriptors)[number]['id']
export type AgentDescriptor = (typeof agentDescriptors)[number]

export interface InstalledAgent {
  readonly descriptor: AgentDescriptor
  readonly home: string
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const physicalDirectory = async (path: string): Promise<boolean> => {
  const state = await lstat(path).catch(() => undefined)
  return Boolean(state?.isDirectory() && !state.isSymbolicLink())
}

const descriptor = (id: string): AgentDescriptor => {
  const value = agentDescriptors.find((candidate) => candidate.id === id)
  if (!value) throw new KiError(`unknown agent ${id}; use claude-code or chatgpt-codex`, 2)
  return value
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
    return { descriptor: known, home: resolve(homeDirectory, known.home) }
  })
}

const detectAgents = async (homeDirectory: string): Promise<readonly InstalledAgent[]> =>
  (
    await Promise.all(
      agentDescriptors.map(async (candidate) => {
        const home = resolve(homeDirectory, candidate.home)
        return (await physicalDirectory(home)) ? { descriptor: candidate, home } : undefined
      })
    )
  ).filter((agent): agent is InstalledAgent => agent !== undefined)

export const bootstrapAgents = async (options: {
  readonly homeDirectory: string
  readonly configurationDirectory: string
}): Promise<readonly InstalledAgent[]> => {
  const path = agentsPath(options.configurationDirectory)
  if (await lstat(path).catch(() => undefined)) throw new KiError('KI environment is already bootstrapped', 1)
  const state = await lstat(options.configurationDirectory).catch(() => undefined)
  if (state && (!state.isDirectory() || state.isSymbolicLink())) throw new KiError('KI configuration directory must be a directory', 1)
  const agents = await detectAgents(options.homeDirectory)
  await mkdir(options.configurationDirectory, { recursive: true })
  await writeFile(path, renderConfiguration(agents), { encoding: 'utf8', flag: 'wx' })
  return agents
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

export const agentSkillDirectory = (agent: InstalledAgent, scope: 'user' | 'repo', repository?: string): string =>
  scope === 'user'
    ? join(agent.home, 'skills')
    : repository
      ? join(repository, agent.descriptor.skills)
      : (() => {
          throw new KiError('repository scope requires a repository', 2)
        })()
