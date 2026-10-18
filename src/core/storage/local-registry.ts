import { lstat, mkdir, readFile, realpath } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'
import { parse } from 'smol-toml'
import { KiError } from '../errors.ts'
import { prepareWrites, publishWrites } from '../filesystem/index.ts'

const REGISTRY_FILE = 'registry.toml'
const REPOSITORY = /^https:\/\/github\.com\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/
const KEY = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/

export interface LocalRegistryEntry {
  readonly key: string
  readonly repository: string
  readonly path: string
  readonly stores?: LocalRepositoryStores
  /** External store roles this host deliberately does without. */
  readonly absentStores?: readonly ExternalRegistryStoreRole[]
  readonly searchBoundary?: string
}

export type ExternalRegistryStoreRole = keyof LocalRepositoryStores

const EXTERNAL_ROLES: readonly ExternalRegistryStoreRole[] = ['sources', 'legacy']

const absentStoreErrors = (key: string, absent: unknown, stores: unknown): readonly string[] => {
  if (absent === undefined) return []
  if (!Array.isArray(absent) || !absent.length)
    return [`repositories.${key}.absent_stores must be a non-empty array of store roles`]
  const errors: string[] = []
  for (const role of absent)
    if (!(EXTERNAL_ROLES as readonly unknown[]).includes(role))
      errors.push(`repositories.${key}.absent_stores has unknown role ${role}`)
    else if (isRecord(stores) && stores[role] !== undefined)
      errors.push(`repositories.${key} ${role} store cannot be both bound and absent`)
  if (new Set(absent).size !== absent.length) errors.push(`repositories.${key}.absent_stores repeats a role`)
  return errors
}

export interface LocalRepositoryStores {
  readonly sources?: string
  readonly legacy?: string
}

export interface LocalRegistryInspection {
  readonly path: string
  readonly state: 'missing' | 'valid' | 'invalid'
  readonly repositories: readonly LocalRegistryEntry[]
  readonly errors: readonly string[]
}

export type LocalRegistryRemovalSelector =
  | { readonly kind: 'key'; readonly value: string }
  | { readonly kind: 'path'; readonly value: string }

export interface LocalRegistryRemoval {
  readonly removed: LocalRegistryEntry
  readonly write: {
    readonly path: string
    readonly content: string
  }
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

const validBoundary = (value: unknown): value is string => validKey(value) && value.length <= 128

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
        if (!['repository', 'path', 'stores', 'absent_stores', 'search_boundary'].includes(field))
          errors.push(`repositories.${key} has unrecognised key ${field}`)
      if (!validKey(key)) errors.push(`repositories.${key} key must be a stable local repository name`)
      if (!canonicalRepositoryIdentity(entry['repository']))
        errors.push(`repositories.${key} repository must be a canonical HTTPS GitHub repository`)
      if (typeof entry['path'] !== 'string' || !isAbsolute(entry['path']))
        errors.push(`repositories.${key} path must be an absolute path`)
      const boundary = entry['search_boundary']
      if (boundary !== undefined && !validBoundary(boundary))
        errors.push(`repositories.${key}.search_boundary must be a safe boundary ID`)
      const stores = entry['stores']
      if (stores !== undefined && !isRecord(stores)) errors.push(`repositories.${key}.stores must be a table`)
      if (isRecord(stores)) {
        for (const field of Object.keys(stores))
          if (!['sources', 'legacy'].includes(field))
            errors.push(`repositories.${key}.stores has unrecognised key ${field}`)
        for (const role of ['sources', 'legacy'] as const)
          if (stores[role] !== undefined && (typeof stores[role] !== 'string' || !isAbsolute(stores[role])))
            errors.push(`repositories.${key}.stores.${role} must be an absolute path`)
        if (!Object.keys(stores).length) errors.push(`repositories.${key}.stores must not be empty`)
      }
      const absent = entry['absent_stores']
      const absentErrors = absentStoreErrors(key, absent, stores)
      errors.push(...absentErrors)
      if (
        !absentErrors.length &&
        validKey(key) &&
        canonicalRepositoryIdentity(entry['repository']) &&
        typeof entry['path'] === 'string' &&
        isAbsolute(entry['path']) &&
        (stores === undefined ||
          (isRecord(stores) &&
            Object.keys(stores).length > 0 &&
            Object.keys(stores).every(
              (role) =>
                (role === 'sources' || role === 'legacy') &&
                typeof stores[role] === 'string' &&
                isAbsolute(stores[role] as string)
            )))
      )
        repositories.push({
          key,
          repository: entry['repository'],
          path: entry['path'],
          ...(validBoundary(boundary) ? { searchBoundary: boundary } : {}),
          ...(Array.isArray(absent) ? { absentStores: absent as ExternalRegistryStoreRole[] } : {}),
          ...(isRecord(stores)
            ? {
                stores: {
                  ...(typeof stores['sources'] === 'string' ? { sources: stores['sources'] } : {}),
                  ...(typeof stores['legacy'] === 'string' ? { legacy: stores['legacy'] } : {})
                }
              }
            : {})
        })
    }
  }
  const boundaries = repositories.flatMap((entry) => (entry.searchBoundary ? [entry.searchBoundary] : []))
  if (new Set(boundaries).size !== boundaries.length) errors.push('repositories repeats a search_boundary')
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
        `path = ${JSON.stringify(repository.path)}`,
        ...(repository.searchBoundary ? [`search_boundary = ${JSON.stringify(repository.searchBoundary)}`] : []),
        ...(repository.absentStores?.length
          ? [`absent_stores = [${repository.absentStores.map((role) => JSON.stringify(role)).join(', ')}]`]
          : []),
        ...(repository.stores
          ? [
              '',
              `[repositories.${JSON.stringify(repository.key)}.stores]`,
              ...(repository.stores.sources ? [`sources = ${JSON.stringify(repository.stores.sources)}`] : []),
              ...(repository.stores.legacy ? [`legacy = ${JSON.stringify(repository.stores.legacy)}`] : [])
            ]
          : [])
      ]),
    ''
  ].join('\n')

export const localRegistryRemoval = async (
  stateDirectory: string,
  selector: LocalRegistryRemovalSelector
): Promise<LocalRegistryRemoval> => {
  const inspection = await inspectLocalRegistry(stateDirectory)
  if (inspection.state === 'invalid')
    throw new KiError(`local KI repository registry is invalid: ${inspection.errors.join('; ')}`, 1)
  if (selector.kind === 'key' && !validKey(selector.value))
    throw new KiError('registry key must be a stable local repository name', 2)
  const removed = inspection.repositories.find((repository) => repository[selector.kind] === selector.value)
  if (!removed) throw new KiError(`local KI repository registry has no ${selector.kind} ${selector.value}`, 2)
  return {
    removed,
    write: {
      path: REGISTRY_FILE,
      content: renderLocalRegistry(inspection.repositories.filter((repository) => repository !== removed))
    }
  }
}

export const localRegistryWrite = async (
  stateDirectory: string,
  entry: LocalRegistryEntry
): Promise<{ readonly path: string; readonly content: string; readonly create?: boolean } | undefined> =>
  localRegistryWriteMany(stateDirectory, [entry])

/** Validate a registry proposal in preview without materialising a missing XDG state directory. */
export const publishLocalRegistryProposal = async (
  stateDirectory: string,
  proposal: NonNullable<Awaited<ReturnType<typeof localRegistryWrite>>>,
  dryRun: boolean
): Promise<void> => {
  const state = await lstat(stateDirectory).catch(() => undefined)
  if (dryRun && !state) {
    await prepareWrites(stateDirectory, [proposal])
    return
  }
  if (!dryRun) await mkdir(stateDirectory, { recursive: true })
  const writes = await prepareWrites(await realpath(stateDirectory), [proposal])
  await publishWrites(writes, dryRun)
}

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
    if (byIdentity && (byIdentity.key !== entry.key || byIdentity.path !== entry.path))
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
  const boundaries = repositories.flatMap((entry) => (entry.searchBoundary ? [entry.searchBoundary] : []))
  if (boundaries.some((boundary) => !validBoundary(boundary)) || new Set(boundaries).size !== boundaries.length)
    throw new KiError('search_boundary must be safe and unique per registered KB', 2)
  if (renderLocalRegistry(repositories) === renderLocalRegistry(inspection.repositories)) return undefined
  return { path: REGISTRY_FILE, content: renderLocalRegistry(repositories), create: inspection.state === 'missing' }
}

/**
 * Replace one exact registry entry, renaming its key when the replacement does, so a checkout
 * that moves or changes identity keeps one record.
 */
export const replaceLocalRegistryEntry = (
  repositories: readonly LocalRegistryEntry[],
  before: LocalRegistryEntry,
  after: LocalRegistryEntry
): readonly LocalRegistryEntry[] => {
  const current = repositories.find((entry) => entry.key === before.key)
  if (current?.repository !== before.repository || current.path !== before.path)
    throw new KiError(`local KI repository registry no longer holds ${before.key} at ${before.path}`, 1)
  const remaining = repositories.filter((entry) => entry !== current)
  for (const field of ['key', 'repository', 'path'] as const)
    if (remaining.some((entry) => entry[field] === after[field]))
      throw new KiError(`local KI repository registry already holds ${field} ${after[field]}`, 1)
  return [...remaining, after]
}

/** Publish one registry replacement against the current machine-local registry. */
export const publishLocalRegistryReplacement = async (
  stateDirectory: string,
  before: LocalRegistryEntry,
  after: LocalRegistryEntry
): Promise<void> => {
  const repositories = replaceLocalRegistryEntry(await requiredLocalRegistry(stateDirectory), before, after)
  await publishLocalRegistryProposal(
    stateDirectory,
    { path: REGISTRY_FILE, content: renderLocalRegistry(repositories) },
    false
  )
}
