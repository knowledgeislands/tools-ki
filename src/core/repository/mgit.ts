import { lstat, readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { parse } from 'smol-toml'
import { KiError } from '../errors.ts'
import { physicalDirectory, type RepositoryLocation, targetFromDirectory } from './location.ts'

export const MGIT_MANIFEST_FILE = '.mgit.toml'

type MgitRepositoryType = 'standard' | 'nested' | 'bare'

interface WorkspaceMember {
  readonly kind: 'workspace' | 'repository'
  readonly path: string
  readonly type?: MgitRepositoryType
}

interface WorkspaceManifest {
  readonly kind: 'workspace'
  readonly path: string
  readonly members: readonly WorkspaceMember[]
}

interface RepositoryManifest {
  readonly kind: 'repository'
  readonly path: string
}

type MgitManifest = WorkspaceManifest | RepositoryManifest

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const safeRelativePath = (value: string): boolean =>
  Boolean(value) && !isAbsolute(value) && !value.split(/[\\/]/).some((part) => !part || part === '.' || part === '..')

const manifestError = (path: string, detail: string): KiError => new KiError(`${path} ${detail}`, 2)

const rejectUnknownKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  context: string
): void => {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key))
  if (unknown) throw manifestError(path, `${context} contains unsupported field ${unknown}`)
}

const repositoryMember = (path: string, value: Record<string, unknown>, manifestPath: string): WorkspaceMember => {
  rejectUnknownKeys(value, ['kind', 'type', 'source'], manifestPath, `workspace member ${path}`)
  if (value['type'] !== 'standard' && value['type'] !== 'nested' && value['type'] !== 'bare')
    throw manifestError(manifestPath, `workspace repository member ${path} must declare supported type`)
  if (value['source'] !== undefined && (typeof value['source'] !== 'string' || !value['source']))
    throw manifestError(manifestPath, `workspace repository member ${path} source must be a non-empty string`)
  return { kind: 'repository', path, type: value['type'] }
}

const structuralMembers = (
  group: Record<string, unknown>,
  manifestPath: string
): ReadonlyMap<string, WorkspaceMember> => {
  rejectUnknownKeys(group, ['members'], manifestPath, 'workspace structural group')
  if (!isRecord(group['members'])) throw manifestError(manifestPath, 'workspace structural group must declare members')
  const members = new Map<string, WorkspaceMember>()
  for (const [path, value] of Object.entries(group['members'])) {
    if (!safeRelativePath(path) || !isRecord(value))
      throw manifestError(manifestPath, `workspace has unsafe or invalid member ${path}`)
    if (value['kind'] === 'repository') members.set(path, repositoryMember(path, value, manifestPath))
    else if (value['kind'] === 'workspace') {
      rejectUnknownKeys(value, ['kind'], manifestPath, `workspace member ${path}`)
      members.set(path, { kind: 'workspace', path })
    } else throw manifestError(manifestPath, `workspace member ${path} must declare repository or workspace kind`)
  }
  return members
}

const selectedMembers = (
  name: string,
  group: Record<string, unknown>,
  structural: ReadonlyMap<string, WorkspaceMember>,
  manifestPath: string
): readonly WorkspaceMember[] => {
  rejectUnknownKeys(group, ['members'], manifestPath, `workspace group ${name}`)
  if (group['members'] === undefined) return []
  if (!isRecord(group['members'])) throw manifestError(manifestPath, `workspace group ${name} members must be a table`)
  return Object.entries(group['members']).map(([path, value]) => {
    if (!safeRelativePath(path) || !isRecord(value))
      throw manifestError(manifestPath, `workspace group ${name} has unsafe or invalid member ${path}`)
    rejectUnknownKeys(value, ['kind'], manifestPath, `workspace group ${name} member ${path}`)
    const member = structural.get(path)
    if (!member)
      throw manifestError(manifestPath, `workspace group ${name} member ${path} is not in structural default`)
    if (value['kind'] !== member.kind)
      throw manifestError(manifestPath, `workspace group ${name} member ${path} kind disagrees with structural default`)
    return member
  })
}

const workspaceManifest = (
  parsed: Record<string, unknown>,
  path: string,
  groups: Record<string, unknown>
): WorkspaceManifest => {
  rejectUnknownKeys(parsed, ['schema', 'kind', 'default', 'groups'], path, 'workspace manifest')
  const defaultGroup = parsed['default']
  if (typeof defaultGroup !== 'string' || !/^[A-Za-z0-9_-]+$/.test(defaultGroup))
    throw manifestError(path, 'workspace default must name a valid group')
  const structuralGroup = groups['default']
  if (!isRecord(structuralGroup)) throw manifestError(path, 'workspace must declare structural default group')
  const structural = structuralMembers(structuralGroup, path)
  for (const [name, group] of Object.entries(groups)) {
    if (!/^[A-Za-z0-9_-]+$/.test(name) || !isRecord(group))
      throw manifestError(path, `workspace has invalid group ${name}`)
    if (name !== 'default') selectedMembers(name, group, structural, path)
  }
  const selectedGroup = groups[defaultGroup]
  if (!isRecord(selectedGroup)) throw manifestError(path, `workspace default names unknown group ${defaultGroup}`)
  const members =
    defaultGroup === 'default'
      ? [...structural.values()]
      : selectedMembers(defaultGroup, selectedGroup, structural, path)
  if (!members.length) throw manifestError(path, `workspace group ${defaultGroup} selects no repositories`)
  return { kind: 'workspace', path, members }
}

const parseManifest = (contents: string, path: string): MgitManifest => {
  let parsed: unknown
  try {
    parsed = parse(contents)
  } catch {
    throw manifestError(path, 'must be valid TOML')
  }
  /* v8 ignore next -- a TOML document always parses to a table. */
  if (!isRecord(parsed)) throw manifestError(path, 'must be a table')
  if (parsed['schema'] !== 1) throw manifestError(path, 'schema must equal 1')
  if (parsed['kind'] === 'workspace') {
    if (!isRecord(parsed['groups'])) throw manifestError(path, 'workspace groups must be a table')
    return workspaceManifest(parsed, path, parsed['groups'])
  }
  if (parsed['kind'] === 'repository') {
    rejectUnknownKeys(parsed, ['schema', 'kind', 'symlinks'], path, 'repository manifest')
    if (parsed['symlinks'] !== undefined && !isRecord(parsed['symlinks']))
      throw manifestError(path, 'repository symlinks must be a table')
    return { kind: 'repository', path }
  }
  throw manifestError(path, 'kind must be workspace or repository')
}

const existingManifest = async (path: string): Promise<'regular' | 'unsafe' | undefined> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state) return undefined
  return state.isFile() && !state.isSymbolicLink() ? 'regular' : 'unsafe'
}

const readManifest = async (directory: string): Promise<MgitManifest | undefined> => {
  const canonical = join(directory, MGIT_MANIFEST_FILE)
  const canonicalState = await existingManifest(canonical)
  if (!canonicalState) return undefined
  if (canonicalState === 'unsafe') throw manifestError(canonical, 'must be a regular file')
  return parseManifest(await readFile(canonical, 'utf8'), canonical)
}

const resolveWorkspace = async (
  directory: string,
  manifest: WorkspaceManifest
): Promise<readonly RepositoryLocation[]> => {
  const targets: RepositoryLocation[] = []
  for (const member of manifest.members) {
    if (member.kind === 'repository') {
      if (member.type === 'bare') continue
      const checkout = member.type === 'nested' ? join(directory, member.path, 'main') : join(directory, member.path)
      targets.push(await targetFromDirectory(checkout, `${manifest.path} has invalid repository member ${member.path}`))
      continue
    }
    const child = await physicalDirectory(
      join(directory, member.path),
      `${manifest.path} has invalid child workspace ${member.path}`
    )
    const childManifest = await readManifest(child)
    if (childManifest?.kind !== 'workspace')
      throw manifestError(
        manifest.path,
        `child workspace ${member.path} must contain workspace-kind ${MGIT_MANIFEST_FILE}`
      )
    targets.push(...(await resolveWorkspace(child, childManifest)))
  }
  return targets
}

export const repositoriesFromMgitManifest = async (
  directory: string
): Promise<readonly RepositoryLocation[] | undefined> => {
  const manifest = await readManifest(directory)
  if (!manifest || manifest.kind === 'repository') return undefined
  return resolveWorkspace(directory, manifest)
}
