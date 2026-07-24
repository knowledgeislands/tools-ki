import { lstat, realpath } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { KiError } from './errors.ts'

const CONFIGURATION_FILE = '.ki-config.toml'

export interface RepositoryLocation {
  readonly root: string
  readonly configuration: string
}

const isConfigurationFile = async (path: string): Promise<boolean> => {
  const state = await lstat(path).catch(() => undefined)
  return Boolean(state?.isFile() && !state.isSymbolicLink())
}

const physicalDirectory = async (path: string, error: string): Promise<string> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isDirectory() || state.isSymbolicLink()) throw new KiError(error, 2)
  return realpath(path)
}

const isBoundary = (directory: string, homeDirectory: string): boolean => directory === homeDirectory || directory === dirname(directory)

export const discoverRepository = async (workingDirectory: string, homeDirectory: string): Promise<RepositoryLocation | null> => {
  const home = await realpath(homeDirectory).catch(() => resolve(homeDirectory))
  let candidate = await realpath(workingDirectory)
  while (!isBoundary(candidate, home)) {
    const configuration = join(candidate, CONFIGURATION_FILE)
    if (await isConfigurationFile(configuration)) return { root: candidate, configuration }
    candidate = dirname(candidate)
  }
  return null
}

export const resolveRepository = async (options: {
  readonly repository?: string
  readonly workingDirectory: string
  readonly homeDirectory: string
}): Promise<RepositoryLocation> => {
  if (!options.repository) {
    const discovered = await discoverRepository(options.workingDirectory, options.homeDirectory)
    if (discovered) return discovered
    throw new KiError('no KI repository found from the current working directory', 2)
  }
  const root = await physicalDirectory(options.repository, '--repo must be an existing directory')
  const configuration = join(root, CONFIGURATION_FILE)
  if (!(await isConfigurationFile(configuration))) throw new KiError('--repo must name a repository containing .ki-config.toml', 2)
  return { root, configuration }
}
