import { join } from 'node:path'

/**
 * A work folder's entry file, the definition of its work. Kris renamed it from `work.md` to `_index.md`, so that it
 * sorts first, on 8 November 2026 (INDEX-ENTRY); through the rollout a folder may still hold `work.md`, read when it
 * has no `_index.md`.
 */
export const WORK_ENTRY_FILE = '_index.md'
export const LEGACY_WORK_ENTRY_FILE = 'work.md'

/** The entry file names a work folder may hold, preferred first. */
export const WORK_ENTRY_FILES = [WORK_ENTRY_FILE, LEGACY_WORK_ENTRY_FILE] as const

export interface WorkEntryFile {
  /** The file the folder's definition is read from: `_index.md`, else `work.md`. */
  readonly name: (typeof WORK_ENTRY_FILES)[number]
  /** Whether the folder holds both names, a finding: `_index.md` governs and `work.md` should go. */
  readonly both: boolean
}

/**
 * The work folder's entry file, by the caller's own test of a file, so that each reader keeps whether it follows a
 * symbolic link; undefined when the folder holds neither name.
 */
export const workEntryFile = async (
  folder: string,
  isFile: (path: string) => Promise<boolean>
): Promise<WorkEntryFile | undefined> => {
  const [current, legacy] = await Promise.all(WORK_ENTRY_FILES.map((name) => isFile(join(folder, name))))
  if (current) return { name: WORK_ENTRY_FILE, both: legacy === true }
  return legacy ? { name: LEGACY_WORK_ENTRY_FILE, both: false } : undefined
}

/** The finding a folder holding both entry files carries, naming the folder relative to its repository. */
export const bothEntryFilesWarning = (folder: string): string =>
  `${folder}/ holds both ${WORK_ENTRY_FILE} and ${LEGACY_WORK_ENTRY_FILE}; ${WORK_ENTRY_FILE} governs, so remove ${LEGACY_WORK_ENTRY_FILE}`
