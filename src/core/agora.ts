import { lstat, readdir, readFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { parse } from 'smol-toml'
import { KiError } from './errors.ts'
export const AGORA_EXTENSION = '.ki-agora'
export interface AgoraProfile {
  readonly path: string
  readonly id: string
  readonly name: string
  readonly tool: 'zed'
  readonly projects: readonly string[]
}
interface AgoraDocument {
  readonly name?: unknown
  readonly tool?: unknown
  readonly primary?: unknown
  readonly projects?: unknown
}
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
export const agoraDirectory = (configurationDirectory: string): string => join(configurationDirectory, 'agoras')
const profileError = (path: string, message: string): KiError => new KiError(`${path} ${message}`, 2)
const profileId = (path: string): string => path.slice(path.lastIndexOf('/') + 1, -AGORA_EXTENSION.length)
const readProfile = async (path: string): Promise<AgoraProfile> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state) throw new KiError(`no Agora profile at ${path}`, 2)
  if (!state.isFile()) throw profileError(path, 'must be a regular file')
  let document: AgoraDocument
  try {
    document = parse(await readFile(path, 'utf8')) as AgoraDocument
  } catch {
    throw profileError(path, 'must be valid TOML')
  }
  if (typeof document.name !== 'string' || !document.name) throw profileError(path, 'name must be a non-empty string')
  if (document.tool !== 'zed') throw profileError(path, 'tool must equal "zed"')
  if (document.projects === undefined) return { path, id: profileId(path), name: document.name, tool: 'zed', projects: [] }
  if (!isRecord(document.projects)) throw profileError(path, 'projects must be a table')
  if (typeof document.primary !== 'string' || !document.primary) throw profileError(path, 'primary must name one project')
  const projectPaths = Object.entries(document.projects)
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([name, entry]) => {
      if (typeof entry !== 'string' || !entry) throw profileError(path, `project ${name} must be a non-empty path`)
      if (!isAbsolute(entry)) throw profileError(path, `project ${name} path must be absolute`)
      return [name, entry] as const
    })
  const primary = projectPaths.find(([name]) => name === document.primary)?.[1]
  if (!primary) throw profileError(path, `primary ${document.primary} is not declared in projects`)
  const projects = [primary, ...projectPaths.filter(([name]) => name !== document.primary).map(([, project]) => project)]
  if (new Set(projects).size !== projects.length) throw profileError(path, 'projects must not contain duplicate paths')
  return { path, id: profileId(path), name: document.name, tool: 'zed', projects }
}
export const listAgoras = async (configurationDirectory: string): Promise<readonly AgoraProfile[]> => {
  const directory = agoraDirectory(configurationDirectory)
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => undefined)
  if (!entries) return []
  return Promise.all(
    entries
      .filter((entry) => entry.name.endsWith(AGORA_EXTENSION))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((entry) => readProfile(join(directory, entry.name)))
  )
}
export const resolveAgora = async (configurationDirectory: string, workingDirectory: string, value: string): Promise<AgoraProfile> =>
  readProfile(
    isAbsolute(value)
      ? resolve(value)
      : value.endsWith(AGORA_EXTENSION)
        ? resolve(workingDirectory, value)
        : join(agoraDirectory(configurationDirectory), `${value}${AGORA_EXTENSION}`)
  )
