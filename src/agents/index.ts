import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
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

const agentsPath = (stateDirectory: string): string => join(stateDirectory, 'agents.toml')

const renderInventory = (agents: readonly InstalledAgent[]): string =>
  ['schema = 1', ...agents.flatMap((agent) => ['', `[agents.${agent.descriptor.id}]`, `home = ${JSON.stringify(agent.home)}`]), ''].join(
    '\n'
  )

const readInventory = async (stateDirectory: string, homeDirectory: string): Promise<readonly InstalledAgent[] | undefined> => {
  const path = agentsPath(stateDirectory)
  const state = await lstat(path).catch(() => undefined)
  if (!state) return undefined
  if (!state.isFile() || state.isSymbolicLink()) throw new KiError('agent inventory must be a regular file', 1)
  let parsed: unknown
  try {
    parsed = parse(await readFile(path, 'utf8'))
  } catch {
    throw new KiError('agent inventory must be valid TOML', 1)
  }
  if (!isRecord(parsed)) throw new KiError('agent inventory must use schema 1', 1)
  const inventory = parsed as { schema?: unknown; agents?: unknown }
  if (inventory.schema !== 1 || !isRecord(inventory.agents)) throw new KiError('agent inventory must use schema 1', 1)
  return Object.entries(inventory.agents).map(([id, record]) => {
    if (!isRecord(record)) throw new KiError(`agent inventory ${id} must declare home`, 1)
    const entry = record as { home?: unknown }
    if (typeof entry.home !== 'string') throw new KiError(`agent inventory ${id} must declare home`, 1)
    const known = descriptor(id)
    const expected = resolve(homeDirectory, known.home)
    if (resolve(entry.home) !== expected) throw new KiError(`agent inventory ${id} has an unexpected home`, 1)
    return { descriptor: known, home: expected }
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

const writeInventory = async (stateDirectory: string, agents: readonly InstalledAgent[]): Promise<void> => {
  const state = await lstat(stateDirectory).catch(() => undefined)
  if (state && (!state.isDirectory() || state.isSymbolicLink())) throw new KiError('KI state directory must be a directory', 1)
  await mkdir(stateDirectory, { recursive: true })
  const path = agentsPath(stateDirectory)
  const temporary = join(dirname(path), `.agents.${randomUUID()}.toml.tmp`)
  try {
    await writeFile(temporary, renderInventory(agents), { encoding: 'utf8', flag: 'wx' })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

export const installedAgents = async (options: {
  readonly homeDirectory: string
  readonly stateDirectory: string
  readonly refresh?: boolean
  readonly selected?: readonly string[]
}): Promise<readonly InstalledAgent[]> => {
  const cached = options.refresh ? undefined : await readInventory(options.stateDirectory, options.homeDirectory)
  const available = cached ?? (await detectAgents(options.homeDirectory))
  if (!cached) await writeInventory(options.stateDirectory, available)
  const selected = options.selected?.length ? options.selected.map(descriptor) : available.map((agent) => agent.descriptor)
  const byId = new Map(available.map((agent) => [agent.descriptor.id, agent]))
  const agents = selected.map((candidate) => byId.get(candidate.id))
  if (agents.some((agent) => !agent)) {
    const absent = selected.find((candidate) => !byId.has(candidate.id))
    throw new KiError(`agent ${absent?.id} is not installed; refresh detection or select an installed agent`, 1)
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
