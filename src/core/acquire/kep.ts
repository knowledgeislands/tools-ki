import { createHash, randomUUID } from 'node:crypto'
import { copyFile, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { KiError } from '../errors.ts'

export interface KepFile {
  readonly path: string
  readonly source?: string
  readonly content?: string | Uint8Array
}

export interface KepPayload {
  readonly checksumLines: readonly string[]
  readonly packageId: string
  readonly payloadSha256: string
}

export interface PublishKepOptions {
  readonly directory: string
  readonly files: readonly KepFile[]
  readonly payload: KepPayload
  readonly metadata: string
}

const digest = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex')

const validPayloadPath = (path: string): boolean =>
  !path.startsWith('/') &&
  !path.includes('//') &&
  path.split('/').every((segment) => segment && segment !== '.' && segment !== '..')

const fileContent = async (file: KepFile): Promise<string | Uint8Array> => {
  /* v8 ignore next -- Every CLI caller constructs one exclusive content source; no CLI argument can supply a KepFile. */
  if (file.source !== undefined && file.content !== undefined) throw new KiError('KEP file has two content sources')
  if (file.source !== undefined) return readFile(file.source)
  /* v8 ignore next -- Every CLI caller supplies content when source is absent; no CLI argument can supply a KepFile. */
  if (file.content !== undefined) return file.content
  /* v8 ignore next -- The preceding exhaustive guard is unreachable from all CLI callers. */
  throw new KiError('KEP file has no content source')
}

const orderedFiles = (files: readonly KepFile[]): readonly KepFile[] => {
  const paths = new Set<string>()
  for (const file of files) {
    /* v8 ignore next -- ChatGPT paths are validated before this boundary and Granola paths are fixed constants. */
    if (!validPayloadPath(file.path)) throw new KiError(`KEP payload path is unsafe: ${file.path}`)
    /* v8 ignore next -- Both current callers construct disjoint path namespaces; no CLI input can repeat one. */
    if (paths.has(file.path)) throw new KiError(`KEP payload path is repeated: ${file.path}`)
    paths.add(file.path)
  }
  return [...files].sort((left, right) => left.path.localeCompare(right.path, 'en'))
}

export const prepareKep = async (files: readonly KepFile[]): Promise<KepPayload> => {
  const checksumLines = await Promise.all(
    orderedFiles(files).map(async (file) => `${digest(await fileContent(file))}  ${file.path}`)
  )
  const payloadSha256 = digest(`${checksumLines.join('\n')}\n`)
  return { checksumLines, payloadSha256, packageId: `kep:sha256:${payloadSha256}` }
}

const writePayloadFile = async (root: string, file: KepFile): Promise<void> => {
  const destination = join(root, file.path)
  await mkdir(dirname(destination), { recursive: true })
  if (file.source !== undefined) {
    await copyFile(file.source, destination)
    return
  }
  await writeFile(destination, file.content as string | Uint8Array)
}

const writePreparedKep = async (options: PublishKepOptions, staging: string): Promise<void> => {
  await mkdir(staging)
  await Promise.all(options.files.map((file) => writePayloadFile(staging, file)))
  await mkdir(join(staging, 'checksums'), { recursive: true })
  await writeFile(join(staging, 'checksums/sha256sums.txt'), `${options.payload.checksumLines.join('\n')}\n`)
  await writeFile(join(staging, 'kep.toml'), options.metadata)
}

export const publishKep = async (options: PublishKepOptions): Promise<void> => {
  const staging = join(dirname(options.directory), `.${options.payload.payloadSha256}.${randomUUID()}.tmp`)
  try {
    await writePreparedKep(options, staging)
    await rename(staging, options.directory)
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    throw error
  }
}

const parseManifestLine = (line: string): readonly [string, string] => {
  const match = /^([a-f0-9]{64}) {2}(.+)$/.exec(line)
  if (!match?.[1] || !match[2] || !validPayloadPath(match[2])) throw new KiError('KEP checksum manifest is malformed')
  return [match[1], match[2]]
}

export const verifyKep = async (directory: string, expectedPayloadSha256?: string): Promise<KepPayload> => {
  const state = await lstat(directory).catch(() => undefined)
  if (!state?.isDirectory() || state.isSymbolicLink()) throw new KiError('KEP directory is not a physical directory')
  const manifest = await readFile(join(directory, 'checksums/sha256sums.txt'), 'utf8').catch(() => {
    throw new KiError('KEP checksum manifest is missing')
  })
  const lines = manifest.endsWith('\n') ? manifest.slice(0, -1).split('\n') : []
  if (!lines.length) throw new KiError('KEP checksum manifest is malformed')
  const checksumLines: string[] = []
  for (const line of lines) {
    const [expected, path] = parseManifestLine(line)
    const actual = digest(
      await readFile(join(directory, path)).catch(() => {
        throw new KiError(`KEP payload file is missing: ${path}`)
      })
    )
    if (actual !== expected) throw new KiError(`KEP payload checksum differs: ${path}`)
    checksumLines.push(line)
  }
  const payloadSha256 = digest(`${checksumLines.join('\n')}\n`)
  if (expectedPayloadSha256 && payloadSha256 !== expectedPayloadSha256)
    throw new KiError('KEP payload checksum does not match its content-addressed directory')
  const metadata = await readFile(join(directory, 'kep.toml'), 'utf8').catch(() => {
    throw new KiError('KEP metadata is missing')
  })
  if (!metadata.includes(`payload_sha256 = "${payloadSha256}"`))
    throw new KiError('KEP metadata payload checksum differs from verified manifest')
  return { checksumLines, payloadSha256, packageId: `kep:sha256:${payloadSha256}` }
}
