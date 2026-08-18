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

export interface RepositoriesSection {
  readonly paths?: unknown
}

export interface UserConfigurationInspection {
  readonly path: string
  readonly state: 'missing' | 'valid' | 'invalid'
  readonly agents: readonly string[]
  readonly harnesses: readonly string[]
  readonly skills: readonly string[]
  readonly locals: readonly LocalDevelopmentConfiguration[]
  readonly repositories: readonly string[]
  readonly warnings: readonly string[]
  readonly errors: readonly string[]
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
