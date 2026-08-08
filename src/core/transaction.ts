import { randomUUID } from 'node:crypto'
import { link, lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { KiError } from './errors.ts'

export interface NativeWrite {
  readonly path: string
  readonly content: string
  readonly create?: boolean
}

/** An optional lexical allow-list below the physical root for a restricted publisher. */
export interface WriteScope {
  readonly paths: readonly string[]
}

/** A proposal and the particular scope that authorised it; scopes never pool across skills. */
export interface ScopedNativeWrite {
  readonly write: NativeWrite
  readonly scope: WriteScope
}

interface PreparedWrite extends NativeWrite {
  readonly repository: string
  readonly absolutePath: string
}

interface FileIdentity {
  readonly dev: number
  readonly ino: number
}

const isContained = (root: string, path: string): boolean => {
  const remainder = relative(root, path)
  return remainder === '' || (!remainder.startsWith('..') && remainder !== '..')
}

const safeRelativePath = (value: string): boolean =>
  Boolean(value) && !value.startsWith('/') && value.split('/').every((part) => part && part !== '.' && part !== '..')

const allowedByScope = (path: string, scope: WriteScope | undefined): boolean =>
  !scope || scope.paths.some((allowed) => path === allowed || path.startsWith(`${allowed}/`))

const sameIdentity = (left: FileIdentity, right: FileIdentity): boolean =>
  left.dev === right.dev && left.ino === right.ino

/**
 * Several independent rubric items may derive the same complete-file conform
 * from shared read-only evidence. Retain one identical proposal, but never
 * choose between competing replacement content.
 */
const distinctWrites = (writes: readonly NativeWrite[]): readonly NativeWrite[] => {
  const byPath = new Map<string, NativeWrite>()
  for (const write of writes) {
    const existing = byPath.get(write.path)
    if (!existing) {
      byPath.set(write.path, write)
      continue
    }
    if (existing.content !== write.content || Boolean(existing.create) !== Boolean(write.create))
      throw new KiError(`direct conform repeats write path ${write.path} with different content`, 1)
  }
  return [...byPath.values()]
}

const distinctScopedWrites = (writes: readonly ScopedNativeWrite[]): readonly ScopedNativeWrite[] => {
  const byPath = new Map<string, ScopedNativeWrite>()
  for (const proposal of writes) {
    const existing = byPath.get(proposal.write.path)
    if (!existing) {
      byPath.set(proposal.write.path, proposal)
      continue
    }
    if (
      existing.write.content !== proposal.write.content ||
      Boolean(existing.write.create) !== Boolean(proposal.write.create)
    ) {
      throw new KiError(`direct conform repeats write path ${proposal.write.path} with different content`, 1)
    }
  }
  return [...byPath.values()]
}

const inspectWriteTarget = async (repository: string, path: string, absolutePath: string): Promise<FileIdentity> => {
  const state = await lstat(absolutePath).catch(() => undefined)
  if (!state?.isFile() || state.isSymbolicLink())
    throw new KiError(`direct conform write target ${path} must be an existing regular file`, 1)
  const physicalPath = await realpath(absolutePath)
  if (!isContained(repository, physicalPath))
    throw new KiError(`direct conform write target ${path} escapes the repository`, 1)
  return { dev: state.dev, ino: state.ino }
}

const inspectCreateTarget = async (repository: string, path: string, absolutePath: string): Promise<void> => {
  const state = await lstat(absolutePath).catch(() => undefined)
  if (state) throw new KiError(`direct conform create target ${path} must not already exist`, 1)
  let parent = dirname(absolutePath)
  while (true) {
    const parentState = await lstat(parent).catch(() => undefined)
    if (parentState) {
      if (!parentState.isDirectory() || parentState.isSymbolicLink())
        throw new KiError(`direct conform create target ${path} escapes the repository`, 1)
      // A concurrent deletion after lstat is not reachable through one CLI invocation.
      /* v8 ignore next */
      const physicalParent = await realpath(parent).catch(() => undefined)
      // lstat resolves the components before the one it reports on, so an intermediate symlink
      // passes the check above and only shows as an escape once the parent is fully resolved.
      if (!physicalParent || !isContained(repository, physicalParent))
        throw new KiError(`direct conform create target ${path} escapes the repository`, 1)
      return
    }
    const next = dirname(parent)
    /* v8 ignore next -- A safe relative target starts below the repository, so ascent cannot escape without a concurrent replacement. */
    if (next === parent || !isContained(repository, next))
      throw new KiError(`direct conform create target ${path} escapes the repository`, 1)
    parent = next
  }
}

const ensureCreateParent = async (repository: string, path: string, absolutePath: string): Promise<void> => {
  const parent = dirname(absolutePath)
  const relativeParent = relative(repository, parent)
  /* v8 ignore next -- Prepared create targets are safe relative paths beneath the resolved repository. */
  if (!isContained(repository, parent) || (!relativeParent && parent !== repository))
    throw new KiError(`direct conform create target ${path} escapes the repository`, 1)
  let current = repository
  for (const part of relativeParent ? relativeParent.split('/') : []) {
    current = join(current, part)
    let state = await lstat(current).catch(() => undefined)
    if (!state) {
      await mkdir(current)
      // A concurrent removal immediately after mkdir is not reachable through one CLI invocation.
      /* v8 ignore next */
      state = await lstat(current).catch(() => undefined)
    }
    // Validation inspects only the first existing ancestor, so an intermediate segment that is
    // itself a symbolic link reaches this walk unexamined.
    if (!state?.isDirectory() || state.isSymbolicLink())
      throw new KiError(`direct conform create target ${path} escapes the repository`, 1)
    // A concurrent replacement after lstat is not reachable through one CLI invocation.
    /* v8 ignore next */
    const physicalDirectory = await realpath(current).catch(() => undefined)
    /* v8 ignore next -- Current was validated as a contained physical directory above. */
    if (!physicalDirectory || !isContained(repository, physicalDirectory))
      throw new KiError(`direct conform create target ${path} escapes the repository`, 1)
  }
}

export const prepareWrites = async (
  repository: string,
  writes: readonly NativeWrite[],
  scope?: WriteScope
): Promise<readonly PreparedWrite[]> =>
  prepareScopedWrites(
    repository,
    distinctWrites(writes).map((write) => ({ write, scope: scope ?? { paths: [] } })),
    scope === undefined
  )

/** Every path is checked against the scope belonging to the skill that proposed it before identical writes may be coalesced. */
export const prepareScopedWrites = async (
  repository: string,
  writes: readonly ScopedNativeWrite[],
  unrestricted = false
): Promise<readonly PreparedWrite[]> => {
  const prepared: PreparedWrite[] = []
  for (const proposal of distinctScopedWrites(writes)) {
    const { write, scope } = proposal
    if (!safeRelativePath(write.path)) throw new KiError(`direct conform write path ${write.path} is unsafe`, 1)
    if (!unrestricted && !allowedByScope(write.path, scope))
      throw new KiError(`direct conform write path ${write.path} is outside its declared filesystem scope`, 1)
    const absolutePath = join(repository, write.path)
    prepared.push({ ...write, repository, absolutePath })
  }
  return prepared
}

interface ExistingSnapshot {
  readonly identity: FileIdentity
  readonly contents: string
}

const snapshotExistingTarget = async (write: PreparedWrite): Promise<ExistingSnapshot> => {
  const identity = await inspectWriteTarget(write.repository, write.path, write.absolutePath)
  const contents = await readFile(write.absolutePath, 'utf8')
  if (!sameIdentity(identity, await inspectWriteTarget(write.repository, write.path, write.absolutePath)))
    throw new KiError(`direct conform write target ${write.path} changed during publication`, 1)
  return { identity, contents }
}

const assertSnapshotCurrent = async (write: PreparedWrite, snapshot: ExistingSnapshot): Promise<void> => {
  const identity = await inspectWriteTarget(write.repository, write.path, write.absolutePath)
  if (!sameIdentity(identity, snapshot.identity) || (await readFile(write.absolutePath, 'utf8')) !== snapshot.contents)
    throw new KiError(`direct conform write target ${write.path} changed before publication`, 1)
}

const temporaryPath = (write: PreparedWrite): string =>
  join(dirname(write.absolutePath), `.${randomUUID()}.ki-conform.tmp`)

const publishOne = async (write: PreparedWrite): Promise<void> => {
  if (write.create) {
    await ensureCreateParent(write.repository, write.path, write.absolutePath)
    await inspectCreateTarget(write.repository, write.path, write.absolutePath)
    const temporary = temporaryPath(write)
    try {
      await writeFile(temporary, write.content, { encoding: 'utf8', flag: 'wx' })
      await link(temporary, write.absolutePath)
    } finally {
      await rm(temporary, { force: true })
    }
    return
  }

  const snapshot = await snapshotExistingTarget(write)
  const temporary = temporaryPath(write)
  try {
    await writeFile(temporary, write.content, { encoding: 'utf8', flag: 'wx' })
    await assertSnapshotCurrent(write, snapshot)
    await rename(temporary, write.absolutePath)
  } finally {
    await rm(temporary, { force: true })
  }
}

const validateOne = async (write: PreparedWrite): Promise<void> => {
  if (write.create) await inspectCreateTarget(write.repository, write.path, write.absolutePath)
  else await snapshotExistingTarget(write)
}

export const publishWrites = async (writes: readonly PreparedWrite[], dryRun: boolean): Promise<void> => {
  for (const write of writes) {
    if (dryRun) await validateOne(write)
    else await publishOne(write)
  }
}
