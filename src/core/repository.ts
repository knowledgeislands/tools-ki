import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { parse } from 'smol-toml'
import { REPOSITORY_CONFIGURATION_FILE } from './configuration.ts'
import { KiError } from './errors.ts'
import { resolveWorkspaceGroup, workspaceConfigurationExists } from './workspace.ts'

const MGIT_CONFIGURATION_FILE = '.mgit-config.toml'

export interface RepositoryLocation {
  readonly root: string
  readonly configuration: string
}

const isConfigurationFile = async (path: string): Promise<boolean> => {
  const state = await lstat(path).catch(() => undefined)
  return Boolean(state?.isFile() && !state.isSymbolicLink())
}

const isRegularFile = async (path: string): Promise<boolean> => {
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
    const configuration = join(candidate, REPOSITORY_CONFIGURATION_FILE)
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
  return targetFromDirectory(options.repository, '--repo must be an existing directory', '--repo must name a repository containing .ki-config.toml')
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

const globBase = (pattern: string): string => pattern.slice(0, Math.max(1, pattern.lastIndexOf(sep, pattern.search(/[*?]/))))

const walkDirectories = async (directory: string): Promise<readonly string[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  const directories: string[] = [directory]
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    directories.push(...(await walkDirectories(join(directory, entry.name))))
  }
  return directories
}

const expandPattern = async (value: string, workingDirectory: string, source = '--repo'): Promise<readonly string[]> => {
  const pattern = isAbsolute(value) ? resolve(value) : resolve(workingDirectory, value)
  const base = globBase(pattern)
  await physicalDirectory(base, `${source} pattern ${value} has no existing directory`)
  const expression = globExpression(pattern)
  return (await walkDirectories(base)).filter((directory) => expression.test(directory))
}

const targetFromDirectory = async (directory: string, directoryMessage: string, configurationMessage = directoryMessage): Promise<RepositoryLocation> => {
  const root = await physicalDirectory(directory, directoryMessage)
  const configuration = join(root, REPOSITORY_CONFIGURATION_FILE)
  if (!(await isConfigurationFile(configuration))) throw new KiError(configurationMessage, 2)
  return { root, configuration }
}

const safeEntryPath = (value: string): boolean =>
  Boolean(value) && !isAbsolute(value) && !value.split(/[\\/]/).some((part) => !part || part === '.' || part === '..')

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

type MgitEntryKind = 'bare' | 'dir' | 'nested' | 'standard'

interface MgitEntry {
  readonly kind: MgitEntryKind
  readonly path: string
}

interface MgitDocument {
  readonly version?: unknown
  readonly members?: unknown
}

interface MgitMemberDocument {
  readonly type?: unknown
  readonly source?: unknown
}

const mgitError = (configuration: string, message: string): KiError => new KiError(`${configuration} ${message}`, 2)

const parseMgitConfiguration = (contents: string, configuration: string): readonly MgitEntry[] => {
  let parsed: unknown
  try {
    parsed = parse(contents)
  } catch {
    throw mgitError(configuration, 'must be valid TOML')
  }
  /* v8 ignore next -- a TOML document always parses to a table. */
  if (!isRecord(parsed)) throw mgitError(configuration, 'must be a table')
  const document = parsed as MgitDocument
  if (document.version !== 1) throw mgitError(configuration, 'version must equal 1')
  if (document.members === undefined) return []
  if (!isRecord(document.members)) throw mgitError(configuration, 'members must be a table')
  return Object.entries(document.members).map(([path, value]) => {
    const member = value as MgitMemberDocument
    if (!safeEntryPath(path) || !isRecord(value)) throw mgitError(configuration, `has invalid member ${path}`)
    if (typeof member.source !== 'undefined' && (typeof member.source !== 'string' || !member.source))
      throw mgitError(configuration, `member ${path} must use a non-empty source string`)
    if (member.type !== 'standard' && member.type !== 'nested' && member.type !== 'bare' && member.type !== 'dir')
      throw mgitError(configuration, `member ${path} has an unsupported type`)
    return { kind: member.type, path }
  })
}

const repositoriesFromMgitConfiguration = async (directory: string): Promise<readonly RepositoryLocation[]> => {
  const configuration = join(directory, MGIT_CONFIGURATION_FILE)
  const contents = await readFile(configuration, 'utf8')
  const entries = parseMgitConfiguration(contents, configuration)
  const targets: RepositoryLocation[] = []
  for (const entry of entries) {
    if (entry.kind === 'bare') continue
    const child = join(directory, entry.path)
    if (entry.kind === 'dir')
      targets.push(
        ...(await repositoriesFromMgitConfiguration(await physicalDirectory(child, `invalid ${MGIT_CONFIGURATION_FILE} directory target ${entry.path}`)))
      )
    else {
      const checkout = entry.kind === 'nested' ? join(child, 'main') : child
      targets.push(await targetFromDirectory(checkout, `invalid ${MGIT_CONFIGURATION_FILE} repository target ${entry.path}`))
    }
  }
  return targets
}

const distinctTargets = (targets: readonly RepositoryLocation[], source: string): readonly RepositoryLocation[] => {
  const seen = new Set<string>()
  for (const target of targets) {
    if (seen.has(target.root)) throw new KiError(`${source} selects duplicate repository ${target.root}`, 2)
    seen.add(target.root)
  }
  return targets
}

export const resolveRepositoryTargets = async (options: {
  readonly repositories: readonly string[]
  readonly workspace?: string
  readonly workingDirectory: string
  readonly homeDirectory: string
}): Promise<readonly RepositoryLocation[]> => {
  if (options.repositories.length && options.workspace) throw new KiError('--repo and --workspace cannot be used together', 2)
  if (options.repositories.length) {
    const targets: RepositoryLocation[] = []
    for (const value of options.repositories) {
      if (!hasPattern(value)) {
        targets.push(
          await targetFromDirectory(
            resolve(options.workingDirectory, value),
            '--repo must be an existing directory',
            '--repo must name a repository containing .ki-config.toml'
          )
        )
        continue
      }
      const matches = await expandPattern(value, options.workingDirectory)
      if (!matches.length) throw new KiError(`--repo pattern ${value} matched no repositories`, 2)
      for (const match of matches) targets.push(await targetFromDirectory(match, `--repo pattern ${value} matched a non-KI directory`))
    }
    return distinctTargets(targets, '--repo')
  }
  const working = await realpath(options.workingDirectory)
  if (options.workspace || (await workspaceConfigurationExists(working))) {
    const selected = await resolveWorkspaceGroup(working, options.workspace)
    return selected.repositories.map(({ root, configuration }) => ({ root, configuration }))
  }
  const configuration = join(working, MGIT_CONFIGURATION_FILE)
  if (await isRegularFile(configuration)) return distinctTargets(await repositoriesFromMgitConfiguration(working), MGIT_CONFIGURATION_FILE)
  return [await resolveRepository({ workingDirectory: options.workingDirectory, homeDirectory: options.homeDirectory })]
}
