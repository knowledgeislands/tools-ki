import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { KiError } from '../../errors.ts'
import type { Runner } from '../../runtime/runner.ts'
import { renderGranolaMeeting } from './markdown.ts'
import { granolaReceivers, type RoutedGranolaMeeting, routeGranolaMeetings } from './routing.ts'
import {
  type GranolaDetail,
  type GranolaTranscript,
  granolaSource,
  sha256,
  stableJson,
  transcriptProjectionUnavailable
} from './source.ts'
import {
  type GranolaCheckpoint,
  type GranolaCheckpointMeeting,
  type GranolaDisposition,
  type GranolaJournal,
  type GranolaJournalComponent,
  type GranolaJournalFailure,
  type GranolaTranscriptState,
  loadGranolaCheckpoint,
  loadGranolaJournal,
  migrateGranolaCheckpoint,
  removeGranolaJournal,
  verifyGranolaCheckpoint,
  verifyGranolaDocument,
  writeAcquisitionStateAtomic
} from './state.ts'
import {
  enumerateGranolaMeetings,
  type GranolaWindowEvidence,
  granolaInterval,
  identityCheckpointSha256
} from './windows.ts'

export interface GranolaImportOptions {
  readonly repository?: string
  readonly since: string
  readonly until: string
  readonly dryRun?: boolean
  readonly refreshTranscripts?: boolean
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
  readonly transcriptReads: number
  readonly resumed: number
  readonly ledgerChanged: boolean
  readonly dryRun: boolean
}

export interface GranolaStatusResult {
  readonly repository: string
  readonly checkpoint: 'absent' | 'legacy' | 'current'
  readonly generation?: string
  readonly meetings: number
  readonly availableTranscripts: number
  readonly retryingTranscripts: number
  readonly durableOmissions: number
  readonly dispositions: Readonly<Record<string, number>>
  readonly journal: 'absent' | 'in-progress'
  readonly remaining: number
  readonly failures: number
}

export interface GranolaResetOptions {
  readonly repository?: string
  readonly source?: string
  readonly component?: 'detail' | 'transcript'
  readonly rebuild?: boolean
  readonly confirm?: boolean
}

export interface GranolaResetResult {
  readonly repository: string
  readonly plan: string
  readonly changed: boolean
}

export interface GranolaOperationContext {
  readonly workingDirectory: string
  readonly homeDirectory: string
  readonly stateDirectory: string
  readonly environment: NodeJS.ProcessEnv
  readonly runner: Runner
  readonly now: () => number
}

const basePath = (root: string): string => join(root, '+/_ACQUIRE/granola')
const checkpointPath = (root: string): string => join(basePath(root), 'ledger.json')
const journalPath = (root: string): string => join(basePath(root), 'journal.json')

const batches = <T>(items: readonly T[], size: number): readonly (readonly T[])[] => {
  const result: T[][] = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result
}

const detailHash = (meeting: RoutedGranolaMeeting, detail: GranolaDetail): string =>
  sha256(
    stableJson({
      listing: meeting.projection,
      detail: detail.projection,
      folder_ids: meeting.folderIds,
      inferred_unfoldered: meeting.inferredUnfoldered
    })
  )

const transcriptHash = (transcript: Extract<GranolaTranscript, { readonly state: 'available' }>): string =>
  sha256(stableJson(transcript.projection))

const transcriptFromDocument = (
  content: string | undefined
): Extract<GranolaTranscript, { readonly state: 'available' }> | undefined => {
  if (!content) return undefined
  const marker = '\n## Transcript\n\n'
  const start = content.indexOf(marker)
  if (start === -1) return undefined
  const transcript = content.slice(start + marker.length).trim()
  if (!transcript || transcript.startsWith('_Transcript source')) return undefined
  return { state: 'available', projection: { transcript } }
}

const physicalDocument = async (path: string): Promise<string | undefined> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state) return undefined
  if (!state.isFile() || state.isSymbolicLink())
    throw new KiError(`Granola meeting document ${basename(path)} is unsafe`)
  return readFile(path, 'utf8')
}

const writeDocument = async (path: string, content: string, meetingId: string): Promise<void> => {
  await mkdir(dirname(path), { recursive: true })
  const existing = await physicalDocument(path)
  if (existing && !existing.includes(`source_id: ${JSON.stringify(meetingId)}`)) {
    throw new KiError(`Granola meeting document ${basename(path)} belongs to another source identity`)
  }
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

const currentCheckpoint = async (root: string, repository: string): Promise<GranolaCheckpoint | undefined> => {
  const loaded = await loadGranolaCheckpoint(checkpointPath(root), repository)
  return loaded?.schema === 2 ? migrateGranolaCheckpoint(loaded, repository) : loaded
}

const journalFailure = (
  failures: readonly GranolaJournalFailure[],
  sourceId: string,
  message: string,
  observedAt: string
): readonly GranolaJournalFailure[] => {
  const previous = [...failures].reverse().find((failure) => failure.source_id === sourceId)
  return [
    ...failures,
    { source_id: sourceId, message, attempts: (previous?.attempts ?? 0) + 1, observed_at: observedAt }
  ]
}

const validateJournalBinding = (
  journal: GranolaJournal,
  binding: {
    readonly repository: string
    readonly account: string
    readonly schema: string
    readonly interval: { readonly since: string; readonly until: string }
    readonly identity: string
    readonly selected: readonly string[]
  }
): void => {
  const compatible =
    journal.repository === binding.repository &&
    journal.account_sha256 === binding.account &&
    journal.source_schema_sha256 === binding.schema &&
    stableJson(journal.discovery_interval) === stableJson(binding.interval) &&
    journal.identity_checkpoint_sha256 === binding.identity &&
    stableJson(journal.selected_identities) === stableJson(binding.selected)
  if (!compatible) {
    throw new KiError('Granola journal is stale or incompatible; review ki acquire reset --adapter granola')
  }
}

const initialJournal = (options: {
  readonly repository: string
  readonly account: string
  readonly schema: string
  readonly interval: { readonly since: string; readonly until: string }
  readonly identity: string
  readonly selected: readonly string[]
  readonly observedAt: string
}): GranolaJournal => ({
  schema: 1,
  phase: 'in-progress',
  run_id: randomUUID(),
  adapter: 'granola',
  repository: options.repository,
  account_sha256: options.account,
  source_schema_sha256: options.schema,
  discovery_interval: options.interval,
  identity_checkpoint_sha256: options.identity,
  selected_identities: options.selected,
  components: {},
  remaining_identities: options.selected,
  failures: [],
  retry_state: {},
  created_at: options.observedAt,
  updated_at: options.observedAt
})

const cachedTranscript = async (
  root: string,
  meeting: GranolaCheckpointMeeting | undefined
): Promise<GranolaTranscript | undefined> => {
  if (meeting?.transcript_state !== 'available') return undefined
  const transcript = transcriptFromDocument(await verifyGranolaDocument(root, meeting, 'cached transcript'))
  if (!transcript || !meeting.transcript_sha256) {
    throw new KiError('Granola cached transcript differs from checkpoint')
  }
  /* v8 ignore next -- cached-document parsing never returns a transcript carrying the unavailable marker. */
  if (transcriptProjectionUnavailable(transcript.projection)) return undefined
  return transcript
}

const readTranscript = async (options: {
  readonly source: Awaited<ReturnType<typeof granolaSource>>
  readonly meetingId: string
  readonly current?: GranolaCheckpointMeeting
  readonly root: string
  readonly refresh: boolean
  readonly observedAt: string
}): Promise<{
  readonly transcript: GranolaTranscript
  readonly hash?: string
  readonly state: GranolaTranscriptState
  readonly observedAt: string
  readonly retries: number
  readonly read: boolean
}> => {
  const current = options.current
  const cached = await cachedTranscript(options.root, current)
  const shouldRead =
    options.refresh || !current || (current.transcript_state === 'retrying' && current.transcript_retry_count < 3)
  if (!shouldRead) {
    const complete = current as GranolaCheckpointMeeting
    if (complete.transcript_state === 'available') {
      /* v8 ignore next -- an available validated checkpoint either yields a cached transcript or throws while parsing it. */
      if (!cached) throw new KiError('Granola cached transcript contains an unavailable provider response')
      return {
        transcript: cached,
        hash: complete.transcript_sha256 as string,
        state: 'available',
        observedAt: complete.transcript_observed_at as string,
        retries: 0,
        read: false
      }
    }
    return {
      transcript: { state: 'unavailable', reason: 'durable provider omission' },
      state: 'durable-omission',
      observedAt: complete.transcript_observed_at as string,
      retries: complete.transcript_retry_count,
      read: false
    }
  }
  const observed = await options.source.transcript(options.meetingId)
  if (observed.state === 'available') {
    return {
      transcript: observed,
      hash: transcriptHash(observed),
      state: 'available',
      observedAt: options.observedAt,
      retries: 0,
      read: true
    }
  }
  if (cached && current) {
    return {
      transcript: cached,
      hash: current.transcript_sha256 as string,
      state: 'available',
      observedAt: current.transcript_observed_at as string,
      retries: current.transcript_retry_count,
      read: true
    }
  }
  const retries = (current?.transcript_retry_count ?? 0) + 1
  return {
    transcript: observed,
    state: retries >= 3 ? 'durable-omission' : 'retrying',
    observedAt: options.observedAt,
    retries,
    read: true
  }
}

const stagedDisposition = (
  current: GranolaCheckpointMeeting | undefined,
  documentSha256: string,
  sourceSha256: string,
  observedAt: string,
  changed: boolean
): GranolaDisposition => {
  if (current && current.disposition.state !== 'staged' && changed) {
    return {
      state: 'awaiting-review',
      document_sha256: documentSha256,
      disposed_at: observedAt,
      source_version_sha256: sourceSha256
    }
  }
  if (current && !changed) return current.disposition
  return {
    state: 'staged',
    document_sha256: documentSha256,
    disposed_at: observedAt,
    source_version_sha256: sourceSha256
  }
}

const withoutVolatile = (checkpoint: GranolaCheckpoint): unknown => ({
  ...checkpoint,
  generation: '',
  updated_at: ''
})

export const importGranola = async (
  options: GranolaImportOptions,
  context: GranolaOperationContext
): Promise<GranolaImportResult> => {
  const interval = granolaInterval(options.since, options.until)
  const { target, receivers } = await granolaReceivers({
    repository: options.repository,
    workingDirectory: context.workingDirectory,
    homeDirectory: context.homeDirectory,
    stateDirectory: context.stateDirectory
  })
  const source = await granolaSource(context.runner, context.environment)
  const folders = [...(await source.folders())].sort((left, right) => left.id.localeCompare(right.id, 'en'))
  const global = await enumerateGranolaMeetings(source, interval)
  const folderEnumerations = new Map<string, Awaited<ReturnType<typeof enumerateGranolaMeetings>>>()
  for (const folder of folders) {
    folderEnumerations.set(folder.id, await enumerateGranolaMeetings(source, interval, folder.id))
  }
  const folderMeetings = new Map(
    [...folderEnumerations.entries()].map(([id, result]) => [id, result.meetings] as const)
  )
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
  const routing = routeGranolaMeetings({ target, receivers, meetings: discoveredMeetings, folders, folderMeetings })
  const identity = identityCheckpointSha256(global, folderEnumerations)
  const selectedIds = routing.selected
    .map((meeting) => meeting.id)
    .sort((left, right) => left.localeCompare(right, 'en'))
  const root = basePath(target.root)
  const observedAt = new Date(context.now()).toISOString()
  const previous = await currentCheckpoint(target.root, target.repository)
  if (previous) {
    if (previous.account_sha256 !== source.accountSha256) {
      throw new KiError('Granola account differs from receiver checkpoint; refusing to mix source identities')
    }
    await verifyGranolaCheckpoint(root, previous)
  }

  const binding = {
    repository: target.repository,
    account: source.accountSha256,
    schema: source.schemaSha256,
    interval,
    identity,
    selected: selectedIds
  }
  let journal = await loadGranolaJournal(journalPath(target.root))
  if (journal) validateJournalBinding(journal, binding)
  else journal = initialJournal({ ...binding, observedAt })
  if (!options.dryRun) {
    await mkdir(root, { recursive: true })
    await writeAcquisitionStateAtomic(journalPath(target.root), journal)
  }

  const meetings: Record<string, GranolaCheckpointMeeting> = previous ? { ...previous.meetings } : {}
  const stalePaths = new Set<string>()
  let created = 0
  let amended = 0
  let unchanged = 0
  let omissions = 0
  let transcriptReads = 0
  let resumed = 0

  for (const batch of batches(routing.selected, 10)) {
    let details: ReadonlyMap<string, GranolaDetail>
    try {
      details = await source.details(batch.map((meeting) => meeting.id))
    } catch (error) {
      const id = (batch[0] as RoutedGranolaMeeting).id
      const message = error instanceof Error ? error.message : String(error)
      journal = {
        ...journal,
        failures: journalFailure(journal.failures, id, message, observedAt),
        updated_at: observedAt
      }
      if (!options.dryRun) await writeAcquisitionStateAtomic(journalPath(target.root), journal)
      throw error
    }
    for (const meeting of batch) {
      const detail = details.get(meeting.id)
      /* v8 ignore next -- granolaSource.details accounts every requested identity as available or explicitly unavailable. */
      if (!detail) throw new KiError(`Granola detail batch omitted ${meeting.id}`)
      const observedDetailHash = detailHash(meeting, detail)
      const recovered: GranolaJournalComponent | undefined = journal.components[meeting.id]
      if (recovered?.detail_sha256 === observedDetailHash) {
        const staged = await physicalDocument(join(root, recovered.staged_document_path))
        if (staged && sha256(staged) === recovered.staged_document_sha256) {
          meetings[meeting.id] = recovered.checkpoint
          resumed += 1
          continue
        }
      }

      const current = previous?.meetings[meeting.id]
      let transcriptResult: Awaited<ReturnType<typeof readTranscript>>
      try {
        transcriptResult = await readTranscript({
          source,
          meetingId: meeting.id,
          ...(current ? { current } : {}),
          root,
          refresh: Boolean(options.refreshTranscripts),
          observedAt
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        journal = {
          ...journal,
          failures: journalFailure(journal.failures, meeting.id, message, observedAt),
          updated_at: observedAt
        }
        if (!options.dryRun) await writeAcquisitionStateAtomic(journalPath(target.root), journal)
        throw error
      }
      if (transcriptResult.read) transcriptReads += 1
      const changed =
        !current ||
        current.detail_sha256 !== observedDetailHash ||
        current.transcript_sha256 !== transcriptResult.hash ||
        current.transcript_state !== transcriptResult.state ||
        current.transcript_retry_count !== transcriptResult.retries
      /* v8 ignore next -- unchanged state always has a validated current checkpoint and acquired_at fallback. */
      const transcriptObservedAt = changed
        ? transcriptResult.observedAt
        : (current?.transcript_observed_at ?? current?.acquired_at ?? observedAt)
      const acquiredAt = changed ? observedAt : (current as GranolaCheckpointMeeting).acquired_at
      const document = renderGranolaMeeting({
        accountSha256: source.accountSha256,
        acquiredAt,
        detail,
        detailSha256: observedDetailHash,
        folders,
        meeting,
        transcript: transcriptResult.transcript,
        transcriptObservedAt,
        ...(transcriptResult.hash ? { transcriptSha256: transcriptResult.hash } : {}),
        transcriptState: transcriptResult.state
      })
      const documentSha256 = sha256(document.content)
      const sourceVersionSha256 = sha256(
        stableJson({
          detail_sha256: observedDetailHash,
          transcript_sha256: transcriptResult.hash,
          transcript_state: transcriptResult.state
        })
      )
      const checkpointMeeting: GranolaCheckpointMeeting = {
        path: document.path,
        document_sha256: documentSha256,
        detail_sha256: observedDetailHash,
        ...(transcriptResult.hash ? { transcript_sha256: transcriptResult.hash } : {}),
        transcript_state: transcriptResult.state,
        transcript_observed_at: transcriptObservedAt,
        transcript_retry_count: transcriptResult.retries,
        versions: [...new Set([...(current?.versions ?? []), documentSha256])],
        folder_ids: meeting.folderIds,
        inferred_unfoldered: meeting.inferredUnfoldered,
        acquired_at: acquiredAt,
        disposition: stagedDisposition(current, documentSha256, sourceVersionSha256, observedAt, changed)
      }
      if (!options.dryRun && changed) {
        await writeDocument(join(root, document.path), document.content, meeting.id)
        if (current?.path && current.path !== document.path && current.disposition.state === 'staged') {
          stalePaths.add(current.path)
        }
      }
      meetings[meeting.id] = checkpointMeeting
      if (!current) created += 1
      else if (changed) amended += 1
      else unchanged += 1
      if (transcriptResult.state !== 'available' || detail.state === 'unavailable') omissions += 1
      journal = {
        ...journal,
        components: {
          ...journal.components,
          [meeting.id]: {
            detail_sha256: observedDetailHash,
            ...(transcriptResult.hash ? { transcript_sha256: transcriptResult.hash } : {}),
            transcript_state: transcriptResult.state,
            transcript_observed_at: transcriptResult.observedAt,
            staged_document_path: document.path,
            staged_document_sha256: documentSha256,
            verified_at: observedAt,
            checkpoint: checkpointMeeting
          }
        },
        remaining_identities: journal.remaining_identities.filter((id) => id !== meeting.id),
        retry_state: { ...journal.retry_state, [meeting.id]: transcriptResult.retries },
        updated_at: observedAt
      }
      if (!options.dryRun) await writeAcquisitionStateAtomic(journalPath(target.root), journal)
    }
  }

  const windows: readonly GranolaWindowEvidence[] = [
    ...global.evidence,
    ...[...folderEnumerations.values()].flatMap((result) => result.evidence)
  ]
  const proposed: GranolaCheckpoint = {
    schema: 3,
    generation: randomUUID(),
    adapter: 'granola',
    repository: target.repository,
    provider: 'granola',
    account_sha256: source.accountSha256,
    source_schema_sha256: source.schemaSha256,
    identity_checkpoint_sha256: identity,
    interval,
    exhaustive: true,
    windows,
    meetings,
    updated_at: observedAt
  }
  const ledgerChanged = !previous || stableJson(withoutVolatile(previous)) !== stableJson(withoutVolatile(proposed))
  if (!options.dryRun) {
    /* v8 ignore next -- every selected identity is removed in the verified loop before this commit guard. */
    if (journal.remaining_identities.length)
      throw new KiError('Granola journal cannot commit with remaining identities')
    if (ledgerChanged) await writeAcquisitionStateAtomic(checkpointPath(target.root), proposed)
    await removeGranolaJournal(journalPath(target.root))
    for (const path of stalePaths) await rm(join(root, path), { force: true })
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
    transcriptReads,
    resumed,
    ledgerChanged,
    dryRun: Boolean(options.dryRun)
  }
}

export const granolaStatus = async (options: {
  readonly repository?: string
  readonly workingDirectory: string
  readonly homeDirectory: string
  readonly stateDirectory: string
}): Promise<GranolaStatusResult> => {
  const { target } = await granolaReceivers(options)
  const loaded = await loadGranolaCheckpoint(checkpointPath(target.root), target.repository)
  const checkpoint = loaded?.schema === 2 ? migrateGranolaCheckpoint(loaded, target.repository) : loaded
  const journal = await loadGranolaJournal(journalPath(target.root))
  const meetings = checkpoint ? Object.values(checkpoint.meetings) : []
  const dispositions: Record<string, number> = {}
  for (const meeting of meetings) {
    dispositions[meeting.disposition.state] = (dispositions[meeting.disposition.state] ?? 0) + 1
  }
  return {
    repository: target.repository,
    checkpoint: loaded?.schema === 2 ? 'legacy' : loaded ? 'current' : 'absent',
    ...(checkpoint ? { generation: checkpoint.generation } : {}),
    meetings: meetings.length,
    availableTranscripts: meetings.filter((meeting) => meeting.transcript_state === 'available').length,
    retryingTranscripts: meetings.filter((meeting) => meeting.transcript_state === 'retrying').length,
    durableOmissions: meetings.filter((meeting) => meeting.transcript_state === 'durable-omission').length,
    dispositions,
    journal: journal ? 'in-progress' : 'absent',
    remaining: journal?.remaining_identities.length ?? 0,
    failures: journal?.failures.length ?? 0
  }
}

export const reconcileGranola = async (options: {
  readonly repository?: string
  readonly workingDirectory: string
  readonly homeDirectory: string
  readonly stateDirectory: string
}): Promise<GranolaStatusResult> => {
  const { target } = await granolaReceivers(options)
  const checkpoint = await currentCheckpoint(target.root, target.repository)
  if (!checkpoint) throw new KiError('Granola checkpoint is absent; run ki acquire import --adapter granola')
  await verifyGranolaCheckpoint(basePath(target.root), checkpoint)
  return granolaStatus(options)
}

export const resetGranola = async (
  options: GranolaResetOptions,
  context: Pick<GranolaOperationContext, 'workingDirectory' | 'homeDirectory' | 'stateDirectory' | 'now'>
): Promise<GranolaResetResult> => {
  const { target } = await granolaReceivers({
    repository: options.repository,
    workingDirectory: context.workingDirectory,
    homeDirectory: context.homeDirectory,
    stateDirectory: context.stateDirectory
  })
  if (options.component && !options.source) throw new KiError('--component requires --source', 2)
  if (options.rebuild && (options.source || options.component)) {
    throw new KiError('--rebuild cannot be combined with --source or --component', 2)
  }
  const scope = options.rebuild
    ? 'complete rebuild (checkpoint, journal, and staged meeting documents)'
    : options.source && options.component
      ? `${options.component} component for source ${options.source}`
      : options.source
        ? `checkpoint entry and staged document for source ${options.source}`
        : 'adapter checkpoint and in-progress journal'
  const plan = `Reset plan for ${target.repository}: ${scope}. Provider data will not be changed.`
  if (!options.confirm) return { repository: target.repository, plan, changed: false }

  const path = checkpointPath(target.root)
  const checkpoint = await currentCheckpoint(target.root, target.repository)
  if (options.rebuild) {
    await rm(basePath(target.root), { recursive: true, force: true })
    return { repository: target.repository, plan, changed: true }
  }
  if (!options.source) {
    await rm(path, { force: true })
    await removeGranolaJournal(journalPath(target.root))
    return { repository: target.repository, plan, changed: true }
  }
  if (!checkpoint) throw new KiError('Granola checkpoint is absent')
  const meeting = checkpoint.meetings[options.source]
  if (!meeting) throw new KiError(`Granola checkpoint has no source ${options.source}`)
  let nextMeeting: GranolaCheckpointMeeting | undefined
  if (options.component === 'transcript') {
    const { transcript_sha256: _transcriptSha256, transcript_observed_at: _transcriptObservedAt, ...rest } = meeting
    nextMeeting = { ...rest, transcript_state: 'retrying', transcript_retry_count: 0 }
  } else if (options.component === 'detail') {
    nextMeeting = { ...meeting, detail_sha256: '' }
  }
  const meetings = { ...checkpoint.meetings }
  if (nextMeeting) meetings[options.source] = nextMeeting
  else {
    delete meetings[options.source]
    if (meeting.disposition.state === 'staged' || meeting.disposition.state === 'awaiting-review') {
      await rm(join(basePath(target.root), meeting.path), { force: true })
    }
  }
  await writeAcquisitionStateAtomic(path, {
    ...checkpoint,
    generation: randomUUID(),
    meetings,
    updated_at: new Date(context.now()).toISOString()
  })
  await removeGranolaJournal(journalPath(target.root))
  return { repository: target.repository, plan, changed: true }
}
