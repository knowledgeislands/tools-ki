import { randomUUID } from 'node:crypto'
import { lstat, readdir, realpath, rename, rm, symlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { KiError } from '../errors.ts'
import { canonicalHarnessIdentifier, parkedPayloadEntry, readInstalledHarness } from '../harness/index.ts'
import {
  ensureDirectory,
  harnessDirectory,
  harnessMetadataFile,
  payloadRoots,
  physicalDirectory,
  retiredCanonicalPayloadRoots
} from './harness-paths.ts'

export const installedHarnessSlot = async (
  dataDirectory: string,
  identifier: string
): Promise<{ readonly prefix?: string }> => {
  const destination = harnessDirectory(dataDirectory, identifier)
  const state = await lstat(destination).catch(() => undefined)
  if (!state?.isDirectory() && !state?.isSymbolicLink())
    throw new KiError(`installed harness ${identifier} must be a directory`, 1)
  const metadata = await lstat(join(destination, harnessMetadataFile)).catch(() => undefined)
  if (!metadata) return {}
  return { prefix: (await readInstalledHarness(dataDirectory, identifier)).prefix }
}

const localPayloadDirectory = async (local: string, payload: (typeof payloadRoots)[number]): Promise<string> => {
  const source = resolve(local, payload)
  await physicalDirectory(source, `local harness ${payload} directory`)
  return realpath(source)
}

const recognisedInstalledRoot = async (
  destination: string,
  identifier: string,
  localSources: ReadonlyMap<(typeof payloadRoots)[number], string>
): Promise<'physical' | 'local'> => {
  const state = await lstat(destination).catch(() => undefined)
  if (!state) throw new KiError(`installed harness ${identifier} must be a directory`, 1)
  if (state.isSymbolicLink()) return 'local'
  await physicalDirectory(destination, `installed harness ${identifier}`)
  const retired: readonly string[] = identifier === canonicalHarnessIdentifier ? retiredCanonicalPayloadRoots : []
  const entries = await readdir(destination, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === harnessMetadataFile) {
      if (!entry.isFile() || entry.isSymbolicLink())
        throw new KiError(`installed harness ${identifier} has unrecognised state`, 1)
      continue
    }
    if (retired.includes(entry.name)) {
      if (!entry.isDirectory() || entry.isSymbolicLink())
        throw new KiError(`installed harness ${identifier} has unrecognised state`, 1)
      continue
    }
    if (!payloadRoots.includes(entry.name as (typeof payloadRoots)[number]))
      throw new KiError(`installed harness ${identifier} has unrecognised state`, 1)
    if (entry.isSymbolicLink()) {
      const expected = localSources.get(entry.name as (typeof payloadRoots)[number])
      const actual = await realpath(join(destination, entry.name)).catch(() => undefined)
      if (!expected || actual !== expected)
        throw new KiError(`installed harness ${identifier} ${entry.name} link is unfamiliar`, 1)
      continue
    }
    if (!entry.isDirectory()) throw new KiError(`installed harness ${identifier} has unrecognised state`, 1)
  }
  return 'physical'
}

export const enableHarnessDevelopment = async (
  dataDirectory: string,
  identifier: string,
  local: string
): Promise<string> => {
  const harness = await realpath(resolve(local))
  await physicalDirectory(harness, 'local harness')
  const sources = new Map(
    await Promise.all(
      payloadRoots.map(async (payload) => [payload, await localPayloadDirectory(harness, payload)] as const)
    )
  )
  const destination = harnessDirectory(dataDirectory, identifier)
  const [owner, name] = identifier.split('/') as [string, string]
  await ensureDirectory(join(dataDirectory, 'harnesses'), 'installed harnesses directory')
  await ensureDirectory(dirname(destination), `installed harness owner ${owner}`)
  const state = await recognisedInstalledRoot(destination, identifier, sources)
  if (state === 'local') {
    const actual = await realpath(destination).catch(() => undefined)
    if (actual !== harness) throw new KiError(`installed harness ${identifier} root link is unfamiliar`, 1)
    return harness
  }
  const previous = join(dirname(destination), parkedPayloadEntry(randomUUID(), name))
  await rename(destination, previous)
  /* v8 ignore start -- Requires a filesystem failure after the verified installed root is parked; no CLI input can cause it. */
  try {
    await symlink(harness, destination, 'dir')
  } catch (error) {
    await rename(previous, destination).catch(() => undefined)
    throw error
  }
  /* v8 ignore stop */
  await rm(previous, { recursive: true, force: true })
  return harness
}

export const harnessDevelopmentProjection = async (dataDirectory: string, identifier: string): Promise<boolean> => {
  const destination = harnessDirectory(dataDirectory, identifier)
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

export const isHarnessDevelopmentLinked = (dataDirectory: string, identifier: string): Promise<boolean> =>
  harnessDevelopmentProjection(dataDirectory, identifier)

// Local development replaces the complete active Harness root, so metadata and payloads always
// come from one source. With the configured source, verify that root resolves to the checkout.
export const harnessDevelopmentEnabled = async (
  dataDirectory: string,
  identifier: string,
  local?: string
): Promise<boolean> => {
  if (!(await harnessDevelopmentProjection(dataDirectory, identifier))) return false
  if (!local) return true
  const [harness, active] = await Promise.all([
    realpath(resolve(local)).catch(() => undefined),
    realpath(harnessDirectory(dataDirectory, identifier)).catch(
      // The projection check above just resolved this same active root; only concurrent replacement can invalidate it.
      /* v8 ignore next */
      () => undefined
    )
  ])
  return Boolean(harness && harness === active)
}
