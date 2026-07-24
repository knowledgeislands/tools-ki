import { lstat } from 'node:fs/promises'
import { resolve } from 'node:path'

export interface KiPaths {
  readonly data: string
  readonly config: string
  readonly cache: string
  readonly state: string
}

const environment = process.env as NodeJS.ProcessEnv & { HOME?: string; USERPROFILE?: string }

const userHome = (): string => environment.HOME ?? environment.USERPROFILE ?? ''

const xdg = (name: string, fallback: string): string => process.env[name] || resolve(userHome(), fallback)

export const resolveKiPaths = (): KiPaths => ({
  data: resolve(xdg('XDG_DATA_HOME', '.local/share'), 'ki'),
  config: resolve(xdg('XDG_CONFIG_HOME', '.config'), 'ki'),
  cache: resolve(xdg('XDG_CACHE_HOME', '.cache'), 'ki'),
  state: resolve(xdg('XDG_STATE_HOME', '.local/state'), 'ki')
})

export const installationMode = async (executable: string): Promise<'regular executable' | 'linked development checkout'> => {
  const executablePath = resolve(process.cwd(), executable)
  const state = await lstat(executablePath).catch(() => undefined)
  return state?.isSymbolicLink() ? 'linked development checkout' : 'regular executable'
}
