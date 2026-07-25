import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { parse } from 'smol-toml'
import { KiError } from './errors.ts'
import { baseHarnessIdentifier, inspectHarnessRoot, readInstalledHarness } from './harness.ts'

const harnessIdentifier = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const sha256 = /^[a-f0-9]{64}$/
const decoder = new TextDecoder('utf-8', { fatal: true })
const payloadRoots = ['skills', 'agents', 'hooks'] as const

export interface HarnessRelease {
  readonly id: string
  readonly url: string
  readonly sha256: string
}

/**
 * The one harness every KI installation can acquire without user-managed
 * registry configuration. The Git commit and archive digest together are the
 * immutable acquisition evidence; additional harnesses remain opt-in.
 */
export const canonicalHarnessRelease: HarnessRelease = {
  id: baseHarnessIdentifier,
  url: 'https://codeload.github.com/knowledgeislands/ki-agentic-harness/tar.gz/41f5725c08687a5e94faf2d941d0a04134feb861',
  sha256: 'fff4d3f0b13b6efcde064c5f8278fc58289b6ed6ae8cbc5ae0b18c7fd0bec68c'
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

type RegistryValue = Record<string, unknown> & { readonly harnesses?: unknown }

const isRecord = (value: unknown): value is RegistryValue => typeof value === 'object' && value !== null && !Array.isArray(value)

const stringField = (source: Record<string, unknown>, field: string, description: string): string => {
  const value = source[field]
  if (typeof value !== 'string' || !value) throw new KiError(`${description} must declare ${field}`, 1)
  return value
}

const safeRelativePath = (value: string): boolean =>
  Boolean(value) && !value.startsWith('/') && value.split('/').every((part) => part && part !== '.' && part !== '..')

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
  if (!state.isFile() || state.isSymbolicLink()) throw new KiError('KI configuration must be a regular file', 1)
  let parsed: unknown
  try {
    parsed = parse(await readFile(path, 'utf8'))
  } catch {
    throw new KiError('KI configuration must be valid TOML', 1)
  }
  if (!isRecord(parsed)) throw new KiError('KI configuration must be a TOML table', 1)
  const configuration = parsed as Record<string, unknown> & { harnesses?: unknown }
  if (configuration.harnesses === undefined) return [canonicalHarnessRelease]
  if (!isRecord(configuration.harnesses)) throw new KiError('KI configuration harnesses must be a TOML table', 1)
  const harnesses = configuration.harnesses as Record<string, unknown> & { ids?: unknown; releases?: unknown }
  if (harnesses.releases === undefined) {
    if (!Array.isArray(harnesses.ids) || harnesses.ids.some((id) => typeof id !== 'string' || !harnessIdentifier.test(id))) {
      throw new KiError('KI configuration harnesses.ids must be an array of harness identifiers', 1)
    }
    return [canonicalHarnessRelease]
  }
  if (!Array.isArray(harnesses.releases)) throw new KiError('KI configuration harnesses.releases must be an array of release entries', 1)
  const releases = harnesses.releases.map(parseRelease)
  const identities = new Set<string>([baseHarnessIdentifier])
  for (const release of releases) {
    if (release.id === baseHarnessIdentifier) {
      throw new KiError(`harness registry must not override the built-in canonical harness ${baseHarnessIdentifier}`, 1)
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
  if (!state.isFile() || state.isSymbolicLink()) throw new KiError('KI configuration must be a regular file', 1)
  let parsed: unknown
  try {
    parsed = parse(await readFile(path, 'utf8'))
  } catch {
    throw new KiError('KI configuration must be valid TOML', 1)
  }
  if (!isRecord(parsed)) throw new KiError('KI configuration must be a TOML table', 1)
  if (parsed.harnesses === undefined) return []
  if (!isRecord(parsed.harnesses)) throw new KiError('KI configuration harnesses must be a TOML table', 1)
  const ids = (parsed.harnesses as { readonly ids?: unknown }).ids
  if (ids === undefined) return []
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || !harnessIdentifier.test(id))) {
    throw new KiError('KI configuration harnesses.ids must be an array of harness identifiers', 1)
  }
  return ids
}

export const recordInstalledHarness = async (configurationDirectory: string, identifier: string, installed: boolean): Promise<void> => {
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

const tarString = (archive: Uint8Array, start: number, length: number): string => {
  const end = archive.subarray(start, start + length).indexOf(0)
  return decoder.decode(archive.subarray(start, end < 0 ? start + length : start + end))
}

const tarSize = (archive: Uint8Array, start: number): number => {
  const raw = tarString(archive, start, 12).trim()
  if (!/^[0-7]*$/.test(raw)) throw new KiError('harness archive has an invalid tar entry size', 1)
  const size = Number.parseInt(raw || '0', 8)
  if (!Number.isSafeInteger(size) || size < 0) throw new KiError('harness archive has an unsafe tar entry size', 1)
  return size
}

const zeroBlock = (archive: Uint8Array, offset: number): boolean => archive.subarray(offset, offset + 512).every((byte) => byte === 0)

const extractArchive = async (payload: Uint8Array, target: string): Promise<void> => {
  let archive: Uint8Array
  try {
    archive = gunzipSync(payload)
  } catch {
    throw new KiError('harness release must be a gzip-compressed tar archive', 1)
  }
  let payloadPrefix: string | undefined
  let retained = 0
  for (let offset = 0; offset + 512 <= archive.length; ) {
    if (zeroBlock(archive, offset)) {
      if (retained === 0) throw new KiError('harness archive contains no skills, agents, or hooks payload', 1)
      return
    }
    const name = tarString(archive, offset, 100)
    const headerPrefix = tarString(archive, offset + 345, 155)
    const type = tarString(archive, offset + 156, 1)
    const rawPath = headerPrefix ? `${headerPrefix}/${name}` : name
    const path = type === '5' ? rawPath.replace(/\/+$/, '') : rawPath
    const size = tarSize(archive, offset + 124)
    const contentsStart = offset + 512
    const contentsEnd = contentsStart + size
    if (!safeRelativePath(path) || contentsEnd > archive.length) throw new KiError('harness archive contains an unsafe entry', 1)
    const parts = path.split('/')
    const direct = parts[0] === 'skills' || parts[0] === 'agents' || parts[0] === 'hooks'
    const nested = parts[1] === 'skills' || parts[1] === 'agents' || parts[1] === 'hooks'
    if (!direct && !nested) {
      offset = contentsStart + Math.ceil(size / 512) * 512
      continue
    }
    const entryPrefix = direct ? '' : (parts[0] as string)
    if (payloadPrefix !== undefined && payloadPrefix !== entryPrefix) throw new KiError('harness archive mixes payload roots', 1)
    payloadPrefix = entryPrefix
    const payloadPath = parts.slice(direct ? 0 : 1).join('/')
    if (type === '2' && payloadPath.includes('/scripts/vendored/')) {
      offset = contentsStart + Math.ceil(size / 512) * 512
      continue
    }
    if (type === '5') {
      if (size !== 0) throw new KiError('harness archive directory has contents', 1)
    } else if (type !== '' && type !== '0') {
      throw new KiError('harness archive may contain only regular files and directories', 1)
    }
    const destination = join(target, payloadPath)
    if (relative(target, destination).startsWith('..')) throw new KiError('harness archive entry escapes its staging directory', 1)
    if (type === '5') await mkdir(destination, { recursive: true })
    else {
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, archive.subarray(contentsStart, contentsEnd), { flag: 'wx' })
      retained += 1
    }
    offset = contentsStart + Math.ceil(size / 512) * 512
  }
  throw new KiError('harness archive is missing its terminating tar block', 1)
}

const removeLegacyHarnessLock = async (root: string, identifier: string): Promise<void> => {
  const path = join(root, 'harness-lock.toml')
  const state = await lstat(path).catch(() => undefined)
  if (!state) return
  if (!state.isFile() || state.isSymbolicLink()) throw new KiError(`installed harness ${identifier} has an unsafe legacy lock`, 1)
  await rm(path)
}

const migrateLegacyHarnessLayout = async (ownerDirectory: string, destination: string, identifier: string): Promise<void> => {
  const entries = await readdir(destination, { withFileTypes: true })
  const latest = entries.find((entry) => entry.name === 'latest')
  if (!latest) {
    await removeLegacyHarnessLock(destination, identifier)
    return
  }
  if (entries.length !== 1 || !latest.isDirectory() || latest.isSymbolicLink()) {
    throw new KiError(`installed harness ${identifier} has unrecognised legacy state`, 1)
  }
  const legacyRoot = join(destination, 'latest')
  await inspectHarnessRoot(legacyRoot, identifier)
  const previous = join(ownerDirectory, `.migrate-${randomUUID()}`)
  await rename(destination, previous)
  try {
    await rename(join(previous, 'latest'), destination)
    await removeLegacyHarnessLock(destination, identifier)
    await rm(previous, { recursive: true, force: true })
  } catch (error) {
    if (!(await lstat(destination).catch(() => undefined))) await rename(previous, destination).catch(() => undefined)
    throw error
  }
}

export const installHarness = async (
  configurationDirectory: string,
  dataDirectory: string,
  identifier: string,
  fetcher: Fetcher = fetch
): Promise<{ readonly installed: boolean; readonly archiveSha256: string }> => {
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
    await migrateLegacyHarnessLayout(ownerDirectory, destination, identifier)
    await readInstalledHarness(dataDirectory, identifier)
    return { installed: false, archiveSha256: release.sha256 }
  }

  let response: Response
  try {
    response = await fetcher(release.url, { redirect: 'error' })
  } catch {
    throw new KiError(`could not download configured harness ${identifier}`, 1)
  }
  if (!response.ok) throw new KiError(`could not download configured harness ${identifier}: HTTP ${response.status}`, 1)
  const payload = new Uint8Array(await response.arrayBuffer())
  const digest = createHash('sha256').update(payload).digest('hex')
  if (digest !== release.sha256) throw new KiError(`configured harness ${identifier} archive does not match its SHA-256`, 1)

  const staging = await mkdtemp(join(ownerDirectory, '.install-'))
  try {
    await extractArchive(payload, staging)
    await inspectHarnessRoot(staging, identifier)
    await rename(staging, destination)
    return { installed: true, archiveSha256: release.sha256 }
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
}

export const installCanonicalHarness = async (
  configurationDirectory: string,
  dataDirectory: string,
  fetcher: Fetcher = fetch
): Promise<{ readonly installed: boolean; readonly archiveSha256: string }> =>
  installHarness(configurationDirectory, dataDirectory, baseHarnessIdentifier, fetcher)

const canonicalHarnessDirectory = (dataDirectory: string): string =>
  join(dataDirectory, 'harnesses', 'knowledgeislands', 'ki-agentic-harness')

const localPayloadDirectory = async (local: string, payload: (typeof payloadRoots)[number]): Promise<string> => {
  const source = resolve(local, payload)
  await physicalDirectory(source, `local harness ${payload} directory`)
  return realpath(source)
}

export const enableCanonicalHarnessDevelopment = async (dataDirectory: string, local: string): Promise<string> => {
  const harness = await realpath(resolve(local)).catch(() => undefined)
  if (!harness) throw new KiError('local harness must be a directory', 1)
  await physicalDirectory(harness, 'local harness')
  const sources = new Map(
    await Promise.all(payloadRoots.map(async (payload) => [payload, await localPayloadDirectory(harness, payload)] as const))
  )
  const destination = canonicalHarnessDirectory(dataDirectory)
  await ensureDirectory(join(dataDirectory, 'harnesses'), 'installed harnesses directory')
  await ensureDirectory(dirname(destination), 'installed harness owner knowledgeislands')
  const state = await lstat(destination).catch(() => undefined)
  if (!state) await mkdir(destination)
  await physicalDirectory(destination, `installed harness ${baseHarnessIdentifier}`)
  const entries = await readdir(destination, { withFileTypes: true })
  if (
    entries.some(
      (entry) => !payloadRoots.includes(entry.name as (typeof payloadRoots)[number]) || (!entry.isDirectory() && !entry.isSymbolicLink())
    )
  ) {
    throw new KiError(`installed harness ${baseHarnessIdentifier} has unrecognised state`, 1)
  }
  for (const payload of payloadRoots) {
    const target = join(destination, payload)
    const targetState = await lstat(target).catch(() => undefined)
    const source = sources.get(payload)
    if (!source) throw new KiError(`local harness must provide ${payload}`, 1)
    if (targetState?.isSymbolicLink()) {
      const actual = await realpath(target).catch(() => undefined)
      if (actual !== source) throw new KiError(`installed harness ${baseHarnessIdentifier} ${payload} link is unfamiliar`, 1)
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
  await physicalDirectory(destination, `installed harness ${baseHarnessIdentifier}`)
  const entries = await readdir(destination, { withFileTypes: true })
  return (
    entries.length === payloadRoots.length &&
    entries.every((entry) => payloadRoots.includes(entry.name as (typeof payloadRoots)[number]) && entry.isSymbolicLink())
  )
}

export const disableCanonicalHarnessDevelopment = async (dataDirectory: string): Promise<boolean> => {
  const destination = canonicalHarnessDirectory(dataDirectory)
  if (!(await canonicalDevelopmentProjection(dataDirectory))) return false
  await rm(destination, { recursive: true })
  return true
}

export const restoreCanonicalHarness = async (
  configurationDirectory: string,
  dataDirectory: string,
  fetcher: Fetcher = fetch
): Promise<{ readonly installed: boolean; readonly archiveSha256: string }> => {
  await disableCanonicalHarnessDevelopment(dataDirectory)
  return installCanonicalHarness(configurationDirectory, dataDirectory, fetcher)
}

export const uninstallHarness = async (
  dataDirectory: string,
  identifier: string,
  dryRun = false
): Promise<{ readonly uninstalled: boolean }> => {
  if (!harnessIdentifier.test(identifier)) throw new KiError('harness identifier must be an owner/name identifier', 2)
  if (identifier === baseHarnessIdentifier) throw new KiError(`the required base harness ${identifier} cannot be uninstalled`, 1)

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
      (entry) => !payloadRoots.includes(entry.name as (typeof payloadRoots)[number]) || !entry.isDirectory() || entry.isSymbolicLink()
    )
  ) {
    throw new KiError(`installed harness ${identifier} has unrecognised state and will not be removed`, 1)
  }
  if (dryRun) return { uninstalled: false }

  const removal = join(ownerDirectory, `.uninstall-${randomUUID()}`)
  await rename(destination, removal)
  try {
    await inspectHarnessRoot(removal, identifier)
    await rm(removal, { recursive: true, force: true })
    return { uninstalled: true }
  } catch (error) {
    await rename(removal, destination).catch(() => undefined)
    throw error
  }
}
