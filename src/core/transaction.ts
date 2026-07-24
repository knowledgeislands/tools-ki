import { randomUUID } from 'node:crypto'
import { lstat, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { KiError } from './errors.ts'

export interface NativeWrite {
  readonly path: string
  readonly content: string
}

interface PreparedWrite extends NativeWrite {
  readonly absolutePath: string
  readonly original: string
}

const isContained = (root: string, path: string): boolean => {
  const remainder = relative(root, path)
  return remainder === '' || (!remainder.startsWith('..') && remainder !== '..')
}

const safeRelativePath = (value: string): boolean =>
  Boolean(value) && !value.startsWith('/') && value.split('/').every((part) => part && part !== '.' && part !== '..')

export const prepareWrites = async (repository: string, writes: readonly NativeWrite[]): Promise<readonly PreparedWrite[]> => {
  const paths = new Set<string>()
  const prepared: PreparedWrite[] = []
  for (const write of writes) {
    if (!safeRelativePath(write.path)) throw new KiError(`native conform write path ${write.path} is unsafe`, 1)
    if (paths.has(write.path)) throw new KiError(`native conform repeats write path ${write.path}`, 1)
    paths.add(write.path)
    const absolutePath = join(repository, write.path)
    const state = await lstat(absolutePath).catch(() => undefined)
    if (!state?.isFile() || state.isSymbolicLink())
      throw new KiError(`native conform write target ${write.path} must be an existing regular file`, 1)
    const physicalPath = await realpath(absolutePath)
    if (!isContained(repository, physicalPath)) throw new KiError(`native conform write target ${write.path} escapes the repository`, 1)
    prepared.push({ ...write, absolutePath, original: await readFile(absolutePath, 'utf8') })
  }
  return prepared
}

export const publishWrites = async (writes: readonly PreparedWrite[], dryRun: boolean): Promise<void> => {
  if (dryRun) return
  for (const write of writes) {
    if ((await readFile(write.absolutePath, 'utf8')) !== write.original) {
      throw new KiError(`native conform write target ${write.path} changed before publication`, 1)
    }
  }
  const temporary = new Map<PreparedWrite, string>()
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
    }
  } catch (error) {
    for (const write of published.reverse()) {
      if ((await readFile(write.absolutePath, 'utf8').catch(() => undefined)) === write.content) {
        await writeFile(write.absolutePath, write.original, 'utf8')
      }
    }
    throw error
  } finally {
    await Promise.all([...temporary.values()].map(async (path) => rm(path, { force: true })))
  }
}
