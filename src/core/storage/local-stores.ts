import { lstat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import type { KnowledgeBaseStoreRole } from '../configuration/declaration.ts'
import { errorWithNext, KiError } from '../errors.ts'
import type { LocalRegistryEntry } from './local-registry.ts'

export type ExternalStoreRole = Exclude<KnowledgeBaseStoreRole, 'notes'>

/** Whether a file-system error refuses access rather than reports an absence. */
export const accessDenied = (error: unknown): boolean => {
  const code = (error as NodeJS.ErrnoException).code
  return code === 'EPERM' || code === 'EACCES'
}

/** How to restore access to a folder the host refuses to read. */
export const accessDenialFix = (platform: NodeJS.Platform): string =>
  platform === 'darwin'
    ? "grant Full Disk Access to the terminal app, or to sshd-keygen-wrapper over SSH, in System Settings > Privacy & Security, or run ki at the Mac's screen"
    : 'give this user read access to the folder'

/** A denied folder as a denial with its fix, so that it is never read as missing or empty. */
export const accessDenialError = (path: string, platform: NodeJS.Platform): KiError =>
  new KiError(
    `access denied to ${path}${platform === 'darwin' ? ' by macOS privacy protection' : ''}`,
    1,
    accessDenialFix(platform)
  )

/** `lstat` that answers undefined for an absent path and throws the denial for a refused one. */
export const lstatUnlessAbsent = async (path: string, platform: NodeJS.Platform) =>
  lstat(path).catch((error: unknown) => {
    if (accessDenied(error)) throw accessDenialError(path, platform)
    return undefined
  })

export const repositoryStoreDirectory = async (
  role: ExternalStoreRole,
  path: string,
  platform: NodeJS.Platform
): Promise<string> => {
  if (!isAbsolute(path)) throw new KiError(`${role} store must be an absolute path`, 1)
  const state = await lstatUnlessAbsent(path, platform)
  if (!state?.isDirectory() || state.isSymbolicLink())
    throw new KiError(`${role} store must be an existing direct directory`, 1)
  return path
}

export type KnowledgeBaseStoreAvailability =
  | { readonly role: ExternalStoreRole; readonly root: string }
  | { readonly role: ExternalStoreRole; readonly absent: true }
  | { readonly role: ExternalStoreRole; readonly unavailable: string; readonly bound: boolean }

/**
 * Report each declared external store as its validated root, absent on this host by choice, or the
 * reason it is unavailable: unbound without a marker, or bound to a path that is not a directory.
 */
export const knowledgeBaseStoreAvailability = async (
  entry: LocalRegistryEntry | undefined,
  roles: readonly ExternalStoreRole[],
  platform: NodeJS.Platform
): Promise<readonly KnowledgeBaseStoreAvailability[]> => {
  const stores: KnowledgeBaseStoreAvailability[] = []
  for (const role of roles) {
    const path = entry?.stores?.[role]
    if (!path)
      stores.push(
        entry?.absentStores?.includes(role) ? { role, absent: true } : { role, unavailable: 'not bound', bound: false }
      )
    else
      stores.push(
        await repositoryStoreDirectory(role, path, platform).then(
          (root) => ({ role, root }),
          (error: Error) => ({ role, unavailable: errorWithNext(error), bound: true })
        )
      )
  }
  return stores
}
