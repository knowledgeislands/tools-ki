import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { KiError } from './errors.ts'
import type { HarnessRelease } from './registry.ts'

const decoder = new TextDecoder('utf-8', { fatal: true })

export type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

const safeRelativePath = (value: string): boolean =>
  Boolean(value) && !value.startsWith('/') && value.split('/').every((part) => part && part !== '.' && part !== '..')

export const tarString = (archive: Uint8Array, start: number, length: number): string => {
  const end = archive.subarray(start, start + length).indexOf(0)
  return decoder.decode(archive.subarray(start, end < 0 ? start + length : start + end))
}

export const tarSize = (archive: Uint8Array, start: number): number => {
  const raw = tarString(archive, start, 12).trim()
  if (!/^[0-7]*$/.test(raw)) throw new KiError('harness archive has an invalid tar entry size', 1)
  const size = Number.parseInt(raw || '0', 8)
  // A twelve-byte octal tar size is necessarily a non-negative safe JavaScript integer.
  /* v8 ignore next */
  if (!Number.isSafeInteger(size) || size < 0) throw new KiError('harness archive has an unsafe tar entry size', 1)
  return size
}

export const zeroBlock = (archive: Uint8Array, offset: number): boolean => archive.subarray(offset, offset + 512).every((byte) => byte === 0)

interface ParsedTarEntry {
  readonly payloadPath: string
  readonly type: string
  readonly contentsStart: number
  readonly contentsEnd: number
}

/**
 * Parses every payload entry (under `skills/`, `subagents/`, or `hooks/`, optionally
 * nested one level under a harness-source prefix) out of a decompressed tar archive
 * without writing anything to disk. Runtime projections such as `.agents/skills/`
 * are source metadata, not harness payloads.
 */
const parsePayloadEntries = (archive: Uint8Array): readonly ParsedTarEntry[] => {
  let payloadPrefix: string | undefined
  const entries: ParsedTarEntry[] = []
  for (let offset = 0; offset + 512 <= archive.length; ) {
    if (zeroBlock(archive, offset)) return entries
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
    const direct = parts[0] === 'skills' || parts[0] === 'subagents' || parts[0] === 'hooks'
    const nested = !parts[0]?.startsWith('.') && (parts[1] === 'skills' || parts[1] === 'subagents' || parts[1] === 'hooks')
    if (direct || nested) {
      const entryPrefix = direct ? '' : (parts[0] as string)
      if (payloadPrefix !== undefined && payloadPrefix !== entryPrefix) throw new KiError('harness archive mixes payload roots', 1)
      payloadPrefix = entryPrefix
      const payloadPath = parts.slice(direct ? 0 : 1).join('/')
      entries.push({ payloadPath, type, contentsStart, contentsEnd })
    }
    offset = contentsStart + Math.ceil(size / 512) * 512
  }
  throw new KiError('harness archive is missing its terminating tar block', 1)
}

export const extractArchive = async (payload: Uint8Array, target: string): Promise<void> => {
  let archive: Uint8Array
  try {
    archive = gunzipSync(payload)
  } catch {
    throw new KiError('harness release must be a gzip-compressed tar archive', 1)
  }
  const entries = parsePayloadEntries(archive)

  let retained = 0
  for (const entry of entries) {
    if (entry.type === '5') {
      if (entry.contentsEnd !== entry.contentsStart) throw new KiError('harness archive directory has contents', 1)
    } else if (entry.type !== '' && entry.type !== '0') {
      throw new KiError('harness archive may contain only regular files and directories', 1)
    }
    const destination = join(target, entry.payloadPath)
    // payloadPath passed safeRelativePath before this join; this only guards a future extraction refactor.
    /* v8 ignore next */
    if (relative(target, destination).startsWith('..')) throw new KiError('harness archive entry escapes its staging directory', 1)
    if (entry.type === '5') await mkdir(destination, { recursive: true })
    else {
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, archive.subarray(entry.contentsStart, entry.contentsEnd), { flag: 'wx' })
      retained += 1
    }
  }
  if (retained === 0) throw new KiError('harness archive contains no skills, agents, or hooks payload', 1)
}

/**
 * Downloads a configured harness release and verifies its bytes against the
 * immutable SHA-256 evidence recorded in the release registry, returning the
 * verified archive payload for extraction. Never follows redirects — the
 * digest is only meaningful against the exact bytes served at the configured
 * URL.
 */
export const acquireVerifiedArchive = async (fetcher: Fetcher, release: HarnessRelease): Promise<Uint8Array> => {
  let response: Response
  try {
    response = await fetcher(release.url, { redirect: 'error' })
  } catch {
    throw new KiError(`could not download configured harness ${release.id}`, 1)
  }
  if (!response.ok) throw new KiError(`could not download configured harness ${release.id}: HTTP ${response.status}`, 1)
  const payload = new Uint8Array(await response.arrayBuffer())
  const digest = createHash('sha256').update(payload).digest('hex')
  if (digest !== release.sha256) throw new KiError(`configured harness ${release.id} archive does not match its SHA-256`, 1)
  return payload
}
