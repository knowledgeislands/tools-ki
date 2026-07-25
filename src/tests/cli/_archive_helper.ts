// Builds a minimal gzip-compressed tar archive in memory, shaped exactly like a real
// harness release archive, so CLI tests can stub the fetcher with a fixture instead of
// hitting the network. Only the tar fields `installHarness`'s extractor reads are
// populated (name, size, type, prefix) — this is not a general-purpose tar writer.
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'

export type ArchiveEntry = string | { readonly type: '2' }

const octal = (value: number, length: number): string => `${value.toString(8).padStart(length - 1, '0')}\0`

export interface HarnessArchive {
  readonly payload: Uint8Array
  readonly sha256: string
}

export const makeHarnessArchive = (files: Readonly<Record<string, ArchiveEntry>>): HarnessArchive => {
  const chunks: Uint8Array[] = []
  for (const [path, entry] of Object.entries(files)) {
    const contents = typeof entry === 'string' ? entry : ''
    const encoded = new TextEncoder().encode(contents)
    const header = new Uint8Array(512)
    header.set(new TextEncoder().encode(path), 0)
    header.set(new TextEncoder().encode(octal(0o644, 8)), 100)
    header.set(new TextEncoder().encode(octal(encoded.length, 12)), 124)
    header[156] = (typeof entry === 'string' ? '0' : entry.type).charCodeAt(0)
    chunks.push(header, encoded, new Uint8Array((512 - (encoded.length % 512)) % 512))
  }
  chunks.push(new Uint8Array(1024))
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
