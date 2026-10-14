import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { KiError } from '../errors.ts'
import { gitWorkingTreeRoot } from '../runtime/git.ts'
import { type AgentContext, instant, read, runDirectory } from './context.ts'

/**
 * Where a run's knowledge files live: the owning repository's tracked `+/_THREADS/<run>/`
 * folder, so that losing the state folder loses no knowledge. Kris settled the split on
 * 2026-10-14: "tracked +/_THREADS/<thread>/ for the decisions log and agent reports; state
 * folder keeps runtime only."
 */
export interface ThreadHome {
  /** Physical root of the Git working tree that owns the thread. */
  readonly repository: string
  /** The thread folder, relative to the repository. */
  readonly folder: string
}

export const threadFolder = (run: string): string => `+/_THREADS/${run}`

/** The absolute thread folder. */
export const threadPath = (home: ThreadHome): string => join(home.repository, home.folder)

/** The run's decisions log in its tracked folder. */
export const decisionsLog = (home: ThreadHome): string => join(threadPath(home), 'decisions.md')

/** Where the named agent writes its final report. */
export const reportPath = (home: ThreadHome, name: string): string => join(threadPath(home), `${name}.report.md`)

const threadFile = (context: AgentContext, run: string): string => join(runDirectory(context, run), 'thread.json')

const isHome = (value: unknown): value is ThreadHome =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as ThreadHome).repository === 'string' &&
  typeof (value as ThreadHome).folder === 'string'

/** The thread home recorded at the run's first use, or undefined before it. */
export const readThread = async (context: AgentContext, run: string): Promise<ThreadHome | undefined> => {
  const path = threadFile(context, run)
  const text = await read(path)
  if (text === undefined) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new KiError(`${path} is not valid JSON`, 1)
  }
  if (!isHome(parsed)) throw new KiError(`${path} does not name a repository and folder`, 1)
  return parsed
}

const repositoryRoot = async (context: AgentContext, directory: string, label?: string): Promise<string> => {
  const root = await gitWorkingTreeRoot(directory, context.runner, context.environment)
  if (root === undefined)
    throw new KiError(
      label === undefined
        ? 'the working directory is not inside a Git repository; run from the owning repository or pass --repo <dir>'
        : `no Git repository at ${label}`,
      2
    )
  return root
}

/**
 * Resolves the run's thread home. The first `launch`, `queue`, `new` or `decide` for a run
 * fixes it as the Git top level of the working directory, or of `--repo`, and records it in
 * the state folder's `thread.json`; later commands read it, and an explicit `--repo` that
 * disagrees is an error. With `write` false the home is resolved but never recorded.
 */
export const threadHome = async (
  context: AgentContext,
  run: string,
  repo?: string | undefined,
  write = true
): Promise<ThreadHome> => {
  const existing = await readThread(context, run)
  const requested =
    repo === undefined ? undefined : await repositoryRoot(context, resolve(context.workingDirectory, repo), repo)
  if (existing && requested !== undefined && requested !== existing.repository)
    throw new KiError(`${run} belongs to ${existing.repository}, not ${requested}`, 2)
  if (existing) return existing
  const home: ThreadHome = {
    repository: requested ?? (await repositoryRoot(context, context.workingDirectory)),
    folder: threadFolder(run)
  }
  if (write) {
    await mkdir(runDirectory(context, run), { recursive: true })
    await writeFile(threadFile(context, run), `${JSON.stringify(home)}\n`)
  }
  return home
}

/** One entry of a decisions log, with the line range it spans. */
export interface DecisionEntry {
  readonly number: number
  readonly home: string | undefined
  /** Index of the heading line and of the first line after the entry. */
  readonly start: number
  readonly end: number
}

const heading = /^## Decision (\d+)\b/
const homeLine = /^home: (.+)$/

/** The numbered entries of a log, in file order; an entry runs to the next `## ` heading. */
export const parseDecisions = (text: string): readonly DecisionEntry[] => {
  const all = text.split('\n')
  const sections = all.flatMap((line, index) => (line.startsWith('## ') ? [index] : []))
  return sections.flatMap((start, position) => {
    const match = heading.exec(all[start] as string)
    if (!match) return []
    const end = sections[position + 1] ?? all.length
    const home = all
      .slice(start + 1, end)
      .map((line) => homeLine.exec(line)?.[1])
      .find((value) => value !== undefined)
    return [{ number: Number(match[1]), home, start, end }]
  })
}

export interface DecisionRequest {
  readonly text: string
  /** A log to append instead of the thread's own. */
  readonly log?: string | undefined
  /** The decision's durable home: a committed path or a work-record identifier. */
  readonly home?: string | undefined
  readonly repo?: string | undefined
}

/** Appends a numbered, timestamped owner decision; returns its number and the log written. */
export const appendDecision = async (
  context: AgentContext,
  run: string,
  request: DecisionRequest
): Promise<{ readonly number: number; readonly path: string }> => {
  if (!request.text.trim()) throw new KiError('a decision needs text', 2)
  if (request.home !== undefined && !request.home.trim()) throw new KiError('a home needs a path or identifier', 2)
  const path =
    request.log === undefined
      ? decisionsLog(await threadHome(context, run, request.repo))
      : resolve(context.workingDirectory, request.log)
  const existing = await read(path)
  const number = Math.max(0, ...parseDecisions(existing ?? '').map((entry) => entry.number)) + 1
  if (existing === undefined) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, '# Decisions\n')
  }
  const home = request.home === undefined ? '' : `home: ${request.home.trim()}\n\n`
  await appendFile(path, `\n## Decision ${number} (${instant(context)})\n\n${home}- ${request.text.trim()}\n`)
  return { number, path }
}

/** Writes or replaces the `home:` line of one entry in the thread's tracked log. */
export const reconcileDecision = async (
  context: AgentContext,
  run: string,
  number: number,
  home: string
): Promise<string> => {
  if (!home.trim()) throw new KiError('a home needs a path or identifier', 2)
  const existing = await readThread(context, run)
  if (existing === undefined) throw new KiError(`${run} has no thread home yet; record a decision first`, 1)
  const path = decisionsLog(existing)
  const text = await read(path)
  if (text === undefined) throw new KiError(`no decisions log at ${path}`, 1)
  const entry = parseDecisions(text).find((candidate) => candidate.number === number)
  if (entry === undefined) throw new KiError(`no Decision ${number} in ${path}`, 1)
  const all = text.split('\n')
  const at = all.findIndex((line, index) => index > entry.start && index < entry.end && homeLine.test(line))
  if (at >= 0) all[at] = `home: ${home.trim()}`
  else all.splice(entry.start + 1, 0, '', `home: ${home.trim()}`)
  await writeFile(path, all.join('\n'))
  return path
}
