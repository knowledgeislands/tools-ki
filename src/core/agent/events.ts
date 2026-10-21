import { randomUUID } from 'node:crypto'
import { appendFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { KiError } from '../errors.ts'
import { type AgentContext, git, instant, read } from './context.ts'
import { loadControl } from './control-store.ts'
import { withRunLock } from './locking.ts'
import { ownsScope } from './scope.ts'
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

type Pending = Omit<RunEvent, 'seq' | 'at' | 'run' | 'attempt'> & { readonly attempt?: number | undefined }

/** The run's agents and whether each one's process is alive, as the caller observes them. */
export interface Observed {
  readonly agents: readonly string[]
  readonly alive: (name: string) => Promise<boolean>
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
const modified = async (path: string): Promise<number> => (await stat(path).catch(() => ({ mtimeMs: 0 }))).mtimeMs

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
/** Single-shot observers refuse boundedly. Pending publications survive this refusal. */
const withLock = <T>(context: AgentContext, directory: string, work: () => Promise<T>): Promise<T> =>
  withRunLock(directory, 'events', work, context.processes.onExit)

export const readEvents = async (directory: string, after = 0): Promise<RunEvent[]> => {
  const path = eventsFile(directory)
  return ((await evidenceRead(path)) ?? '')
    .split('\n')
    .filter((line) => line.trim())
    .map((line, index) =>
      parseEvidence<RunEvent>(
        path,
        line,
        (event) =>
          event !== null &&
          event.seq === index + 1 &&
          typeof event.agent === 'string' &&
          Number.isInteger(event.attempt) &&
          event.attempt > 0 &&
          typeof event.text === 'string' &&
          eventKinds.includes(event.kind)
      )
    )
    .filter((event) => event.seq > after)
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
  let seq = (await readEvents(directory)).length
  const lines = pending.map((event) => {
    seq += 1
    const { agent, kind, text, tag, operation, publication } = event
    const attempt = event.attempt ?? (attempts.get(agent) as number)
    return `${JSON.stringify({ seq, at: instant(context), run: basename(directory), agent, attempt, kind, text, ...(tag === undefined ? {} : { tag }), ...(operation === undefined ? {} : { operation }), ...(publication === undefined ? {} : { publication }) })}\n`
  })
  await appendFile(eventsFile(directory), lines.join(''))
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
  explicitAttempt?: number
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
  const journal = await readEvents(directory)
  const snapshot = await readSnapshot(context, directory, observed)
  const startedKey = (event: Pending): string => `${event.agent}/${event.attempt}/${event.kind}`
  const started = new Set(journal.filter((event) => ['launch', 'held'].includes(event.kind)).map(startedKey))
  const publications = new Set(journal.map((event) => event.publication))
  const operations = new Set(journal.map((event) => `${event.operation}/${event.kind}`))
  const pending: Pending[] = []
  for (const path of paths) {
    const event = parseEvidence<Pending>(
      path,
      (await evidenceRead(path)) ?? '',
      (value) =>
        value !== null &&
        typeof value.publication === 'string' &&
        typeof value.agent === 'string' &&
        eventKinds.includes(value.kind) &&
        typeof value.text === 'string' &&
        Number.isInteger(value.attempt) &&
        (value.attempt as number) > 0
    )
    if (
      publications.has(event.publication) ||
      (event.operation && operations.has(`${event.operation}/${event.kind}`)) ||
      (['launch', 'held'].includes(event.kind) && started.has(startedKey(event)))
    )
      continue
    started.add(startedKey(event))
    publications.add(event.publication)
    operations.add(`${event.operation}/${event.kind}`)
    const attempt = event.attempt as number
    const seen = snapshot[event.agent]?.attempt === attempt ? (snapshot[event.agent] as Seen) : { attempt }
    snapshot[event.agent] = publicationSeen(seen, event)
    pending.push(event)
  }
  await append(context, directory, snapshot, new Map(), pending)
  for (const path of paths) await rm(path)
}

/** The append-only journal is authoritative if snapshot persistence was interrupted. */
const publicationSeen = (seen: Seen, event: Pending): Seen => {
  if (
    (event.kind === 'blocked' && event.operation === undefined) ||
    event.kind === 'failed' ||
    event.kind === 'stopped'
  )
    return { ...seen, failed: true, ended: true }
  if (event.kind === 'done') return { ...seen, ended: true }
  if (event.kind === 'launch') return { ...seen, ended: false }
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
  const thread = await readThread(context, basename(directory))
  return (thread && (await read(reportPath(thread, name)))) ?? (await read(join(directory, `${name}.report.md`)))
}

/**
 * Copies the report the agent wrote in the state folder into the thread folder, where the
 * coordinator reads and commits it, so that the launcher stays its only writer. A thread-folder
 * copy with changes Git does not hold is left alone; one Git holds unchanged, as after a
 * relaunch, is replaced. A report the thread retired, which Git holds with these contents, stays
 * retired, as when a lost `events.state.json` replays an ended agent. A run homed in a retired
 * `+/_THREADS/` folder follows its work folder, and one with none keeps its report in the state folder.
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
  } else if (await heldAs(context, thread, `${name}.report.md`, source)) return
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
    state === undefined
      ? Object.create(null)
      : Object.assign(
          Object.create(null),
          parseEvidence<Snapshot>(
            path,
            state,
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
        )
  const journal = await readEvents(directory)
  for (const event of journal) {
    const previous = snapshot[event.agent]
    if (previous && previous.attempt > event.attempt) continue
    const seen = previous?.attempt === event.attempt ? previous : { attempt: event.attempt }
    snapshot[event.agent] = publicationSeen(seen, event)
  }
  if (state !== undefined || journal.length > 0) return snapshot
  if (observed)
    for (const name of observed.agents) {
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
  alive: boolean
): Promise<{ readonly seen: Seen; readonly when: number; readonly events: Pending[] }> => {
  const events: Pending[] = []
  const control = await loadControl(directory)
  const attempt = control?.attempts[name]
  if (attempt?.state === 'stopped') return { seen: { ...previous, ended: true }, when: 0, events }
  if (
    attempt &&
    (['stop-requested', 'stop-timeout', 'unconfirmed'].includes(attempt.state) ||
      (attempt.entry && control?.entries[attempt.entry]?.state === 'queued'))
  )
    return { seen: previous, when: 0, events }
  if (attempt?.state === 'failed')
    return {
      seen: { ...previous, ended: true },
      when: 0,
      events: previous.ended ? [] : [{ agent: name, kind: 'failed', text: 'attempt failed' }]
    }
  const { done, line } = await statusOf(directory, name)
  if (done && attempt?.owner && context.processes.control) {
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
    events.push({ agent: name, kind, text: form[2] as string })
    if (kind === 'failed') seen = { ...seen, failed: true }
  }
  const when = Math.max(
    await modified(join(directory, `${name}.status`)),
    await modified(join(directory, `${name}.pid`))
  )
  if (done) await homeReport(context, directory, name)
  const report = done ? await reportOf(context, directory, name) : undefined
  if (!seen.ended && done) {
    events.push(
      report === undefined
        ? { agent: name, kind: 'failed', text: 'no report' }
        : { agent: name, kind: 'done', text: line ?? 'DONE' }
    )
    seen = { ...seen, ended: true }
  } else if (!seen.ended && !alive) {
    if (!seen.failed) events.push({ agent: name, kind: 'failed', text: `exited without DONE (${line ?? 'no status'})` })
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
    const journal = await readEvents(directory)
    const recorded = new Set(journal.map((event) => `${event.operation}/${event.kind}`))
    for (const operation of Object.values(store?.operations ?? {})) {
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
      const previous = snapshot[name]?.attempt === attempt ? (snapshot[name] as Seen) : { attempt }
      const change = await agentChanges(context, directory, name, previous, await observed.alive(name))
      snapshot[name] = change.seen
      changes.push({ when: change.when, name, events: change.events })
    }
    changes.sort((left, right) => left.when - right.when || left.name.localeCompare(right.name))
    await append(
      context,
      directory,
      snapshot,
      attempts,
      changes.flatMap((change) => change.events)
    )
  })
