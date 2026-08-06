import { lstat, realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Fetcher } from './core/acquire.ts'
import type { Output } from './core/output.ts'
import type { Environment, KiInstallationMode, KiPaths } from './core/paths.ts'
import { resolveKiPaths, userHome } from './core/paths.ts'
import { type Runner, runCommand } from './core/runner.ts'

export interface KiContext {
  readonly stdout: Output
  readonly stderr: Output
  readonly executable: string
  readonly installation: KiInstallationMode
  readonly workingDirectory: string
  readonly environment: Environment
  readonly homeDirectory: string
  readonly paths: KiPaths
  readonly fetcher: Fetcher
  readonly runner: Runner
  /** Injectable filesystem metadata read for CLI-bound fault injection. */
  readonly lstat: typeof lstat
  /** Injectable wall clock for user-facing elapsed-time reporting. */
  readonly now: () => number
  /** Registers an interrupt observer so a live display can restore the terminal; returns its release. */
  readonly onInterrupt: (handler: () => void) => () => void
}

export interface ContextOptions {
  readonly stdout: Output
  readonly stderr: Output
  readonly executable: string
  /** Entrypoints supply their proven installation provenance; callers default to regular. */
  readonly installation?: KiInstallationMode
  readonly workingDirectory: string
  readonly environment: Environment
  readonly fetcher?: Fetcher
  readonly runner?: Runner
  readonly lstat?: typeof lstat
  readonly now?: () => number
  readonly onInterrupt?: (handler: () => void) => () => void
}

/* v8 ignore start -- Real signal delivery is a process concern; tests inject this capability at the same boundary. */
const processInterrupt = (handler: () => void): (() => void) => {
  process.on('SIGINT', handler)
  return () => {
    process.off('SIGINT', handler)
  }
}
/* v8 ignore stop */

export const createContext = async (options: ContextOptions): Promise<KiContext> => {
  const workingDirectory = await realpath(options.workingDirectory)
  const homeDirectory = await realpath(userHome(options.environment)).catch(() =>
    resolve(userHome(options.environment))
  )
  return {
    stdout: options.stdout,
    stderr: options.stderr,
    executable: options.executable,
    installation: options.installation ?? 'regular',
    workingDirectory,
    environment: options.environment,
    homeDirectory,
    paths: resolveKiPaths(options.environment),
    fetcher: options.fetcher ?? fetch,
    runner: options.runner ?? runCommand,
    lstat: options.lstat ?? lstat,
    now: options.now ?? Date.now,
    onInterrupt: options.onInterrupt ?? processInterrupt
  }
}
