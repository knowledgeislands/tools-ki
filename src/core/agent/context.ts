import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { KiError } from '../errors.ts'
import type { Environment } from '../paths.ts'
import type { Runner } from '../runtime/runner.ts'
import type { AgentProcesses } from './processes.ts'

/** Cumulative authority tiers whose footers ship with the ki-delegation skill. */
export const authorityTiers = ['none', 'push', 'prune', 'release'] as const
export type AuthorityTier = (typeof authorityTiers)[number]

/** Grants that each lift one footer ban, appended after the tier footer; also shipped by ki-delegation. */
export const grantNames = ['fetch', 'machine'] as const
export type GrantName = (typeof grantNames)[number]

export interface AgentContext {
  /** The KI state root; runs live under its `agents/` directory. */
  readonly stateDirectory: string
  /** The pinned canonical harness that ships the ki-delegation run assets. */
  readonly harnessDirectory: string
  readonly workingDirectory: string
  readonly environment: Environment
  /** Command and leading arguments that start this same `ki` again. */
  readonly launcher: readonly [string, ...string[]]
  readonly processes: AgentProcesses
  /** Runs `git` and `tar`; injected so tests drive real commands against a sandbox. */
  readonly runner: Runner
  readonly now: () => number
}

export const checkName = (value: string, label: string): string => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new KiError(`invalid ${label}: '${value}'`, 2)
  return value
}

/** The directory holding every run's state folder. */
export const agentsDirectory = (context: AgentContext): string => join(context.stateDirectory, 'agents')

/** The run's state folder: runtime files only, never knowledge. */
export const runDirectory = (context: AgentContext, run: string): string =>
  join(agentsDirectory(context), checkName(run, 'run'))

/** The run's temporary root, outside every repository: `$TMPDIR/ki-agents/<run>/`. */
export const temporaryRoot = (context: AgentContext, run: string): string =>
  join(context.environment['TMPDIR'] || '/tmp', 'ki-agents', checkName(run, 'run'))

/** One agent's temporary folder, `$TMPDIR/ki-agents/<run>/<name>/`, removed when the run closes. */
export const temporaryDirectory = (context: AgentContext, run: string, name: string): string =>
  join(temporaryRoot(context, run), checkName(name, 'name'))

export const read = (path: string): Promise<string | undefined> => readFile(path, 'utf8').catch(() => undefined)

/** The run's `git`, with discovery left to `-C` so the answer follows the directory asked about. */
export const git = async (
  context: AgentContext,
  directory: string,
  arguments_: readonly string[]
): Promise<{ readonly exitCode: number; readonly output: string }> =>
  context.runner('git', ['-C', directory, ...arguments_], context.environment)

const clock = (context: AgentContext, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormatPart[] => {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      ...options,
      timeZone: context.environment.TZ || undefined
    }).formatToParts(context.now())
  } catch {
    throw new KiError(`invalid TZ: '${context.environment.TZ}'`, 2)
  }
}

/** `HH:MM <zone>`, or `YYYY-MM-DD HH:MM <zone>` with the date, in the owner's time zone, taken from `TZ` when set. */
export const localTime = (context: AgentContext, dated = false): string => {
  const parts = clock(context, {
    ...(dated ? { year: 'numeric', month: '2-digit', day: '2-digit' } : {}),
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short'
  })
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value as string
  const time = `${part('hour')}:${part('minute')} ${part('timeZoneName')}`
  return dated ? `${part('year')}-${part('month')}-${part('day')} ${time}` : time
}

/** `YYYY-MM-DDTHH:MM:SSZ`: the instant in UTC to the second, as the decisions log and close note record it. */
export const instant = (context: AgentContext): string =>
  new Date(context.now()).toISOString().replace(/\.\d{3}Z$/, 'Z')
