// Builds a minimal gzip-compressed tar archive in memory, shaped exactly like a real
// harness release archive, so CLI tests can stub the fetcher with a fixture instead of
// hitting the network. Only the tar fields `installHarness`'s extractor reads are
// populated (name, size, type, prefix) — this is not a general-purpose tar writer.
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'

export type ArchiveEntry =
  | string
  | {
      readonly contents?: string
      readonly prefix?: string
      readonly size?: number | string
      readonly type: string
    }

export interface ArchiveOptions {
  readonly terminatingBlocks?: boolean
  readonly harnessPrefix?: string | null
}

const octal = (value: number, length: number): string => `${value.toString(8).padStart(length - 1, '0')}\0`

export interface HarnessArchive {
  readonly payload: Uint8Array
  readonly sha256: string
}

export const makeHarnessArchive = (
  files: Readonly<Record<string, ArchiveEntry>>,
  { terminatingBlocks = true, harnessPrefix = 'ki' }: ArchiveOptions = {}
): HarnessArchive => {
  const chunks: Uint8Array[] = []
  const firstPayload = Object.entries(files).find(([path, entry]) => {
    const rawPath = typeof entry !== 'string' && entry.prefix ? `${entry.prefix}/${path}` : path
    const parts = rawPath.split('/')
    return (
      ['skills', 'subagents', 'hooks'].includes(parts[0] as string) ||
      (!parts[0]?.startsWith('.') && ['skills', 'subagents', 'hooks'].includes(parts[1] as string))
    )
  })
  const firstEntryPrefix = firstPayload && typeof firstPayload[1] !== 'string' ? firstPayload[1].prefix : undefined
  const firstRawPath = firstPayload
    ? firstEntryPrefix
      ? `${firstEntryPrefix}/${firstPayload[0]}`
      : firstPayload[0]
    : ''
  const firstParts = firstRawPath.split('/')
  const nestedPrefix =
    firstParts.length > 1 && ['skills', 'subagents', 'hooks'].includes(firstParts[1] as string)
      ? firstParts[0]
      : undefined
  const metadataPath = nestedPrefix && !firstEntryPrefix ? `${nestedPrefix}/.ki-config.toml` : '.ki-config.toml'
  const metadataContents = `[skills.ki-repo-harness]\nprefix = ${JSON.stringify(harnessPrefix)}\n`
  const entries =
    harnessPrefix === null || files[metadataPath] !== undefined
      ? files
      : {
          [metadataPath]:
            firstEntryPrefix && nestedPrefix
              ? { contents: metadataContents, prefix: nestedPrefix, type: '0' }
              : metadataContents,
          ...files
        }
  for (const [path, entry] of Object.entries(entries)) {
    const contents = typeof entry === 'string' ? entry : (entry.contents ?? '')
    const encoded = new TextEncoder().encode(contents)
    const header = new Uint8Array(512)
    header.set(new TextEncoder().encode(path), 0)
    if (typeof entry !== 'string' && entry.prefix) header.set(new TextEncoder().encode(entry.prefix), 345)
    header.set(new TextEncoder().encode(octal(0o644, 8)), 100)
    let size: string
    if (typeof entry === 'string') size = octal(encoded.length, 12)
    else if (typeof entry.size === 'string') size = entry.size
    else size = octal(entry.size ?? encoded.length, 12)
    header.set(new TextEncoder().encode(size), 124)
    header[156] = (typeof entry === 'string' ? '0' : entry.type).charCodeAt(0)
    chunks.push(header, encoded, new Uint8Array((512 - (encoded.length % 512)) % 512))
  }
  if (terminatingBlocks) chunks.push(new Uint8Array(1024))
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const output = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  const payload = gzipSync(output)
  const sha256 = createHash('sha256').update(payload).digest('hex')
  return { payload, sha256 }
}
