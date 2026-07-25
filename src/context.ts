import { realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Output } from './core/output.ts'
import type { Environment, KiInstallationMode, KiPaths } from './core/paths.ts'
import { installationMode, resolveKiPaths, userHome } from './core/paths.ts'
import { discoverRepository, type RepositoryLocation } from './core/repository.ts'

export interface KiContext {
  readonly stdout: Output
  readonly stderr: Output
  readonly executable: string
  readonly installation: KiInstallationMode
  readonly workingDirectory: string
  readonly homeDirectory: string
  readonly paths: KiPaths
  readonly repository: RepositoryLocation | null
}

export interface ContextOptions {
  readonly stdout: Output
  readonly stderr: Output
  readonly executable: string
  readonly workingDirectory: string
  readonly environment: Environment
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
    homeDirectory,
    paths: resolveKiPaths(options.environment),
    repository: await discoverRepository(workingDirectory, homeDirectory)
  }
}
