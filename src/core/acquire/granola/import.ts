import { randomUUID } from 'node:crypto'
import { lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { KiError } from '../../errors.ts'
import { type GranolaCapture, granolaCaptureIndex, readGranolaCapture } from './captures.ts'
import { storeGranolaMcpImages } from './images.ts'
import { granolaLayout, verifyGranolaParents } from './layout.ts'
import { renderGranolaMeeting } from './markdown.ts'
import { privateGranolaMarker } from './marker.ts'
import { type GranolaAttachmentImage, granolaAttachmentInventory } from './projection.ts'
import { type FlaggedGranolaMeeting, granolaReceivers, routeGranolaMeetings } from './routing.ts'
import {
  type GranolaOperationContext,
  type GranolaTranscript,
  granolaDetailHash,
  granolaSource,
  sha256,
  stableJson
} from './source.ts'
import { enumerateGranolaMeetings, granolaInterval } from './windows.ts'

export interface GranolaImportOptions {
  readonly repository?: string
  readonly since: string
  readonly until: string
  readonly dryRun?: boolean
  readonly refresh?: boolean
  readonly refreshAcquired?: boolean
}

export interface GranolaImportResult {
  readonly repository: string
  readonly since: string
  readonly until: string
  readonly discovered: number
  readonly selected: number
  readonly excluded: number
  readonly unfoldered: number
  readonly duplicated: number
  readonly flagged: readonly FlaggedGranolaMeeting[]
  readonly unknownFolders: readonly { readonly id: string; readonly title?: string }[]
  readonly created: number
  readonly refreshed: number
  readonly kept: readonly { readonly id: string; readonly reason: string }[]
  readonly omissions: number
  readonly imageMeetings: number
  readonly images: number
  readonly skipped: number
  readonly attachmentsAvailable: boolean
  readonly dryRun: boolean
}

const batches = <T>(items: readonly T[], size: number): readonly (readonly T[])[] => {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result
}

const transcriptFromDocument = (
  content: string
): Extract<GranolaTranscript, { readonly state: 'available' }> | undefined => {
  const marker = '\n## Transcript\n\n'
  const start = content.indexOf(marker)
  if (start === -1) return undefined
  const transcript = content.slice(start + marker.length).trim()
  if (!transcript || transcript.startsWith('_Transcript ')) return undefined
  return { state: 'available', projection: { transcript } }
}

/** An existing document here was indexed and identity-checked by `readGranolaCapture`. */
const writeDocument = async (path: string, content: string): Promise<void> => {
  await verifyGranolaParents(path)
  await mkdir(dirname(path), { recursive: true })
  const state = await lstat(path).catch(() => undefined)
  if (state && (!state.isFile() || state.isSymbolicLink()))
    throw new KiError(`Granola meeting document ${basename(path)} is unsafe`)
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

/**
 * Acquire keeps no ledger: Acquired-folder membership alone marks a meeting dealt with, and an existing
 * capture is never overwritten unless a refresh is explicitly requested. Git history holds earlier bytes.
 */
export const importGranola = async (
  options: GranolaImportOptions,
  context: GranolaOperationContext
): Promise<GranolaImportResult> => {
  const interval = granolaInterval(options.since, options.until)
  const refresh = Boolean(options.refresh || options.refreshAcquired)
  const { target, receivers } = await granolaReceivers({
    repository: options.repository,
    workingDirectory: context.workingDirectory,
    homeDirectory: context.homeDirectory,
    stateDirectory: context.stateDirectory
  })
  const source = await granolaSource(context.runner, context.environment)
  const folders = [...(await source.folders())].sort((left, right) => left.id.localeCompare(right.id, 'en'))
  const global = await enumerateGranolaMeetings(source, interval)
  const folderMeetings = new Map<string, Awaited<ReturnType<typeof enumerateGranolaMeetings>>['meetings']>()
  for (const folder of folders) {
    folderMeetings.set(folder.id, (await enumerateGranolaMeetings(source, interval, folder.id)).meetings)
  }
  const discoveredMeetings = new Map(global.meetings)
  for (const meetings of folderMeetings.values()) {
    for (const [meetingId, meeting] of meetings) {
      const existing = discoveredMeetings.get(meetingId)
      if (existing && stableJson(existing.projection) !== stableJson(meeting.projection)) {
        throw new KiError(`Granola meeting ${meetingId} has conflicting global and folder projections`)
      }
      if (!existing) discoveredMeetings.set(meetingId, meeting)
    }
  }
  let routing = routeGranolaMeetings({ target, receivers, meetings: discoveredMeetings, folders, folderMeetings })
  const layout = granolaLayout(target.root, target.captureRoot)
  const root = layout.documents
  const observedAt = new Date(context.now()).toISOString()

  let skipped = 0
  if (target.acquiredFolderId) {
    privateGranolaMarker(target.acquiredFolderId, folders)
    if (!options.refreshAcquired) {
      // The validated private marker is one of the exhaustively enumerated folders.
      const marked = folderMeetings.get(target.acquiredFolderId) as ReadonlyMap<string, unknown>
      const selected = routing.selected.filter((meeting) => !marked.has(meeting.id))
      skipped = routing.selected.length - selected.length
      routing = { ...routing, selected }
    }
  }

  const index = await granolaCaptureIndex(
    layout,
    routing.selected.map((meeting) => meeting.id)
  )
  const kept: { id: string; reason: string }[] = []
  const existing = new Map<string, GranolaCapture>()
  const pending = []
  for (const meeting of routing.selected) {
    const paths = index.get(meeting.id) ?? []
    if (paths.length > 1) kept.push({ id: meeting.id, reason: `several captures exist (${paths.join(', ')})` })
    else if (paths.length && !refresh) kept.push({ id: meeting.id, reason: `capture exists at ${paths[0]}` })
    else {
      if (paths.length) {
        const capture = await readGranolaCapture(root, paths[0] as string, meeting.id)
        if (capture.accountSha256 && capture.accountSha256 !== source.accountSha256) {
          kept.push({ id: meeting.id, reason: `capture at ${capture.path} belongs to another Granola account` })
          continue
        }
        existing.set(meeting.id, capture)
      }
      pending.push(meeting)
    }
  }

  let created = 0
  let refreshed = 0
  let omissions = 0
  let imageMeetings = 0
  let images = 0
  for (const batch of batches(pending, 10)) {
    const details = await source.details(batch.map((meeting) => meeting.id))
    for (const meeting of batch) {
      const detail = details.get(meeting.id)
      /* v8 ignore next -- granolaSource.details accounts every requested identity as available or explicitly unavailable. */
      if (!detail) throw new KiError(`Granola detail batch omitted ${meeting.id}`)
      const detailSha256 = granolaDetailHash(meeting, detail)
      const current = existing.get(meeting.id)
      const inventory =
        source.images && detail.state === 'available'
          ? granolaAttachmentInventory(detail.projection, meeting.projection)
          : undefined
      const imageBlocks: readonly GranolaAttachmentImage[] | undefined =
        inventory && source.images ? await source.images(meeting.id, inventory.ids) : undefined
      const observed = await source.transcript(meeting.id)
      // A refresh never discards a transcript the provider can no longer return.
      const retained = observed.state === 'unavailable' && current ? transcriptFromDocument(current.content) : undefined
      const transcript = retained ?? observed
      const transcriptSha256 =
        transcript.state !== 'available'
          ? undefined
          : retained
            ? current?.transcriptSha256
            : sha256(stableJson(transcript.projection))
      const document = renderGranolaMeeting({
        attachmentsVerified: Boolean(imageBlocks),
        ...(target.captureRoot ? { captureRoot: target.captureRoot } : {}),
        accountSha256: source.accountSha256,
        acquiredAt: observedAt,
        detail,
        detailSha256,
        folders,
        meeting,
        transcript,
        transcriptObservedAt: observedAt,
        ...(transcriptSha256 ? { transcriptSha256 } : {}),
        transcriptState: transcript.state
      })
      // A refreshed capture stays wherever Acquire has filed it.
      const documentPath = current?.path ?? document.path
      if (imageBlocks) {
        images += await storeGranolaMcpImages({
          root,
          path: documentPath,
          meetingId: meeting.id,
          detailSha256,
          images: imageBlocks,
          dryRun: Boolean(options.dryRun)
        })
        imageMeetings += 1
      }
      if (!options.dryRun) await writeDocument(join(root, documentPath), document.content)
      if (current) refreshed += 1
      else created += 1
      if (transcript.state !== 'available' || detail.state === 'unavailable') omissions += 1
    }
  }
  return {
    repository: target.repository,
    since: interval.since,
    until: interval.until,
    discovered: discoveredMeetings.size,
    selected: routing.selected.length,
    excluded: routing.excluded,
    unfoldered: routing.unfoldered,
    duplicated: routing.duplicated,
    flagged: routing.flagged,
    unknownFolders: routing.unknownFolders,
    created,
    refreshed,
    kept,
    omissions,
    imageMeetings,
    images,
    skipped,
    attachmentsAvailable: Boolean(source.images),
    dryRun: Boolean(options.dryRun)
  }
}
