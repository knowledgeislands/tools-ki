import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { KiError } from '../../errors.ts'
import { granolaCaptureIndex } from './captures.ts'
import { granolaCaptureRoot, granolaLayout, verifyGranolaParents } from './layout.ts'
import type { GranolaAttachmentImage } from './projection.ts'

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const sourcePattern = new RegExp(`^attachment-(${uuid})\\.(?:jpg|jpeg|png|webp)$`, 'i')
const meetingPattern = new RegExp(`^${uuid}$`, 'i')
const digest = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')
const regularFile = async (path: string): Promise<boolean> => {
  await verifyGranolaParents(path)
  const state = await lstat(path).catch(() => undefined)
  if (!state) return false
  if (!state.isFile() || state.isSymbolicLink()) throw new KiError(`Unsafe Granola image file: ${path}`)
  return true
}
const imageExtension = (bytes: Buffer): string => {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  throw new KiError('Granola image export is not PNG, JPEG, or WebP')
}
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

/** Callers establish that the manifest is a physical file before verifying it. */
export const verifyGranolaImages = async (root: string, meetingId: string, path: string): Promise<number> => {
  const directory = dirname(join(root, path))
  const manifest = join(directory, `${meetingId}--attachments.json`)
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(manifest, 'utf8')) as unknown
  } catch {
    throw new KiError(`Granola image manifest for ${meetingId} is invalid JSON`)
  }
  if (
    !record(parsed) ||
    parsed['schema'] !== 1 ||
    parsed['meeting_id'] !== meetingId ||
    !Number.isSafeInteger(parsed['expected_count']) ||
    !Array.isArray(parsed['assets']) ||
    parsed['assets'].length !== parsed['expected_count']
  ) {
    throw new KiError(`Granola image manifest for ${meetingId} is malformed`)
  }
  const seen = new Set<string>()
  for (const asset of parsed['assets']) {
    if (
      !record(asset) ||
      typeof asset['attachment_id'] !== 'string' ||
      !meetingPattern.test(asset['attachment_id']) ||
      typeof asset['file'] !== 'string' ||
      !new RegExp(`^${meetingId}--attachment-${asset['attachment_id']}\\.(?:png|jpg|webp)$`).test(asset['file']) ||
      typeof asset['sha256'] !== 'string' ||
      !/^[0-9a-f]{64}$/.test(asset['sha256']) ||
      !Number.isSafeInteger(asset['bytes']) ||
      Number(asset['bytes']) < 1 ||
      seen.has(asset['attachment_id'])
    ) {
      throw new KiError(`Granola image manifest for ${meetingId} has invalid asset`)
    }
    seen.add(asset['attachment_id'])
    const path = join(directory, asset['file'])
    if (!(await regularFile(path))) throw new KiError(`Granola image ${asset['file']} is missing`)
    const bytes = await readFile(path)
    if (digest(bytes) !== asset['sha256'] || bytes.length !== asset['bytes'])
      throw new KiError(`Granola image ${asset['file']} differs from manifest`)
    if (`${meetingId}--attachment-${asset['attachment_id']}.${imageExtension(bytes)}` !== asset['file'])
      throw new KiError(`Granola image ${asset['file']} has wrong format extension`)
  }
  return seen.size
}

export interface GranolaImageOptions {
  readonly repository: string
  readonly captureRoot?: string
  readonly source: string
  readonly directory: string
  readonly expected: number
  readonly dryRun?: boolean
  readonly now: () => number
}

export interface GranolaMcpImageManifest {
  readonly expected_count: number
  readonly detail_sha256: string
  readonly assets: readonly { readonly attachment_id: string; readonly file: string; readonly sha256: string }[]
}

export const verifyGranolaMcpImages = async (
  root: string,
  meetingId: string,
  path: string,
  detailSha256: string | undefined,
  expected: number
): Promise<GranolaMcpImageManifest> => {
  const manifest = join(dirname(join(root, path)), `${meetingId}--attachments.json`)
  if (!(await regularFile(manifest))) throw new KiError('Granola MCP screenshot manifest is missing')
  const count = await verifyGranolaImages(root, meetingId, path)
  const raw = JSON.parse(await readFile(manifest, 'utf8')) as Record<string, unknown>
  if (raw['provider'] !== 'granola-mcp' || raw['detail_sha256'] !== detailSha256 || count !== expected)
    throw new KiError('Granola screenshot inventory is not verified for this source version')
  return raw as unknown as GranolaMcpImageManifest
}

/** Preserve the exact MCP image blocks, independently of the manual-export ingress. */
export const storeGranolaMcpImages = async (options: {
  readonly root: string
  readonly path: string
  readonly meetingId: string
  readonly detailSha256: string
  readonly images: readonly GranolaAttachmentImage[]
  readonly dryRun: boolean
}): Promise<number> => {
  if (!meetingPattern.test(options.meetingId)) throw new KiError('Granola MCP image destination identity is unsafe')
  const directory = dirname(join(options.root, options.path))
  const manifestPath = join(directory, `${options.meetingId}--attachments.json`)
  await verifyGranolaParents(manifestPath)
  const assets = []
  const copies: { path: string; bytes: Buffer }[] = []
  for (const image of [...options.images].sort((left, right) => left.id.localeCompare(right.id, 'en'))) {
    const extension = imageExtension(image.bytes)
    const expectedMime = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`
    if (image.mimeType !== expectedMime) throw new KiError('Granola image MIME type differs from its bytes')
    const file = `${options.meetingId}--attachment-${image.id}.${extension}`
    const path = join(directory, file)
    const sha256 = digest(image.bytes)
    if (await regularFile(path)) {
      if (digest(await readFile(path)) !== sha256)
        throw new KiError(`Granola immutable image ${image.id} changed bytes`)
    } else copies.push({ path, bytes: image.bytes })
    assets.push({ attachment_id: image.id, file, sha256, bytes: image.bytes.length, metadata: image.metadata })
  }
  const manifest = {
    schema: 1,
    meeting_id: options.meetingId,
    provider: 'granola-mcp',
    expected_count: assets.length,
    detail_sha256: options.detailSha256,
    assets
  }
  const content = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
  const old = (await regularFile(manifestPath)) ? await readFile(manifestPath) : undefined
  if (options.dryRun) return assets.length
  await mkdir(directory, { recursive: true })
  for (const copy of copies) {
    const temporary = join(directory, `.${basename(copy.path)}.${randomUUID()}.tmp`)
    await writeFile(temporary, copy.bytes, { flag: 'wx' })
    await rename(temporary, copy.path)
  }
  if (old && !old.equals(content)) {
    const archive = join(directory, 'source-evidence', `images-${digest(old)}.json`)
    await verifyGranolaParents(archive)
    await mkdir(dirname(archive), { recursive: true })
    if (await regularFile(archive)) {
      if (!(await readFile(archive)).equals(old)) throw new KiError('Granola image evidence archive changed bytes')
    } else await writeFile(archive, old, { flag: 'wx' })
  }
  if (!old?.equals(content)) {
    const temporary = join(directory, `.${basename(manifestPath)}.${randomUUID()}.tmp`)
    await writeFile(temporary, content, { flag: 'wx' })
    await rename(temporary, manifestPath)
  }
  return assets.length
}

export interface GranolaImageResult {
  readonly repository: string
  readonly source: string
  readonly count: number
  readonly bytes: number
  readonly manifest: string
  readonly dryRun: boolean
}

export const importGranolaImages = async (options: GranolaImageOptions): Promise<GranolaImageResult> => {
  if (!meetingPattern.test(options.source)) throw new KiError('--source must be a Granola meeting UUID', 2)
  if (!Number.isSafeInteger(options.expected) || options.expected < 1)
    throw new KiError('--expected must be a positive integer from the Granola image stack', 2)
  const layout = granolaLayout(options.repository, granolaCaptureRoot(options.captureRoot))
  const root = layout.documents
  const captures = (await granolaCaptureIndex(layout, [options.source])).get(options.source) ?? []
  if (captures.length !== 1)
    throw new KiError(`Granola meeting ${options.source} must have exactly one capture before images are acquired`)
  const path = captures[0] as string
  const sourceDirectory = resolve(options.directory)
  const directoryState = await lstat(sourceDirectory).catch(() => undefined)
  if (!directoryState?.isDirectory() || directoryState.isSymbolicLink())
    throw new KiError('Granola image export directory must be a physical directory')
  const names = (await readdir(sourceDirectory)).sort((a, b) => a.localeCompare(b, 'en'))
  if (names.length !== options.expected)
    throw new KiError(`Granola image export has ${names.length} files; expected ${options.expected}`)
  const targetDirectory = dirname(join(root, path))
  const assets: { attachment_id: string; file: string; sha256: string; bytes: number }[] = []
  const copies: { target: string; bytes: Buffer }[] = []
  for (const name of names) {
    const match = sourcePattern.exec(name)
    if (!match) throw new KiError(`Granola image export has unexpected file ${name}`)
    const attachmentId = (match[1] as string).toLowerCase()
    const source = join(sourceDirectory, name)
    await regularFile(source)
    const bytes = await readFile(source)
    const sha256 = digest(bytes)
    const file = `${options.source}--attachment-${attachmentId}.${imageExtension(bytes)}`
    const target = join(targetDirectory, file)
    if (await regularFile(target)) {
      if (digest(await readFile(target)) !== sha256)
        throw new KiError(`Granola image ${file} differs from acquired copy`)
    } else copies.push({ target, bytes })
    assets.push({ attachment_id: attachmentId, file, sha256, bytes: bytes.length })
  }
  if (new Set(assets.map((asset) => asset.attachment_id)).size !== options.expected)
    throw new KiError('Granola image export repeats an attachment UUID')
  const manifest = join(targetDirectory, `${options.source}--attachments.json`)
  if (await regularFile(manifest)) {
    await verifyGranolaImages(root, options.source, path)
    const existing = JSON.parse(await readFile(manifest, 'utf8')) as { assets?: unknown }
    if (JSON.stringify(existing.assets) !== JSON.stringify(assets))
      throw new KiError('Existing Granola image manifest differs; review the source update before replacing it')
  }
  if (!options.dryRun) {
    for (const copy of copies) {
      const temporary = join(targetDirectory, `.${basename(copy.target)}.${randomUUID()}.tmp`)
      try {
        await writeFile(temporary, copy.bytes, { flag: 'wx' })
        await rename(temporary, copy.target)
      } finally {
        await rm(temporary, { force: true })
      }
    }
    if (!(await regularFile(manifest))) {
      await writeFile(
        manifest,
        `${JSON.stringify({ schema: 1, source: 'Granola desktop image export', meeting_id: options.source, expected_count: options.expected, observed_at: new Date(options.now()).toISOString(), assets }, null, 2)}\n`,
        { flag: 'wx' }
      )
    }
  }
  return {
    repository: options.repository,
    source: options.source,
    count: assets.length,
    bytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
    manifest,
    dryRun: Boolean(options.dryRun)
  }
}
