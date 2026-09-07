import { lstat, readFile, realpath } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { parse } from 'smol-toml'
import { KiError } from '../errors.ts'
import type { Environment } from '../paths.ts'
import type { Runner } from '../runtime/runner.ts'
import { canonicalRepositoryIdentity } from '../storage/index.ts'

const REFERENCE_ASSOCIATIONS_FILE = 'agora-references.toml'

export interface ReferenceAssociation {
  readonly repository: string
  readonly path: string
}

export interface ReferenceAssociationInspection {
  readonly path: string
  readonly state: 'missing' | 'valid' | 'invalid'
  readonly associations: readonly ReferenceAssociation[]
  readonly errors: readonly string[]
}

export interface ReferenceCheckoutInspection {
  readonly state: 'available' | 'missing' | 'remote-mismatch'
  readonly root?: string
  readonly detail: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const invalid = (path: string, errors: readonly string[]): ReferenceAssociationInspection => ({
  path,
  state: 'invalid',
  associations: [],
  errors
})

export const referenceAssociationsPath = (stateDirectory: string): string =>
  join(stateDirectory, REFERENCE_ASSOCIATIONS_FILE)

export const inspectReferenceAssociations = async (stateDirectory: string): Promise<ReferenceAssociationInspection> => {
  const path = referenceAssociationsPath(stateDirectory)
  const state = await lstat(path).catch(() => undefined)
  if (!state) return { path, state: 'missing', associations: [], errors: [] }
  if (!state.isFile() || state.isSymbolicLink()) return invalid(path, ['association store must be a regular file'])

  let parsed: unknown
  try {
    parsed = parse(await readFile(path, 'utf8'))
  } catch {
    return invalid(path, ['association store must be valid TOML'])
  }
  /* v8 ignore next -- TOML documents parse to tables; retain the boundary guard for parser changes. */
  if (!isRecord(parsed)) return invalid(path, ['association store must be a TOML table'])

  const errors: string[] = []
  for (const key of Object.keys(parsed))
    if (!['schema', 'references'].includes(key)) errors.push(`unrecognised key ${key}`)
  if (parsed['schema'] !== 1) errors.push('schema must equal 1')
  const references = parsed['references']
  if (!Array.isArray(references)) errors.push('references must be an array of association records')

  const associations: ReferenceAssociation[] = []
  if (Array.isArray(references)) {
    for (const [index, value] of references.entries()) {
      if (!isRecord(value)) {
        errors.push(`references[${index}] must be a table`)
        continue
      }
      for (const key of Object.keys(value))
        if (!['repository', 'path'].includes(key)) errors.push(`references[${index}] has unrecognised key ${key}`)
      if (!canonicalRepositoryIdentity(value['repository']))
        errors.push(`references[${index}].repository must be a canonical HTTPS GitHub repository`)
      if (typeof value['path'] !== 'string' || !isAbsolute(value['path']))
        errors.push(`references[${index}].path must be an absolute path`)
      if (
        canonicalRepositoryIdentity(value['repository']) &&
        typeof value['path'] === 'string' &&
        isAbsolute(value['path'])
      )
        associations.push({ repository: value['repository'], path: value['path'] })
    }
  }

  return errors.length ? invalid(path, errors) : { path, state: 'valid', associations, errors: [] }
}

export const requiredReferenceAssociations = async (
  stateDirectory: string
): Promise<readonly ReferenceAssociation[]> => {
  const inspection = await inspectReferenceAssociations(stateDirectory)
  if (inspection.state === 'invalid')
    throw new KiError(`local Agora reference associations are invalid: ${inspection.errors.join('; ')}`, 1)
  return inspection.associations
}

export const renderReferenceAssociations = (associations: readonly ReferenceAssociation[]): string => {
  const entries = associations
    .slice()
    .sort((left, right) =>
      left.repository === right.repository
        ? left.path.localeCompare(right.path, 'en')
        : left.repository.localeCompare(right.repository, 'en')
    )
    .map(
      (association) =>
        `  { repository = ${JSON.stringify(association.repository)}, path = ${JSON.stringify(association.path)} },`
    )
  return ['schema = 1', 'references = [', ...entries, ']', ''].join('\n')
}

export const referenceAssociationWrite = async (
  stateDirectory: string,
  association: ReferenceAssociation
): Promise<{ readonly path: string; readonly content: string; readonly create?: boolean } | undefined> => {
  const inspection = await inspectReferenceAssociations(stateDirectory)
  if (inspection.state === 'invalid')
    throw new KiError(`local Agora reference associations are invalid: ${inspection.errors.join('; ')}`, 1)
  const existing = inspection.associations.filter((candidate) => candidate.repository === association.repository)
  if (existing.length > 1)
    throw new KiError(`local Agora reference association for ${association.repository} is ambiguous`, 1)
  const associations = [
    ...inspection.associations.filter((candidate) => candidate.repository !== association.repository),
    association
  ]
  const content = renderReferenceAssociations(associations)
  if (content === renderReferenceAssociations(inspection.associations)) return undefined
  return { path: REFERENCE_ASSOCIATIONS_FILE, content, create: inspection.state === 'missing' }
}

export const referenceAssociationRemoval = async (
  stateDirectory: string,
  repository: string
): Promise<{ readonly path: string; readonly content: string }> => {
  const inspection = await inspectReferenceAssociations(stateDirectory)
  if (inspection.state === 'invalid')
    throw new KiError(`local Agora reference associations are invalid: ${inspection.errors.join('; ')}`, 1)
  const existing = inspection.associations.filter((candidate) => candidate.repository === repository)
  if (!existing.length) throw new KiError(`no local Agora reference association exists for ${repository}`, 2)
  return {
    path: REFERENCE_ASSOCIATIONS_FILE,
    content: renderReferenceAssociations(
      inspection.associations.filter((candidate) => candidate.repository !== repository)
    )
  }
}

const canonicalRemoteIdentity = (value: string): string | undefined => {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+)\/([^/]+?)(?:\.git)?\s*$/.exec(value)
  const identity = match && `https://github.com/${match[1]}/${match[2]}`
  return canonicalRepositoryIdentity(identity) ? identity : undefined
}

export const inspectReferenceCheckout = async (
  path: string,
  repository: string,
  runner: Runner,
  environment: Environment
): Promise<ReferenceCheckoutInspection> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isDirectory() || state.isSymbolicLink())
    return { state: 'missing', detail: `associated path ${path} is not an existing physical directory` }
  const root = await realpath(path)
  const worktree = await runner('git', ['-C', root, 'rev-parse', '--show-toplevel'], environment)
  const reportedRoot = worktree.exitCode ? undefined : await realpath(worktree.output.trim()).catch(() => undefined)
  if (!reportedRoot || reportedRoot !== root)
    return { state: 'remote-mismatch', detail: `associated path ${path} is not a Git checkout root` }
  const remote = await runner('git', ['-C', root, 'remote', 'get-url', 'origin'], environment)
  const identity = remote.exitCode ? undefined : canonicalRemoteIdentity(remote.output)
  if (identity !== repository)
    return {
      state: 'remote-mismatch',
      detail: `associated checkout ${root} has origin ${identity ?? 'without a canonical GitHub identity'}, expected ${repository}`
    }
  return { state: 'available', root, detail: `associated checkout ${root} matches ${repository}` }
}
