import { lstat } from 'node:fs/promises'
import { dirname, join, parse } from 'node:path'
import { KiError } from '../../errors.ts'

export const granolaCaptureRoot = (value: unknown): string | undefined => {
  if (value !== undefined && (typeof value !== 'string' || !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(value)))
    throw new KiError('[skills.ki-acquire-granola].capture_root must be a safe repository-relative directory')
  return value as string | undefined
}

/** Capture paths are relative to `documents`; `captures` is the directory that holds them. */
export const granolaLayout = (root: string, captureRoot?: string): { documents: string; captures: string } => ({
  documents: captureRoot ? root : join(root, '+/_ACQUIRE/granola'),
  captures: captureRoot ? join(root, captureRoot) : join(root, '+/_ACQUIRE/granola')
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
