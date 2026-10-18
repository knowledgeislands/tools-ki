import { appendFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { type AgentContext, git, instant, read } from './context.ts'
import { followThread, heldAs, readThread, reportPath } from './thread.ts'

export type EventKind = 'launch' | 'held' | 'progress' | 'done' | 'failed' | 'blocked' | 'needs-owner'

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

type Pending = Omit<RunEvent, 'seq' | 'at' | 'run' | 'attempt'>

/** The run's agents and whether each one's process is alive, as the caller observes them. */
export interface Observed {
  readonly agents: readonly string[]
  readonly alive: (name: string) => Promise<boolean>
}

const eventsFile = (directory: string): string => join(directory, 'events.jsonl')
const stateFile = (directory: string): string => join(directory, 'events.state.json')

/** The file's modification time, or 0 when it is absent. */
const modified = async (path: string): Promise<number> => (await stat(path).catch(() => ({ mtimeMs: 0 }))).mtimeMs

/** Milliseconds after which another observer's lock is taken over. */
const lockStale = 30_000

/** Runs `work` holding the run's `events.lock`, so two observers never append the same event. */
const withLock = async <T>(context: AgentContext, directory: string, work: () => Promise<T>): Promise<T> => {
  const lock = join(directory, 'events.lock')
  while (
    !(await writeFile(lock, `${process.pid}\n`, { flag: 'wx' }).then(
      () => true,
      () => false
    ))
  ) {
    // A lock that vanished since the failed create counts as stale, so the next pass takes it.
    if (context.now() - (await modified(lock)) > lockStale) await rm(lock, { force: true })
    else await delay(20)
  }
  try {
    return await work()
  } finally {
    await rm(lock, { force: true })
  }
}

/** The events after sequence number `after`, in order. */
export const readEvents = async (directory: string, after = 0): Promise<RunEvent[]> =>
  ((await read(eventsFile(directory))) ?? '')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as RunEvent)
    .filter((event) => event.seq > after)

/** One more than the agent's `<name>.prev-<n>` folders, which a relaunch leaves behind. */
const attemptOf = async (directory: string, name: string): Promise<number> =>
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
    const { agent, kind, text, tag } = event
    const attempt = attempts.get(agent) as number
    return `${JSON.stringify({ seq, at: instant(context), run: basename(directory), agent, attempt, kind, text, ...(tag === undefined ? {} : { tag }) })}\n`
  })
  await appendFile(eventsFile(directory), lines.join(''))
  await writeFile(stateFile(directory), `${JSON.stringify(snapshot)}\n`)
}

/**
 * Appends an event the launcher observes as it happens: a launch, a hold, a gate that closes
 * on a held agent, or a queued agent the dispatcher cannot launch. A gate or launch failure
 * ends that attempt, so derivation reports no exit after it.
 */
export const recordEvent = (
  context: AgentContext,
  directory: string,
  observed: Observed,
  agent: string,
  kind: 'launch' | 'held' | 'blocked' | 'failed',
  text: string
): Promise<void> =>
  withLock(context, directory, async () => {
    const attempt = await attemptOf(directory, agent)
    const others = { ...observed, agents: observed.agents.filter((name) => name !== agent) }
    const snapshot = await readSnapshot(context, directory, others)
    const seen = snapshot[agent]?.attempt === attempt ? (snapshot[agent] as Seen) : { attempt }
    snapshot[agent] = kind === 'blocked' || kind === 'failed' ? { ...seen, ended: true } : seen
    await append(context, directory, snapshot, new Map([[agent, attempt]]), [{ agent, kind, text }])
  })

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
 * and derives from empty.
 */
const readSnapshot = async (context: AgentContext, directory: string, observed: Observed): Promise<Snapshot> => {
  const state = await read(stateFile(directory))
  if (state !== undefined) return JSON.parse(state) as Snapshot
  const snapshot: Snapshot = {}
  if ((await readEvents(directory)).length > 0) return snapshot
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
  const { done, line } = await statusOf(directory, name)
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
  if (!seen.ended && done) await homeReport(context, directory, name)
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
    const snapshot = await readSnapshot(context, directory, observed)
    const attempts = new Map<string, number>()
    const changes: { readonly when: number; readonly name: string; readonly events: Pending[] }[] = []
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
