import { AsyncLocalStorage } from 'node:async_hooks'
import { createHash, randomUUID } from 'node:crypto'
import { appendFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { KiError } from '../errors.ts'
import { type AgentContext, git, instant, read } from './context.ts'
import { loadControl, lostControlOperations } from './control-store.ts'
import { withRunLock } from './locking.ts'
import { ownershipLoss, ownsScope } from './scope.ts'
import { followThread, heldAs, readThread, reportPath } from './thread.ts'

export type EventKind =
  | 'launch'
  | 'held'
  | 'progress'
  | 'done'
  | 'failed'
  | 'blocked'
  | 'needs-owner'
  | 'stop-requested'
  | 'stopped'
  | 'dequeued'

/** One line of the run's append-only `events.jsonl`; `seq` is its line number. */
export interface RunEvent {
  readonly seq: number
  readonly at: string
  readonly run: string
  readonly agent: string
  readonly attempt: number
  readonly kind: EventKind
  readonly text: string
  readonly tag?: string
  readonly operation?: string | undefined
  readonly publication?: string | undefined
  readonly queueSource?: string | undefined
  /** Source status identity survives snapshot recovery; progress never ends an attempt. */
  readonly statusLine?: string | undefined
  readonly terminal?: boolean | undefined
}

/** What the last derivation saw of one agent's attempt, so nothing is emitted twice. */
interface Seen {
  readonly attempt: number
  readonly line?: string
  readonly ended?: boolean
  readonly failed?: boolean
  readonly queries?: readonly string[]
}

type Snapshot = Record<string, Seen>
const seenKey = (agent: string, attempt: number): string => `${agent}/${attempt}`

type Pending = Omit<RunEvent, 'seq' | 'at' | 'run' | 'attempt'> & {
  readonly attempt?: number | undefined
  readonly publicationOrder?: number | undefined
}

/** The run's agents and whether each one's process is alive, as the caller observes them. */
export interface Observed {
  readonly agents: readonly string[]
  readonly alive: (name: string) => Promise<boolean>
  readonly homeReports?: boolean | undefined
}

const eventKinds = [
  'launch',
  'held',
  'progress',
  'done',
  'failed',
  'blocked',
  'needs-owner',
  'stop-requested',
  'stopped',
  'dequeued'
]
const eventsFile = (directory: string): string => join(directory, 'events.jsonl')
const stateFile = (directory: string): string => join(directory, 'events.state.json')

/** The file's modification time, or 0 when it is absent. */
const modified = async (path: string): Promise<number> => {
  try {
    return (await stat(path)).mtimeMs
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0
    throw evidenceError(path, error)
  }
}

const evidenceRecovery = 'see docs/guides/user/background-agents.md#recover-event-evidence'
const evidenceError = (path: string, error: unknown): KiError =>
  new KiError(`events-evidence-unverified: ${path}: ${String(error)}`, 1, evidenceRecovery)
/** Only ENOENT is absence; unreadable evidence must never reset event identities. */
const evidenceRead = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw evidenceError(path, error)
  }
}
const parseEvidence = <T>(path: string, source: string, valid: (value: T) => boolean): T => {
  try {
    const value = JSON.parse(source) as T
    if (!valid(value)) throw new Error('invalid evidence shape')
    return value
  } catch (error) {
    throw evidenceError(path, error)
  }
}
const parseSnapshot = (path: string, source: string): Snapshot =>
  parseEvidence<Snapshot>(
    path,
    source,
    (value) =>
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.values(value).every(
        (seen) =>
          seen !== null &&
          typeof seen === 'object' &&
          Number.isInteger(seen.attempt) &&
          seen.attempt > 0 &&
          (seen.line === undefined || typeof seen.line === 'string') &&
          (seen.ended === undefined || typeof seen.ended === 'boolean') &&
          (seen.failed === undefined || typeof seen.failed === 'boolean') &&
          (seen.queries === undefined ||
            (Array.isArray(seen.queries) && seen.queries.every((query) => typeof query === 'string')))
      )
  )

const eventLease = new AsyncLocalStorage<string>()

/** Single-shot observers refuse boundedly. Pending publications survive this refusal. */
const withLock = <T>(context: AgentContext, directory: string, work: () => Promise<T>): Promise<T> =>
  withRunLock(directory, 'events', () => eventLease.run(directory, work), context.processes.onExit).catch(
    (error: unknown) => {
      if (error instanceof KiError) throw error
      throw evidenceError(directory, error)
    }
  )

const eventDigest = (text: string): string => createHash('sha256').update(text).digest('hex')
/** Commit the exact append intent before publication so readers can finish an interrupted append. */
const writeHistory = async (
  directory: string,
  journal: string,
  seq: number,
  events: readonly RunEvent[]
): Promise<void> => {
  const path = join(directory, 'events.history')
  const temporary = `${path}.tmp`
  const failures = events
    .filter((event) => event.kind === 'failed' || event.kind === 'blocked')
    .map(({ seq, terminal, statusLine }) => ({ seq, terminal, statusLine }))
  const contents = `${JSON.stringify({ schema: 'ki/agent-events/v2', seq, sha256: eventDigest(journal), journal, failures, failureSha256: eventDigest(JSON.stringify(failures)) })}\n`
  await writeFile(temporary, contents)
  await rename(temporary, path)
  if ((await evidenceRead(path)) !== contents) throw evidenceError(path, 'checkpoint write could not be verified')
}

const verifyLegacyHistory = async (
  directory: string,
  events: readonly RunEvent[],
  legacyFailures: ReadonlySet<number>
): Promise<void> => {
  const store = await loadControl(directory)
  if (
    Object.values(store?.operations ?? {}).some((operation) => (operation.receipt?.eventSequence ?? 0) > events.length)
  )
    throw evidenceError(eventsFile(directory), 'journal is shorter than a confirmed event receipt')
  const path = stateFile(directory)
  const source = await evidenceRead(path)
  if (source === undefined) return
  const snapshot = parseSnapshot(path, source)
  for (const [key, seen] of Object.entries(snapshot)) {
    const agent = key.split('/')[0] as string
    const journal = events.filter((event) => event.agent === agent && event.attempt === seen.attempt)
    if (!journal.length) {
      if (
        Object.values(store?.history ?? {}).some(
          (attempt) => attempt.agent === agent && attempt.attempt === seen.attempt
        )
      )
        throw evidenceError(eventsFile(directory), 'journal has lost an observed immutable attempt')
      continue
    }
    const replayed = journal.reduce<Seen>((prior, event) => publicationSeen(prior, event), { attempt: seen.attempt })
    if (
      seen.ended &&
      !replayed.ended &&
      !journal.some((event) => legacyFailures.has(event.seq) && event.terminal === false)
    )
      throw evidenceError(eventsFile(directory), 'journal has lost an observed terminal outcome')
    if (seen.line !== undefined) {
      const form = statusForm.exec(seen.line)
      if (
        form &&
        !journal.some(
          (event) =>
            event.statusLine === seen.line ||
            (event.kind === formKind[form[1] as keyof typeof formKind] && event.text === form[2])
        )
      )
        throw evidenceError(eventsFile(directory), 'journal has lost an observed status event')
    }
    if (
      (seen.queries ?? []).some(
        (query) => !journal.some((event) => event.kind === 'needs-owner' && `${event.tag} - ${event.text}` === query)
      )
    )
      throw evidenceError(eventsFile(directory), 'journal has lost an observed query')
  }
}

export const readEvents = async (
  context: AgentContext,
  directory: string,
  after = 0,
  initialize = false
): Promise<RunEvent[]> => {
  const path = eventsFile(directory)
  const bytes = await readFile(path).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw evidenceError(path, error)
  })
  const source = bytes?.toString('utf8')
  if (source === undefined) {
    const snapshot = await evidenceRead(stateFile(directory))
    const initialized = await evidenceRead(join(directory, 'events.history'))
    const cursor = await evidenceRead(join(directory, 'events.seen'))
    const control = await loadControl(directory)
    if (
      initialized !== undefined ||
      snapshot !== undefined ||
      (cursor !== undefined && cursor.trim() !== '0') ||
      Object.keys(control?.operations ?? {}).length > 0
    )
      throw evidenceError(path, 'journal missing beside prior event evidence; restore the authoritative history')
    if (initialize) {
      try {
        await writeFile(path, '', { flag: 'wx' })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw evidenceError(path, error)
      }
      return readEvents(context, directory, after, initialize)
    }
  }
  const history = join(directory, 'events.history')
  const checkpoint = await evidenceRead(history)
  let journal = source ?? ''
  let expectedSequence: number | undefined
  let failures: RunEvent[] = []
  if (checkpoint !== undefined && checkpoint !== 'ki/agent-events/v1\n') {
    // A concurrent first publication may appear after the initial absence checks.
    if (bytes === undefined) return readEvents(context, directory, after, initialize)
    const saved = parseEvidence<{
      schema: string
      seq: number
      sha256: string
      journal: string
      failures?: RunEvent[]
      failureSha256?: string
    }>(
      history,
      checkpoint,
      (value) =>
        value !== null &&
        value.schema === 'ki/agent-events/v2' &&
        Number.isSafeInteger(value.seq) &&
        value.seq >= 0 &&
        typeof value.sha256 === 'string' &&
        typeof value.journal === 'string' &&
        eventDigest(value.journal) === value.sha256 &&
        (value.failures === undefined ||
          (Array.isArray(value.failures) &&
            value.failures.every(
              (failure) =>
                failure !== null &&
                Number.isSafeInteger(failure.seq) &&
                failure.seq > 0 &&
                failure.seq <= value.seq &&
                typeof failure.terminal === 'boolean' &&
                (failure.statusLine === undefined || typeof failure.statusLine === 'string')
            ) &&
            new Set(value.failures.map((failure) => failure.seq)).size === value.failures.length &&
            value.failureSha256 === eventDigest(JSON.stringify(value.failures))))
    )
    if (
      !Buffer.from(saved.journal)
        .subarray(0, (bytes as Buffer).length)
        .equals(bytes as Buffer)
    )
      throw evidenceError(
        path,
        'journal differs from committed history; preserve both copies and restore authoritative evidence'
      )

    journal = saved.journal
    expectedSequence = saved.seq
    failures = saved.failures ?? []
  }
  if (journal !== '' && !journal.endsWith('\n')) throw evidenceError(path, 'journal has a truncated line terminator')
  const events = journal
    .split('\n')
    .filter((line) => line.trim())
    .map((line, index) =>
      parseEvidence<RunEvent>(
        path,
        line,
        (event) =>
          event !== null &&
          event.seq === index + 1 &&
          event.run === basename(directory) &&
          typeof event.at === 'string' &&
          Number.isFinite(Date.parse(event.at)) &&
          (event.queueSource === undefined ||
            (typeof event.queueSource === 'string' && event.queueSource.length > 0)) &&
          (event.operation === undefined || (typeof event.operation === 'string' && event.operation.length > 0)) &&
          (event.publication === undefined ||
            (typeof event.publication === 'string' && event.publication.length > 0)) &&
          (event.tag === undefined || (typeof event.tag === 'string' && event.tag.length > 0)) &&
          typeof event.agent === 'string' &&
          Number.isSafeInteger(event.attempt) &&
          event.attempt > 0 &&
          typeof event.text === 'string' &&
          eventKinds.includes(event.kind) &&
          (event.statusLine === undefined || typeof event.statusLine === 'string') &&
          (event.terminal === undefined || typeof event.terminal === 'boolean')
      )
    )

  if (expectedSequence !== undefined && expectedSequence !== events.length)
    throw evidenceError(history, 'checkpoint sequence differs from journal')
  const legacyFailures = new Set(
    events
      .filter((event) => ['failed', 'blocked'].includes(event.kind) && event.terminal === undefined)
      .map((event) => event.seq)
  )
  for (const failure of failures) {
    const event = events[failure.seq - 1] as RunEvent
    if (
      !['failed', 'blocked'].includes(event.kind) ||
      (event.terminal !== undefined && event.terminal !== failure.terminal) ||
      (event.statusLine !== undefined && event.statusLine !== failure.statusLine)
    )
      throw evidenceError(history, 'failure identity differs from journal')
    events[failure.seq - 1] = { ...event, terminal: failure.terminal, statusLine: failure.statusLine }
  }
  await classifyLegacyFailures(directory, events)
  if (checkpoint === 'ki/agent-events/v1\n' || checkpoint === undefined)
    await verifyLegacyHistory(directory, events, legacyFailures)
  const cursor = await evidenceRead(join(directory, 'events.seen'))
  if (
    cursor !== undefined &&
    (!/^\d+\s*$/.test(cursor) || !Number.isSafeInteger(Number(cursor)) || Number(cursor) > events.length)
  )
    throw evidenceError(join(directory, 'events.seen'), 'invalid cursor or cursor ahead of journal')
  if (source !== undefined && journal !== source) {
    if (eventLease.getStore() !== directory)
      return withLock(context, directory, () => readEvents(context, directory, after, initialize))
    // Finish only a digest-verified exact prefix, preserving every existing byte.
    const intended = Buffer.from(journal)
    await appendFile(path, intended.subarray((bytes as Buffer).length))
    if (!(await readFile(path)).equals(intended)) throw evidenceError(path, 'journal recovery could not be verified')
  }
  if (initialize && checkpoint === undefined) await writeHistory(directory, journal, events.length, events)
  return events.filter((event) => event.seq > after)
}

/** Initialise by exclusive creation before effects; never replace existing history. */
export const initializeEvents = async (context: AgentContext, directory: string): Promise<void> => {
  await readEvents(context, directory, 0, true)
}

/** One more than the agent's `<name>.prev-<n>` folders, which a relaunch leaves behind. */
const attemptOf = async (directory: string, name: string): Promise<number> =>
  (await loadControl(directory))?.attempts[name]?.attempt ??
  (await readdir(directory)).filter((file) => file.startsWith(`${name}.prev-`)).length + 1

const append = async (
  context: AgentContext,
  directory: string,
  snapshot: Snapshot,
  attempts: ReadonlyMap<string, number>,
  pending: readonly Pending[]
): Promise<void> => {
  const events = await readEvents(context, directory, 0, true)
  let seq = events.length
  const lines = pending.map((event) => {
    seq += 1
    const { agent, kind, text, tag, operation, publication, queueSource, statusLine, terminal } = event
    const attempt = event.attempt ?? (attempts.get(agent) as number)
    return `${JSON.stringify({ seq, at: instant(context), run: basename(directory), agent, attempt, kind, text, ...(tag === undefined ? {} : { tag }), ...(operation === undefined ? {} : { operation }), ...(publication === undefined ? {} : { publication }), ...(queueSource === undefined ? {} : { queueSource }), ...(statusLine === undefined ? {} : { statusLine }), ...(terminal === undefined ? {} : { terminal }) })}\n`
  })
  const journal = await evidenceRead(eventsFile(directory))
  if (journal === undefined) throw evidenceError(eventsFile(directory), 'journal disappeared before append intent')
  await writeHistory(directory, journal + lines.join(''), seq, [
    ...events,
    ...lines.map((line) => JSON.parse(line) as RunEvent)
  ])
  await appendFile(eventsFile(directory), lines.join(''))
  if ((await evidenceRead(eventsFile(directory))) !== journal + lines.join(''))
    throw evidenceError(eventsFile(directory), 'append could not be verified; preserve the checkpoint append intent')
  await writeFile(stateFile(directory), `${JSON.stringify(snapshot)}\n`)
}

/**
 * Appends an event the launcher observes as it happens: a launch, a hold, a gate that closes
 * on a held agent, or a queued agent the dispatcher cannot launch. A gate or launch failure
 * ends that attempt, so derivation reports no exit after it.
 */
export const recordEvent = async (
  context: AgentContext,
  directory: string,
  observed: Observed | undefined,
  agent: string,
  kind: 'launch' | 'held' | 'blocked' | 'failed' | 'stop-requested' | 'stopped' | 'dequeued',
  text: string,
  operation?: string,
  explicitAttempt?: number,
  queueSource?: string
): Promise<void> => {
  try {
    const publication = randomUUID()
    const pending = join(directory, 'events.pending')
    await mkdir(pending, { recursive: true })
    const path = join(pending, `${publication}.json`)
    const event: Pending = {
      agent,
      kind,
      text,
      operation,
      publication,
      queueSource,
      terminal:
        kind === 'failed' ||
        kind === 'stopped' ||
        kind === 'dequeued' ||
        (kind === 'blocked' && (text.startsWith('gate cannot open:') || text.startsWith('could not launch:'))),
      // Producers hold control.lock; the journal and pending count provide a
      // durable order even when a fixed clock gives several events one instant.
      publicationOrder:
        (await readEvents(context, directory)).length +
        (await readdir(pending)).filter((file) => file.endsWith('.json')).length +
        1,
      attempt: explicitAttempt ?? (await attemptOf(directory, agent))
    }
    await writeFile(`${path}.tmp`, `${JSON.stringify(event)}\n`)
    await rename(`${path}.tmp`, path)
    // The durable pending record is already publication evidence. A busy observer or
    // damaged projection cannot turn a worker-start acknowledgement into a failure.
    try {
      await withLock(context, directory, () => publishPending(context, directory, observed))
    } catch (error) {
      // Busy publication remains durable and pending. Evidence failures refuse,
      // except when a start receipt already proves the effect crossed the boundary.
      if (
        !(error instanceof KiError && error.message.startsWith('events-transaction-busy:')) &&
        kind !== 'launch' &&
        kind !== 'held'
      )
        throw error
    }
  } catch (error) {
    // Worker-start receipts are already durable. Even a pending-directory write
    // failure must not contradict them; deriveEvents reconstructs missing launches.
    if (kind !== 'launch' && kind !== 'held') throw evidenceError(join(directory, 'events.pending'), error)
  }
}

export const flushPendingEvents = (context: AgentContext, directory: string): Promise<void> =>
  withLock(context, directory, () => publishPending(context, directory, undefined))

const publishPending = async (
  context: AgentContext,
  directory: string,
  observed: Observed | undefined
): Promise<void> => {
  const pendingDirectory = join(directory, 'events.pending')
  const files = await readdir(pendingDirectory).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw evidenceError(pendingDirectory, error)
  })
  const paths = files
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => join(pendingDirectory, file))
  if (paths.length === 0) return
  const journal = await readEvents(context, directory)
  const snapshot = await readSnapshot(context, directory, observed)
  const startedKey = (event: Pending): string => `${event.agent}/${event.attempt}/${event.kind}`
  const started = new Set(journal.filter((event) => ['launch', 'held'].includes(event.kind)).map(startedKey))
  const publications = new Set(journal.map((event) => event.publication))
  const operations = new Set(journal.map((event) => `${event.operation}/${event.kind}`))
  const pending: Pending[] = []
  const ended = new Set(journal.filter(terminalEvent).map((event) => `${event.agent}/${event.attempt}`))
  const records = await Promise.all(
    paths.map(async (path) => {
      const event = parseEvidence<Pending>(
        path,
        (await evidenceRead(path)) ?? '',
        (value) =>
          value !== null &&
          typeof value.publication === 'string' &&
          value.publication.length > 0 &&
          typeof value.agent === 'string' &&
          eventKinds.includes(value.kind) &&
          typeof value.text === 'string' &&
          (value.queueSource === undefined ||
            (typeof value.queueSource === 'string' && value.queueSource.length > 0)) &&
          (value.operation === undefined || (typeof value.operation === 'string' && value.operation.length > 0)) &&
          (value.tag === undefined || (typeof value.tag === 'string' && value.tag.length > 0)) &&
          (value.statusLine === undefined || typeof value.statusLine === 'string') &&
          (value.terminal === undefined || typeof value.terminal === 'boolean') &&
          (value.publicationOrder === undefined ||
            (Number.isSafeInteger(value.publicationOrder) && value.publicationOrder > 0)) &&
          Number.isSafeInteger(value.attempt) &&
          (value.attempt as number) > 0
      )
      return { event, created: await modified(path) }
    })
  )
  records.sort(
    (left, right) =>
      (left.event.publicationOrder === undefined ? 0 : 1) - (right.event.publicationOrder === undefined ? 0 : 1) ||
      (left.event.publicationOrder ?? left.created) - (right.event.publicationOrder ?? right.created) ||
      (left.event.publication as string).localeCompare(right.event.publication as string)
  )
  // Pending v1 records need the same proof before they can own a terminal identity.
  const planned = [
    ...journal,
    ...records.map(({ event }, index) => ({
      ...event,
      attempt: event.attempt as number,
      seq: journal.length + index + 1,
      at: instant(context),
      run: basename(directory)
    }))
  ]
  await classifyLegacyFailures(directory, planned)
  for (const [index, record] of records.entries()) record.event = planned[journal.length + index] as RunEvent
  for (const { event } of records) {
    if (
      publications.has(event.publication) ||
      (event.operation && operations.has(`${event.operation}/${event.kind}`)) ||
      (['launch', 'held'].includes(event.kind) && started.has(startedKey(event))) ||
      (terminalEvent(event) && ended.has(`${event.agent}/${event.attempt}`))
    )
      continue
    started.add(startedKey(event))
    if (terminalEvent(event)) ended.add(`${event.agent}/${event.attempt}`)
    publications.add(event.publication)
    operations.add(`${event.operation}/${event.kind}`)
    const attempt = event.attempt as number
    const key = seenKey(event.agent, attempt)
    const seen =
      snapshot[key] ?? (snapshot[event.agent]?.attempt === attempt ? (snapshot[event.agent] as Seen) : { attempt })
    const next = publicationSeen(seen, event)
    snapshot[key] = next
    if ((snapshot[event.agent]?.attempt ?? 0) <= attempt) snapshot[event.agent] = next
    pending.push(event)
  }
  await append(context, directory, snapshot, new Map(), pending)
  for (const path of paths) await rm(path)
}

/** A closed launcher vocabulary can also occur verbatim in worker progress. */
const legacyTerminalFailure = ({ kind, text }: RunEvent): boolean =>
  text.startsWith('could not launch:') ||
  (kind === 'blocked'
    ? text.startsWith('gate cannot open:')
    : text === 'no report' || text === 'attempt failed' || /^exited without DONE \(.+\)$/.test(text))

/** Resolve old failure identities before adopting their journal or trusting a snapshot. */
const classifyLegacyFailures = async (directory: string, events: RunEvent[]): Promise<void> => {
  const legacy = events.filter((event) => ['failed', 'blocked'].includes(event.kind) && event.terminal === undefined)
  if (!legacy.length) return
  const source = await evidenceRead(stateFile(directory))
  const snapshot = source === undefined ? {} : parseSnapshot(stateFile(directory), source)
  const control = await loadControl(directory)
  const progress = new Set<string>()
  for (const event of legacy) {
    const key = seenKey(event.agent, event.attempt)
    const seen = snapshot[key] ?? snapshot[event.agent]
    const current = (await attemptOf(directory, event.agent)) === event.attempt
    const status = current ? await statusOf(directory, event.agent) : undefined
    const line = [seen?.attempt === event.attempt ? seen.line : undefined, status?.line].find((line) => {
      const form = line === undefined ? undefined : statusForm.exec(line)
      return form != null && formKind[form[1] as keyof typeof formKind] === event.kind && form[2] === event.text
    })
    const receipt = event.operation === undefined ? undefined : control?.operations[event.operation]?.receipt
    const confirmed = receipt?.eventSequence === event.seq && receipt.resultingState === 'failed'
    const identity = `${key}/${event.kind}/${event.text}`
    const attemptEvents = events.filter((other) => other.agent === event.agent && other.attempt === event.attempt)
    const later = attemptEvents.some((other) => other.seq > event.seq)
    if (confirmed) {
      events[event.seq - 1] = { ...event, terminal: true }
    } else if ((line !== undefined && !progress.has(identity)) || later || !legacyTerminalFailure(event)) {
      progress.add(identity)
      events[event.seq - 1] = { ...event, terminal: false, statusLine: line }
    } else {
      const attempt = Object.values(control?.history ?? {}).find(
        (value) => value.agent === event.agent && value.attempt === event.attempt
      )
      const ended = attempt?.state === 'failed' || attempt?.state === 'done'
      const noReport =
        event.text === 'no report' &&
        status?.done &&
        (await read(join(directory, `${event.agent}.report.md`))) === undefined
      const queued =
        (event.text.startsWith('could not launch:') || event.text.startsWith('gate cannot open:')) &&
        Object.values(control?.entries ?? {}).some(
          (entry) =>
            entry.name === event.agent &&
            entry.attempt === event.attempt &&
            entry.state === 'cancelled' &&
            entry.disposition === event.kind
        )
      if (ended || noReport || queued) events[event.seq - 1] = { ...event, terminal: true }
      else
        throw evidenceError(
          eventsFile(directory),
          `ambiguous legacy failure at sequence ${event.seq}; preserve status, snapshot and control evidence`
        )
    }
  }
}

const terminalEvent = (event: Pending): boolean =>
  event.terminal ?? ['done', 'stopped', 'dequeued'].includes(event.kind)

/** The append-only journal is authoritative if snapshot persistence was interrupted. */
const publicationSeen = (previous: Seen, event: Pending): Seen => {
  const seen = event.statusLine === undefined ? previous : { ...previous, line: event.statusLine }
  // Older journals predate explicit identities. Their terminal derivations have
  // fixed messages; arbitrary worker status text never ends an attempt.
  const terminal = terminalEvent(event)
  if (terminal) return { ...seen, failed: event.kind !== 'done', ended: true }
  if (event.kind === 'needs-owner')
    return { ...seen, queries: [...new Set([...(seen.queries ?? []), `${event.tag} - ${event.text}`])] }
  return seen
}

/** `HH:MM TZ - milestone: <text>`, and the `blocked:` and `failed:` forms of the progress protocol. */
const statusForm = /^\d{2}:\d{2} \S+ - (milestone|blocked|failed): (.+)$/

const formKind = { milestone: 'progress', blocked: 'blocked', failed: 'failed' } as const

const queryHeading = /^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*) [-–—] (.+)$/

/**
 * The outstanding queries of an owner report: `### <TAG> - <title>` under `## Queries`, or
 * `<TAG> - <title>` headings under the older `## Outstanding queries`.
 */
export const reportQueries = (report: string): { readonly tag: string; readonly title: string }[] => {
  const queries: { tag: string; title: string }[] = []
  let section = ''
  for (const line of report.split('\n')) {
    const heading = /^(#+)\s+(.*?)\s*$/.exec(line)
    if (heading?.[1] === '##') section = (heading[2] as string).toLowerCase()
    else if (heading && (section === 'queries' || section === 'outstanding queries')) {
      const query = queryHeading.exec(heading[2] as string)
      if (query) queries.push({ tag: query[1] as string, title: query[2] as string })
    }
  }
  return queries
}

/** The agent's report: in the thread folder, or in the state folder of a run older than its thread home. */
const reportOf = async (context: AgentContext, directory: string, name: string): Promise<string | undefined> => {
  const source = await read(join(directory, `${name}.report.md`))
  if (source !== undefined) return source
  const thread = await readThread(context, basename(directory))
  return thread === undefined ? undefined : read(reportPath(thread, name))
}

/**
 * Copies the report the agent wrote in the state folder into the thread folder, where the
 * coordinator reads and commits it, so that the launcher stays its only writer. It runs once per
 * attempt, when the attempt first ends. A thread-folder copy with changes Git does not hold is
 * left alone; one Git holds unchanged, as after a relaunch, is replaced. A report Git already holds
 * with these contents, under the folder's present or an earlier name, is never written again: a
 * retired report stays retired, and a newer committed version is not overwritten by an older one.
 * A run homed in a retired `+/_THREADS/` folder follows its work folder, and one with none keeps
 * its report in the state folder.
 */
const homeReport = async (context: AgentContext, directory: string, name: string): Promise<void> => {
  const source = join(directory, `${name}.report.md`)
  const report = await read(source)
  const thread = await followThread(context, basename(directory))
  if (report === undefined || thread === undefined) return
  const target = reportPath(thread, name)
  if ((await read(target)) !== undefined) {
    const status = await git(context, thread.repository, ['status', '--porcelain', '--', target])
    if (status.output.trim()) return
  }
  if (await heldAs(context, thread, `${name}.report.md`, source)) return
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, report)
}

/** The agent's last status line before any `DONE`, and whether it wrote `DONE`. */
const statusOf = async (
  directory: string,
  name: string
): Promise<{ readonly done: boolean; readonly line?: string }> => {
  const lines = ((await read(join(directory, `${name}.status`))) ?? '').split('\n').filter((line) => line.trim())
  const done = lines.at(-1)?.trim() === 'DONE'
  return { done, line: done ? lines.at(-2) : lines.at(-1) }
}

const queryKeys = (report: string): string[] => reportQueries(report).map((query) => `${query.tag} - ${query.title}`)

/**
 * The snapshot in `events.state.json`. A run with neither it nor `events.jsonl` predates run
 * events, so each agent that had already ended starts seen: its finish, status line and queries
 * are never replayed, and a report in an older place gives no `failed: no report`. A live agent
 * keeps ordinary derivation. A run with events but no snapshot lost its state, not its history,
 * and reconstructs terminal ownership from its journal.
 */
const readSnapshot = async (
  context: AgentContext,
  directory: string,
  observed: Observed | undefined
): Promise<Snapshot> => {
  const path = stateFile(directory)
  const state = await evidenceRead(path)
  const snapshot: Snapshot =
    state === undefined ? Object.create(null) : Object.assign(Object.create(null), parseSnapshot(path, state))
  const journal = await readEvents(context, directory)
  const replayed = new Set<string>()
  for (const event of journal) {
    const key = seenKey(event.agent, event.attempt)
    const previous = snapshot[key] ?? snapshot[event.agent]
    const seen = previous?.attempt === event.attempt ? previous : { attempt: event.attempt }
    // Rebuild terminal ownership from classified evidence, including poisoned v1 snapshots.
    if (!replayed.has(key)) {
      snapshot[key] = { ...seen, ended: false, failed: false }
      replayed.add(key)
    }
    const next = publicationSeen(snapshot[key] as Seen, event)
    snapshot[key] = next
    if ((snapshot[event.agent]?.attempt ?? 0) <= event.attempt) snapshot[event.agent] = next
  }
  if (state !== undefined || journal.length > 0) return snapshot
  const control = await loadControl(directory)
  if (observed)
    for (const name of observed.agents) {
      if (control?.attempts[name]) continue
      const { done, line } = await statusOf(directory, name)
      if (!done && (await observed.alive(name))) continue
      const queries = done ? queryKeys((await reportOf(context, directory, name)) ?? '') : []
      snapshot[name] = { attempt: await attemptOf(directory, name), line, ended: true, queries }
    }
  return snapshot
}

/** What changed for one agent since the snapshot, with the time it changed. */
const agentChanges = async (
  context: AgentContext,
  directory: string,
  name: string,
  previous: Seen,
  alive: boolean,
  homeReports: boolean
): Promise<{ readonly seen: Seen; readonly when: number; readonly events: Pending[] }> => {
  const events: Pending[] = []
  const control = await loadControl(directory)
  const attempt = control?.attempts[name]
  if (attempt?.state === 'stopped' || (attempt?.entry && control?.entries[attempt.entry]?.disposition === 'dequeued'))
    return { seen: { ...previous, ended: true }, when: 0, events }
  if (control && attempt) {
    const loss = await ownershipLoss(context, control, attempt, alive)
    if (loss) {
      const journal = await readEvents(context, directory)
      return {
        seen: previous,
        when: 0,
        events: journal.some((event) => event.kind === 'blocked' && event.operation === loss.operation)
          ? []
          : [
              {
                agent: name,
                attempt: attempt.attempt,
                kind: 'blocked',
                operation: loss.operation,
                text: loss.text,
                terminal: false
              }
            ]
      }
    }
  }
  const { done, line } = await statusOf(directory, name)
  if (attempt?.state === 'held' || (attempt?.state === 'unconfirmed' && !context.processes.control))
    return { seen: previous, when: 0, events }
  if (
    attempt &&
    !done &&
    (['stop-requested', 'stop-timeout', 'unconfirmed'].includes(attempt.state) ||
      (attempt.entry && control?.entries[attempt.entry]?.state === 'queued'))
  )
    return { seen: previous, when: 0, events }
  if (attempt?.gateFailure !== undefined)
    return {
      seen: { ...previous, ended: true },
      when: 0,
      events: previous.ended ? [] : [{ agent: name, kind: 'blocked', text: attempt.gateFailure, terminal: true }]
    }
  if (attempt?.state === 'failed')
    return {
      seen: { ...previous, ended: true },
      when: 0,
      events: previous.ended ? [] : [{ agent: name, kind: 'failed', text: 'attempt failed', terminal: true }]
    }
  if (done && attempt && context.processes.control) {
    try {
      const scope = await context.processes.control.inspect(attempt)
      if (!ownsScope(attempt, scope) || !scope.containment || !scope.empty || !scope.fenced)
        return { seen: previous, when: 0, events }
    } catch {
      return { seen: previous, when: 0, events }
    }
  }
  let seen = { ...previous, line }
  const form = line === undefined || line === previous.line ? undefined : statusForm.exec(line)
  if (form) {
    const kind = formKind[form[1] as keyof typeof formKind]
    events.push({ agent: name, kind, text: form[2] as string, statusLine: line, terminal: false })
  }
  const when = Math.max(
    await modified(join(directory, `${name}.status`)),
    await modified(join(directory, `${name}.pid`))
  )
  // Home the report on the attempt's first end only, so that later passes never redeliver it.
  if (done && homeReports && !seen.ended) await homeReport(context, directory, name)
  const report = done ? await reportOf(context, directory, name) : undefined
  if (!seen.ended && done) {
    events.push(
      report === undefined
        ? { agent: name, kind: 'failed', text: 'no report', terminal: true }
        : { agent: name, kind: 'done', text: line ?? 'DONE', terminal: true }
    )
    seen = { ...seen, ended: true }
  } else if (!seen.ended && !alive) {
    events.push({ agent: name, kind: 'failed', text: `exited without DONE (${line ?? 'no status'})`, terminal: true })
    seen = { ...seen, ended: true }
  }
  if (done) {
    const asked = new Set(seen.queries)
    for (const query of reportQueries(report ?? ''))
      if (!asked.has(`${query.tag} - ${query.title}`))
        events.push({ agent: name, kind: 'needs-owner', text: query.title, tag: query.tag })
    seen = { ...seen, queries: queryKeys(report ?? '') }
  }
  return { seen, when, events }
}

/**
 * Compares every agent's status, pid and report with the snapshot in `events.state.json` and
 * appends what changed to `events.jsonl`, under the run's lock. Events found in one pass are
 * appended in the order their source files changed, then by agent name.
 */
export const deriveEvents = (context: AgentContext, directory: string, observed: Observed): Promise<void> =>
  withLock(context, directory, async () => {
    await publishPending(context, directory, observed)
    const snapshot = await readSnapshot(context, directory, observed)
    const attempts = new Map<string, number>()
    const changes: { readonly when: number; readonly name: string; readonly events: Pending[] }[] = []
    const store = await loadControl(directory)
    const journal = await readEvents(context, directory)
    const recorded = new Set(journal.map((event) => `${event.operation}/${event.kind}`))
    const ended = new Set(journal.filter(terminalEvent).map((event) => `${event.agent}/${event.attempt}`))
    for (const entry of Object.values(store?.entries ?? {})) {
      if (
        entry.state !== 'cancelled' ||
        (entry.disposition !== 'blocked' && entry.disposition !== 'failed') ||
        ended.has(`${entry.name}/${entry.attempt}`)
      )
        continue
      changes.push({
        when: 0,
        name: entry.name,
        events: [
          {
            agent: entry.name,
            attempt: entry.attempt,
            kind: entry.disposition,
            text:
              entry.dispositionReason ??
              `could not launch: preserved ${entry.disposition} queue outcome; inspect the dispatch log`,
            terminal: true
          }
        ]
      })
    }
    for (const operation of await lostControlOperations(context, directory, store)) {
      if (recorded.has(`${operation.id}/blocked`)) continue
      const target = operation.target as { agent: string; attempt: number }
      changes.push({
        when: Date.parse(operation.timestamp),
        name: target.agent,
        events: [
          {
            agent: target.agent,
            attempt: target.attempt,
            kind: 'blocked',
            operation: operation.id,
            text: `${operation.id}: ownership-unverified; control holder lost before a durable outcome; inspect preserved evidence`,
            terminal: false
          }
        ]
      })
    }
    for (const operation of Object.values(store?.operations ?? {})) {
      if (
        operation.operation === 'stop' &&
        operation.receipt &&
        ['stop-timeout', 'ownership-unverified', 'containment-unverified'].includes(operation.receipt.outcome) &&
        !recorded.has(`${operation.id}/blocked`)
      ) {
        const target = operation.target as { agent: string; attempt: number }
        changes.push({
          when: Date.parse(operation.timestamp),
          name: target.agent,
          events: [
            {
              agent: target.agent,
              attempt: target.attempt,
              kind: 'blocked',
              operation: operation.id,
              text: `${operation.id}: ${operation.receipt.outcome}`,
              terminal: false
            }
          ]
        })
      }
      if (
        (operation.operation === 'spawn' && operation.receipt?.outcome === 'started') ||
        (operation.operation === 'spawn-supervisor' && operation.receipt?.outcome === 'held')
      ) {
        const target = operation.target as { agent: string; attempt: number }
        const kind = operation.operation === 'spawn' ? 'launch' : 'held'
        const published = journal.some(
          (event) => event.agent === target.agent && event.attempt === target.attempt && event.kind === kind
        )
        if (!published)
          changes.push({
            when: Date.parse(operation.timestamp),
            name: target.agent,
            events: [
              {
                agent: target.agent,
                attempt: target.attempt,
                kind,
                operation: operation.id,
                text: `${kind === 'launch' ? 'worker started' : 'hold process started'}; control receipt ${operation.id}`
              }
            ]
          })
      }
      if (operation.operation === 'stop' && operation.previousState !== 'stopped') {
        const target = operation.target as { token: string; agent: string; attempt: number }
        const attempt = store?.history[target.token]
        if (
          attempt?.state === 'stopped' &&
          attempt.stoppedBy === operation.id &&
          (!operation.receipt || operation.receipt.outcome === 'stopped') &&
          !recorded.has(`${operation.id}/stopped`)
        ) {
          const payload = JSON.parse(operation.payload) as { reason: string }
          changes.push({
            when: Date.parse(operation.timestamp),
            name: target.agent,
            events: [
              {
                agent: target.agent,
                attempt: target.attempt,
                kind: 'stopped',
                operation: operation.id,
                text: `${operation.id}: ${payload.reason}`
              }
            ]
          })
        }
      }
      if (operation.operation !== 'dequeue' || operation.previousState === 'cancelled') continue
      const target = operation.target as { id: string }
      const entry = store?.entries[target.id]
      if (
        entry?.state !== 'cancelled' ||
        entry.cancellationOperation !== operation.id ||
        recorded.has(`${operation.id}/dequeued`)
      )
        continue
      const payload = JSON.parse(operation.payload) as { reason: string }
      changes.push({
        when: Date.parse(operation.timestamp),
        name: entry.name,
        events: [
          {
            agent: entry.name,
            attempt: entry.attempt,
            kind: 'dequeued',
            operation: operation.id,
            text: `${operation.id}: ${payload.reason}`
          }
        ]
      })
    }
    for (const name of observed.agents) {
      const attempt = await attemptOf(directory, name)
      attempts.set(name, attempt)
      const key = seenKey(name, attempt)
      const previous = snapshot[key] ?? (snapshot[name]?.attempt === attempt ? (snapshot[name] as Seen) : { attempt })
      const change = await agentChanges(
        context,
        directory,
        name,
        previous,
        await observed.alive(name),
        observed.homeReports !== false
      )
      snapshot[key] = change.seen
      snapshot[name] = change.seen
      changes.push({ when: change.when, name, events: change.events })
    }
    changes.sort((left, right) => left.when - right.when || left.name.localeCompare(right.name))
    await append(
      context,
      directory,
      snapshot,
      attempts,
      changes
        .flatMap((change) => change.events)
        .filter((event) => {
          if (terminalEvent(event)) {
            const key = `${event.agent}/${event.attempt ?? attempts.get(event.agent)}`
            if (ended.has(key)) return false
            ended.add(key)
          }
          if (!event.operation) return true
          const key = `${event.operation}/${event.kind}`
          if (recorded.has(key)) return false
          recorded.add(key)
          return true
        })
    )
  })
