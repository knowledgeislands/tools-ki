import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { KiContext } from '../../context.ts'
import { KiError } from '../errors.ts'
import { granolaReceivers, type RoutedGranolaMeeting, routeGranolaMeetings } from './granola-routing.ts'
import { type GranolaTranscript, granolaSource, stableJson } from './granola-source.ts'
import {
  enumerateGranolaMeetings,
  type GranolaWindowEvidence,
  granolaInterval,
  identityCheckpointSha256
} from './granola-windows.ts'
import { type KepFile, prepareKep, publishKep, verifyKep } from './kep.ts'

export interface GranolaImportOptions {
  readonly repository?: string
  readonly since: string
  readonly until: string
  readonly dryRun?: boolean
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
  readonly created: number
  readonly amended: number
  readonly unchanged: number
  readonly omissions: number
  readonly ledgerChanged: boolean
  readonly dryRun: boolean
}

interface GranolaLedgerMeeting {
  readonly latest_payload_sha256: string
  readonly versions: readonly string[]
  readonly folder_ids: readonly string[]
  readonly inferred_unfoldered: boolean
}

interface GranolaLedger {
  readonly schema: 1
  readonly provider: 'granola'
  readonly account_sha256: string
  readonly source_schema_sha256: string
  readonly identity_checkpoint_sha256: string
  readonly interval: { readonly since: string; readonly until: string }
  readonly exhaustive: true
  readonly windows: readonly GranolaWindowEvidence[]
  readonly meetings: Readonly<Record<string, GranolaLedgerMeeting>>
  readonly updated_at: string
}

const KNOWN_OMISSIONS = [
  'attachments',
  'audio',
  'content_version',
  'created_at',
  'deletion_tombstone',
  'native_folder_membership',
  'recording',
  'source_url',
  'tags',
  'transcript_timestamps',
  'updated_at'
] as const

const ledgerShape = (value: unknown): GranolaLedger => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new KiError('Granola ledger is malformed')
  const ledger = value as Partial<GranolaLedger>
  const valid = [
    ledger.schema === 1,
    ledger.provider === 'granola',
    typeof ledger.account_sha256 === 'string',
    typeof ledger.source_schema_sha256 === 'string',
    typeof ledger.identity_checkpoint_sha256 === 'string',
    Boolean(ledger.interval),
    ledger.exhaustive === true,
    Array.isArray(ledger.windows),
    Boolean(ledger.meetings) && typeof ledger.meetings === 'object',
    typeof ledger.updated_at === 'string'
  ].every(Boolean)
  if (!valid) throw new KiError('Granola ledger is malformed')
  for (const [id, meeting] of Object.entries(ledger.meetings as Readonly<Record<string, GranolaLedgerMeeting>>)) {
    const validMeeting = [
      Boolean(id),
      Boolean(meeting),
      typeof meeting?.latest_payload_sha256 === 'string',
      Array.isArray(meeting?.versions) && meeting.versions.every((version) => typeof version === 'string'),
      Array.isArray(meeting?.folder_ids) && meeting.folder_ids.every((folder) => typeof folder === 'string'),
      typeof meeting?.inferred_unfoldered === 'boolean'
    ].every(Boolean)
    if (!validMeeting) throw new KiError(`Granola ledger meeting ${id} is malformed`)
  }
  return ledger as GranolaLedger
}

const loadLedger = async (path: string): Promise<GranolaLedger | undefined> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state) return undefined
  if (!state.isFile() || state.isSymbolicLink()) throw new KiError('Granola ledger must be a physical file')
  try {
    return ledgerShape(JSON.parse(await readFile(path, 'utf8')) as unknown)
  } catch (error) {
    if (error instanceof KiError) throw error
    throw new KiError('Granola ledger is not valid JSON')
  }
}

const verifyLedgerPackages = async (base: string, ledger: GranolaLedger | undefined): Promise<void> => {
  if (!ledger) return
  const versions = new Set(Object.values(ledger.meetings).flatMap((meeting) => meeting.versions))
  for (const version of [...versions].sort()) await verifyKep(join(base, version), version)
}

const transcriptFile = (transcript: GranolaTranscript): KepFile[] =>
  transcript.state === 'available'
    ? [{ path: 'source/originals/transcript.json', content: `${stableJson(transcript.projection)}\n` }]
    : []

const meetingFiles = (
  meeting: RoutedGranolaMeeting,
  detail: unknown,
  transcript: GranolaTranscript
): readonly KepFile[] => [
  { path: 'source/originals/listing.json', content: `${stableJson(meeting.projection)}\n` },
  { path: 'source/originals/detail.json', content: `${stableJson(detail)}\n` },
  ...transcriptFile(transcript),
  {
    path: 'source/originals/folder-evidence.json',
    content: `${stableJson({ folder_ids: meeting.folderIds, inferred_unfoldered: meeting.inferredUnfoldered })}\n`
  },
  {
    path: 'relationships/native.jsonl',
    content: `${stableJson({
      type: 'granola-folder-evidence',
      meeting_id: meeting.id,
      folder_ids: meeting.folderIds,
      inferred_unfoldered: meeting.inferredUnfoldered
    })}\n`
  }
]

const kepMetadata = (options: {
  readonly payloadSha256: string
  readonly packageId: string
  readonly accountSha256: string
  readonly schemaSha256: string
  readonly meeting: RoutedGranolaMeeting
  readonly interval: { readonly since: string; readonly until: string }
  readonly identityCheckpointSha256: string
  readonly observedAt: string
  readonly transcript: GranolaTranscript
  readonly originalCount: number
}): string => {
  const omissions = [...KNOWN_OMISSIONS, ...(options.transcript.state === 'unavailable' ? ['transcript'] : [])].sort()
  return [
    'format = "kep"',
    'format_version = "0.1.0"',
    `package_id = ${JSON.stringify(options.packageId)}`,
    `payload_sha256 = ${JSON.stringify(options.payloadSha256)}`,
    `omissions = ${JSON.stringify(omissions)}`,
    'normalisations = []',
    'checksum_manifest = "checksums/sha256sums.txt"',
    '',
    '[connector]',
    'id = "knowledgeislands.granola.mcp"',
    'version = "0.1.0"',
    'mode = "read-only-mcp"',
    '',
    '[source]',
    'system = "granola"',
    `account_sha256 = ${JSON.stringify(options.accountSha256)}`,
    `meeting_id = ${JSON.stringify(options.meeting.id)}`,
    `observed_at = ${JSON.stringify(options.observedAt)}`,
    '',
    '[acquisition]',
    `since = ${JSON.stringify(options.interval.since)}`,
    `until = ${JSON.stringify(options.interval.until)}`,
    `source_schema_sha256 = ${JSON.stringify(options.schemaSha256)}`,
    `identity_checkpoint_sha256 = ${JSON.stringify(options.identityCheckpointSha256)}`,
    `folder_ids = ${JSON.stringify(options.meeting.folderIds)}`,
    `inferred_unfoldered = ${options.meeting.inferredUnfoldered}`,
    '',
    '[inventory]',
    'records = 0',
    'assets = 0',
    'relationships = 1',
    `originals = ${options.originalCount}`,
    ''
  ].join('\n')
}

const withoutUpdatedAt = (ledger: GranolaLedger): Omit<GranolaLedger, 'updated_at'> => {
  const { updated_at: _, ...stable } = ledger
  return stable
}

const writeLedger = async (path: string, ledger: GranolaLedger): Promise<void> => {
  const temporary = join(dirname(path), `.ledger.${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, `${JSON.stringify(ledger, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

export const importGranola = async (
  options: GranolaImportOptions,
  context: KiContext
): Promise<GranolaImportResult> => {
  const interval = granolaInterval(options.since, options.until)
  const { target, receivers } = await granolaReceivers({
    repository: options.repository,
    workingDirectory: context.workingDirectory,
    homeDirectory: context.homeDirectory,
    stateDirectory: context.paths.state
  })
  const source = await granolaSource(context.runner, context.environment)
  const folders = [...(await source.folders())].sort((left, right) => left.id.localeCompare(right.id, 'en'))
  const global = await enumerateGranolaMeetings(source, interval)
  const folderEnumerations = new Map<string, Awaited<ReturnType<typeof enumerateGranolaMeetings>>>()
  for (const folder of folders)
    folderEnumerations.set(folder.id, await enumerateGranolaMeetings(source, interval, folder.id))
  const folderMeetings = new Map(
    [...folderEnumerations.entries()].map(([id, result]) => [id, result.meetings] as const)
  )
  for (const [folderId, meetings] of folderMeetings)
    for (const meetingId of meetings.keys())
      if (!global.meetings.has(meetingId))
        throw new KiError(
          `Granola folder ${folderId} returned meeting ${meetingId} absent from complete global discovery`
        )
  const routing = routeGranolaMeetings({
    target,
    receivers,
    meetings: global.meetings,
    folders,
    folderMeetings
  })
  const identitySha256 = identityCheckpointSha256(global, folderEnumerations)
  const base = join(target.root, '+/_ACQUIRE/granola')
  const ledgerPath = join(base, 'ledger.json')
  const previous = await loadLedger(ledgerPath)
  if (previous && previous.account_sha256 !== source.accountSha256)
    throw new KiError('Granola account differs from receiver ledger; refusing to mix source identities')
  await verifyLedgerPackages(base, previous)

  const observedAt = new Date(context.now()).toISOString()
  const meetings: Record<string, GranolaLedgerMeeting> = { ...(previous?.meetings ?? {}) }
  let created = 0
  let amended = 0
  let unchanged = 0
  let omissions = 0
  if (!options.dryRun) await mkdir(base, { recursive: true })
  for (const meeting of routing.selected) {
    const detail = await source.detail(meeting.id)
    const transcript = await source.transcript(meeting.id)
    if (transcript.state === 'unavailable') omissions += 1
    const files = meetingFiles(meeting, detail, transcript)
    const payload = await prepareKep(files)
    const destination = join(base, payload.payloadSha256)
    const destinationState = await lstat(destination).catch(() => undefined)
    if (destinationState) await verifyKep(destination, payload.payloadSha256)
    else if (!options.dryRun)
      await publishKep({
        directory: destination,
        files,
        payload,
        metadata: kepMetadata({
          payloadSha256: payload.payloadSha256,
          packageId: payload.packageId,
          accountSha256: source.accountSha256,
          schemaSha256: source.schemaSha256,
          meeting,
          interval,
          identityCheckpointSha256: identitySha256,
          observedAt,
          transcript,
          originalCount: files.filter((file) => file.path.startsWith('source/originals/')).length
        })
      })
    const old = meetings[meeting.id]
    if (old?.latest_payload_sha256 === payload.payloadSha256) unchanged += 1
    else if (old) amended += 1
    else created += 1
    meetings[meeting.id] = {
      latest_payload_sha256: payload.payloadSha256,
      versions: [...new Set([...(old?.versions ?? []), payload.payloadSha256])],
      folder_ids: meeting.folderIds,
      inferred_unfoldered: meeting.inferredUnfoldered
    }
  }

  const windows = [...global.evidence, ...[...folderEnumerations.values()].flatMap((result) => result.evidence)]
  const proposed: GranolaLedger = {
    schema: 1,
    provider: 'granola',
    account_sha256: source.accountSha256,
    source_schema_sha256: source.schemaSha256,
    identity_checkpoint_sha256: identitySha256,
    interval,
    exhaustive: true,
    windows,
    meetings,
    updated_at: observedAt
  }
  const ledgerChanged = !previous || stableJson(withoutUpdatedAt(previous)) !== stableJson(withoutUpdatedAt(proposed))
  if (ledgerChanged && !options.dryRun) await writeLedger(ledgerPath, proposed)
  return {
    repository: target.repository,
    since: interval.since,
    until: interval.until,
    discovered: global.meetings.size,
    selected: routing.selected.length,
    excluded: routing.excluded,
    unfoldered: routing.unfoldered,
    duplicated: routing.duplicated,
    created,
    amended,
    unchanged,
    omissions,
    ledgerChanged,
    dryRun: Boolean(options.dryRun)
  }
}
