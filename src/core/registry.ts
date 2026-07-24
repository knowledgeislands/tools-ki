import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { parse } from 'smol-toml'
import { KiError } from './errors.ts'
import { baseHarnessIdentifier, createHarnessLock, readInstalledHarness, renderHarnessLock, verifyHarnessRoot } from './harness.ts'

const harnessIdentifier = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const sha256 = /^[a-f0-9]{64}$/
const decoder = new TextDecoder('utf-8', { fatal: true })

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

export const isHarnessIdentifier = (value: string): boolean => harnessIdentifier.test(value)

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
  const path = join(configurationDirectory, 'harnesses.toml')
  const state = await lstat(path).catch(() => undefined)
  if (!state) return [canonicalHarnessRelease]
  if (!state.isFile() || state.isSymbolicLink()) throw new KiError('harness registry must be a regular file', 1)
  let parsed: unknown
  try {
    parsed = parse(await readFile(path, 'utf8'))
  } catch {
    throw new KiError('harness registry must be valid TOML', 1)
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.harnesses)) throw new KiError('harness registry must declare [[harnesses]] entries', 1)
  const releases = parsed.harnesses.map(parseRelease)
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

  const [owner, name] = identifier.split('/') as [string, string]
  const harnesses = join(dataDirectory, 'harnesses')
  await ensureDirectory(harnesses, 'installed harnesses directory')
  const ownerDirectory = join(harnesses, owner)
  await ensureDirectory(ownerDirectory, `installed harness owner ${owner}`)
  const destination = join(ownerDirectory, name)
  await ensureDirectory(destination, `installed harness ${identifier}`)
  const latest = join(destination, 'latest')
  const existing = await lstat(latest).catch(() => undefined)
  if (existing) {
    const installed = await readInstalledHarness(dataDirectory, identifier)
    return { installed: false, archiveSha256: installed.lock.archive.sha256 }
  }

  const staging = await mkdtemp(join(destination, '.install-'))
  try {
    await extractArchive(payload, staging)
    const lock = await createHarnessLock(staging, identifier, { url: release.url, sha256: release.sha256 })
    await writeFile(join(staging, 'harness-lock.toml'), renderHarnessLock(lock), { flag: 'wx' })
    await rename(staging, latest)
    return { installed: true, archiveSha256: lock.archive.sha256 }
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

export const uninstallHarness = async (
  dataDirectory: string,
  identifier: string,
  dryRun = false
): Promise<{ readonly uninstalled: boolean; readonly archiveSha256: string }> => {
  if (!harnessIdentifier.test(identifier)) throw new KiError('harness identifier must be an owner/name identifier', 2)
  if (identifier === baseHarnessIdentifier) throw new KiError(`the required base harness ${identifier} cannot be uninstalled`, 1)

  const installed = await readInstalledHarness(dataDirectory, identifier)
  const [owner, name] = identifier.split('/') as [string, string]
  const harnesses = join(dataDirectory, 'harnesses')
  const ownerDirectory = join(harnesses, owner)
  await physicalDirectory(ownerDirectory, `installed harness owner ${owner}`)
  const destination = join(ownerDirectory, name)
  await physicalDirectory(destination, `installed harness ${identifier}`)
  const entries = await readdir(destination, { withFileTypes: true })
  if (entries.length !== 1 || entries[0]?.name !== 'latest' || !entries[0].isDirectory() || entries[0].isSymbolicLink()) {
    throw new KiError(`installed harness ${identifier} has unrecognised state and will not be removed`, 1)
  }
  if (dryRun) return { uninstalled: false, archiveSha256: installed.lock.archive.sha256 }

  const removal = join(ownerDirectory, `.uninstall-${randomUUID()}`)
  await rename(destination, removal)
  try {
    await verifyHarnessRoot(join(removal, 'latest'), identifier)
    await rm(removal, { recursive: true, force: true })
    return { uninstalled: true, archiveSha256: installed.lock.archive.sha256 }
  } catch (error) {
    await rename(removal, destination).catch(() => undefined)
    throw error
  }
}
