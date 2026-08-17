import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { parse } from 'smol-toml'
import { minimumBootstrapUserSkills } from '../bootstrap-capabilities.ts'
import { KiError } from '../errors.ts'
import { acquireVerifiedArchive, extractArchive, type Fetcher } from '../harness/acquire.ts'
import {
  canonicalHarnessIdentifier,
  discoverInstallOrphans,
  type InstalledHarness,
  type InstallOrphan,
  inspectHarnessRoot,
  parkedPayloadEntry,
  readInstalledHarness
} from '../harness/index.ts'
import type { Environment } from '../paths.ts'
import type { Runner } from '../runtime/runner.ts'
import { createInstallStagingArtifact } from './managed-artifacts.ts'

export type { Fetcher } from '../harness/acquire.ts'

const harnessIdentifier = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const sha256 = /^[a-f0-9]{64}$/
const payloadRoots = ['skills', 'subagents', 'hooks'] as const
// The first canonical archive used `agents/`; `ki dev local on` may replace that
// recognised retired layout with the current `subagents/` projection.
const retiredCanonicalPayloadRoots = ['agents'] as const

export interface HarnessRelease {
  readonly id: string
  readonly url: string
  readonly sha256: string
  readonly auth?: 'github-cli'
}

export interface HarnessInstallationOptions {
  /** Capabilities the replacement must retain, so active projections remain valid. */
  readonly requiredCapabilities?: readonly string[]
  /** Give canonical bootstrap inventory failures their actionable archive diagnostic. */
  readonly requiredCapabilitiesContext?: 'canonical-bootstrap'
  /** Replace an existing verified harness only after the replacement is fully inspected. */
  readonly replace?: boolean
}

export interface HarnessInstallation {
  readonly installed: boolean
  readonly replaced: boolean
  readonly archiveSha256: string
}

/**
 * The one harness every KI installation can acquire without user-managed
 * registry configuration. The Git commit and archive digest together are the
 * immutable acquisition evidence; additional harnesses remain opt-in.
 */
export const canonicalHarnessRelease: HarnessRelease = {
  id: canonicalHarnessIdentifier,
  url: 'https://codeload.github.com/knowledgeislands/ki-agentic-harness/tar.gz/445330a6836e429d603059410481f97fd921593a',
  sha256: '9d395e9b35748f7cbb26b93f96407ab407d166d2d4e2fbc8519781585ee2692c'
}

type RegistryValue = Record<string, unknown> & { readonly harnesses?: unknown }

const isRecord = (value: unknown): value is RegistryValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const stringField = (source: Record<string, unknown>, field: string, description: string): string => {
  const value = source[field]
  if (typeof value !== 'string' || !value) throw new KiError(`${description} must declare ${field}`, 1)
  return value
}

const physicalDirectory = async (path: string, description: string): Promise<void> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isDirectory() || state.isSymbolicLink()) throw new KiError(`${description} must be a directory`, 1)
}

const ensureDirectory = async (path: string, description: string): Promise<void> => {
  const state = await lstat(path).catch(() => undefined)
  if (state) return physicalDirectory(path, description)
  await mkdir(path, { recursive: true })
  await physicalDirectory(path, description)
}

const githubCodeloadPath = (identifier: string, path: string): boolean => {
  const [owner, repository] = identifier.split('/') as [string, string]
  const prefix = `/${owner}/${repository}/tar.gz/`
  const revision = path.slice(prefix.length)
  return path.startsWith(prefix) && Boolean(revision) && !revision.includes('/')
}

const parseReleaseAuthentication = (
  value: unknown,
  identifier: string,
  url: URL,
  description: string
): 'github-cli' | undefined => {
  if (value === undefined) return undefined
  if (value !== 'github-cli') throw new KiError(`${description} auth must be github-cli`, 1)
  if (url.hostname !== 'codeload.github.com' || !githubCodeloadPath(identifier, url.pathname)) {
    throw new KiError(
      `${description} github-cli authentication requires https://codeload.github.com/${identifier}/tar.gz/<revision>`,
      1
    )
  }
  return value
}

const parseRelease = (value: unknown, index: number): HarnessRelease => {
  const description = `harnesses[${index}]`
  if (!isRecord(value)) throw new KiError(`${description} must be a table`, 1)
  const id = stringField(value, 'id', description)
  if (!harnessIdentifier.test(id)) throw new KiError(`${description} id must be an owner/name identifier`, 1)
  const url = stringField(value, 'url', description)
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    throw new KiError(`${description} url must be an HTTPS URL`, 1)
  }
  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password)
    throw new KiError(`${description} url must be an HTTPS URL without credentials`, 1)
  const digest = stringField(value, 'sha256', description)
  if (!sha256.test(digest)) throw new KiError(`${description} sha256 must be lowercase SHA-256`, 1)
  return { id, url, sha256: digest, auth: parseReleaseAuthentication(value['auth'], id, parsedUrl, description) }
}

export const readHarnessRegistry = async (configurationDirectory: string): Promise<readonly HarnessRelease[]> => {
  const path = join(configurationDirectory, 'config.toml')
  const state = await lstat(path).catch(() => undefined)
  if (!state) return [canonicalHarnessRelease]
  if (!state.isFile() || state.isSymbolicLink()) throw new KiError('ki configuration must be a regular file', 1)
  let parsed: unknown
  try {
    parsed = parse(await readFile(path, 'utf8'))
  } catch {
    throw new KiError('ki configuration must be valid TOML', 1)
  }
  // A successfully parsed TOML document is always a table; this only guards a future parser change.
  /* v8 ignore next */
  if (!isRecord(parsed)) throw new KiError('ki configuration must be a TOML table', 1)
  const configuration = parsed as Record<string, unknown> & { harnesses?: unknown }
  if (configuration.harnesses === undefined) return [canonicalHarnessRelease]
  if (!isRecord(configuration.harnesses)) throw new KiError('ki configuration harnesses must be a TOML table', 1)
  const harnesses = configuration.harnesses as Record<string, unknown> & { ids?: unknown; releases?: unknown }
  if (harnesses.releases === undefined) {
    if (
      !Array.isArray(harnesses.ids) ||
      harnesses.ids.some((id) => typeof id !== 'string' || !harnessIdentifier.test(id))
    ) {
      throw new KiError('ki configuration harnesses.ids must be an array of harness identifiers', 1)
    }
    return [canonicalHarnessRelease]
  }
  if (!Array.isArray(harnesses.releases))
    throw new KiError('ki configuration harnesses.releases must be an array of release entries', 1)
  const releases = harnesses.releases.map(parseRelease)
  const identities = new Set<string>([canonicalHarnessIdentifier])
  for (const release of releases) {
    if (release.id === canonicalHarnessIdentifier) {
      throw new KiError(
        `harness registry must not override the built-in canonical harness ${canonicalHarnessIdentifier}`,
        1
      )
    }
    if (identities.has(release.id)) throw new KiError(`harness registry repeats ${release.id}`, 1)
    identities.add(release.id)
  }
  return [canonicalHarnessRelease, ...releases]
}

/**
 * Reads the configuration a harness record will have to rewrite, so a caller can refuse before it
 * removes anything. Uninstall reaches `recordInstalledHarness` without going through
 * `installHarness`, so this is the first strict read of `config.toml` on that path.
 */
export const requireWritableHarnessRegistry = async (configurationDirectory: string): Promise<void> => {
  await configuredHarnessIds(configurationDirectory)
}

const configuredHarnessIds = async (configurationDirectory: string): Promise<readonly string[] | undefined> => {
  const path = join(configurationDirectory, 'config.toml')
  const state = await lstat(path).catch(() => undefined)
  if (!state) return undefined
  if (!state.isFile() || state.isSymbolicLink()) throw new KiError('ki configuration must be a regular file', 1)
  let parsed: unknown
  try {
    parsed = parse(await readFile(path, 'utf8'))
  } catch {
    throw new KiError('ki configuration must be valid TOML', 1)
  }
  // A successfully parsed TOML document is always a table; this only guards a future parser change.
  /* v8 ignore next */
  if (!isRecord(parsed)) throw new KiError('ki configuration must be a TOML table', 1)
  if (parsed.harnesses === undefined) return []
  if (!isRecord(parsed.harnesses)) throw new KiError('ki configuration harnesses must be a TOML table', 1)
  const ids = (parsed.harnesses as { readonly ids?: unknown }).ids
  if (ids === undefined) return []
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || !harnessIdentifier.test(id))) {
    throw new KiError('ki configuration harnesses.ids must be an array of harness identifiers', 1)
  }
  return ids
}

export const recordInstalledHarness = async (
  configurationDirectory: string,
  identifier: string,
  installed: boolean
): Promise<void> => {
  // Unreachable because installHarness rejects an identifier it cannot match against the registry,
  // and the uninstall and reinstall actions both call requireHarnessIdentifier before reaching here.
  /* v8 ignore next */
  if (!harnessIdentifier.test(identifier)) throw new KiError('harness identifier must be an owner/name identifier', 2)
  const identifiers = await configuredHarnessIds(configurationDirectory)
  if (identifiers === undefined) return
  const next = new Set(identifiers)
  if (installed) next.add(identifier)
  else next.delete(identifier)
  const path = join(configurationDirectory, 'config.toml')
  const contents = await readFile(path, 'utf8')
  const ids = ['ids = [', ...[...next].sort().map((id) => `  ${JSON.stringify(id)},`), ']'].join('\n')
  const section = /\[harnesses\]\n([\s\S]*?)(?=\n\[|$)/
  const match = section.exec(contents)
  const updated = match
    ? contents.replace(section, (_whole, body: string) => {
        const existing = /ids\s*=\s*\[[\s\S]*?\](?=\n|$)/.exec(body)
        const nextBody = existing ? body.replace(existing[0], ids) : `${ids}\n${body}`
        return `[harnesses]\n${nextBody}`
      })
    : `${contents.trimEnd()}\n\n[harnesses]\n${ids}\n`
  await writeFile(path, updated, 'utf8')
}

const requireCapabilities = (harness: InstalledHarness, options: HarnessInstallationOptions): void => {
  const required = new Set(options.requiredCapabilities ?? [])
  for (const capability of required) {
    if (!harness.capabilities.some((candidate) => candidate.name === capability)) {
      if (options.requiredCapabilitiesContext === 'canonical-bootstrap') {
        throw new KiError(`canonical harness is incomplete: missing required bootstrap skill ${capability}`, 1)
      }
      throw new KiError(`harness ${harness.id} does not provide skill ${capability}`, 1)
    }
  }
}

export const installHarness = async (
  configurationDirectory: string,
  dataDirectory: string,
  stateDirectory: string,
  identifier: string,
  fetcher: Fetcher,
  runner: Runner,
  environment: Environment,
  options: HarnessInstallationOptions = {}
): Promise<HarnessInstallation> => {
  if (!harnessIdentifier.test(identifier)) throw new KiError('harness identifier must be an owner/name identifier', 2)
  const releases = await readHarnessRegistry(configurationDirectory)
  const release = releases.find((candidate) => candidate.id === identifier)
  if (!release) throw new KiError(`harness ${identifier} is not configured in the immutable release registry`, 1)
  const [owner, name] = identifier.split('/') as [string, string]
  const harnesses = join(dataDirectory, 'harnesses')
  await ensureDirectory(harnesses, 'installed harnesses directory')
  const ownerDirectory = join(harnesses, owner)
  await ensureDirectory(ownerDirectory, `installed harness owner ${owner}`)
  const destination = join(ownerDirectory, name)
  const existing = await lstat(destination).catch(() => undefined)
  if (existing) {
    requireCapabilities(await readInstalledHarness(dataDirectory, identifier), options)
    if (!options.replace) return { installed: false, replaced: false, archiveSha256: release.sha256 }
  }

  const payload = await acquireVerifiedArchive(fetcher, release, { runner, environment })

  const artifact = await createInstallStagingArtifact(stateDirectory, dataDirectory, owner)
  const staging = artifact.staging
  try {
    await mkdir(staging)
    await artifact.transition('active')
    await extractArchive(payload, staging)
    requireCapabilities(await inspectHarnessRoot(staging, identifier), options)
    if (!existing) {
      await artifact.transition('retired')
      await rename(staging, destination)
      await artifact.retire()
      return { installed: true, replaced: false, archiveSha256: release.sha256 }
    }
    const previous = join(ownerDirectory, parkedPayloadEntry(randomUUID(), name))
    await rename(destination, previous)
    await artifact.transition('retired')
    /* v8 ignore start -- Recovery needs a filesystem failure after the old verified payload is parked; no CLI input can cause it. */
    try {
      await rename(staging, destination)
    } catch (error) {
      await rename(previous, destination).catch(() => undefined)
      throw error
    }
    /* v8 ignore stop */
    await rm(previous, { recursive: true, force: true })
    await artifact.retire()
    return { installed: true, replaced: true, archiveSha256: release.sha256 }
  } catch (error) {
    await artifact.transition('recoverable')
    await rm(staging, { recursive: true, force: true })
    await artifact.retire()
    throw error
  }
}

export interface OrphanRecovery {
  readonly orphan: InstallOrphan
  readonly action: 'restore' | 'remove' | 'refuse'
  readonly detail: string
}

// Decides what an orphan deserves without doing it, so a dry run and a real run agree by
// construction. A parked payload is only ever removed once its destination is present again:
// while the destination is absent it is the sole verified copy of that harness.
const plannedRecovery = async (dataDirectory: string, orphan: InstallOrphan): Promise<OrphanRecovery> => {
  if (orphan.kind === 'staging')
    return { orphan, action: 'remove', detail: 'unpromoted extraction from an interrupted install' }
  if (!orphan.destination)
    return { orphan, action: 'refuse', detail: 'parked payload does not name the harness it replaced' }
  const destination = join(dataDirectory, 'harnesses', orphan.owner, orphan.destination)
  const present = await lstat(destination).catch(() => undefined)
  return present
    ? { orphan, action: 'remove', detail: `${orphan.owner}/${orphan.destination} is installed` }
    : { orphan, action: 'restore', detail: `restores ${orphan.owner}/${orphan.destination}` }
}

export const planOrphanRecovery = async (dataDirectory: string): Promise<readonly OrphanRecovery[]> => {
  const orphans = await discoverInstallOrphans(dataDirectory)
  return Promise.all(orphans.map((orphan) => plannedRecovery(dataDirectory, orphan)))
}

export const recoverInstallOrphans = async (
  dataDirectory: string,
  planned: readonly OrphanRecovery[]
): Promise<readonly OrphanRecovery[]> => {
  for (const recovery of planned) {
    if (recovery.action === 'restore')
      await rename(
        recovery.orphan.path,
        join(dataDirectory, 'harnesses', recovery.orphan.owner, recovery.orphan.destination as string)
      )
    if (recovery.action === 'remove') await rm(recovery.orphan.path, { recursive: true, force: true })
  }
  return planned
}

const canonicalHarnessDirectory = (dataDirectory: string): string =>
  join(dataDirectory, 'harnesses', 'knowledgeislands', 'ki-agentic-harness')

const localPayloadDirectory = async (local: string, payload: (typeof payloadRoots)[number]): Promise<string> => {
  const source = resolve(local, payload)
  await physicalDirectory(source, `local harness ${payload} directory`)
  return realpath(source)
}

export const enableCanonicalHarnessDevelopment = async (dataDirectory: string, local: string): Promise<string> => {
  const harness = await realpath(resolve(local))
  await physicalDirectory(harness, 'local harness')
  const sources = new Map(
    await Promise.all(
      payloadRoots.map(async (payload) => [payload, await localPayloadDirectory(harness, payload)] as const)
    )
  )
  const destination = canonicalHarnessDirectory(dataDirectory)
  await ensureDirectory(join(dataDirectory, 'harnesses'), 'installed harnesses directory')
  await ensureDirectory(dirname(destination), 'installed harness owner knowledgeislands')
  const state = await lstat(destination).catch(() => undefined)
  if (!state) await mkdir(destination)
  await physicalDirectory(destination, `installed harness ${canonicalHarnessIdentifier}`)
  const entries = await readdir(destination, { withFileTypes: true })
  if (
    entries.some(
      (entry) =>
        (!payloadRoots.includes(entry.name as (typeof payloadRoots)[number]) &&
          !retiredCanonicalPayloadRoots.includes(entry.name as (typeof retiredCanonicalPayloadRoots)[number])) ||
        (!entry.isDirectory() && !entry.isSymbolicLink())
    )
  ) {
    throw new KiError(`installed harness ${canonicalHarnessIdentifier} has unrecognised state`, 1)
  }
  await Promise.all(
    retiredCanonicalPayloadRoots.map((payload) => rm(join(destination, payload), { recursive: true, force: true }))
  )
  for (const payload of payloadRoots) {
    const target = join(destination, payload)
    const targetState = await lstat(target).catch(() => undefined)
    const source = sources.get(payload)
    // The map is constructed from every payloadRoots member directly above; this only guards a future refactor.
    /* v8 ignore next */
    if (!source) throw new KiError(`local harness must provide ${payload}`, 1)
    if (targetState?.isSymbolicLink()) {
      const actual = await realpath(target).catch(() => undefined)
      if (actual !== source)
        throw new KiError(`installed harness ${canonicalHarnessIdentifier} ${payload} link is unfamiliar`, 1)
      continue
    }
    if (targetState) await rm(target, { recursive: true })
    await symlink(source, target, 'dir')
  }
  return harness
}

const canonicalDevelopmentProjection = async (dataDirectory: string): Promise<boolean> => {
  const destination = canonicalHarnessDirectory(dataDirectory)
  const state = await lstat(destination).catch(() => undefined)
  if (!state) return false
  await physicalDirectory(destination, `installed harness ${canonicalHarnessIdentifier}`)
  const entries = await readdir(destination, { withFileTypes: true })
  return (
    entries.length === payloadRoots.length &&
    entries.every(
      (entry) => payloadRoots.includes(entry.name as (typeof payloadRoots)[number]) && entry.isSymbolicLink()
    )
  )
}

export const isCanonicalHarnessDevelopmentLinked = (dataDirectory: string): Promise<boolean> =>
  canonicalDevelopmentProjection(dataDirectory)

// A partial projection is not an active local harness. With the configured source,
// verify every payload link resolves to its expected local directory too.
export const canonicalHarnessDevelopmentEnabled = async (dataDirectory: string, local?: string): Promise<boolean> => {
  if (!(await canonicalDevelopmentProjection(dataDirectory))) return false
  if (!local) return true
  const harness = await realpath(resolve(local)).catch(() => undefined)
  if (!harness) return false
  const links = await Promise.all(
    payloadRoots.map(async (payload) => {
      const [source, target] = await Promise.all([
        realpath(join(harness, payload)).catch(() => undefined),
        realpath(join(canonicalHarnessDirectory(dataDirectory), payload)).catch(() => undefined)
      ])
      return Boolean(source && source === target)
    })
  )
  return links.every(Boolean)
}

export const restoreCanonicalHarness = async (
  configurationDirectory: string,
  dataDirectory: string,
  stateDirectory: string,
  fetcher: Fetcher,
  runner: Runner,
  environment: Environment
): Promise<{ readonly installed: boolean; readonly archiveSha256: string }> =>
  installHarness(
    configurationDirectory,
    dataDirectory,
    stateDirectory,
    canonicalHarnessIdentifier,
    fetcher,
    runner,
    environment,
    {
      replace: await canonicalDevelopmentProjection(dataDirectory),
      requiredCapabilities: minimumBootstrapUserSkills,
      requiredCapabilitiesContext: 'canonical-bootstrap'
    }
  )

export const uninstallHarness = async (dataDirectory: string, identifier: string): Promise<void> => {
  // The public command validates both conditions before calling this filesystem primitive; retain its defensive core guard.
  /* v8 ignore next -- no public CLI path can bypass the command validation. */
  if (!harnessIdentifier.test(identifier)) throw new KiError('harness identifier must be an owner/name identifier', 2)
  /* v8 ignore next -- no public CLI path can bypass the command validation. */
  if (identifier === canonicalHarnessIdentifier)
    throw new KiError(`the canonical harness ${identifier} cannot be uninstalled`, 1)

  await readInstalledHarness(dataDirectory, identifier)
  const [owner, name] = identifier.split('/') as [string, string]
  const harnesses = join(dataDirectory, 'harnesses')
  const ownerDirectory = join(harnesses, owner)
  await physicalDirectory(ownerDirectory, `installed harness owner ${owner}`)
  const destination = join(ownerDirectory, name)
  await physicalDirectory(destination, `installed harness ${identifier}`)
  const entries = await readdir(destination, { withFileTypes: true })
  if (
    !entries.length ||
    entries.some(
      (entry) =>
        !payloadRoots.includes(entry.name as (typeof payloadRoots)[number]) ||
        !entry.isDirectory() ||
        entry.isSymbolicLink()
    )
  ) {
    throw new KiError(`installed harness ${identifier} has unrecognised state and will not be removed`, 1)
  }
  const removal = join(ownerDirectory, `.uninstall-${randomUUID()}`)
  await rename(destination, removal)
  try {
    await inspectHarnessRoot(removal, identifier)
    await rm(removal, { recursive: true, force: true })
    return
    /* v8 ignore start -- Recovery needs a filesystem failure or replacement after the successful rename; no single CLI input can cause it. */
  } catch (error) {
    await rename(removal, destination).catch(() => undefined)
    throw error
  }
  /* v8 ignore stop */
}
