import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, realpath, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { parse } from 'smol-toml'
import { KiError } from '../errors.ts'

const artifactIdentifier = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const harnessOwner = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

type ArtifactState = 'creating' | 'active' | 'recoverable' | 'retired'

interface ManagedArtifact {
  readonly id: string
  readonly operation: 'harness-install'
  readonly state: ArtifactState
  readonly paths: readonly [string]
  readonly lock: string
}

export interface InstallStagingArtifact {
  readonly staging: string
  readonly transition: (state: ArtifactState) => Promise<void>
  readonly retire: () => Promise<void>
}

export interface ManagedArtifactReport {
  readonly label: string
  /** A validated owned artifact path, used to avoid duplicating legacy recovery reports. */
  readonly path?: string
  readonly kind:
    | 'candidate'
    | 'live'
    | 'interrupted-recoverable'
    | 'manually-altered'
    | 'foreign'
    | 'unreadable-manifest'
}

interface ManagedArtifactRecoveryLease {
  readonly path: string
  readonly retire: () => Promise<void>
  readonly release: () => Promise<void>
}

export interface ManagedArtifactRecoveryControl {
  readonly leases: readonly ManagedArtifactRecoveryLease[]
  readonly protected: readonly { readonly path: string; readonly detail: string }[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const contained = (root: string, path: string): boolean => {
  const remainder = relative(root, path)
  return remainder === '' || (!remainder.startsWith('..') && remainder !== '..')
}

const artifactsDirectory = (stateDirectory: string): string => join(stateDirectory, 'managed-artifacts')

const locksDirectory = (stateDirectory: string): string => join(artifactsDirectory(stateDirectory), 'locks')

const manifestPath = (stateDirectory: string, id: string): string =>
  join(artifactsDirectory(stateDirectory), `${id}.toml`)

const physicalDirectory = async (path: string, description: string): Promise<void> => {
  // A directory cannot vanish between its caller's validation and this check without a filesystem race.
  /* v8 ignore next */
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isDirectory() || state.isSymbolicLink()) throw new KiError(`${description} must be a directory`, 1)
}

const ensureDirectory = async (path: string, description: string): Promise<void> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state) await mkdir(path, { recursive: true })
  await physicalDirectory(path, description)
}

const render = (artifact: ManagedArtifact): string =>
  [
    'schema = 1',
    `id = ${JSON.stringify(artifact.id)}`,
    `operation = ${JSON.stringify(artifact.operation)}`,
    `state = ${JSON.stringify(artifact.state)}`,
    `paths = [${artifact.paths.map((path) => JSON.stringify(path)).join(', ')}]`,
    `lock = ${JSON.stringify(artifact.lock)}`,
    ''
  ].join('\n')

const writeAtomically = async (path: string, content: string): Promise<void> => {
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

const validState = (value: unknown): value is ArtifactState =>
  value === 'creating' || value === 'active' || value === 'recoverable' || value === 'retired'

const readManifest = async (path: string): Promise<ManagedArtifact> => {
  // The directory scan supplied this path; its disappearance before inspection is a filesystem race.
  /* v8 ignore next */
  const file = await lstat(path).catch(() => undefined)
  if (!file?.isFile() || file.isSymbolicLink()) throw new Error('manifest must be a regular file')
  let parsed: unknown
  try {
    parsed = parse(await readFile(path, 'utf8'))
  } catch {
    throw new Error('manifest must be valid TOML')
  }
  // TOML documents are tables; this only protects a future parser change.
  /* v8 ignore next */
  if (!isRecord(parsed)) throw new Error('manifest must be a TOML table')
  const { schema, id, operation, state, paths, lock } = parsed
  if (schema !== 1) throw new Error('schema 1 is required')
  if (typeof id !== 'string' || !artifactIdentifier.test(id)) throw new Error('id must be a UUID')
  if (operation !== 'harness-install') throw new Error('operation is not supported')
  if (!validState(state)) throw new Error('state is invalid')
  if (
    !Array.isArray(paths) ||
    paths.length !== 1 ||
    paths.some((path) => typeof path !== 'string' || !isAbsolute(path))
  )
    throw new Error('paths must contain one absolute path')
  if (typeof lock !== 'string' || !isAbsolute(lock)) throw new Error('lock must be an absolute path')
  return { id, operation, state, paths: paths as [string], lock }
}

const installPath = async (dataDirectory: string, path: string): Promise<boolean> => {
  const harnesses = await realpath(resolve(dataDirectory, 'harnesses')).catch(() => undefined)
  if (!harnesses) return false
  if (!contained(harnesses, path)) return false
  const relativePath = relative(harnesses, path).split('/')
  if (relativePath.length !== 2) return false
  const [owner, name] = relativePath as [string, string]
  return harnessOwner.test(owner) && name.startsWith('.install-')
}

const expectedLock = (stateDirectory: string, artifact: ManagedArtifact): boolean =>
  artifact.lock === join(locksDirectory(stateDirectory), artifact.id)

const acquireLock = async (path: string): Promise<boolean> => {
  // The locks directory was verified before this acquisition; its disappearance is a filesystem race.
  /* v8 ignore next */
  const parent = await lstat(dirname(path)).catch(() => undefined)
  // Only the same filesystem race can make the checked parent non-physical here.
  /* v8 ignore next */
  if (!parent?.isDirectory() || parent.isSymbolicLink()) return false
  try {
    await mkdir(path)
    return true
  } catch {
    return false
  }
}

const releaseLock = (path: string): Promise<void> => rmdir(path)

const lockHeld = async (path: string): Promise<boolean> => Boolean(await lstat(path).catch(() => undefined))

export const createInstallStagingArtifact = async (
  stateDirectory: string,
  dataDirectory: string,
  owner: string
): Promise<InstallStagingArtifact> => {
  const id = randomUUID()
  const directory = artifactsDirectory(stateDirectory)
  const locks = locksDirectory(stateDirectory)
  await ensureDirectory(directory, 'managed artifacts directory')
  await ensureDirectory(locks, 'managed artifacts locks directory')
  const lock = join(locks, id)
  await mkdir(lock)
  const ownerDirectory = await realpath(join(dataDirectory, 'harnesses', owner))
  const staging = join(ownerDirectory, `.install-${id}`)
  let artifact: ManagedArtifact = { id, operation: 'harness-install', state: 'creating', paths: [staging], lock }
  const path = manifestPath(stateDirectory, id)
  try {
    await writeAtomically(path, render(artifact))
  } catch (error) {
    // A manifest write failure can occur only after the lock is acquired; no CLI input can
    // provoke that filesystem fault, but leaving its lock would turn a failed install into a
    // permanent live record.
    /* v8 ignore start */
    await releaseLock(lock)
    throw error
    /* v8 ignore stop */
  }
  const transition = async (state: ArtifactState): Promise<void> => {
    artifact = { ...artifact, state }
    await writeAtomically(path, render(artifact))
  }
  return {
    staging,
    transition,
    retire: async () => {
      await rm(path, { force: true })
      await releaseLock(lock)
    }
  }
}

const report = (
  id: string,
  kind: ManagedArtifactReport['kind'],
  detail: string,
  path?: string
): ManagedArtifactReport => ({
  kind,
  label: `artifact ${id} [${kind === 'candidate' ? 'candidate' : `refused: ${kind}`}] ${detail}`,
  ...(path ? { path } : {})
})

const reportManifest = async (
  stateDirectory: string,
  dataDirectory: string,
  path: string,
  locksArePhysical: boolean
): Promise<ManagedArtifactReport> => {
  let artifact: ManagedArtifact
  try {
    artifact = await readManifest(path)
  } catch (error) {
    return report(path, 'unreadable-manifest', (error as Error).message)
  }
  if (basename(path) !== `${artifact.id}.toml`)
    return report(artifact.id, 'unreadable-manifest', 'manifest name does not match id')
  if (!(await installPath(dataDirectory, artifact.paths[0])) || !expectedLock(stateDirectory, artifact))
    return report(artifact.id, 'foreign', 'declared path or lock is outside the harness-install boundary')
  if (!locksArePhysical || (await lockHeld(artifact.lock)))
    return report(artifact.id, 'live', 'operation lock is held or unverifiable', artifact.paths[0])
  const state = await lstat(artifact.paths[0]).catch(() => undefined)
  if (!state?.isDirectory() || state.isSymbolicLink())
    return report(
      artifact.id,
      'manually-altered',
      'declared staging path is not a physical directory',
      artifact.paths[0]
    )
  if (artifact.state === 'creating' || artifact.state === 'recoverable')
    return report(artifact.id, 'interrupted-recoverable', 'use ki manage repair', artifact.paths[0])
  if (artifact.state === 'active')
    return report(artifact.id, 'live', 'active record has no producer lock', artifact.paths[0])
  return report(
    artifact.id,
    'candidate',
    `retired harness-install · would remove ${artifact.paths[0]}`,
    artifact.paths[0]
  )
}

export const reportManagedArtifacts = async (
  stateDirectory: string,
  dataDirectory: string
): Promise<readonly ManagedArtifactReport[]> => {
  const directory = artifactsDirectory(stateDirectory)
  const state = await lstat(directory).catch(() => undefined)
  if (!state) return []
  if (!state.isDirectory() || state.isSymbolicLink())
    return [report(directory, 'unreadable-manifest', 'managed artifacts directory must be a physical directory')]
  const locks = await lstat(locksDirectory(stateDirectory)).catch(() => undefined)
  const locksArePhysical = Boolean(locks?.isDirectory() && !locks.isSymbolicLink())
  const entries = await readdir(directory, { withFileTypes: true })
  const manifests = entries
    .filter((entry) => entry.name.endsWith('.toml'))
    .map((entry) => join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right))
  return Promise.all(manifests.map((path) => reportManifest(stateDirectory, dataDirectory, path, locksArePhysical)))
}

export const acquireManagedArtifactRecovery = async (
  stateDirectory: string,
  dataDirectory: string
): Promise<ManagedArtifactRecoveryControl> => {
  const directory = artifactsDirectory(stateDirectory)
  const directoryState = await lstat(directory).catch(() => undefined)
  if (!directoryState?.isDirectory() || directoryState.isSymbolicLink()) return { leases: [], protected: [] }
  const locks = await lstat(locksDirectory(stateDirectory)).catch(() => undefined)
  const locksArePhysical = Boolean(locks?.isDirectory() && !locks.isSymbolicLink())
  const entries = await readdir(directory, { withFileTypes: true })
  const leases: ManagedArtifactRecoveryLease[] = []
  const protectedPaths: { path: string; detail: string }[] = []
  for (const entry of entries.filter((entry) => entry.name.endsWith('.toml'))) {
    let artifact: ManagedArtifact
    try {
      artifact = await readManifest(join(directory, entry.name))
    } catch {
      continue
    }
    if (basename(entry.name) !== `${artifact.id}.toml` || !(await installPath(dataDirectory, artifact.paths[0])))
      continue
    if (!locksArePhysical || !expectedLock(stateDirectory, artifact)) {
      protectedPaths.push({ path: artifact.paths[0], detail: 'managed artifact lock is unsafe' })
      continue
    }
    if (!(await acquireLock(artifact.lock))) {
      protectedPaths.push({ path: artifact.paths[0], detail: 'managed artifact operation is live' })
      continue
    }
    if (artifact.state !== 'creating' && artifact.state !== 'recoverable') {
      await releaseLock(artifact.lock)
      protectedPaths.push({ path: artifact.paths[0], detail: 'managed artifact is not recoverable' })
      continue
    }
    let held = true
    const release = async (): Promise<void> => {
      if (!held) return
      held = false
      await releaseLock(artifact.lock)
    }
    leases.push({
      path: artifact.paths[0],
      retire: async () => {
        await rm(join(directory, entry.name), { force: true })
        await release()
      },
      release
    })
  }
  return { leases, protected: protectedPaths }
}
