import { randomUUID } from 'node:crypto'
import { link, lstat, mkdir, readFile, realpath, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { KiError } from './errors.ts'

export interface NativeWrite {
  readonly path: string
  readonly content: string
  readonly create?: boolean
}

/** An optional lexical allow-list below the physical root for a restricted transaction. */
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
  readonly original?: string
  readonly identity?: FileIdentity
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

const sameIdentity = (left: FileIdentity, right: FileIdentity): boolean => left.dev === right.dev && left.ino === right.ino

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
    if (existing.write.content !== proposal.write.content || Boolean(existing.write.create) !== Boolean(proposal.write.create)) {
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
  if (!isContained(repository, physicalPath)) throw new KiError(`direct conform write target ${path} escapes the repository`, 1)
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
      /* v8 ignore next -- A physical existing parent was validated above; only a concurrent replacement can violate this. */
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

const ensureCreateParent = async (repository: string, path: string, absolutePath: string): Promise<readonly string[]> => {
  const parent = dirname(absolutePath)
  const relativeParent = relative(repository, parent)
  /* v8 ignore next -- Prepared create targets are safe relative paths beneath the resolved repository. */
  if (!isContained(repository, parent) || (!relativeParent && parent !== repository))
    throw new KiError(`direct conform create target ${path} escapes the repository`, 1)
  const created: string[] = []
  let current = repository
  for (const part of relativeParent ? relativeParent.split('/') : []) {
    current = join(current, part)
    let state = await lstat(current).catch(() => undefined)
    if (!state) {
      await mkdir(current)
      created.push(current)
      // A concurrent removal immediately after mkdir is not reachable through one CLI invocation.
      /* v8 ignore next */
      state = await lstat(current).catch(() => undefined)
    }
    /* v8 ignore next -- Current was either a physical existing directory or created and rechecked above. */
    if (!state?.isDirectory() || state.isSymbolicLink()) throw new KiError(`direct conform create target ${path} escapes the repository`, 1)
    // A concurrent replacement after lstat is not reachable through one CLI invocation.
    /* v8 ignore next */
    const physicalDirectory = await realpath(current).catch(() => undefined)
    /* v8 ignore next -- Current was validated as a contained physical directory above. */
    if (!physicalDirectory || !isContained(repository, physicalDirectory))
      throw new KiError(`direct conform create target ${path} escapes the repository`, 1)
  }
  return created
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

/**
 * Prepares multiple user-scoped proposals as one transaction. Every path is
 * checked against the scope belonging to the skill that proposed it before
 * identical writes may be coalesced with another skill's proposal.
 */
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
    if (write.create) {
      await inspectCreateTarget(repository, write.path, absolutePath)
      prepared.push({ ...write, repository, absolutePath })
      continue
    }
    const identity = await inspectWriteTarget(repository, write.path, absolutePath)
    const original = await readFile(absolutePath, 'utf8')
    if (!sameIdentity(identity, await inspectWriteTarget(repository, write.path, absolutePath)))
      throw new KiError(`direct conform write target ${write.path} changed during preparation`, 1)
    prepared.push({ ...write, repository, absolutePath, original, identity })
  }
  return prepared
}

export const publishWrites = async (writes: readonly PreparedWrite[], dryRun: boolean): Promise<void> => {
  if (dryRun) return
  const createdDirectories: string[] = []
  for (const write of writes) {
    if (write.create) {
      await inspectCreateTarget(write.repository, write.path, write.absolutePath)
      continue
    }
    const identity = await inspectWriteTarget(write.repository, write.path, write.absolutePath)
    if (
      !write.identity ||
      write.original === undefined ||
      !sameIdentity(identity, write.identity) ||
      (await readFile(write.absolutePath, 'utf8')) !== write.original
    ) {
      throw new KiError(`direct conform write target ${write.path} changed before publication`, 1)
    }
  }
  const temporary = new Map<PreparedWrite, string>()
  const publishedIdentities = new Map<PreparedWrite, FileIdentity>()
  const published: PreparedWrite[] = []
  let publishedSuccessfully = false
  try {
    for (const write of writes) {
      if (!write.create) continue
      for (const directory of await ensureCreateParent(write.repository, write.path, write.absolutePath)) {
        /* v8 ignore next -- A directory is returned only when this transaction created it; duplicate return values require concurrent replacement. */
        if (!createdDirectories.includes(directory)) createdDirectories.push(directory)
      }
      await inspectCreateTarget(write.repository, write.path, write.absolutePath)
    }
    for (const write of writes) {
      const path = join(dirname(write.absolutePath), `.${randomUUID()}.ki-conform.tmp`)
      await writeFile(path, write.content, { encoding: 'utf8', flag: 'wx' })
      temporary.set(write, path)
    }
    for (const write of writes) {
      const path = temporary.get(write)
      // This private map is populated for every write immediately before this publication loop.
      /* v8 ignore next */
      if (!path) throw new KiError(`direct conform transaction lost temporary content for ${write.path}`, 1)
      if (write.create) await link(path, write.absolutePath)
      else await rename(path, write.absolutePath)
      published.push(write)
      publishedIdentities.set(write, await inspectWriteTarget(write.repository, write.path, write.absolutePath))
    }
    publishedSuccessfully = true
  } catch (error) {
    let rollbackRefusal: KiError | undefined
    for (const write of published.reverse()) {
      const publishedIdentity = publishedIdentities.get(write)
      /* v8 ignore start -- This callback requires a third party to remove the just-published target during rollback. */
      const currentIdentity = await inspectWriteTarget(write.repository, write.path, write.absolutePath).catch(() => undefined)
      /* v8 ignore stop */
      if (!publishedIdentity || !currentIdentity || !sameIdentity(publishedIdentity, currentIdentity)) {
        rollbackRefusal ??= new KiError(`direct conform rollback target ${write.path} changed after publication`, 1)
      } else if (write.create) {
        await rm(write.absolutePath, { force: true })
      } else {
        // Only non-create writes reach this branch, and preparation always snapshots their original content.
        /* v8 ignore next */
        if (write.original === undefined) throw new KiError(`direct conform transaction lost original content for ${write.path}`, 1)
        await writeFile(write.absolutePath, write.original, 'utf8')
      }
    }
    if (rollbackRefusal) throw rollbackRefusal
    throw error
  } finally {
    await Promise.all([...temporary.values()].map(async (path) => rm(path, { force: true })))
    if (!publishedSuccessfully) {
      for (const directory of createdDirectories.reverse()) {
        // A third party must replace the transaction-owned empty directory to make this catch reachable.
        /* v8 ignore next */
        await rmdir(directory).catch(() => undefined)
      }
    }
  }
}
