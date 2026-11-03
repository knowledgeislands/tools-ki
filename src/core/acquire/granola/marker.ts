import { dirname, join, relative } from 'node:path'
import { KiError } from '../../errors.ts'
import type { Runner } from '../../runtime/runner.ts'
import { type GranolaCapture, granolaCaptureIndex, readGranolaCapture } from './captures.ts'
import { type GranolaMcpImageManifest, verifyGranolaMcpImages } from './images.ts'
import { granolaLayout } from './layout.ts'
import {
  attribute,
  granolaAttachmentCount,
  granolaAttachmentInventory,
  granolaAttachmentTypes,
  record,
  stringField
} from './projection.ts'
import { granolaReceivers } from './routing.ts'
import {
  type GranolaFolder,
  type GranolaOperationContext,
  granolaDetailHash,
  granolaFolderMarker,
  granolaFolderMover,
  granolaSource,
  sha256,
  stableJson
} from './source.ts'
import { enumerateGranolaMeetings, granolaInterval } from './windows.ts'

export const privateGranolaMarker = (id: string, folders: readonly GranolaFolder[]): GranolaFolder => {
  const folder = folders.find((candidate) => candidate.id === id)
  const data = record(folder?.projection)
  if (!folder || data?.['visibility'] !== 'private' || data['role'] !== 'owner' || data['audience'] !== 'only you')
    throw new KiError(
      'Acquired and Captured folders must be owner-controlled private folders whose audience is only you'
    )
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
  /** The Acquired folder, when the repository marks by adding it. */
  readonly folder?: string
  /** The number of Triaged-to-Captured pairs, when the repository marks by moving. */
  readonly pairs: number
  readonly ready: number
  readonly marked: number
  readonly already: number
  readonly exceptions: readonly { readonly id: string; readonly reason: string }[]
}

const membership = (folders: readonly string[]): string =>
  stableJson([...folders].sort((left, right) => left.localeCompare(right, 'en')))

export const markGranola = async (
  options: GranolaMarkOptions,
  context: GranolaOperationContext
): Promise<GranolaMarkResult> => {
  const interval = granolaInterval(options.since, options.until)
  const { target } = await granolaReceivers({ repository: options.repository, ...context })
  const moves = target.captureMoves
  const pairs = Object.keys(moves).length
  if (!target.acquiredFolderId && !pairs)
    throw new KiError('Granola marking requires acquired_folder_id or capture_moves')
  const doneFolders = target.acquiredFolderId ? [target.acquiredFolderId] : Object.values(moves)
  const layout = granolaLayout(target.root, target.captureRoot)
  const source = await granolaSource(context.runner, context.environment)
  const { images: readImages, attachmentTotal } = source
  if (!readImages || !attachmentTotal) throw new KiError('Granola marking requires authoritative MCP screenshot access')
  const checkFolders = async (): Promise<void> => {
    const listed = await source.folders()
    for (const folder of doneFolders) privateGranolaMarker(folder, listed)
  }
  await checkFolders()
  const writer =
    options.confirm && target.acquiredFolderId
      ? await granolaFolderMarker(context.runner, context.environment)
      : undefined
  const mover = options.confirm && pairs ? await granolaFolderMover(context.runner, context.environment) : undefined
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
      const triaged = folders.filter((folder) => Object.hasOwn(moves, folder))
      // Acquired or Captured membership alone marks a note dealt with; it needs no local evidence.
      if (folders.some((folder) => doneFolders.includes(folder))) {
        if (triaged.length) throw new KiError('The note is in Triaged and Captured together')
        already += 1
        continue
      }
      if (pairs && triaged.length !== 1)
        throw new KiError(
          triaged.length ? 'The note is in several Triaged folders' : 'The note is in no declared Triaged folder'
        )
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
        expectedImages: granolaAttachmentCount(meeting.projection),
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
      /* v8 ignore next -- The detail and listing hashes above match a capture whose inventory reconciled when it was taken. */
      if (inventory.difference) throw new KiError(inventory.difference)
      const total = inventory.expected ? await attachmentTotal(id) : 0
      const images = total === inventory.expected ? await readImages(id, inventory.ids) : []
      const typed = granolaAttachmentTypes(inventory, images, total)
      if (typed.difference) throw new KiError(typed.difference)
      const saved = manifest.assets
      if (
        images.length !== saved.length ||
        images.some((image) => saved.find((asset) => asset.attachment_id === image.id)?.sha256 !== sha256(image.bytes))
      )
        throw new KiError('Granola source screenshots differ from the committed capture')
      ready += 1
      if (writer && target.acquiredFolderId) {
        await checkFolders()
        await writer(id, target.acquiredFolderId)
        const after = await enumerateGranolaMeetings(source, interval, target.acquiredFolderId)
        const observed = after.meetings.get(id)
        if (
          !observed ||
          stableJson(granolaMeetingFolders(observed.projection)) !== membership([...folders, target.acquiredFolderId])
        )
          throw new KiError('Granola marker addition did not preserve all original memberships')
        marked += 1
      } else if (mover) {
        const from = triaged[0] as string
        const to = moves[from] as string
        // Captured is added and read back before Triaged is removed, so a note is never left in neither.
        const shown = async (): Promise<string> => {
          const observed = (await enumerateGranolaMeetings(source, interval, to)).meetings.get(id)
          return observed ? stableJson(granolaMeetingFolders(observed.projection)) : ''
        }
        await checkFolders()
        await mover.add(id, to)
        if ((await shown()) !== membership([...folders, to]))
          throw new KiError('Granola did not show the note in Captured with all its folders; it stays in Triaged')
        await mover.remove(id, from).catch((error: unknown) => {
          throw new KiError(`Removal from Triaged failed; the note is in both Triaged and Captured: ${String(error)}`)
        })
        if ((await shown()) !== membership([...folders.filter((folder) => folder !== from), to]))
          throw new KiError('Granola did not confirm the removal from Triaged; the note was already shown in Captured')
        marked += 1
      }
    } catch (error) {
      exceptions.push({ id, reason: String(error) })
    }
  }
  return {
    repository: target.repository,
    ...(target.acquiredFolderId ? { folder: target.acquiredFolderId } : {}),
    pairs,
    ready,
    marked,
    already,
    exceptions
  }
}
