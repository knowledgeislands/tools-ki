import { dirname, join, relative } from 'node:path'
import { KiError } from '../../errors.ts'
import type { Runner } from '../../runtime/runner.ts'
import { type GranolaCapture, granolaCaptureIndex, readGranolaCapture } from './captures.ts'
import { type GranolaMcpImageManifest, verifyGranolaMcpImages } from './images.ts'
import { granolaLayout } from './layout.ts'
import { attribute, granolaAttachmentInventory, granolaScreenshotCount, record, stringField } from './projection.ts'
import { granolaReceivers } from './routing.ts'
import {
  type GranolaFolder,
  type GranolaOperationContext,
  granolaDetailHash,
  granolaFolderMarker,
  granolaSource,
  sha256,
  stableJson
} from './source.ts'
import { enumerateGranolaMeetings, granolaInterval } from './windows.ts'

export const privateGranolaMarker = (id: string, folders: readonly GranolaFolder[]): GranolaFolder => {
  const folder = folders.find((candidate) => candidate.id === id)
  const data = record(folder?.projection)
  if (!folder || data?.['visibility'] !== 'private' || data['role'] !== 'owner' || data['audience'] !== 'only you')
    throw new KiError('Acquired must be an owner-controlled private folder whose audience is only you')
  return folder
}

export const granolaMeetingFolders = (projection: unknown): readonly string[] => {
  let ids: string[]
  if (typeof projection === 'string') {
    if (!/<folders\b/.test(projection)) throw new KiError('Granola did not provide authoritative folder memberships')
    ids = [...projection.matchAll(/<folder\b[^>]*>/g)].map((match) => attribute(match[0], 'id') ?? '')
  } else {
    const data = record(projection)
    const folders = data?.['folders'] ?? data?.['folder_ids']
    if (!Array.isArray(folders)) throw new KiError('Granola did not provide authoritative folder memberships')
    ids = folders.map((folder) => (typeof folder === 'string' ? folder : (stringField(folder, ['id']) ?? '')))
  }
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length)
    throw new KiError('Granola folder memberships contain an invalid identity')
  return ids.sort((left, right) => left.localeCompare(right, 'en'))
}

const committedFile = async (
  repository: string,
  path: string,
  runner: Runner,
  environment: NodeJS.ProcessEnv
): Promise<void> => {
  const captured = await runner('git', ['-C', repository, 'rev-parse', '--verify', `HEAD:${path}`], environment)
  const local = await runner(
    'git',
    ['-C', repository, 'hash-object', '--no-filters', '--', join(repository, path)],
    environment
  )
  if (captured.exitCode || local.exitCode || !captured.output.trim() || captured.output.trim() !== local.output.trim())
    throw new KiError(`Granola capture is not committed at HEAD: ${path}`)
}

/** The committed capture and its screenshots are the preservation evidence; there is no separate receipt. */
export const verifyGranolaPreservation = async (options: {
  readonly repository: string
  readonly root: string
  readonly capture: GranolaCapture
  readonly id: string
  readonly expectedImages: number
  readonly runner: Runner
  readonly environment: NodeJS.ProcessEnv
}): Promise<GranolaMcpImageManifest> => {
  const directory = dirname(join(options.root, options.capture.path))
  const manifest = await verifyGranolaMcpImages(
    options.root,
    options.id,
    options.capture.path,
    options.capture.detailSha256,
    options.expectedImages
  )
  const paths = [
    join(options.root, options.capture.path),
    join(directory, `${options.id}--attachments.json`),
    ...manifest.assets.map((asset) => join(directory, asset.file))
  ]
  for (const path of paths)
    await committedFile(options.repository, relative(options.repository, path), options.runner, options.environment)
  return manifest
}

export interface GranolaMarkOptions {
  readonly repository?: string
  readonly since: string
  readonly until: string
  readonly sources?: readonly string[]
  readonly confirm?: boolean
}

export interface GranolaMarkResult {
  readonly repository: string
  readonly folder: string
  readonly ready: number
  readonly marked: number
  readonly already: number
  readonly exceptions: readonly { readonly id: string; readonly reason: string }[]
}

export const markGranola = async (
  options: GranolaMarkOptions,
  context: GranolaOperationContext
): Promise<GranolaMarkResult> => {
  const interval = granolaInterval(options.since, options.until)
  const { target } = await granolaReceivers({ repository: options.repository, ...context })
  if (!target.acquiredFolderId) throw new KiError('Granola marking requires acquired_folder_id')
  const layout = granolaLayout(target.root, target.captureRoot)
  const source = await granolaSource(context.runner, context.environment)
  if (!source.images) throw new KiError('Granola marking requires authoritative MCP screenshot access')
  privateGranolaMarker(target.acquiredFolderId, await source.folders())
  const writer = options.confirm ? await granolaFolderMarker(context.runner, context.environment) : undefined
  const enumeration = await enumerateGranolaMeetings(source, interval)
  const sources = options.sources ?? [...enumeration.meetings.keys()]
  if (new Set(sources).size !== sources.length || sources.some((id) => !enumeration.meetings.has(id)))
    throw new KiError('Every mark source must be a distinct owned note in the requested interval')
  const index = await granolaCaptureIndex(layout, sources)
  let ready = 0
  let marked = 0
  let already = 0
  const exceptions: { id: string; reason: string }[] = []
  for (const id of sources) {
    try {
      const meeting = enumeration.meetings.get(id)
      /* v8 ignore next -- validated source IDs index this unchanged enumeration map. */
      if (!meeting) throw new KiError('Granola source identity disappeared')
      const folders = granolaMeetingFolders(meeting.projection)
      // Acquired membership alone marks a note dealt with; it needs no local evidence.
      if (folders.includes(target.acquiredFolderId)) {
        already += 1
        continue
      }
      const paths = index.get(id) ?? []
      if (paths.length !== 1)
        throw new KiError(paths.length ? 'Several captures exist for this note' : 'No capture exists for this note')
      const capture = await readGranolaCapture(layout.documents, paths[0] as string, id)
      if (capture.accountSha256 !== source.accountSha256)
        throw new KiError('Granola marking source account does not match the capture')
      const manifest = await verifyGranolaPreservation({
        repository: target.root,
        root: layout.documents,
        capture,
        id,
        expectedImages: granolaScreenshotCount(meeting.projection),
        runner: context.runner,
        environment: context.environment
      })
      if (capture.transcriptState !== 'available')
        throw new KiError('A complete local capture and available transcript are required before marking')
      if (stableJson(folders) !== stableJson(capture.folderIds))
        throw new KiError('Original Granola folder memberships changed after capture')
      const detail = (await source.details([id])).get(id)
      if (detail?.state !== 'available') throw new KiError('Current source detail is unavailable')
      const detailHash = granolaDetailHash(
        { projection: meeting.projection, folderIds: folders, inferredUnfoldered: capture.inferredUnfoldered },
        detail
      )
      if (detailHash !== capture.detailSha256) throw new KiError('Granola source note changed after capture')
      const transcript = await source.transcript(id)
      if (transcript.state !== 'available' || sha256(stableJson(transcript.projection)) !== capture.transcriptSha256)
        throw new KiError('Granola source transcript changed or is unavailable')
      const inventory = granolaAttachmentInventory(detail.projection, meeting.projection)
      const images = await source.images(id, inventory.ids)
      const saved = manifest.assets
      if (
        images.length !== saved.length ||
        images.some((image) => saved.find((asset) => asset.attachment_id === image.id)?.sha256 !== sha256(image.bytes))
      )
        throw new KiError('Granola source screenshots differ from the committed capture')
      ready += 1
      if (!writer) continue
      privateGranolaMarker(target.acquiredFolderId, await source.folders())
      await writer(id, target.acquiredFolderId)
      const after = await enumerateGranolaMeetings(source, interval, target.acquiredFolderId)
      const observed = after.meetings.get(id)
      if (
        !observed ||
        stableJson(granolaMeetingFolders(observed.projection)) !==
          stableJson([...folders, target.acquiredFolderId].sort((left, right) => left.localeCompare(right, 'en')))
      )
        throw new KiError('Granola marker addition did not preserve all original memberships')
      marked += 1
    } catch (error) {
      exceptions.push({ id, reason: String(error) })
    }
  }
  return { repository: target.repository, folder: target.acquiredFolderId, ready, marked, already, exceptions }
}
