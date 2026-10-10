import { createHash, randomUUID } from 'node:crypto'
import { lstat, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { KiError } from '../../errors.ts'
import { granolaCaptureRoot, granolaLayout, verifyGranolaParents } from './layout.ts'
import {
  type GranolaCheckpointMeeting,
  loadGranolaCheckpoint,
  safeRelativePath,
  verifyGranolaDocument
} from './state.ts'

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

export const verifyGranolaImages = async (
  root: string,
  meetingId: string,
  meeting: GranolaCheckpointMeeting
): Promise<number> => {
  if (!safeRelativePath(meeting.path)) throw new KiError(`Granola image meeting ${meetingId} has unsafe document path`)
  const directory = dirname(join(root, meeting.path))
  const manifest = join(directory, `${meetingId}--attachments.json`)
  if (!(await regularFile(manifest))) return 0
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
  readonly repositoryId: string
  readonly captureRoot?: string
  readonly source: string
  readonly directory: string
  readonly expected: number
  readonly dryRun?: boolean
  readonly now: () => number
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
  const checkpoint = await loadGranolaCheckpoint(join(layout.state, 'ledger.json'), options.repositoryId)
  if (checkpoint?.schema !== 3) throw new KiError('Current Granola checkpoint is required')
  const meeting = checkpoint.meetings[options.source]
  if (!meeting) throw new KiError(`Granola checkpoint has no meeting ${options.source}`)
  if (!(await verifyGranolaDocument(root, meeting, options.source)))
    throw new KiError('Granola meeting document must be present before images are acquired')
  const sourceDirectory = resolve(options.directory)
  const directoryState = await lstat(sourceDirectory).catch(() => undefined)
  if (!directoryState?.isDirectory() || directoryState.isSymbolicLink())
    throw new KiError('Granola image export directory must be a physical directory')
  const names = (await readdir(sourceDirectory)).sort((a, b) => a.localeCompare(b, 'en'))
  if (names.length !== options.expected)
    throw new KiError(`Granola image export has ${names.length} files; expected ${options.expected}`)
  const targetDirectory = dirname(join(root, meeting.path))
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
    await verifyGranolaImages(root, options.source, meeting)
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
