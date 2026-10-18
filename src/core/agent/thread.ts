import { appendFile, copyFile, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { KiError } from '../errors.ts'
import { gitWorkingTreeRoot } from '../runtime/git.ts'
import { isWorkId, WORK_DIRECTORY, workSlug } from '../work/status.ts'
import { type AgentContext, git, instant, read, runDirectory } from './context.ts'

/**
 * Where a run's knowledge files live: the owning repository's tracked work folder
 * `+/_WORK/<id>/`, so that losing the state folder loses no knowledge. Kris settled the split
 * on 2026-10-14: "tracked +/_THREADS/<thread>/ for the decisions log and agent reports; state
 * folder keeps runtime only." The work model retired `+/_THREADS/` and `+/_CHECKPOINTS/`, and
 * Kris named a run report written there THREADS-REGRESSION on 2026-10-18, so a home outside
 * `+/_WORK/` is only ever followed into its work folder, never written.
 */
export interface ThreadHome {
  /** Physical root of the Git working tree that owns the thread. */
  readonly repository: string
  /** The thread folder, relative to the repository. */
  readonly folder: string
}

/** The work folder of the dotted work id, relative to the repository. */
export const workFolder = (id: string): string => `${WORK_DIRECTORY}/${id}`

/** Whether the home is a work folder, rather than a retired `+/_THREADS/` or `+/_CHECKPOINTS/` one. */
export const isWorkHome = (home: ThreadHome): boolean => home.folder.startsWith(`${WORK_DIRECTORY}/`)

/** Whether the repository holds the work's `work.md`. */
const holdsWork = async (repository: string, id: string): Promise<boolean> =>
  (await stat(join(repository, workFolder(id), 'work.md')).catch(() => undefined))?.isFile() === true

/**
 * Whether the run's name names the work: its slug, as `ki-coordination` names a work's
 * coordinator run, or, for a run named before the slug, the id after its territory, as the
 * `chezmoi` run of `ki.chezmoi`.
 */
const namesWork = (id: string, run: string): boolean =>
  workSlug(id) === run || workSlug(id.slice(id.indexOf('.') + 1)) === run

/**
 * The one work folder the run's name names, which a new run takes as its home and a run homed
 * in a retired folder follows. None, or two, leave the choice to `ki agent home --work`.
 */
const runWorkFolder = async (repository: string, run: string): Promise<string> => {
  const candidates = (await readdir(join(repository, WORK_DIRECTORY)).catch(() => [])).filter(
    (id) => isWorkId(id) && namesWork(id, run)
  )
  const ids = (await Promise.all(candidates.map(async (id) => ((await holdsWork(repository, id)) ? [id] : [])))).flat()
  if (ids.length > 1)
    throw new KiError(`${run} names ${ids.sort().join(' and ')}; choose one with ki agent home ${run} --work <id>`, 2)
  if (ids.length === 0)
    throw new KiError(
      `${run} names no work folder in ${repository}; write +/_WORK/<id>/work.md, then ki agent home ${run} --work <id>`,
      2
    )
  return workFolder(ids[0] as string)
}

/**
 * The run's recorded home, followed into its work folder when it is a retired one, recording
 * the work folder so that the move happens once. A retired home with no one work folder to
 * follow is undefined, so that nothing is written into it.
 */
export const followThread = async (context: AgentContext, run: string): Promise<ThreadHome | undefined> => {
  const recorded = await readThread(context, run)
  if (recorded === undefined || isWorkHome(recorded)) return recorded
  const folder = await runWorkFolder(recorded.repository, run).catch(() => undefined)
  return folder === undefined ? undefined : recordThread(context, run, { repository: recorded.repository, folder })
}

/** The absolute thread folder. */
export const threadPath = (home: ThreadHome): string => join(home.repository, home.folder)

/** The run's decisions log in its tracked folder. */
export const decisionsLog = (home: ThreadHome): string => join(threadPath(home), 'decisions.md')

/** Where the named agent writes its final report. */
export const reportPath = (home: ThreadHome, name: string): string => join(threadPath(home), `${name}.report.md`)

/**
 * Whether Git knows the thread-folder file: staged or tracked in the index, or in any commit
 * reachable from a ref. A shallow clone that lacks the commit answers no.
 */
const held = async (context: AgentContext, home: ThreadHome, file: string): Promise<boolean> => {
  const path = `${home.folder}/${file}`
  const indexed = await git(context, home.repository, ['ls-files', '--', path])
  if (indexed.exitCode === 0 && indexed.output.trim()) return true
  const logged = await git(context, home.repository, ['log', '-1', '--format=%H', '--all', '--', path])
  return logged.exitCode === 0 && logged.output.trim() !== ''
}

/**
 * Whether Git knows the thread-folder file with the contents of `source`: staged in the index, or
 * in any commit reachable from a ref. A report a relaunched agent wrote afresh is not held so,
 * though an earlier attempt's report under its name may be.
 */
export const heldAs = async (
  context: AgentContext,
  home: ThreadHome,
  file: string,
  source: string
): Promise<boolean> => {
  // A failed hash gives an empty object, which neither the index nor history matches.
  const blob = (await git(context, home.repository, ['hash-object', '--', source])).output.trim()
  const path = `${home.folder}/${file}`
  const indexed = await git(context, home.repository, ['ls-files', '-s', '--', path])
  if (indexed.exitCode === 0 && indexed.output.split(/\s+/)[1] === blob) return true
  const logged = await git(context, home.repository, [
    'log',
    '-1',
    '--format=%H',
    '--all',
    `--find-object=${blob}`,
    '--',
    path
  ])
  return logged.exitCode === 0 && logged.output.trim() !== ''
}

/**
 * Moves the knowledge files a run kept in its state folder before the tracked home existed,
 * `decisions.md` and each `<name>.report.md`, into the thread folder, so that the launcher is
 * their only writer and no thread copies them by hand. Kris settled this on 2026-10-14: "make
 * the launcher the only writer of the thread folder's log and report files". A file the
 * thread folder holds now, or has ever held in Git, supersedes its state-folder copy, which
 * stays to be archived with the run, so that a report the thread has retired stays retired.
 * Returns the names moved, in name order.
 */
export const adoptStateFiles = async (
  context: AgentContext,
  run: string,
  home: ThreadHome
): Promise<readonly string[]> => {
  const directory = runDirectory(context, run)
  // Resolving the home records `thread.json`, so the state folder always exists here.
  const files = (await readdir(directory))
    .filter((file) => file === 'decisions.md' || file.endsWith('.report.md'))
    .sort()
  if (files.length && !isWorkHome(home))
    throw new KiError(
      `${run} is homed in the retired ${home.folder}; record its work folder with ki agent home ${run} --work <id>`,
      2
    )
  const moved: string[] = []
  for (const file of files) {
    const target = join(threadPath(home), file)
    if (await stat(target).catch(() => undefined)) continue
    if (await held(context, home, file)) continue
    await mkdir(threadPath(home), { recursive: true })
    // Copy then remove: the state folder and the repository may sit on different devices.
    await copyFile(join(directory, file), target)
    await rm(join(directory, file))
    moved.push(file)
  }
  return moved
}

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

/** The `workdir` a `<name>.launch.json` records, or undefined when it predates that field. */
const recordedWorkdir = (text: string | undefined): string | undefined => {
  try {
    const { workdir } = JSON.parse(String(text)) as { readonly workdir?: unknown }
    return typeof workdir === 'string' ? workdir : undefined
  } catch {
    return undefined
  }
}

/** The working directory of each launch the run has on record, in name order. */
const launchDirectories = async (context: AgentContext, run: string): Promise<readonly (string | undefined)[]> => {
  const directory = runDirectory(context, run)
  const files = (await readdir(directory).catch(() => [])).filter((file) => file.endsWith('.launch.json')).sort()
  return Promise.all(files.map(async (file) => recordedWorkdir(await read(join(directory, file)))))
}

/**
 * The repository a new home comes from without `--repo`: the launch's working directory,
 * which the current directory must share. Kris settled this on 2026-10-14 after a run whose
 * home had been taken from the shell's directory wrote a report into an unrelated checkout:
 * "thread home from the launch's working directory". A run with no launch yet starts from
 * the current directory, and a run whose launches predate the record needs `--repo`.
 */
const launchRoot = async (context: AgentContext, run: string, launch: string | undefined): Promise<string> => {
  const current = await repositoryRoot(context, context.workingDirectory)
  const launches = launch === undefined ? await launchDirectories(context, run) : [launch]
  if (launches.length === 0) return current
  if (launches.some((directory) => directory === undefined))
    throw new KiError(
      `${run} has no work folder yet and a launch of it has no recorded working directory; pass --repo <dir>`,
      2
    )
  const roots = [
    ...new Set(
      await Promise.all(
        (launches as readonly string[]).map(
          async (directory) => (await gitWorkingTreeRoot(directory, context.runner, context.environment)) ?? directory
        )
      )
    )
  ]
  if (roots.length > 1)
    throw new KiError(`${run} has no work folder yet and its launches ran in ${roots.join(', ')}; pass --repo <dir>`, 2)
  const [root] = roots as [string]
  if (root !== current)
    throw new KiError(
      `${run} has no work folder yet; the current directory is in ${current}, not the launch's working directory ${root}; run from there or pass --repo <dir>`,
      2
    )
  return current
}

/**
 * Resolves the run's thread home. The first `launch`, `queue`, `new` or `decide` for a run
 * fixes it as the Git top level of `--repo`, or else of the launch's working directory, which
 * the current directory must share, and records it in the state folder's `thread.json`. Once
 * recorded the home holds whatever the current directory, and an explicit `--repo` that
 * disagrees is an error. With `write` false the home is resolved but never recorded; `launch`
 * names the working directory of the launch being made, when the command is one.
 */
export const threadHome = async (
  context: AgentContext,
  run: string,
  repo?: string | undefined,
  write = true,
  launch?: string | undefined
): Promise<ThreadHome> => {
  const { existing, repository } = await homeRepository(context, run, repo, launch)
  if (existing && isWorkHome(existing)) return existing
  // A retired home is followed into its work folder; read alone, one with none stays readable.
  const folder = await runWorkFolder(repository, run).catch((error: unknown) => {
    if (existing && !write) return undefined
    throw error
  })
  if (folder === undefined) return existing as ThreadHome
  const home: ThreadHome = { repository, folder }
  return write ? recordThread(context, run, home) : home
}

/** The recorded home, if any, and the repository that owns or will own the thread. */
const homeRepository = async (
  context: AgentContext,
  run: string,
  repo: string | undefined,
  launch?: string | undefined
): Promise<{ readonly existing: ThreadHome | undefined; readonly repository: string }> => {
  const existing = await readThread(context, run)
  const requested =
    repo === undefined ? undefined : await repositoryRoot(context, resolve(context.workingDirectory, repo), repo)
  if (existing && requested !== undefined && requested !== existing.repository)
    throw new KiError(`${run} belongs to ${existing.repository}, not ${requested}`, 2)
  if (existing) return { existing, repository: existing.repository }
  return { existing, repository: requested ?? (await launchRoot(context, run, launch)) }
}

/**
 * Records `+/_WORK/<id>/` as the run's home, for a new run or one homed elsewhere, once the
 * repository holds the work's `work.md`. It moves no file: the work folder's owner moves the
 * thread folder's contents, and the home then follows them.
 */
export const rehomeThread = async (
  context: AgentContext,
  run: string,
  id: string,
  repo?: string | undefined
): Promise<ThreadHome> => {
  if (!isWorkId(id)) throw new KiError(`--work must be a dotted work id: '${id}'`, 2)
  const { repository } = await homeRepository(context, run, repo)
  if (!(await holdsWork(repository, id)))
    throw new KiError(`${join(repository, workFolder(id))} has no work.md; write the work file first`, 2)
  return recordThread(context, run, { repository, folder: workFolder(id) })
}

const recordThread = async (context: AgentContext, run: string, home: ThreadHome): Promise<ThreadHome> => {
  await mkdir(runDirectory(context, run), { recursive: true })
  await writeFile(threadFile(context, run), `${JSON.stringify(home)}\n`)
  return home
}

/** The `ki-coordination` decision classes, which tell the `close` gate what home an entry needs. */
export const decisionClasses = ['operational', 'rule', 'standalone', 'held'] as const

export type DecisionClass = (typeof decisionClasses)[number]

/** One entry of a decisions log, with the line range it spans. */
export interface DecisionEntry {
  readonly number: number
  readonly home: string | undefined
  /** As written, so an entry with a class `ki` does not know is still read. */
  readonly class: string | undefined
  /** Index of the heading line and of the first line after the entry. */
  readonly start: number
  readonly end: number
}

const heading = /^## Decision (\d+)\b/
const homeLine = /^home: (.+)$/
const classLine = /^class: (.+)$/

const field = (lines: readonly string[], pattern: RegExp): string | undefined =>
  lines.map((line) => pattern.exec(line)?.[1]).find((value) => value !== undefined)

/** The numbered entries of a log, in file order; an entry runs to the next `## ` heading. */
export const parseDecisions = (text: string): readonly DecisionEntry[] => {
  const all = text.split('\n')
  const sections = all.flatMap((line, index) => (line.startsWith('## ') ? [index] : []))
  return sections.flatMap((start, position) => {
    const match = heading.exec(all[start] as string)
    if (!match) return []
    const end = sections[position + 1] ?? all.length
    const body = all.slice(start + 1, end)
    return [{ number: Number(match[1]), home: field(body, homeLine), class: field(body, classLine), start, end }]
  })
}

export interface DecisionRequest {
  readonly text: string
  /** A log to append instead of the thread's own. */
  readonly log?: string | undefined
  /** The decision's durable home: a committed path or a work-record identifier. */
  readonly home?: string | undefined
  readonly class?: DecisionClass | undefined
  readonly repo?: string | undefined
}

const bareLetter = /^([a-z])\)?$/
const taggedLetter = /^([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*) [-–—] ([a-z])\)?$/

/** The `<letter>) <wording>` options of the query under `tag` in a report's `## Queries`, or undefined without it. */
const queryOptions = (report: string, tag: string): Map<string, string> | undefined => {
  let section = ''
  let options: Map<string, string> | undefined
  let listing = false
  for (const line of report.split('\n')) {
    const heading = /^(#+)\s+(.*?)\s*$/.exec(line)
    if (heading?.[1] === '##') section = (heading[2] as string).toLowerCase()
    if (heading) {
      if (options) return options
      if (section === 'queries' && heading[1] !== '##' && (heading[2] as string).startsWith(`${tag} `))
        options = new Map()
      listing = false
    } else if (options && line.startsWith('**Options')) listing = true
    else if (options && listing) {
      const option = /^(?:[-*] )?([a-z])\) (.+)$/.exec(line.trim())
      if (option) options.set(option[1] as string, (option[2] as string).replace(/\s*\(recommended\)\s*/, ' ').trim())
    }
  }
  return options
}

/**
 * The entry text and `source:` of a decision given as `<TAG> - <letter>`: the option's wording
 * from the newest report in the thread folder carrying that query. Other text passes as it is.
 */
const resolveLetter = async (
  context: AgentContext,
  run: string,
  text: string
): Promise<{ readonly text: string; readonly source?: string }> => {
  if (bareLetter.test(text))
    throw new KiError(`'${text}' is a bare option letter; give its query tag, as '<TAG> - ${text.charAt(0)}'`, 2)
  const match = taggedLetter.exec(text)
  if (!match) return { text }
  const [, tag, letter] = match as unknown as [string, string, string]
  const thread = await readThread(context, run)
  const folder = thread && threadPath(thread)
  const reports: { readonly file: string; readonly at: number }[] = []
  for (const file of folder ? await readdir(folder).catch(() => [] as string[]) : [])
    if (file.endsWith('.report.md')) reports.push({ file, at: (await stat(join(folder as string, file))).mtimeMs })
  reports.sort((left, right) => right.at - left.at)
  for (const { file } of reports) {
    const options = queryOptions((await read(join(folder as string, file))) as string, tag)
    if (options === undefined) continue
    const source = join((thread as ThreadHome).folder, file)
    const wording = options.get(letter)
    if (wording === undefined) throw new KiError(`${source} has no option ${letter}) under ${tag}`, 1)
    return { text: `${letter}) ${wording}`, source }
  }
  throw new KiError(`no report in the thread folder of ${run} carries a ${tag} query`, 1)
}

/**
 * Appends a numbered, timestamped owner decision; returns its number, the log written and
 * the state-folder files moved into the thread folder first, so that a run's tracked log
 * continues its legacy numbering rather than restarting it.
 */
export const appendDecision = async (
  context: AgentContext,
  run: string,
  request: DecisionRequest
): Promise<{ readonly number: number; readonly path: string; readonly adopted: readonly string[] }> => {
  if (!request.text.trim()) throw new KiError('a decision needs text', 2)
  if (request.home !== undefined && !request.home.trim()) throw new KiError('a home needs a path or identifier', 2)
  const answer = await resolveLetter(context, run, request.text.trim())
  let adopted: readonly string[] = []
  let path: string
  if (request.log === undefined) {
    const home = await threadHome(context, run, request.repo)
    adopted = await adoptStateFiles(context, run, home)
    path = decisionsLog(home)
  } else path = resolve(context.workingDirectory, request.log)
  const existing = await read(path)
  const number = Math.max(0, ...parseDecisions(existing ?? '').map((entry) => entry.number)) + 1
  if (existing === undefined) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, '# Decisions\n')
  }
  const fields = [
    ...(request.home === undefined ? [] : [`home: ${request.home.trim()}\n`]),
    ...(request.class === undefined ? [] : [`class: ${request.class}\n`]),
    ...(answer.source === undefined ? [] : [`source: ${answer.source}\n`])
  ].join('')
  await appendFile(
    path,
    `\n## Decision ${number} (${instant(context)})\n\n${fields}${fields ? '\n' : ''}- ${answer.text}\n`
  )
  return { number, path, adopted }
}

/** Writes or replaces the `home:` or `class:` line of one entry in the thread's tracked log. */
export const reconcileDecision = async (
  context: AgentContext,
  run: string,
  number: number,
  change: { readonly home?: string | undefined; readonly class?: DecisionClass | undefined }
): Promise<string> => {
  if (change.home === undefined && change.class === undefined) throw new KiError('give a home, --class or both', 2)
  if (change.home !== undefined && !change.home.trim()) throw new KiError('a home needs a path or identifier', 2)
  const existing = await followThread(context, run)
  if (existing === undefined) throw new KiError(`${run} has no work folder yet; record a decision first`, 1)
  const path = decisionsLog(existing)
  const text = await read(path)
  if (text === undefined) throw new KiError(`no decisions log at ${path}`, 1)
  const entry = parseDecisions(text).find((candidate) => candidate.number === number)
  if (entry === undefined) throw new KiError(`no Decision ${number} in ${path}`, 1)
  const all = text.split('\n')
  let end = entry.end
  const find = (pattern: RegExp): number =>
    all.findIndex((line, index) => index > entry.start && index < end && pattern.test(line))
  const set = (pattern: RegExp, line: string, after: number): void => {
    const at = find(pattern)
    if (at >= 0) all[at] = line
    else if (after >= 0) {
      all.splice(after + 1, 0, line)
      end += 1
    } else {
      all.splice(entry.start + 1, 0, '', line)
      end += 2
    }
  }
  if (change.home !== undefined) set(homeLine, `home: ${change.home.trim()}`, find(classLine) - 1)
  if (change.class !== undefined) set(classLine, `class: ${change.class}`, find(homeLine))
  await writeFile(path, all.join('\n'))
  return path
}
