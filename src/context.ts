import { realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Fetcher } from './core/acquire.ts'
import type { Output } from './core/output.ts'
import type { Environment, KiInstallationMode, KiPaths } from './core/paths.ts'
import { installationMode, resolveKiPaths, userHome } from './core/paths.ts'
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
  /** Injectable wall clock for user-facing elapsed-time reporting. */
  readonly now: () => number
}

export interface ContextOptions {
  readonly stdout: Output
  readonly stderr: Output
  readonly executable: string
  readonly workingDirectory: string
  readonly environment: Environment
  readonly fetcher?: Fetcher
  readonly runner?: Runner
  readonly now?: () => number
}

export const createContext = async (options: ContextOptions): Promise<KiContext> => {
  const workingDirectory = await realpath(options.workingDirectory)
  const homeDirectory = await realpath(userHome(options.environment)).catch(() => resolve(userHome(options.environment)))
  return {
    stdout: options.stdout,
    stderr: options.stderr,
    executable: options.executable,
    installation: await installationMode(options.executable, workingDirectory),
    workingDirectory,
    environment: options.environment,
    homeDirectory,
    paths: resolveKiPaths(options.environment),
    fetcher: options.fetcher ?? fetch,
    runner: options.runner ?? runCommand,
    now: options.now ?? Date.now
  }
}
