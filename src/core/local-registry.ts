import { lstat, readFile } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'
import { parse } from 'smol-toml'
import { KiError } from './errors.ts'

const REGISTRY_FILE = 'registry.toml'
const REPOSITORY = /^https:\/\/github\.com\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/
const KEY = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/

export interface LocalRegistryEntry {
  readonly key: string
  readonly repository: string
  readonly path: string
}

export interface LocalRegistryInspection {
  readonly path: string
  readonly state: 'missing' | 'valid' | 'invalid'
  readonly repositories: readonly LocalRegistryEntry[]
  readonly errors: readonly string[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const localRegistryPath = (stateDirectory: string): string => join(stateDirectory, REGISTRY_FILE)

const invalid = (path: string, errors: readonly string[]): LocalRegistryInspection => ({
  path,
  state: 'invalid',
  repositories: [],
  errors
})

const validKey = (value: unknown): value is string => typeof value === 'string' && KEY.test(value)

export const canonicalRepositoryIdentity = (value: unknown): value is string =>
  typeof value === 'string' && REPOSITORY.test(value)

export const inspectLocalRegistry = async (stateDirectory: string): Promise<LocalRegistryInspection> => {
  const path = localRegistryPath(stateDirectory)
  const state = await lstat(path).catch(() => undefined)
  if (!state) return { path, state: 'missing', repositories: [], errors: [] }
  if (!state.isFile() || state.isSymbolicLink()) return invalid(path, ['registry must be a regular file'])
  let parsed: unknown
  try {
    parsed = parse(await readFile(path, 'utf8'))
  } catch {
    return invalid(path, ['registry must be valid TOML'])
  }
  // TOML documents parse as tables; this guards a future parser change only.
  /* v8 ignore next */
  if (!isRecord(parsed)) return invalid(path, ['registry must be a TOML table'])
  const errors: string[] = []
  for (const key of Object.keys(parsed))
    if (!['schema', 'repositories'].includes(key)) errors.push(`unrecognised key ${key}`)
  if (parsed['schema'] !== 1) errors.push('schema must equal 1')
  const entries = parsed['repositories']
  if (!isRecord(entries)) errors.push('repositories must be a table of keyed repository records')
  const repositories: LocalRegistryEntry[] = []
  if (isRecord(entries)) {
    for (const [key, entry] of Object.entries(entries)) {
      if (!isRecord(entry)) {
        errors.push(`repositories.${key} must be a table`)
        continue
      }
      for (const field of Object.keys(entry))
        if (!['repository', 'path'].includes(field)) errors.push(`repositories.${key} has unrecognised key ${field}`)
      if (!validKey(key)) errors.push(`repositories.${key} key must be a stable local repository name`)
      if (!canonicalRepositoryIdentity(entry['repository']))
        errors.push(`repositories.${key} repository must be a canonical HTTPS GitHub repository`)
      if (typeof entry['path'] !== 'string' || !isAbsolute(entry['path']))
        errors.push(`repositories.${key} path must be an absolute path`)
      if (
        validKey(key) &&
        canonicalRepositoryIdentity(entry['repository']) &&
        typeof entry['path'] === 'string' &&
        isAbsolute(entry['path'])
      )
        repositories.push({ key, repository: entry['repository'], path: entry['path'] })
    }
  }
  for (const field of ['repository', 'path'] as const) {
    const values = repositories.map((repository) => repository[field])
    if (new Set(values).size !== values.length) errors.push(`repositories repeats a ${field}`)
  }
  return errors.length
    ? invalid(path, errors)
    : {
        path,
        state: 'valid',
        repositories: repositories.sort((left, right) => left.key.localeCompare(right.key, 'en')),
        errors: []
      }
}

export const requiredLocalRegistry = async (stateDirectory: string): Promise<readonly LocalRegistryEntry[]> => {
  const inspection = await inspectLocalRegistry(stateDirectory)
  if (inspection.state === 'invalid')
    throw new KiError(`local KI repository registry is invalid: ${inspection.errors.join('; ')}`, 1)
  return inspection.repositories
}

export const registryEntry = (repository: string, identity: string): LocalRegistryEntry => {
  const key = basename(repository)
  if (!KEY.test(key)) throw new KiError(`repository root ${repository} has no valid local repository name`, 1)
  return { key, repository: identity, path: repository }
}

export const renderLocalRegistry = (repositories: readonly LocalRegistryEntry[]): string =>
  [
    'schema = 1',
    ...(repositories.length ? [] : ['repositories = {}']),
    ...repositories
      .slice()
      .sort((left, right) => left.key.localeCompare(right.key, 'en'))
      .flatMap((repository) => [
        '',
        `[repositories.${JSON.stringify(repository.key)}]`,
        `repository = ${JSON.stringify(repository.repository)}`,
        `path = ${JSON.stringify(repository.path)}`
      ]),
    ''
  ].join('\n')

export const localRegistryWrite = async (
  stateDirectory: string,
  entry: LocalRegistryEntry
): Promise<{ readonly path: string; readonly content: string; readonly create?: boolean } | undefined> =>
  localRegistryWriteMany(stateDirectory, [entry])

export const localRegistryWriteMany = async (
  stateDirectory: string,
  additions: readonly LocalRegistryEntry[]
): Promise<{ readonly path: string; readonly content: string; readonly create?: boolean } | undefined> => {
  const inspection = await inspectLocalRegistry(stateDirectory)
  if (inspection.state === 'invalid')
    throw new KiError(`local KI repository registry is invalid: ${inspection.errors.join('; ')}`, 1)
  let repositories = inspection.repositories
  for (const entry of additions) {
    const byIdentity = repositories.find((candidate) => candidate.repository === entry.repository)
    if (byIdentity && byIdentity.key !== entry.key)
      throw new KiError(`local KI repository registry key ${byIdentity.key} already identifies ${entry.repository}`, 1)
    const byKey = repositories.find((candidate) => candidate.key === entry.key)
    if (byKey && byKey.repository !== entry.repository)
      throw new KiError(`local KI repository registry key ${entry.key} already identifies ${byKey.repository}`, 1)
    const byPath = repositories.find((candidate) => candidate.path === entry.path)
    if (byPath && byPath.repository !== entry.repository)
      throw new KiError(`local KI repository registry path ${entry.path} already identifies ${byPath.repository}`, 1)
    repositories = byIdentity
      ? repositories.map((candidate) => (candidate.repository === entry.repository ? entry : candidate))
      : [...repositories, entry]
  }
  if (renderLocalRegistry(repositories) === renderLocalRegistry(inspection.repositories)) return undefined
  return { path: REGISTRY_FILE, content: renderLocalRegistry(repositories), create: inspection.state === 'missing' }
}
