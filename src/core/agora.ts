import { lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { parse } from 'smol-toml'
import { REPOSITORY_CONFIGURATION_FILE } from './configuration.ts'
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
  readonly projects?: unknown
}

interface ManagedAgora {
  readonly path: string
  readonly id: string
  readonly name: string
  readonly projects: Readonly<Record<string, string>>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const agoraDirectory = (configurationDirectory: string): string => join(configurationDirectory, 'agoras')

const profileError = (path: string, message: string): KiError => new KiError(`${path} ${message}`, 2)

const profileId = (path: string): string => path.slice(path.lastIndexOf('/') + 1, -AGORA_EXTENSION.length)

const requireAgoraId = (value: string): string => {
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value))
    throw new KiError('Agora name must use lower-case letters, numbers, and hyphens', 2)
  return value
}

const profilePath = (configurationDirectory: string, id: string): string =>
  join(agoraDirectory(configurationDirectory), `${requireAgoraId(id)}${AGORA_EXTENSION}`)

const orderedProjects = (projects: Readonly<Record<string, string>>): readonly string[] =>
  Object.entries(projects)
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([, path]) => path)

const readManagedAgora = async (path: string): Promise<ManagedAgora> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state) throw new KiError(`no Agora profile at ${path}`, 2)
  if (!state.isFile() || state.isSymbolicLink()) throw profileError(path, 'must be a regular file')
  let document: AgoraDocument
  try {
    document = parse(await readFile(path, 'utf8')) as AgoraDocument
  } catch {
    throw profileError(path, 'must be valid TOML')
  }
  if (typeof document.name !== 'string' || !document.name) throw profileError(path, 'name must be a non-empty string')
  if (document.tool !== 'zed') throw profileError(path, 'tool must equal "zed"')
  if ('primary' in document) throw profileError(path, 'primary is no longer supported')
  if (document.projects === undefined) return { path, id: profileId(path), name: document.name, projects: {} }
  if (!isRecord(document.projects)) throw profileError(path, 'projects must be a table')
  const projects: Record<string, string> = {}
  for (const [name, entry] of Object.entries(document.projects)) {
    if (typeof entry !== 'string' || !entry) throw profileError(path, `project ${name} must be a non-empty path`)
    if (!isAbsolute(entry)) throw profileError(path, `project ${name} path must be absolute`)
    projects[name] = entry
  }
  if (new Set(Object.values(projects)).size !== Object.keys(projects).length)
    throw profileError(path, 'projects must not contain duplicate paths')
  return { path, id: profileId(path), name: document.name, projects }
}

const profileFromManaged = (profile: ManagedAgora): AgoraProfile => ({
  path: profile.path,
  id: profile.id,
  name: profile.name,
  tool: 'zed',
  projects: orderedProjects(profile.projects)
})

const renderManagedAgora = (profile: Omit<ManagedAgora, 'path' | 'id'>): string => {
  const entries = Object.entries(profile.projects).sort(([left], [right]) => left.localeCompare(right, 'en'))
  return [
    `name = ${JSON.stringify(profile.name)}`,
    'tool = "zed"',
    ...(entries.length
      ? ['', '[projects]', ...entries.map(([name, path]) => `${JSON.stringify(name)} = ${JSON.stringify(path)}`)]
      : []),
    ''
  ].join('\n')
}

const writeManagedAgora = async (
  profile: Omit<ManagedAgora, 'path' | 'id'> & { readonly path: string }
): Promise<void> => {
  await mkdir(agoraDirectory(resolve(profile.path, '..', '..')), { recursive: true })
  await writeFile(profile.path, renderManagedAgora(profile), 'utf8')
}

const managedAgora = (configurationDirectory: string, id: string): Promise<ManagedAgora> =>
  readManagedAgora(profilePath(configurationDirectory, id))

const physicalProject = async (value: string, workingDirectory: string): Promise<string> => {
  const path = resolve(workingDirectory, value)
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isDirectory() || state.isSymbolicLink())
    throw new KiError(`Agora project ${value} must be an existing physical directory`, 2)
  return realpath(path)
}

const projectName = (path: string): string => {
  const name = basename(path)
  // The filesystem root has no basename and is otherwise a valid physical project directory.
  if (!name) throw new KiError(`cannot derive an Agora project name from ${path}`, 2)
  return name
}

export const listAgoras = async (configurationDirectory: string): Promise<readonly AgoraProfile[]> => {
  const directory = agoraDirectory(configurationDirectory)
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => undefined)
  if (!entries) return []
  return Promise.all(
    entries
      .filter((entry) => entry.name.endsWith(AGORA_EXTENSION))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((entry) => readManagedAgora(join(directory, entry.name)).then(profileFromManaged))
  )
}

export const resolveAgora = async (
  configurationDirectory: string,
  workingDirectory: string,
  value: string
): Promise<AgoraProfile> =>
  profileFromManaged(
    await readManagedAgora(
      isAbsolute(value)
        ? resolve(value)
        : value.endsWith(AGORA_EXTENSION)
          ? resolve(workingDirectory, value)
          : profilePath(configurationDirectory, value)
    )
  )

export const createAgora = async (configurationDirectory: string, id: string): Promise<AgoraProfile> => {
  const path = profilePath(configurationDirectory, id)
  if (await lstat(path).catch(() => undefined)) throw new KiError(`Agora ${id} already exists`, 2)
  const profile = { path, name: id, projects: {} }
  await writeManagedAgora(profile)
  return profileFromManaged({ ...profile, id })
}

export const addAgoraProject = async (
  configurationDirectory: string,
  workingDirectory: string,
  id: string,
  value: string
): Promise<AgoraProfile> => {
  const profile = await managedAgora(configurationDirectory, id)
  const path = await physicalProject(value, workingDirectory)
  const name = projectName(path)
  if (Object.hasOwn(profile.projects, name)) throw new KiError(`Agora ${id} already has a project named ${name}`, 2)
  if (Object.values(profile.projects).includes(path)) throw new KiError(`Agora ${id} already has project ${path}`, 2)
  const projects = { ...profile.projects, [name]: path }
  const updated = { ...profile, projects }
  await writeManagedAgora(updated)
  return profileFromManaged(updated)
}

export const removeAgoraProject = async (
  configurationDirectory: string,
  id: string,
  name: string
): Promise<AgoraProfile> => {
  const profile = await managedAgora(configurationDirectory, id)
  if (!Object.hasOwn(profile.projects, name)) throw new KiError(`Agora ${id} has no project named ${name}`, 2)
  const projects = Object.fromEntries(Object.entries(profile.projects).filter(([project]) => project !== name))
  const updated = { ...profile, projects }
  await writeManagedAgora(updated)
  return profileFromManaged(updated)
}

const isRepository = async (directory: string): Promise<boolean> => {
  const state = await lstat(join(directory, REPOSITORY_CONFIGURATION_FILE)).catch(() => undefined)
  return Boolean(state?.isFile() && !state.isSymbolicLink())
}

const discoverProjects = async (directory: string): Promise<readonly string[]> => {
  if (await isRepository(directory)) return [directory]
  const entries = await readdir(directory, { withFileTypes: true })
  const projects: string[] = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === '.git' || !entry.isDirectory() || entry.isSymbolicLink()) continue
    projects.push(...(await discoverProjects(join(directory, entry.name))))
  }
  return projects
}

export const discoverAgoraProjects = async (
  configurationDirectory: string,
  workingDirectory: string,
  id: string,
  directory: string
): Promise<AgoraProfile> => {
  const profile = await managedAgora(configurationDirectory, id)
  const root = await physicalProject(directory, workingDirectory)
  const discovered = await discoverProjects(root)
  if (!discovered.length) throw new KiError(`Agora discovery found no KI repositories in ${root}`, 2)
  const projects = { ...profile.projects }
  for (const path of discovered) {
    const name = projectName(path)
    if (Object.hasOwn(projects, name) && projects[name] !== path)
      throw new KiError(`Agora ${id} already has a different project named ${name}`, 2)
    projects[name] = path
  }
  const updated = { ...profile, projects }
  await writeManagedAgora(updated)
  return profileFromManaged(updated)
}
