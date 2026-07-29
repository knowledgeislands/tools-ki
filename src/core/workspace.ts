import { lstat, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import { KiError } from './errors.ts'

export const WORKSPACE_CONFIGURATION_FILE = '.ki-workspace.toml'

export interface WorkspaceConfiguration {
  readonly schema: 1
  readonly default: string
  readonly groups: Readonly<Record<string, readonly string[]>>
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

interface WorkspaceDocument {
  readonly schema?: unknown
  readonly default?: unknown
  readonly groups?: unknown
}

interface WorkspaceGroupDocument {
  readonly repositories?: unknown
}

const workspacePath = (directory: string): string => join(directory, WORKSPACE_CONFIGURATION_FILE)

const workspaceError = (message: string): KiError => new KiError(`.ki-workspace.toml ${message}`, 2)

const workspaceGroupName = (name: string): string => {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw workspaceError(`group name ${name} must use letters, numbers, hyphens, or underscores`)
  return name
}

const groupSelectors = (name: string, value: unknown): readonly string[] => {
  const group = value as WorkspaceGroupDocument
  if (!isRecord(value) || !Array.isArray(group.repositories) || !group.repositories.every((entry) => typeof entry === 'string' && entry)) {
    throw workspaceError(`group ${name} must declare a repositories string array`)
  }
  return group.repositories
}

const parseWorkspaceConfiguration = (contents: string): WorkspaceConfiguration => {
  let parsed: unknown
  try {
    parsed = parse(contents)
  } catch {
    throw workspaceError('must be valid TOML')
  }
  /* v8 ignore next -- a TOML document always parses to a table. */
  if (!isRecord(parsed)) throw workspaceError('must be a table')
  const document = parsed as WorkspaceDocument
  if (document.schema !== 1) throw workspaceError('schema must equal 1')
  if (typeof document.default !== 'string' || !document.default) throw workspaceError('must declare a default group')
  if (!isRecord(document.groups)) throw workspaceError('must declare named groups')
  const groups = Object.fromEntries(
    Object.entries(document.groups).map(([name, group]) => [workspaceGroupName(name), groupSelectors(name, group)])
  )
  workspaceGroupName(document.default)
  if (!Object.hasOwn(groups, document.default)) throw workspaceError(`default group ${document.default} is not declared`)
  return { schema: 1, default: document.default, groups }
}

export const readWorkspaceConfiguration = async (directory: string): Promise<WorkspaceConfiguration> => {
  const path = workspacePath(directory)
  const state = await lstat(path).catch(() => undefined)
  if (!state) throw new KiError(`no .ki-workspace.toml in ${directory}`, 2)
  if (!state.isFile() || state.isSymbolicLink()) throw workspaceError('must be a regular file')
  return parseWorkspaceConfiguration(await readFile(path, 'utf8'))
}

export const workspaceConfigurationExists = async (directory: string): Promise<boolean> => {
  const state = await lstat(workspacePath(directory)).catch(() => undefined)
  if (!state) return false
  if (!state.isFile() || state.isSymbolicLink()) throw workspaceError('must be a regular file')
  return true
}

export const workspaceGroup = async (
  directory: string,
  name?: string
): Promise<{ readonly name: string; readonly repositories: readonly string[] }> => {
  const configuration = await readWorkspaceConfiguration(directory)
  const selected = name ?? configuration.default
  const repositories = configuration.groups[selected]
  if (!repositories) throw new KiError(`workspace group ${selected} is not declared`, 2)
  return { name: selected, repositories }
}

const renderWorkspaceConfiguration = (configuration: WorkspaceConfiguration): string =>
  [
    'schema = 1',
    `default = ${JSON.stringify(configuration.default)}`,
    ...Object.entries(configuration.groups)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([name, repositories]) => ['', `[groups.${name}]`, `repositories = ${JSON.stringify(repositories)}`]),
    ''
  ].join('\n')

const writeWorkspaceConfiguration = async (directory: string, configuration: WorkspaceConfiguration): Promise<void> =>
  writeFile(workspacePath(directory), renderWorkspaceConfiguration(configuration), 'utf8')

export const initialiseWorkspaceConfiguration = async (directory: string): Promise<string> => {
  const path = workspacePath(directory)
  const state = await lstat(path).catch(() => undefined)
  if (state) throw new KiError(`.ki-workspace.toml already exists in ${directory}`, 2)
  await writeWorkspaceConfiguration(directory, { schema: 1, default: 'default', groups: { default: [] } })
  return path
}

export const addWorkspaceRepository = async (directory: string, group: string, repository: string): Promise<void> => {
  workspaceGroupName(group)
  const configuration = await readWorkspaceConfiguration(directory)
  const existing = configuration.groups[group] ?? []
  if (existing.includes(repository)) throw new KiError(`workspace group ${group} already contains ${repository}`, 2)
  await writeWorkspaceConfiguration(directory, {
    ...configuration,
    groups: { ...configuration.groups, [group]: [...existing, repository] }
  })
}

export const removeWorkspaceRepository = async (directory: string, group: string, repository: string): Promise<void> => {
  workspaceGroupName(group)
  const configuration = await readWorkspaceConfiguration(directory)
  const existing = configuration.groups[group]
  if (!existing) throw new KiError(`workspace group ${group} is not declared`, 2)
  if (!existing.includes(repository)) throw new KiError(`workspace group ${group} does not contain ${repository}`, 2)
  await writeWorkspaceConfiguration(directory, {
    ...configuration,
    groups: { ...configuration.groups, [group]: existing.filter((entry) => entry !== repository) }
  })
}
