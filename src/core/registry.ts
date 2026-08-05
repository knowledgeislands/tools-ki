import { randomUUID } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { parse } from 'smol-toml'
import { minimumBootstrapUserSkills } from '../agents/internal.ts'
import { acquireVerifiedArchive, extractArchive, type Fetcher } from './acquire.ts'
import { KiError } from './errors.ts'
import { canonicalHarnessIdentifier, type InstalledHarness, inspectHarnessRoot, readInstalledHarness } from './harness.ts'

export type { Fetcher } from './acquire.ts'

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
  url: 'https://codeload.github.com/knowledgeislands/ki-agentic-harness/tar.gz/501b40111aefa774aff49f10893dc235708a823c',
  sha256: '72d000a750d6cb505928d08704868e5b5852c03b86a997dc9a05039603997793'
}

type RegistryValue = Record<string, unknown> & { readonly harnesses?: unknown }

const isRecord = (value: unknown): value is RegistryValue => typeof value === 'object' && value !== null && !Array.isArray(value)

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
  return { id, url, sha256: digest }
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
    if (!Array.isArray(harnesses.ids) || harnesses.ids.some((id) => typeof id !== 'string' || !harnessIdentifier.test(id))) {
      throw new KiError('ki configuration harnesses.ids must be an array of harness identifiers', 1)
    }
    return [canonicalHarnessRelease]
  }
  if (!Array.isArray(harnesses.releases)) throw new KiError('ki configuration harnesses.releases must be an array of release entries', 1)
  const releases = harnesses.releases.map(parseRelease)
  const identities = new Set<string>([canonicalHarnessIdentifier])
  for (const release of releases) {
    if (release.id === canonicalHarnessIdentifier) {
      throw new KiError(`harness registry must not override the built-in canonical harness ${canonicalHarnessIdentifier}`, 1)
    }
    if (identities.has(release.id)) throw new KiError(`harness registry repeats ${release.id}`, 1)
    identities.add(release.id)
  }
  return [canonicalHarnessRelease, ...releases]
}

const configuredHarnessIds = async (configurationDirectory: string): Promise<readonly string[] | undefined> => {
  const path = join(configurationDirectory, 'config.toml')
  const state = await lstat(path).catch(() => undefined)
  if (!state) return undefined
  // installHarness already read this configuration as a regular file; reaching this requires a concurrent replacement.
  /* v8 ignore next */
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
  // installHarness already validated this section before recordInstalledHarness is reached.
  /* v8 ignore next */
  if (!isRecord(parsed.harnesses)) throw new KiError('ki configuration harnesses must be a TOML table', 1)
  const ids = (parsed.harnesses as { readonly ids?: unknown }).ids
  if (ids === undefined) return []
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || !harnessIdentifier.test(id))) {
    throw new KiError('ki configuration harnesses.ids must be an array of harness identifiers', 1)
  }
  return ids
}

export const recordInstalledHarness = async (configurationDirectory: string, identifier: string, installed: boolean): Promise<void> => {
  // Both CLI callers validate the harness identifier in installHarness/uninstallHarness before recording it.
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
  identifier: string,
  fetcher: Fetcher,
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

  const payload = await acquireVerifiedArchive(fetcher, release)

  const staging = await mkdtemp(join(ownerDirectory, '.install-'))
  try {
    await extractArchive(payload, staging)
    requireCapabilities(await inspectHarnessRoot(staging, identifier), options)
    if (!existing) {
      await rename(staging, destination)
      return { installed: true, replaced: false, archiveSha256: release.sha256 }
    }
    const previous = join(ownerDirectory, `.replace-${randomUUID()}`)
    await rename(destination, previous)
    /* v8 ignore start -- Recovery needs a filesystem failure after the old verified payload is parked; no CLI input can cause it. */
    try {
      await rename(staging, destination)
    } catch (error) {
      await rename(previous, destination).catch(() => undefined)
      throw error
    }
    /* v8 ignore stop */
    await rm(previous, { recursive: true, force: true })
    return { installed: true, replaced: true, archiveSha256: release.sha256 }
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
}

const canonicalHarnessDirectory = (dataDirectory: string): string => join(dataDirectory, 'harnesses', 'knowledgeislands', 'ki-agentic-harness')

const localPayloadDirectory = async (local: string, payload: (typeof payloadRoots)[number]): Promise<string> => {
  const source = resolve(local, payload)
  await physicalDirectory(source, `local harness ${payload} directory`)
  return realpath(source)
}

export const enableCanonicalHarnessDevelopment = async (dataDirectory: string, local: string): Promise<string> => {
  const harness = await realpath(resolve(local))
  await physicalDirectory(harness, 'local harness')
  const sources = new Map(await Promise.all(payloadRoots.map(async (payload) => [payload, await localPayloadDirectory(harness, payload)] as const)))
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
  await Promise.all(retiredCanonicalPayloadRoots.map((payload) => rm(join(destination, payload), { recursive: true, force: true })))
  for (const payload of payloadRoots) {
    const target = join(destination, payload)
    const targetState = await lstat(target).catch(() => undefined)
    const source = sources.get(payload)
    // The map is constructed from every payloadRoots member directly above; this only guards a future refactor.
    /* v8 ignore next */
    if (!source) throw new KiError(`local harness must provide ${payload}`, 1)
    if (targetState?.isSymbolicLink()) {
      const actual = await realpath(target).catch(() => undefined)
      if (actual !== source) throw new KiError(`installed harness ${canonicalHarnessIdentifier} ${payload} link is unfamiliar`, 1)
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
    entries.every((entry) => payloadRoots.includes(entry.name as (typeof payloadRoots)[number]) && entry.isSymbolicLink())
  )
}

export const isCanonicalHarnessDevelopmentLinked = (dataDirectory: string): Promise<boolean> => canonicalDevelopmentProjection(dataDirectory)

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
  fetcher: Fetcher
): Promise<{ readonly installed: boolean; readonly archiveSha256: string }> =>
  installHarness(configurationDirectory, dataDirectory, canonicalHarnessIdentifier, fetcher, {
    replace: await canonicalDevelopmentProjection(dataDirectory),
    requiredCapabilities: minimumBootstrapUserSkills,
    requiredCapabilitiesContext: 'canonical-bootstrap'
  })

export const uninstallHarness = async (dataDirectory: string, identifier: string): Promise<void> => {
  // The public command validates both conditions before calling this filesystem primitive; retain its defensive core guard.
  /* v8 ignore next -- no public CLI path can bypass the command validation. */
  if (!harnessIdentifier.test(identifier)) throw new KiError('harness identifier must be an owner/name identifier', 2)
  /* v8 ignore next -- no public CLI path can bypass the command validation. */
  if (identifier === canonicalHarnessIdentifier) throw new KiError(`the canonical harness ${identifier} cannot be uninstalled`, 1)

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
    entries.some((entry) => !payloadRoots.includes(entry.name as (typeof payloadRoots)[number]) || !entry.isDirectory() || entry.isSymbolicLink())
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
