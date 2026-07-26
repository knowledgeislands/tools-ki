import { randomUUID } from 'node:crypto'
import { lstat, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { KiError } from './errors.ts'

export interface NativeWrite {
  readonly path: string
  readonly content: string
}

interface PreparedWrite extends NativeWrite {
  readonly repository: string
  readonly absolutePath: string
  readonly original: string
  readonly identity: FileIdentity
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

const sameIdentity = (left: FileIdentity, right: FileIdentity): boolean => left.dev === right.dev && left.ino === right.ino

const inspectWriteTarget = async (repository: string, path: string, absolutePath: string): Promise<FileIdentity> => {
  const state = await lstat(absolutePath).catch(() => undefined)
  if (!state?.isFile() || state.isSymbolicLink())
    throw new KiError(`native conform write target ${path} must be an existing regular file`, 1)
  const physicalPath = await realpath(absolutePath)
  if (!isContained(repository, physicalPath)) throw new KiError(`native conform write target ${path} escapes the repository`, 1)
  return { dev: state.dev, ino: state.ino }
}

export const prepareWrites = async (repository: string, writes: readonly NativeWrite[]): Promise<readonly PreparedWrite[]> => {
  const paths = new Set<string>()
  const prepared: PreparedWrite[] = []
  for (const write of writes) {
    if (!safeRelativePath(write.path)) throw new KiError(`native conform write path ${write.path} is unsafe`, 1)
    if (paths.has(write.path)) throw new KiError(`native conform repeats write path ${write.path}`, 1)
    paths.add(write.path)
    const absolutePath = join(repository, write.path)
    const identity = await inspectWriteTarget(repository, write.path, absolutePath)
    const original = await readFile(absolutePath, 'utf8')
    if (!sameIdentity(identity, await inspectWriteTarget(repository, write.path, absolutePath)))
      throw new KiError(`native conform write target ${write.path} changed during preparation`, 1)
    prepared.push({ ...write, repository, absolutePath, original, identity })
  }
  return prepared
}

export const publishWrites = async (writes: readonly PreparedWrite[], dryRun: boolean): Promise<void> => {
  if (dryRun) return
  for (const write of writes) {
    const identity = await inspectWriteTarget(write.repository, write.path, write.absolutePath)
    if (!sameIdentity(identity, write.identity) || (await readFile(write.absolutePath, 'utf8')) !== write.original) {
      throw new KiError(`native conform write target ${write.path} changed before publication`, 1)
    }
  }
  const temporary = new Map<PreparedWrite, string>()
  const publishedIdentities = new Map<PreparedWrite, FileIdentity>()
  const published: PreparedWrite[] = []
  try {
    for (const write of writes) {
      const path = join(dirname(write.absolutePath), `.${randomUUID()}.ki-conform.tmp`)
      await writeFile(path, write.content, { encoding: 'utf8', flag: 'wx' })
      temporary.set(write, path)
    }
    for (const write of writes) {
      const path = temporary.get(write)
      if (!path) throw new KiError(`native conform transaction lost temporary content for ${write.path}`, 1)
      await rename(path, write.absolutePath)
      published.push(write)
      publishedIdentities.set(write, await inspectWriteTarget(write.repository, write.path, write.absolutePath))
    }
  } catch (error) {
    let rollbackRefusal: KiError | undefined
    for (const write of published.reverse()) {
      const publishedIdentity = publishedIdentities.get(write)
      const currentIdentity = await inspectWriteTarget(write.repository, write.path, write.absolutePath).catch(() => undefined)
      if (!publishedIdentity || !currentIdentity || !sameIdentity(publishedIdentity, currentIdentity)) {
        rollbackRefusal ??= new KiError(`native conform rollback target ${write.path} changed after publication`, 1)
      } else {
        await writeFile(write.absolutePath, write.original, 'utf8')
      }
    }
    if (rollbackRefusal) throw rollbackRefusal
    throw error
  } finally {
    await Promise.all([...temporary.values()].map(async (path) => rm(path, { force: true })))
  }
}
