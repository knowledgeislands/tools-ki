import { cp, lstat, mkdir, readdir } from 'node:fs/promises'
import { dirname, join, parse } from 'node:path'
import { KiError } from '../../errors.ts'

export const granolaCaptureRoot = (value: unknown): string | undefined => {
  if (value !== undefined && (typeof value !== 'string' || !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(value)))
    throw new KiError('[skills.ki-acquire-granola].capture_root must be a safe repository-relative directory')
  return value as string | undefined
}

export const granolaLayout = (root: string, captureRoot?: string): { documents: string; state: string } => ({
  documents: captureRoot ? root : join(root, '+/_ACQUIRE/granola'),
  state: join(root, captureRoot ? '.acquire/granola' : '+/_ACQUIRE/granola')
})

/** A safe leaf does not make symlinked parent directories safe. */
export const verifyGranolaParents = async (path: string): Promise<void> => {
  let parent = dirname(path)
  while (parent !== parse(parent).root) {
    const state = await lstat(parent).catch(() => undefined)
    if (state && (!state.isDirectory() || state.isSymbolicLink()))
      throw new KiError(`Unsafe Granola parent directory: ${parent}`)
    parent = dirname(parent)
  }
}

/** Keep package names stable unless their territory classification changes. */
export const centralGranolaPath = (current: string | undefined, rendered: string, captureRoot: string): string => {
  if (!current?.startsWith(`${captureRoot}/`)) return rendered
  const territory = (path: string): string => path.slice(captureRoot.length + 1).split('/')[0] as string
  return territory(current) === territory(rendered) ? current : rendered
}

export const copyGranolaPackage = async (source: string, destination: string): Promise<boolean> => {
  await verifyGranolaParents(join(source, 'meeting.md'))
  await verifyGranolaParents(join(destination, 'meeting.md'))
  const state = await lstat(source).catch(() => undefined)
  if (!state) return false
  const verifyDirectory = async (path: string): Promise<void> => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name)
      if (entry.isDirectory()) await verifyDirectory(child)
      else if (!entry.isFile()) throw new KiError(`Unsafe Granola package entry: ${child}`)
    }
  }
  await verifyDirectory(source)
  if (await lstat(destination).catch(() => undefined))
    throw new KiError(`Granola destination package already exists: ${destination}`)
  await mkdir(dirname(destination), { recursive: true })
  await cp(source, destination, { recursive: true, errorOnExist: true, force: false })
  return true
}
