import { lstat, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { KiError } from '../core/errors.ts'
import type { AgentDescriptor } from './shared/types.ts'
import { chatgptCodex, claudeCode } from './vendors/index.ts'

export const agentDescriptors = [claudeCode, chatgptCodex] as const satisfies readonly AgentDescriptor[]

export interface InstalledAgent {
  readonly descriptor: AgentDescriptor
  readonly home: string
}

export interface BootstrapConfiguration {
  readonly agents: readonly InstalledAgent[]
  readonly disposition: 'created' | 'refreshed' | 'reused'
}

export interface ManagedUserSkill {
  readonly name: string
  readonly source: string
}

export interface StringListSection {
  readonly ids?: unknown
}

export interface HarnessSection {
  readonly ids?: unknown
  readonly releases?: unknown
}

export interface LocalSourceSection {
  readonly path?: unknown
}

export interface LocalDevelopmentConfiguration {
  readonly harness: string
  readonly path: string
}

/** A `[locals]` table of harness `owner/name` identities to remembered checkout paths, sorted by harness. */
export const inspectLocalsTable = (
  value: unknown,
  errors: string[],
  warnings: string[]
): LocalDevelopmentConfiguration[] => {
  if (value === undefined) return []
  if (!isRecord(value)) {
    errors.push('locals must be a TOML table')
    return []
  }
  const locals: LocalDevelopmentConfiguration[] = []
  for (const [harness, entry] of Object.entries(value)) {
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(harness)) {
      errors.push(`locals.${harness} must name a harness owner/name identifier`)
      continue
    }
    if (!isRecord(entry)) errors.push(`locals.${harness} must be a TOML table`)
    const source: LocalSourceSection = isRecord(entry) ? entry : {}
    for (const key of Object.keys(source)) {
      if (key !== 'path') warnings.push(`locals.${harness} has unrecognised key ${key}`)
    }
    if (typeof source.path !== 'string' || !source.path) {
      errors.push(`locals.${harness}.path must be a non-empty string`)
      continue
    }
    locals.push({ harness, path: source.path })
  }
  return locals.toSorted((left, right) => left.harness.localeCompare(right.harness))
}

export interface RepositoriesSection {
  readonly paths?: unknown
}

export interface UserConfigurationInspection {
  readonly path: string
  readonly state: 'missing' | 'valid' | 'invalid'
  readonly agents: readonly string[]
  readonly harnesses: readonly string[]
  readonly skills: readonly string[]
  /** `config.toml` `[locals]` entries, read only as one-time migration input to the host-local file. */
  readonly legacyLocals: readonly LocalDevelopmentConfiguration[]
  readonly repositories: readonly string[]
  readonly warnings: readonly string[]
  readonly errors: readonly string[]
  readonly legacySchema?: boolean
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const physicalDirectory = async (path: string): Promise<boolean> => {
  const state = await lstat(path).catch(() => undefined)
  return Boolean(state?.isDirectory() && !state.isSymbolicLink())
}

export const requiredPhysicalDirectory = async (path: string, description: string): Promise<string> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isDirectory() || state.isSymbolicLink()) throw new KiError(`${description} must be a directory`, 1)
  return realpath(path)
}

export const descriptor = (id: string): AgentDescriptor => {
  const value = agentDescriptors.find((candidate) => candidate.id === id)
  if (!value) throw new KiError(`unknown agent ${id}; use claude-code or chatgpt-codex`, 2)
  return value
}

export const skillCapability = (agent: InstalledAgent): string => {
  // Every current static descriptor declares its skill path; this guards a future descriptor addition.
  /* v8 ignore next */
  if (!agent.descriptor.paths.skills) throw new KiError(`agent ${agent.descriptor.id} has no skill path`, 1)
  return agent.descriptor.paths.skills
}

export const bootstrapConfigurationPath = (configurationDirectory: string): string =>
  join(configurationDirectory, 'config.toml')
