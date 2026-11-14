import { randomUUID } from 'node:crypto'
import { lstat, readdir, readlink, realpath, rename, rm, symlink } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { sameBackpack } from '../backpack/identity.ts'
import { canonicalBackpackIdentifier, parkedPayloadEntry, readInstalledBackpack } from '../backpack/inspection.ts'
import { KiError } from '../errors.ts'
import {
  backpackDirectory,
  backpackMetadataFile,
  ensureDirectory,
  payloadRoots,
  physicalDirectory,
  retiredCanonicalPayloadRoots
} from './backpack-paths.ts'

export const installedBackpackSlot = async (
  dataDirectory: string,
  identifier: string
): Promise<{ readonly prefix?: string }> => {
  const destination = backpackDirectory(dataDirectory, identifier)
  const state = await lstat(destination).catch(() => undefined)
  if (!state?.isDirectory() && !state?.isSymbolicLink())
    throw new KiError(`installed backpack ${identifier} must be a directory`, 1)
  const metadata = await lstat(join(destination, backpackMetadataFile)).catch(() => undefined)
  if (!metadata) return {}
  return { prefix: (await readInstalledBackpack(dataDirectory, identifier)).prefix }
}

const localPayloadDirectory = async (local: string, payload: (typeof payloadRoots)[number]): Promise<string> => {
  const source = resolve(local, payload)
  await physicalDirectory(source, `local backpack ${payload} directory`)
  return realpath(source)
}

const recognisedInstalledRoot = async (
  destination: string,
  identifier: string,
  localSources: ReadonlyMap<(typeof payloadRoots)[number], string>
): Promise<'physical' | 'local'> => {
  const state = await lstat(destination).catch(() => undefined)
  if (!state) throw new KiError(`installed backpack ${identifier} must be a directory`, 1)
  if (state.isSymbolicLink()) return 'local'
  await physicalDirectory(destination, `installed backpack ${identifier}`)
  const retired: readonly string[] = sameBackpack(identifier, canonicalBackpackIdentifier)
    ? retiredCanonicalPayloadRoots
    : []
  const entries = await readdir(destination, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === backpackMetadataFile) {
      if (!entry.isFile() || entry.isSymbolicLink())
        throw new KiError(`installed backpack ${identifier} has unrecognised state`, 1)
      continue
    }
    if (retired.includes(entry.name)) {
      if (!entry.isDirectory() || entry.isSymbolicLink())
        throw new KiError(`installed backpack ${identifier} has unrecognised state`, 1)
      continue
    }
    if (!payloadRoots.includes(entry.name as (typeof payloadRoots)[number]))
      throw new KiError(`installed backpack ${identifier} has unrecognised state`, 1)
    if (entry.isSymbolicLink()) {
      const expected = localSources.get(entry.name as (typeof payloadRoots)[number])
      const actual = await realpath(join(destination, entry.name)).catch(() => undefined)
      if (!expected || actual !== expected)
        throw new KiError(`installed backpack ${identifier} ${entry.name} link is unfamiliar`, 1)
      continue
    }
    if (!entry.isDirectory()) throw new KiError(`installed backpack ${identifier} has unrecognised state`, 1)
  }
  return 'physical'
}

export const enableBackpackDevelopment = async (
  dataDirectory: string,
  identifier: string,
  local: string
): Promise<string> => {
  const backpack = await realpath(resolve(local))
  await physicalDirectory(backpack, 'local backpack')
  const sources = new Map(
    await Promise.all(
      payloadRoots.map(async (payload) => [payload, await localPayloadDirectory(backpack, payload)] as const)
    )
  )
  const destination = backpackDirectory(dataDirectory, identifier)
  const owner = identifier.slice(0, identifier.indexOf('/'))
  await ensureDirectory(join(dataDirectory, 'backpacks'), 'installed backpacks directory')
  await ensureDirectory(dirname(destination), `installed backpack owner ${owner}`)
  const state = await recognisedInstalledRoot(destination, identifier, sources)
  if (state === 'local') {
    const actual = await realpath(destination).catch(() => undefined)
    if (actual !== backpack) throw new KiError(`installed backpack ${identifier} root link is unfamiliar`, 1)
    return backpack
  }
  const previous = join(dirname(destination), parkedPayloadEntry(randomUUID(), basename(destination)))
  await rename(destination, previous)
  /* v8 ignore start -- Requires a filesystem failure after the verified installed root is parked; no CLI input can cause it. */
  try {
    await symlink(backpack, destination, 'dir')
  } catch (error) {
    await rename(previous, destination).catch(() => undefined)
    throw error
  }
  /* v8 ignore stop */
  await rm(previous, { recursive: true, force: true })
  return backpack
}

const backpackDevelopmentProjection = async (dataDirectory: string, identifier: string): Promise<boolean> => {
  const destination = backpackDirectory(dataDirectory, identifier)
  const state = await lstat(destination).catch(() => undefined)
  if (!state?.isSymbolicLink()) return false
  const root = await realpath(destination).catch(() => undefined)
  if (!root) return false
  const rootState = await lstat(root).catch(
    // realpath above just resolved this target; only concurrent removal reaches this fallback.
    /* v8 ignore next */
    () => undefined
  )
  return Boolean(rootState?.isDirectory())
}

export const isBackpackDevelopmentLinked = (dataDirectory: string, identifier: string): Promise<boolean> =>
  backpackDevelopmentProjection(dataDirectory, identifier)

// Local development replaces the complete active backpack root, so metadata and payloads always
// come from one source. With the configured source, verify that root resolves to the checkout.
export const backpackDevelopmentEnabled = async (
  dataDirectory: string,
  identifier: string,
  local?: string
): Promise<boolean> => {
  if (!(await backpackDevelopmentProjection(dataDirectory, identifier))) return false
  if (!local) return true
  const [backpack, active] = await Promise.all([
    realpath(resolve(local)).catch(() => undefined),
    realpath(backpackDirectory(dataDirectory, identifier)).catch(
      // The projection check above just resolved this same active root; only concurrent replacement can invalidate it.
      /* v8 ignore next */
      () => undefined
    )
  ])
  return Boolean(backpack && backpack === active)
}

export type BackpackDevelopmentBinding =
  | { readonly state: 'archive' }
  | { readonly state: 'active' }
  | {
      readonly state: 'unavailable'
      readonly reason: 'checkout-missing' | 'source-mismatch' | 'source-unconfigured'
      readonly target: string
    }

// Classify the active backpack root against its remembered local source: a physical or absent root
// is archive-backed; a root link is a development binding that is either kept or cannot be kept.
export const backpackDevelopmentBinding = async (
  dataDirectory: string,
  identifier: string,
  local?: string
): Promise<BackpackDevelopmentBinding> => {
  const destination = backpackDirectory(dataDirectory, identifier)
  const state = await lstat(destination).catch(() => undefined)
  if (!state?.isSymbolicLink()) return { state: 'archive' }
  const target = await readlink(destination)
  if (!(await backpackDevelopmentProjection(dataDirectory, identifier)))
    return { state: 'unavailable', reason: 'checkout-missing', target }
  if (!local) return { state: 'unavailable', reason: 'source-unconfigured', target }
  return (await backpackDevelopmentEnabled(dataDirectory, identifier, local))
    ? { state: 'active' }
    : { state: 'unavailable', reason: 'source-mismatch', target }
}
