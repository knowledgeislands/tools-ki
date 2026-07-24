import { lstat } from 'node:fs/promises'
import { resolve } from 'node:path'

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

export const resolveKiPaths = (environment: Environment): KiPaths => ({
  data: resolve(xdg(environment, 'XDG_DATA_HOME', '.local/share'), 'ki'),
  config: resolve(xdg(environment, 'XDG_CONFIG_HOME', '.config'), 'ki'),
  cache: resolve(xdg(environment, 'XDG_CACHE_HOME', '.cache'), 'ki'),
  state: resolve(xdg(environment, 'XDG_STATE_HOME', '.local/state'), 'ki')
})

export const installationMode = async (
  executable: string,
  workingDirectory: string
): Promise<'regular executable' | 'linked development checkout'> => {
  const executablePath = resolve(workingDirectory, executable)
  const state = await lstat(executablePath).catch(() => undefined)
  return state?.isSymbolicLink() ? 'linked development checkout' : 'regular executable'
}
