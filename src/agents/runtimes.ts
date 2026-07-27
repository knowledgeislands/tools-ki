import { readFile } from 'node:fs/promises'
import { parse } from 'smol-toml'
import { KiError } from '../core/errors.ts'
import { type SupportedRuntime, supportedRuntimes } from '../core/harness.ts'
import { type InstalledAgent, isRecord } from './internal.ts'

const agentRuntimes = {
  'claude-code': 'claude-code',
  'chatgpt-codex': 'codex'
} as const satisfies Record<string, SupportedRuntime>

const repositoryRuntimeSet = (value: unknown): readonly SupportedRuntime[] => {
  if (!Array.isArray(value) || value.length === 0 || value.some((runtime) => typeof runtime !== 'string')) {
    throw new KiError('[ki-repo].supported_runtimes must be a non-empty array of runtime identifiers', 1)
  }
  const runtimes = value as string[]
  if (runtimes.some((runtime) => !supportedRuntimes.includes(runtime as SupportedRuntime))) {
    throw new KiError('[ki-repo].supported_runtimes may contain only claude-code or codex', 1)
  }
  if (new Set(runtimes).size !== runtimes.length) throw new KiError('[ki-repo].supported_runtimes repeats a runtime', 1)
  return runtimes as readonly SupportedRuntime[]
}

export const runtimeForAgent = (agent: InstalledAgent): SupportedRuntime => agentRuntimes[agent.descriptor.id as keyof typeof agentRuntimes]

export const compatibleWithSkill = (agent: InstalledAgent, skillRuntimes: readonly SupportedRuntime[] | undefined): boolean =>
  skillRuntimes === undefined || skillRuntimes.includes(runtimeForAgent(agent))

export const repositorySupportedRuntimes = async (configuration: string): Promise<readonly SupportedRuntime[]> => {
  let parsed: unknown
  try {
    parsed = parse(await readFile(configuration, 'utf8'))
  } catch {
    throw new KiError('.ki-config.toml must be valid TOML', 1)
  }
  const repository = isRecord(parsed) && isRecord(parsed['ki-repo']) ? parsed['ki-repo'] : undefined
  if (!repository || !Object.hasOwn(repository, 'supported_runtimes')) {
    throw new KiError('[ki-repo].supported_runtimes must declare the repository runtime set', 1)
  }
  const { supported_runtimes: runtimes } = repository
  return repositoryRuntimeSet(runtimes)
}
