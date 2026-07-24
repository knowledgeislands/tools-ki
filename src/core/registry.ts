import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { parse } from 'smol-toml'
import { KiError } from './errors.ts'
import { readInstalledHarness, verifyHarnessRoot } from './harness.ts'

const harnessIdentifier = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const sha256 = /^[a-f0-9]{64}$/
const decoder = new TextDecoder('utf-8', { fatal: true })

export interface HarnessRelease {
  readonly id: string
  readonly url: string
  readonly sha256: string
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
  const path = join(configurationDirectory, 'harnesses.toml')
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isFile() || state.isSymbolicLink())
    throw new KiError(`harness registry is unavailable: create ${path} with immutable release evidence`, 1)
  let parsed: unknown
  try {
    parsed = parse(await readFile(path, 'utf8'))
  } catch {
    throw new KiError('harness registry must be valid TOML', 1)
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.harnesses)) throw new KiError('harness registry must declare [[harnesses]] entries', 1)
  const releases = parsed.harnesses.map(parseRelease)
  const identities = new Set<string>()
  for (const release of releases) {
    if (identities.has(release.id)) throw new KiError(`harness registry repeats ${release.id}`, 1)
    identities.add(release.id)
  }
  return releases
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
  for (let offset = 0; offset + 512 <= archive.length; ) {
    if (zeroBlock(archive, offset)) return
    const name = tarString(archive, offset, 100)
    const prefix = tarString(archive, offset + 345, 155)
    const path = prefix ? `${prefix}/${name}` : name
    const type = tarString(archive, offset + 156, 1)
    const size = tarSize(archive, offset + 124)
    const contentsStart = offset + 512
    const contentsEnd = contentsStart + size
    if (!safeRelativePath(path) || contentsEnd > archive.length) throw new KiError('harness archive contains an unsafe entry', 1)
    const destination = join(target, path)
    if (relative(target, destination).startsWith('..')) throw new KiError('harness archive entry escapes its staging directory', 1)
    if (type === '5') {
      if (size !== 0) throw new KiError('harness archive directory has contents', 1)
      await mkdir(destination, { recursive: true })
    } else if (type === '' || type === '0') {
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, archive.subarray(contentsStart, contentsEnd), { flag: 'wx' })
    } else {
      throw new KiError('harness archive may contain only regular files and directories', 1)
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
): Promise<{ readonly installed: boolean; readonly latest: string }> => {
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
    return { installed: false, latest: installed.manifest.latest }
  }

  const staging = await mkdtemp(join(destination, '.install-'))
  try {
    await extractArchive(payload, staging)
    const manifest = await verifyHarnessRoot(staging, identifier)
    await rename(staging, latest)
    return { installed: true, latest: manifest.latest }
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
}
