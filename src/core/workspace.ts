import { lstat, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parse } from 'smol-toml'
import { REPOSITORY_CONFIGURATION_FILE } from './configuration.ts'
import { KiError } from './errors.ts'

export const WORKSPACE_CONFIGURATION_FILE = '.ki-workspace.toml'

export type WorkspaceMemberType = 'repository' | 'workspace'

export interface WorkspaceMember {
  readonly type: WorkspaceMemberType
  readonly path: string
}

export interface WorkspaceConfiguration {
  readonly schema: 1
  readonly default: string
  readonly groups: Readonly<Record<string, readonly WorkspaceMember[]>>
}

export interface ResolvedWorkspaceRepository {
  readonly root: string
  readonly configuration: string
  readonly path: string
  readonly origin: 'direct' | 'nested'
}

export interface ResolvedWorkspaceGroup {
  readonly name: string
  readonly members: readonly WorkspaceMember[]
  readonly repositories: readonly ResolvedWorkspaceRepository[]
}

interface WorkspaceDocument {
  readonly schema?: unknown
  readonly default?: unknown
  readonly groups?: unknown
}

interface WorkspaceGroupDocument {
  readonly members?: unknown
  readonly repositories?: unknown
}

interface WorkspaceMemberDocument {
  readonly type?: unknown
  readonly path?: unknown
}

interface RegistrationContainer {
  readonly directory: string
  readonly configuration: WorkspaceConfiguration
}

interface RegistrationNode {
  readonly type: WorkspaceMemberType
  readonly path: string
  readonly repositories: number
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const workspacePath = (directory: string): string => join(directory, WORKSPACE_CONFIGURATION_FILE)

const workspaceError = (directory: string, message: string): KiError => new KiError(`${workspacePath(directory)} ${message}`, 2)

const workspaceGroupName = (directory: string, name: string): string => {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw workspaceError(directory, `group name ${name} must use letters, numbers, hyphens, or underscores`)
  return name
}

const memberPath = (directory: string, group: string, value: unknown): string => {
  if (typeof value !== 'string' || !value) throw workspaceError(directory, `group ${group} member path must be a non-empty string`)
  if (isAbsolute(value)) throw workspaceError(directory, `group ${group} member path ${value} must be relative`)
  return value
}

const groupMembers = (directory: string, name: string, value: unknown): readonly WorkspaceMember[] => {
  const group = value as WorkspaceGroupDocument
  if (isRecord(value) && Object.hasOwn(group, 'repositories')) throw workspaceError(directory, `group ${name} must not declare repositories; use typed members`)
  if (!isRecord(value) || !Array.isArray(group.members)) throw workspaceError(directory, `group ${name} must declare a members array`)
  return group.members.map((entry) => {
    const member = entry as WorkspaceMemberDocument
    if (!isRecord(entry)) throw workspaceError(directory, `group ${name} members must be tables`)
    if (member.type !== 'repository' && member.type !== 'workspace') throw workspaceError(directory, `group ${name} member has unsupported type`)
    const path = memberPath(directory, name, member.path)
    if (member.type === 'workspace' && hasPattern(path)) throw workspaceError(directory, `group ${name} workspace member ${path} must not use a pattern`)
    return { type: member.type, path }
  })
}

const parseWorkspaceConfiguration = (contents: string, directory: string): WorkspaceConfiguration => {
  let parsed: unknown
  try {
    parsed = parse(contents)
  } catch {
    throw workspaceError(directory, 'must be valid TOML')
  }
  /* v8 ignore next -- a TOML document always parses to a table. */
  if (!isRecord(parsed)) throw workspaceError(directory, 'must be a table')
  const document = parsed as WorkspaceDocument
  if (document.schema !== 1) throw workspaceError(directory, 'schema must equal 1')
  if (typeof document.default !== 'string' || !document.default) throw workspaceError(directory, 'must declare a default group')
  if (!isRecord(document.groups)) throw workspaceError(directory, 'must declare named groups')
  const groups = Object.fromEntries(
    Object.entries(document.groups).map(([name, group]) => [workspaceGroupName(directory, name), groupMembers(directory, name, group)])
  )
  workspaceGroupName(directory, document.default)
  if (!Object.hasOwn(groups, document.default)) throw workspaceError(directory, `default group ${document.default} is not declared`)
  return { schema: 1, default: document.default, groups }
}

export const readWorkspaceConfiguration = async (directory: string): Promise<WorkspaceConfiguration> => {
  const path = workspacePath(directory)
  const state = await lstat(path).catch(() => undefined)
  if (!state) throw new KiError(`no ${WORKSPACE_CONFIGURATION_FILE} in ${directory}`, 2)
  if (!state.isFile() || state.isSymbolicLink()) throw workspaceError(directory, 'must be a regular file')
  return parseWorkspaceConfiguration(await readFile(path, 'utf8'), directory)
}

export const workspaceConfigurationExists = async (directory: string): Promise<boolean> => {
  const state = await lstat(workspacePath(directory)).catch(() => undefined)
  if (!state) return false
  if (!state.isFile() || state.isSymbolicLink()) throw workspaceError(directory, 'must be a regular file')
  return true
}

export const workspaceGroup = async (directory: string, name?: string): Promise<{ readonly name: string; readonly members: readonly WorkspaceMember[] }> => {
  const configuration = await readWorkspaceConfiguration(directory)
  const selected = name ?? configuration.default
  const members = configuration.groups[selected]
  if (!members) throw new KiError(`workspace group ${selected} is not declared`, 2)
  return { name: selected, members }
}

const renderMember = (member: WorkspaceMember): string => `{ type = ${JSON.stringify(member.type)}, path = ${JSON.stringify(member.path)} }`

const renderWorkspaceConfiguration = (configuration: WorkspaceConfiguration): string =>
  [
    'schema = 1',
    `default = ${JSON.stringify(configuration.default)}`,
    ...Object.entries(configuration.groups)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([name, members]) => ['', `[groups.${name}]`, `members = [${members.map(renderMember).join(', ')}]`]),
    ''
  ].join('\n')

const writeWorkspaceConfiguration = async (directory: string, configuration: WorkspaceConfiguration): Promise<void> =>
  writeFile(workspacePath(directory), renderWorkspaceConfiguration(configuration), 'utf8')

export const initialiseWorkspaceConfiguration = async (directory: string): Promise<string> => {
  const physical = await realpath(directory)
  const path = workspacePath(physical)
  const state = await lstat(path).catch(() => undefined)
  if (state) throw new KiError(`${WORKSPACE_CONFIGURATION_FILE} already exists in ${physical}`, 2)
  await writeWorkspaceConfiguration(physical, { schema: 1, default: 'default', groups: { default: [] } })
  return path
}

export const addWorkspaceRepository = async (directory: string, group: string, repository: string): Promise<void> => {
  workspaceGroupName(directory, group)
  memberPath(directory, group, repository)
  const configuration = await readWorkspaceConfiguration(directory)
  const existing = configuration.groups[group] ?? []
  if (existing.some((member) => member.type === 'repository' && member.path === repository))
    throw new KiError(`workspace group ${group} already contains repository ${repository}`, 2)
  await writeWorkspaceConfiguration(directory, {
    ...configuration,
    groups: { ...configuration.groups, [group]: [...existing, { type: 'repository', path: repository }] }
  })
}

export const removeWorkspaceRepository = async (directory: string, group: string, repository: string): Promise<void> => {
  workspaceGroupName(directory, group)
  const configuration = await readWorkspaceConfiguration(directory)
  const existing = configuration.groups[group]
  if (!existing) throw new KiError(`workspace group ${group} is not declared`, 2)
  if (!existing.some((member) => member.type === 'repository' && member.path === repository))
    throw new KiError(`workspace group ${group} does not contain repository ${repository}`, 2)
  await writeWorkspaceConfiguration(directory, {
    ...configuration,
    groups: {
      ...configuration.groups,
      [group]: existing.filter((member) => member.type !== 'repository' || member.path !== repository)
    }
  })
}

const isRegularRepository = async (directory: string): Promise<boolean> => {
  const state = await lstat(join(directory, REPOSITORY_CONFIGURATION_FILE)).catch(() => undefined)
  return Boolean(state?.isFile() && !state.isSymbolicLink())
}

const preflightRegistration = async (directory: string, containers: RegistrationContainer[]): Promise<RegistrationNode> => {
  if (await isRegularRepository(directory)) return { type: 'repository', path: directory, repositories: 1 }

  const existing = await lstat(workspacePath(directory)).catch(() => undefined)
  let configuration: WorkspaceConfiguration = { schema: 1, default: 'default', groups: { default: [] } }
  if (existing) {
    if (!existing.isFile() || existing.isSymbolicLink()) throw workspaceError(directory, 'must be a regular file')
    configuration = parseWorkspaceConfiguration(await readFile(workspacePath(directory), 'utf8'), directory)
  }

  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.name !== '.git' && entry.isDirectory() && !entry.isSymbolicLink())
    .sort((left, right) => left.name.localeCompare(right.name))
  const children: WorkspaceMember[] = []
  let repositories = 0
  for (const entry of entries) {
    const child = await preflightRegistration(join(directory, entry.name), containers)
    children.push({ type: child.type, path: entry.name })
    repositories += child.repositories
  }
  containers.push({
    directory,
    configuration: {
      ...configuration,
      groups: { ...configuration.groups, [configuration.default]: children }
    }
  })
  return {
    type: 'workspace',
    path: directory,
    repositories
  }
}

export const registerWorkspace = async (directory: string): Promise<{ readonly path: string; readonly workspaces: number; readonly repositories: number }> => {
  const physical = await realpath(directory)
  if (await isRegularRepository(physical)) throw new KiError(`cannot register a workspace inside repository leaf ${physical}`, 2)
  const containers: RegistrationContainer[] = []
  const root = await preflightRegistration(physical, containers)
  for (const container of containers) await writeWorkspaceConfiguration(container.directory, container.configuration)
  return { path: workspacePath(physical), workspaces: containers.length, repositories: root.repositories }
}

const hasPattern = (value: string): boolean => /[*?]/.test(value)

const globExpression = (value: string): RegExp => {
  let expression = '^'
  for (let index = 0; index < value.length; index += 1) {
    const character = value.charAt(index)
    if (character === '*') {
      if (value[index + 1] === '*') {
        expression += '.*'
        index += 1
      } else expression += `[^${sep}]*`
    } else if (character === '?') expression += `[^${sep}]`
    else expression += character.replace(/[|\\{}()[\]^$+*.]/g, '\\$&')
  }
  return new RegExp(`${expression}$`)
}

const inside = (root: string, target: string): boolean => {
  const path = relative(root, target)
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`))
}

const physicalContainedDirectory = async (root: string, value: string, description: string): Promise<string> => {
  const candidate = resolve(root, value)
  if (!inside(root, candidate)) throw new KiError(`${description} escapes workspace ${root}`, 2)
  const path = relative(root, candidate)
  let current = root
  for (const part of path ? path.split(sep) : []) {
    current = join(current, part)
    const state = await lstat(current).catch(() => undefined)
    if (!state?.isDirectory() || state.isSymbolicLink()) throw new KiError(`${description} must be an existing physical directory`, 2)
  }
  const physical = await realpath(candidate)
  // Every path component was lstat-ed above, so only a concurrent replacement can make realpath escape.
  /* v8 ignore next */
  if (!inside(root, physical)) throw new KiError(`${description} escapes workspace ${root}`, 2)
  return physical
}

const patternBase = (value: string): string => {
  const wildcard = value.search(/[*?]/)
  const prefix = value.slice(0, wildcard)
  const separator = prefix.lastIndexOf(sep)
  return separator === -1 ? '.' : prefix.slice(0, separator)
}

const walkDirectories = async (directory: string): Promise<readonly string[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  const directories: string[] = [directory]
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    directories.push(...(await walkDirectories(join(directory, entry.name))))
  }
  return directories
}

const repositoryTarget = async (selectingRoot: string, declaringWorkspace: string, value: string, group: string): Promise<readonly string[]> => {
  const description = `workspace group ${group} repository ${value}`
  if (!hasPattern(value)) return [await physicalContainedDirectory(selectingRoot, relative(selectingRoot, resolve(declaringWorkspace, value)), description)]
  const base = await physicalContainedDirectory(
    selectingRoot,
    relative(selectingRoot, resolve(declaringWorkspace, patternBase(value))),
    `${description} pattern base`
  )
  const expression = globExpression(resolve(declaringWorkspace, value))
  const matches = (await walkDirectories(base)).filter((directory) => expression.test(directory))
  if (!matches.length) throw new KiError(`${description} matched no repositories`, 2)
  return matches
}

const repositoryLocation = async (selectingRoot: string, root: string, group: string, nested: boolean): Promise<ResolvedWorkspaceRepository> => {
  const configuration = join(root, REPOSITORY_CONFIGURATION_FILE)
  const state = await lstat(configuration).catch(() => undefined)
  if (!state?.isFile() || state.isSymbolicLink())
    throw new KiError(`workspace group ${group} repository ${relative(selectingRoot, root) || '.'} must contain a regular ${REPOSITORY_CONFIGURATION_FILE}`, 2)
  return {
    root,
    configuration,
    path: (relative(selectingRoot, root) || '.').split(sep).join('/'),
    origin: nested ? 'nested' : 'direct'
  }
}

const expandMembers = async (options: {
  readonly selectingRoot: string
  readonly declaringWorkspace: string
  readonly group: string
  readonly members: readonly WorkspaceMember[]
  readonly nested: boolean
  readonly stack: readonly string[]
}): Promise<readonly ResolvedWorkspaceRepository[]> => {
  const repositories: ResolvedWorkspaceRepository[] = []
  for (const member of options.members) {
    if (member.type === 'repository') {
      const targets = await repositoryTarget(options.selectingRoot, options.declaringWorkspace, member.path, options.group)
      for (const target of targets) repositories.push(await repositoryLocation(options.selectingRoot, target, options.group, options.nested))
      continue
    }

    const target = await physicalContainedDirectory(
      options.selectingRoot,
      relative(options.selectingRoot, resolve(options.declaringWorkspace, member.path)),
      `workspace group ${options.group} nested workspace ${member.path}`
    )
    const repeated = options.stack.indexOf(target)
    if (repeated !== -1) {
      const cycle = [...options.stack.slice(repeated), target]
        .map((directory) => (relative(options.selectingRoot, directory) || '.').split(sep).join('/'))
        .join(' -> ')
      throw new KiError(`workspace group ${options.group} has cycle ${cycle}`, 2)
    }
    const selected = await workspaceGroup(target)
    repositories.push(
      ...(await expandMembers({
        ...options,
        declaringWorkspace: target,
        members: selected.members,
        nested: true,
        stack: [...options.stack, target]
      }))
    )
  }
  return repositories
}

export const resolveWorkspaceGroup = async (directory: string, name?: string): Promise<ResolvedWorkspaceGroup> => {
  const selectingRoot = await realpath(directory)
  const selected = await workspaceGroup(selectingRoot, name)
  const repositories = await expandMembers({
    selectingRoot,
    declaringWorkspace: selectingRoot,
    group: selected.name,
    members: selected.members,
    nested: false,
    stack: [selectingRoot]
  })
  const seen = new Set<string>()
  for (const repository of repositories) {
    if (seen.has(repository.root)) throw new KiError(`workspace group ${selected.name} selects duplicate repository ${repository.path}`, 2)
    seen.add(repository.root)
  }
  return { name: selected.name, members: selected.members, repositories }
}
