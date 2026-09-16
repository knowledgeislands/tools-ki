import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { KiContext } from '../../context.ts'
import { KiError } from '../errors.ts'
import { renderGranolaMeeting } from './granola-markdown.ts'
import { granolaReceivers, routeGranolaMeetings } from './granola-routing.ts'
import { type GranolaDetail, type GranolaTranscript, granolaSource, sha256, stableJson } from './granola-source.ts'
import {
  enumerateGranolaMeetings,
  type GranolaWindowEvidence,
  granolaInterval,
  identityCheckpointSha256
} from './granola-windows.ts'
import { verifyKep } from './kep.ts'

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

interface GranolaLedgerBase {
  readonly provider: 'granola'
  readonly account_sha256: string
  readonly source_schema_sha256: string
  readonly identity_checkpoint_sha256: string
  readonly interval: { readonly since: string; readonly until: string }
  readonly exhaustive: true
  readonly windows: readonly GranolaWindowEvidence[]
  readonly updated_at: string
}

interface LegacyGranolaLedgerMeeting {
  readonly latest_payload_sha256: string
  readonly versions: readonly string[]
  readonly folder_ids: readonly string[]
  readonly inferred_unfoldered: boolean
}

interface LegacyGranolaLedger extends GranolaLedgerBase {
  readonly schema: 1
  readonly meetings: Readonly<Record<string, LegacyGranolaLedgerMeeting>>
}

interface GranolaLedgerMeeting {
  readonly path: string
  readonly latest_content_sha256: string
  readonly latest_source_sha256: string
  readonly versions: readonly string[]
  readonly folder_ids: readonly string[]
  readonly inferred_unfoldered: boolean
  readonly acquired_at: string
}

interface GranolaLedger extends GranolaLedgerBase {
  readonly schema: 2
  readonly meetings: Readonly<Record<string, GranolaLedgerMeeting>>
}

type AnyGranolaLedger = LegacyGranolaLedger | GranolaLedger

const physicalFile = async (path: string, label: string): Promise<void> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isFile() || state.isSymbolicLink()) throw new KiError(`${label} must be a physical file`)
}

const commonLedgerShape = (ledger: Partial<GranolaLedgerBase>): boolean =>
  [
    ledger.provider === 'granola',
    typeof ledger.account_sha256 === 'string',
    typeof ledger.source_schema_sha256 === 'string',
    typeof ledger.identity_checkpoint_sha256 === 'string',
    Boolean(ledger.interval),
    ledger.exhaustive === true,
    Array.isArray(ledger.windows),
    typeof ledger.updated_at === 'string'
  ].every(Boolean)

const stringArray = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string')

const ledgerShape = (value: unknown): AnyGranolaLedger => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new KiError('Granola ledger is malformed')
  const candidate = value as Partial<AnyGranolaLedger>
  if (!commonLedgerShape(candidate) || !candidate.meetings || typeof candidate.meetings !== 'object')
    throw new KiError('Granola ledger is malformed')
  if (candidate.schema === 1) {
    for (const [id, meeting] of Object.entries(candidate.meetings)) {
      const legacy = meeting as Partial<LegacyGranolaLedgerMeeting>
      if (
        !legacy ||
        typeof legacy.latest_payload_sha256 !== 'string' ||
        !stringArray(legacy.versions) ||
        !stringArray(legacy.folder_ids) ||
        typeof legacy.inferred_unfoldered !== 'boolean'
      )
        throw new KiError(`Granola ledger meeting ${id} is malformed`)
    }
    return candidate as LegacyGranolaLedger
  }
  if (candidate.schema === 2) {
    for (const [id, meeting] of Object.entries(candidate.meetings)) {
      const current = meeting as Partial<GranolaLedgerMeeting>
      if (
        !current ||
        typeof current.path !== 'string' ||
        typeof current.latest_content_sha256 !== 'string' ||
        typeof current.latest_source_sha256 !== 'string' ||
        !stringArray(current.versions) ||
        !stringArray(current.folder_ids) ||
        typeof current.inferred_unfoldered !== 'boolean' ||
        typeof current.acquired_at !== 'string'
      )
        throw new KiError(`Granola ledger meeting ${id} is malformed`)
    }
    return candidate as GranolaLedger
  }
  throw new KiError('Granola ledger has unsupported schema')
}

const loadLedger = async (path: string): Promise<AnyGranolaLedger | undefined> => {
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

const safeDocumentPath = (path: string): boolean =>
  basename(path) === path &&
  path.endsWith('.md') &&
  !path.startsWith('.') &&
  !path.includes('/') &&
  !path.includes('\\')

const verifyCurrentLedger = async (base: string, ledger: GranolaLedger): Promise<void> => {
  for (const [meetingId, meeting] of Object.entries(ledger.meetings)) {
    if (!safeDocumentPath(meeting.path)) throw new KiError(`Granola ledger meeting ${meetingId} has unsafe path`)
    const path = join(base, meeting.path)
    await physicalFile(path, `Granola meeting document ${meeting.path}`)
    const content = await readFile(path, 'utf8')
    if (sha256(content) !== meeting.latest_content_sha256)
      throw new KiError(`Granola meeting document ${meeting.path} checksum differs from ledger`)
    if (!content.includes(`source_id: ${JSON.stringify(meetingId)}`))
      throw new KiError(`Granola meeting document ${meeting.path} identity differs from ledger`)
  }
}

const verifyLedger = async (base: string, ledger: AnyGranolaLedger | undefined): Promise<void> => {
  if (!ledger) return
  if (ledger.schema === 2) return verifyCurrentLedger(base, ledger)
  const versions = new Set(Object.values(ledger.meetings).flatMap((meeting) => meeting.versions))
  for (const version of [...versions].sort()) await verifyKep(join(base, version), version)
}

const writeAtomic = async (path: string, content: string): Promise<void> => {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

const writeDocument = async (path: string, content: string, replace: boolean): Promise<void> => {
  const state = await lstat(path).catch(() => undefined)
  if (state) {
    if (!state.isFile() || state.isSymbolicLink())
      throw new KiError(`Granola meeting document ${basename(path)} is unsafe`)
    const existing = await readFile(path, 'utf8')
    if (existing === content) return
    if (!replace) throw new KiError(`Granola meeting document ${basename(path)} already exists with different content`)
  }
  await writeAtomic(path, content)
}

const acquiredAtFromDocument = async (path: string): Promise<string | undefined> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state) return undefined
  if (!state.isFile() || state.isSymbolicLink())
    throw new KiError(`Granola meeting document ${basename(path)} is unsafe`)
  const match = /^acquired_at: (".*")$/m.exec(await readFile(path, 'utf8'))
  if (!match?.[1]) return undefined
  try {
    const value = JSON.parse(match[1]) as unknown
    return typeof value === 'string' ? value : undefined
  } catch {
    return undefined
  }
}

const writeLedger = async (path: string, ledger: GranolaLedger): Promise<void> =>
  writeAtomic(path, `${JSON.stringify(ledger, null, 2)}\n`)

const withoutUpdatedAt = (ledger: GranolaLedger): Omit<GranolaLedger, 'updated_at'> => {
  const { updated_at: _, ...stable } = ledger
  return stable
}

const batches = <T>(items: readonly T[], size: number): readonly (readonly T[])[] => {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result
}

const sourceHash = (options: {
  readonly detail: GranolaDetail
  readonly meeting: {
    readonly projection: unknown
    readonly folderIds: readonly string[]
    readonly inferredUnfoldered: boolean
  }
  readonly transcript: GranolaTranscript
}): string =>
  sha256(
    stableJson({
      listing: options.meeting.projection,
      detail: options.detail,
      transcript: options.transcript,
      folder_ids: options.meeting.folderIds,
      inferred_unfoldered: options.meeting.inferredUnfoldered
    })
  )

const legacyCleanupPaths = (base: string, ledger: LegacyGranolaLedger | undefined): readonly string[] =>
  ledger
    ? [...new Set(Object.values(ledger.meetings).flatMap((meeting) => meeting.versions))].map((version) =>
        join(base, version)
      )
    : []

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
  const discoveredMeetings = new Map(global.meetings)
  for (const meetings of folderMeetings.values())
    for (const [meetingId, meeting] of meetings) {
      const existing = discoveredMeetings.get(meetingId)
      if (existing && stableJson(existing.projection) !== stableJson(meeting.projection))
        throw new KiError(`Granola meeting ${meetingId} has conflicting global and folder projections`)
      if (!existing) discoveredMeetings.set(meetingId, meeting)
    }
  const routing = routeGranolaMeetings({
    target,
    receivers,
    meetings: discoveredMeetings,
    folders,
    folderMeetings
  })
  const identitySha256 = identityCheckpointSha256(global, folderEnumerations)
  const base = join(target.root, '+/_ACQUIRE/granola')
  const ledgerPath = join(base, 'ledger.json')
  const previous = await loadLedger(ledgerPath)
  if (previous && previous.account_sha256 !== source.accountSha256)
    throw new KiError('Granola account differs from receiver ledger; refusing to mix source identities')
  await verifyLedger(base, previous)
  if (previous?.schema === 1) {
    const selected = new Set(routing.selected.map((meeting) => meeting.id))
    const outside = Object.keys(previous.meetings).filter((meetingId) => !selected.has(meetingId))
    if (outside.length)
      throw new KiError(`Granola legacy ledger meeting ${outside[0]} is outside the current receiver scope`)
  }

  const observedAt = new Date(context.now()).toISOString()
  const meetings: Record<string, GranolaLedgerMeeting> = previous?.schema === 2 ? { ...previous.meetings } : {}
  const stalePaths = new Set<string>()
  let created = 0
  let amended = 0
  let unchanged = 0
  let omissions = 0
  if (!options.dryRun) await mkdir(base, { recursive: true })
  for (const batch of batches(routing.selected, 10)) {
    const details = await source.details(batch.map((meeting) => meeting.id))
    for (const meeting of batch) {
      const detail = details.get(meeting.id)
      if (!detail) throw new KiError(`Granola detail batch omitted ${meeting.id}`)
      const transcript = await source.transcript(meeting.id)
      const sourceSha256 = sourceHash({ detail, meeting, transcript })
      const old = previous?.meetings[meeting.id]
      const current = previous?.schema === 2 ? previous.meetings[meeting.id] : undefined
      let acquiredAt = current?.latest_source_sha256 === sourceSha256 ? current.acquired_at : observedAt
      let document = renderGranolaMeeting({
        accountSha256: source.accountSha256,
        acquiredAt,
        detail,
        folders,
        meeting,
        sourceSha256,
        transcript
      })
      if (!old) {
        const recoveredAcquiredAt = await acquiredAtFromDocument(join(base, document.path))
        if (recoveredAcquiredAt) {
          acquiredAt = recoveredAcquiredAt
          document = renderGranolaMeeting({
            accountSha256: source.accountSha256,
            acquiredAt,
            detail,
            folders,
            meeting,
            sourceSha256,
            transcript
          })
        }
      }
      if (document.omissions.includes('meeting_detail') || document.omissions.includes('transcript')) omissions += 1
      const contentSha256 = sha256(document.content)
      if (!old) created += 1
      else if (current?.latest_source_sha256 === sourceSha256 && current.latest_content_sha256 === contentSha256)
        unchanged += 1
      else amended += 1
      if (!options.dryRun) {
        const replace = current?.path === document.path
        await writeDocument(join(base, document.path), document.content, replace)
        if (current && current.path !== document.path) stalePaths.add(current.path)
      }
      meetings[meeting.id] = {
        path: document.path,
        latest_content_sha256: contentSha256,
        latest_source_sha256: sourceSha256,
        versions: [...new Set([...(old?.versions ?? []), contentSha256])],
        folder_ids: meeting.folderIds,
        inferred_unfoldered: meeting.inferredUnfoldered,
        acquired_at: acquiredAt
      }
    }
  }

  const windows = [...global.evidence, ...[...folderEnumerations.values()].flatMap((result) => result.evidence)]
  const proposed: GranolaLedger = {
    schema: 2,
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
  const ledgerChanged =
    !previous ||
    previous.schema === 1 ||
    stableJson(withoutUpdatedAt(previous)) !== stableJson(withoutUpdatedAt(proposed))
  if (ledgerChanged && !options.dryRun) {
    await writeLedger(ledgerPath, proposed)
    for (const path of stalePaths) await rm(join(base, path), { force: true })
    for (const path of legacyCleanupPaths(base, previous?.schema === 1 ? previous : undefined))
      await rm(path, { recursive: true, force: true })
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
    created,
    amended,
    unchanged,
    omissions,
    ledgerChanged,
    dryRun: Boolean(options.dryRun)
  }
}
