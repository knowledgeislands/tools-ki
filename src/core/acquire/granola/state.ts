import { randomUUID } from 'node:crypto'
import { lstat, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, normalize } from 'node:path'
import { KiError } from '../../errors.ts'
import { sha256 } from './source.ts'
import type { GranolaWindowEvidence } from './windows.ts'

export type GranolaTranscriptState = 'available' | 'retrying' | 'durable-omission'
export type GranolaDispositionState =
  | 'staged'
  | 'retained'
  | 'harvested-locally'
  | 'routed-through-ki-trades'
  | 'superseded'
  | 'awaiting-review'

export interface GranolaDisposition {
  readonly state: GranolaDispositionState
  readonly canonical_destination?: string
  readonly document_sha256: string
  readonly trade_identity?: string
  readonly trade_receipt?: string
  readonly disposed_at: string
  readonly source_version_sha256: string
}

export interface GranolaCheckpointMeeting {
  readonly path: string
  readonly document_sha256: string
  readonly detail_sha256: string
  readonly transcript_sha256?: string
  readonly transcript_state: GranolaTranscriptState
  readonly transcript_observed_at?: string
  readonly transcript_retry_count: number
  readonly versions: readonly string[]
  readonly folder_ids: readonly string[]
  readonly inferred_unfoldered: boolean
  readonly acquired_at: string
  readonly disposition: GranolaDisposition
}

export interface GranolaCheckpoint {
  readonly schema: 3
  readonly generation: string
  readonly adapter: 'granola'
  readonly repository: string
  readonly provider: 'granola'
  readonly account_sha256: string
  readonly source_schema_sha256: string
  readonly identity_checkpoint_sha256: string
  readonly interval: { readonly since: string; readonly until: string }
  readonly exhaustive: true
  readonly windows: readonly GranolaWindowEvidence[]
  readonly meetings: Readonly<Record<string, GranolaCheckpointMeeting>>
  readonly updated_at: string
}

export interface GranolaJournalComponent {
  readonly detail_sha256: string
  readonly transcript_sha256?: string
  readonly transcript_state: GranolaTranscriptState
  readonly transcript_observed_at?: string
  readonly staged_document_path: string
  readonly staged_document_sha256: string
  readonly verified_at: string
  readonly checkpoint: GranolaCheckpointMeeting
}

export interface GranolaJournalFailure {
  readonly source_id: string
  readonly message: string
  readonly attempts: number
  readonly observed_at: string
}

export interface GranolaJournal {
  readonly schema: 1
  readonly phase: 'in-progress'
  readonly run_id: string
  readonly adapter: 'granola'
  readonly repository: string
  readonly account_sha256: string
  readonly source_schema_sha256: string
  readonly discovery_interval: { readonly since: string; readonly until: string }
  readonly identity_checkpoint_sha256: string
  readonly selected_identities: readonly string[]
  readonly components: Readonly<Record<string, GranolaJournalComponent>>
  readonly remaining_identities: readonly string[]
  readonly failures: readonly GranolaJournalFailure[]
  readonly retry_state: Readonly<Record<string, number>>
  readonly created_at: string
  readonly updated_at: string
}

interface LegacyGranolaCheckpointMeeting {
  readonly path: string
  readonly latest_content_sha256: string
  readonly latest_source_sha256: string
  readonly versions: readonly string[]
  readonly folder_ids: readonly string[]
  readonly inferred_unfoldered: boolean
  readonly acquired_at: string
}

interface LegacyGranolaCheckpoint {
  readonly schema: 2
  readonly provider: 'granola'
  readonly account_sha256: string
  readonly source_schema_sha256: string
  readonly identity_checkpoint_sha256: string
  readonly interval: { readonly since: string; readonly until: string }
  readonly exhaustive: true
  readonly windows: readonly GranolaWindowEvidence[]
  readonly meetings: Readonly<Record<string, LegacyGranolaCheckpointMeeting>>
  readonly updated_at: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const strings = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string')

const optionalString = (value: unknown): boolean => value === undefined || typeof value === 'string'

const interval = (value: unknown): value is { readonly since: string; readonly until: string } =>
  isRecord(value) && typeof value['since'] === 'string' && typeof value['until'] === 'string'

const safeRelativePath = (value: string): boolean => {
  const path = normalize(value)
  return !isAbsolute(path) && path !== '..' && !path.startsWith('../') && !path.startsWith('..\\')
}

const parseJson = async (path: string, label: string): Promise<unknown> => {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as unknown
  } catch {
    throw new KiError(`${label} is not valid JSON`)
  }
}

const fileState = async (path: string): Promise<'missing' | 'file' | 'unsafe'> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state) return 'missing'
  return state.isFile() && !state.isSymbolicLink() ? 'file' : 'unsafe'
}

export const writeAcquisitionStateAtomic = async (path: string, value: unknown): Promise<void> => {
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

const legacyCheckpoint = (value: Record<string, unknown>): LegacyGranolaCheckpoint | undefined => {
  if (value['schema'] !== 2 || value['provider'] !== 'granola' || !isRecord(value['meetings'])) return undefined
  for (const meeting of Object.values(value['meetings'])) {
    if (
      !isRecord(meeting) ||
      typeof meeting['path'] !== 'string' ||
      typeof meeting['latest_content_sha256'] !== 'string' ||
      typeof meeting['latest_source_sha256'] !== 'string' ||
      !strings(meeting['versions']) ||
      !strings(meeting['folder_ids']) ||
      typeof meeting['inferred_unfoldered'] !== 'boolean' ||
      typeof meeting['acquired_at'] !== 'string'
    ) {
      throw new KiError('Granola legacy checkpoint malformed')
    }
  }
  return value as unknown as LegacyGranolaCheckpoint
}

const currentMeeting = (id: string, value: unknown): GranolaCheckpointMeeting => {
  if (
    !isRecord(value) ||
    typeof value['path'] !== 'string' ||
    typeof value['document_sha256'] !== 'string' ||
    typeof value['detail_sha256'] !== 'string' ||
    !optionalString(value['transcript_sha256']) ||
    !['available', 'retrying', 'durable-omission'].includes(String(value['transcript_state'])) ||
    !optionalString(value['transcript_observed_at']) ||
    !Number.isInteger(value['transcript_retry_count']) ||
    Number(value['transcript_retry_count']) < 0 ||
    !strings(value['versions']) ||
    !strings(value['folder_ids']) ||
    typeof value['inferred_unfoldered'] !== 'boolean' ||
    typeof value['acquired_at'] !== 'string' ||
    !isRecord(value['disposition'])
  ) {
    throw new KiError(`Granola checkpoint meeting ${id} malformed`)
  }
  const disposition = value['disposition']
  if (
    !['staged', 'retained', 'harvested-locally', 'routed-through-ki-trades', 'superseded', 'awaiting-review'].includes(
      String(disposition['state'])
    ) ||
    typeof disposition['document_sha256'] !== 'string' ||
    !optionalString(disposition['canonical_destination']) ||
    !optionalString(disposition['trade_identity']) ||
    !optionalString(disposition['trade_receipt']) ||
    typeof disposition['disposed_at'] !== 'string' ||
    typeof disposition['source_version_sha256'] !== 'string'
  ) {
    throw new KiError(`Granola checkpoint meeting ${id} disposition malformed`)
  }
  if (
    disposition['document_sha256'] !== value['document_sha256'] ||
    (value['transcript_state'] === 'available' &&
      (typeof value['transcript_sha256'] !== 'string' ||
        typeof value['transcript_observed_at'] !== 'string' ||
        value['transcript_retry_count'] !== 0)) ||
    (value['transcript_state'] === 'retrying' && Number(value['transcript_retry_count']) >= 3) ||
    (value['transcript_state'] === 'durable-omission' &&
      (Number(value['transcript_retry_count']) < 3 || typeof value['transcript_observed_at'] !== 'string'))
  ) {
    throw new KiError(`Granola checkpoint meeting ${id} component state malformed`)
  }
  return value as unknown as GranolaCheckpointMeeting
}

const currentCheckpoint = (value: Record<string, unknown>): GranolaCheckpoint => {
  if (
    value['schema'] !== 3 ||
    value['adapter'] !== 'granola' ||
    value['provider'] !== 'granola' ||
    typeof value['generation'] !== 'string' ||
    typeof value['repository'] !== 'string' ||
    typeof value['account_sha256'] !== 'string' ||
    typeof value['source_schema_sha256'] !== 'string' ||
    typeof value['identity_checkpoint_sha256'] !== 'string' ||
    !interval(value['interval']) ||
    value['exhaustive'] !== true ||
    !Array.isArray(value['windows']) ||
    !isRecord(value['meetings']) ||
    typeof value['updated_at'] !== 'string'
  ) {
    throw new KiError('Granola checkpoint malformed')
  }
  for (const [id, meeting] of Object.entries(value['meetings'])) currentMeeting(id, meeting)
  return value as unknown as GranolaCheckpoint
}

export const loadGranolaCheckpoint = async (
  path: string,
  repository: string
): Promise<GranolaCheckpoint | LegacyGranolaCheckpoint | undefined> => {
  const state = await fileState(path)
  if (state === 'missing') return undefined
  if (state === 'unsafe') throw new KiError('Granola checkpoint must be physical file')
  const value = await parseJson(path, 'Granola checkpoint')
  if (!isRecord(value)) throw new KiError('Granola checkpoint malformed')
  const legacy = legacyCheckpoint(value)
  if (legacy) return legacy
  const checkpoint = currentCheckpoint(value)
  if (checkpoint.repository !== repository) throw new KiError('Granola checkpoint repository binding differs')
  return checkpoint
}

export const migrateGranolaCheckpoint = (
  checkpoint: LegacyGranolaCheckpoint,
  repository: string
): GranolaCheckpoint => ({
  schema: 3,
  generation: randomUUID(),
  adapter: 'granola',
  repository,
  provider: 'granola',
  account_sha256: checkpoint.account_sha256,
  source_schema_sha256: checkpoint.source_schema_sha256,
  identity_checkpoint_sha256: checkpoint.identity_checkpoint_sha256,
  interval: checkpoint.interval,
  exhaustive: true,
  windows: checkpoint.windows,
  meetings: Object.fromEntries(
    Object.entries(checkpoint.meetings).map(([id, meeting]) => [
      id,
      {
        path: meeting.path,
        document_sha256: meeting.latest_content_sha256,
        detail_sha256: meeting.latest_source_sha256,
        transcript_state: 'retrying',
        transcript_retry_count: 0,
        versions: meeting.versions,
        folder_ids: meeting.folder_ids,
        inferred_unfoldered: meeting.inferred_unfoldered,
        acquired_at: meeting.acquired_at,
        disposition: {
          state: 'staged',
          document_sha256: meeting.latest_content_sha256,
          disposed_at: checkpoint.updated_at,
          source_version_sha256: meeting.latest_source_sha256
        }
      } satisfies GranolaCheckpointMeeting
    ])
  ),
  updated_at: checkpoint.updated_at
})

const journalComponent = (id: string, value: unknown): GranolaJournalComponent => {
  if (
    !isRecord(value) ||
    typeof value['detail_sha256'] !== 'string' ||
    !optionalString(value['transcript_sha256']) ||
    !['available', 'retrying', 'durable-omission'].includes(String(value['transcript_state'])) ||
    !optionalString(value['transcript_observed_at']) ||
    typeof value['staged_document_path'] !== 'string' ||
    typeof value['staged_document_sha256'] !== 'string' ||
    typeof value['verified_at'] !== 'string' ||
    !value['checkpoint']
  ) {
    throw new KiError(`Granola journal component ${id} malformed`)
  }
  const checkpoint = currentMeeting(id, value['checkpoint'])
  if (
    checkpoint.detail_sha256 !== value['detail_sha256'] ||
    checkpoint.transcript_sha256 !== value['transcript_sha256'] ||
    checkpoint.transcript_state !== value['transcript_state'] ||
    checkpoint.transcript_observed_at !== value['transcript_observed_at'] ||
    checkpoint.path !== value['staged_document_path'] ||
    checkpoint.document_sha256 !== value['staged_document_sha256']
  ) {
    throw new KiError(`Granola journal component ${id} checkpoint differs`)
  }
  return value as unknown as GranolaJournalComponent
}

export const loadGranolaJournal = async (path: string): Promise<GranolaJournal | undefined> => {
  const state = await fileState(path)
  if (state === 'missing') return undefined
  if (state === 'unsafe') throw new KiError('Granola journal must be physical file')
  const value = await parseJson(path, 'Granola journal')
  if (
    !isRecord(value) ||
    value['schema'] !== 1 ||
    value['phase'] !== 'in-progress' ||
    value['adapter'] !== 'granola' ||
    typeof value['run_id'] !== 'string' ||
    typeof value['repository'] !== 'string' ||
    typeof value['account_sha256'] !== 'string' ||
    typeof value['source_schema_sha256'] !== 'string' ||
    !interval(value['discovery_interval']) ||
    typeof value['identity_checkpoint_sha256'] !== 'string' ||
    !strings(value['selected_identities']) ||
    !isRecord(value['components']) ||
    !strings(value['remaining_identities']) ||
    !Array.isArray(value['failures']) ||
    !isRecord(value['retry_state']) ||
    typeof value['created_at'] !== 'string' ||
    typeof value['updated_at'] !== 'string'
  ) {
    throw new KiError('Granola journal corrupt or incompatible')
  }
  if (
    value['failures'].some(
      (failure) =>
        !isRecord(failure) ||
        typeof failure['source_id'] !== 'string' ||
        typeof failure['message'] !== 'string' ||
        !Number.isInteger(failure['attempts']) ||
        Number(failure['attempts']) < 1 ||
        typeof failure['observed_at'] !== 'string'
    ) ||
    Object.values(value['retry_state']).some((attempts) => !Number.isInteger(attempts) || Number(attempts) < 0)
  ) {
    throw new KiError('Granola journal corrupt or incompatible')
  }
  const selected = value['selected_identities']
  const remaining = value['remaining_identities']
  const componentIds = Object.keys(value['components'])
  const retryIds = Object.keys(value['retry_state'])
  const failureIds = value['failures'].map((failure) => (failure as Record<string, unknown>)['source_id'])
  if (
    new Set(selected).size !== selected.length ||
    new Set(remaining).size !== remaining.length ||
    remaining.some((id) => !selected.includes(id)) ||
    componentIds.some((id) => !selected.includes(id) || remaining.includes(id)) ||
    retryIds.some((id) => !selected.includes(id)) ||
    failureIds.some((id) => typeof id !== 'string' || !selected.includes(id)) ||
    selected.some((id) => !remaining.includes(id) && !componentIds.includes(id))
  ) {
    throw new KiError('Granola journal corrupt or incompatible')
  }
  for (const [id, component] of Object.entries(value['components'])) journalComponent(id, component)
  return value as unknown as GranolaJournal
}

export const verifyGranolaDocument = async (
  root: string,
  meeting: GranolaCheckpointMeeting,
  label: string
): Promise<string | undefined> => {
  const candidates = [meeting.path, meeting.disposition.canonical_destination].filter((path): path is string =>
    Boolean(path)
  )
  for (const relative of candidates) {
    if (!safeRelativePath(relative)) throw new KiError(`Granola ${label} has unsafe document path ${relative}`)
    const path = join(root, relative)
    const state = await fileState(path)
    if (state === 'unsafe') throw new KiError(`Granola ${label} document ${relative} is unsafe`)
    if (state === 'file') {
      const content = await readFile(path, 'utf8')
      if (sha256(content) !== meeting.disposition.document_sha256) {
        throw new KiError(`Granola ${label} disposed document checksum differs`)
      }
      return content
    }
  }
  if (meeting.disposition.state === 'staged' || meeting.disposition.state === 'awaiting-review') {
    throw new KiError(`Granola ${label} staged document is missing`)
  }
  return undefined
}

export const verifyGranolaCheckpoint = async (root: string, checkpoint: GranolaCheckpoint): Promise<void> => {
  for (const [id, meeting] of Object.entries(checkpoint.meetings)) {
    await verifyGranolaDocument(root, meeting, id)
  }
}

export const removeGranolaJournal = (path: string): Promise<void> => rm(path, { force: true })
