import { lstat } from 'node:fs/promises'
import { resolve } from 'node:path'

export type KiInstallationMode = 'regular' | 'local'

export interface KiPaths {
  readonly data: string
  readonly config: string
  readonly cache: string
  readonly state: string
}

export type Environment = NodeJS.ProcessEnv & { HOME?: string; USERPROFILE?: string }

export const userHome = (environment: Environment): string => environment.HOME ?? environment.USERPROFILE ?? ''

const xdg = (environment: Environment, name: string, fallback: string): string =>
  environment[name] || resolve(userHome(environment), fallback)

const kiPath = (environment: Environment, kiName: string, xdgName: string, fallback: string): string =>
  environment[kiName] || resolve(xdg(environment, xdgName, fallback), 'ki')

export const resolveKiPaths = (environment: Environment): KiPaths => ({
  data: kiPath(environment, 'KI_DATA_HOME', 'XDG_DATA_HOME', '.local/share'),
  config: kiPath(environment, 'KI_CONFIG_HOME', 'XDG_CONFIG_HOME', '.config'),
  cache: kiPath(environment, 'KI_CACHE_HOME', 'XDG_CACHE_HOME', '.cache'),
  state: kiPath(environment, 'KI_STATE_HOME', 'XDG_STATE_HOME', '.local/state')
})

export const installationMode = async (
  executable: string,
  workingDirectory: string
): Promise<KiInstallationMode> => {
  const executablePath = resolve(workingDirectory, executable)
  const state = await lstat(executablePath).catch(() => undefined)
  return state?.isSymbolicLink() ? 'local' : 'regular'
}
