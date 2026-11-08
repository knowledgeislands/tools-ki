import { appendFile, copyFile, mkdir, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { KiError } from '../errors.ts'
import { gitPrimaryWorkingTreeRoot, gitWorkingTreeRoot } from '../runtime/git.ts'
import { requiredLocalRegistry } from '../storage/local-registry.ts'
import { LEGACY_WORK_ENTRY_FILE, WORK_ENTRY_FILE, workEntryFile } from '../work/entry.ts'
import { workNames } from '../work/identity.ts'
import { capitalRoot } from '../work/registry.ts'
import { isWorkId, readWorkDefinitions, WORK_DIRECTORY, workSlug } from '../work/status.ts'
import { type AgentContext, git, instant, localTime, read, runDirectory } from './context.ts'

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
  /**
   * The repository's `origin` remote when the home was recorded, as `https://<host>/<owner>/<repo>`
   * in lower case, by which a moved checkout is found again; absent from a home recorded before it.
   */
  readonly origin?: string | undefined
}

/** The work folder of the dotted work id, relative to the repository. */
export const workFolder = (id: string): string => `${WORK_DIRECTORY}/${id}`

/** Whether the home is a work folder, rather than a retired `+/_THREADS/` or `+/_CHECKPOINTS/` one. */
export const isWorkHome = (home: ThreadHome): boolean => home.folder.startsWith(`${WORK_DIRECTORY}/`)

/** Whether the repository holds the work's entry file, `_index.md` or the former `work.md`. */
const holdsWork = async (repository: string, id: string): Promise<boolean> =>
  (await workEntryFile(
    join(repository, workFolder(id)),
    async (path) => (await stat(path).catch(() => undefined))?.isFile() === true
  )) !== undefined

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
const resolvedWorkFolder = async (repository: string, id: string): Promise<string | undefined> => {
  const matches = (await readWorkDefinitions(repository)).filter((work) => workNames(work.id, work.level).includes(id))
  return matches[0] === undefined ? undefined : workFolder(matches[0].id)
}
const runWorkFolder = async (repository: string, run: string): Promise<string> => {
  const definitions = await readWorkDefinitions(repository)
  const candidates = (await readdir(join(repository, WORK_DIRECTORY)).catch(() => [])).filter(
    (id) =>
      isWorkId(id) &&
      (namesWork(id, run) ||
        definitions.some(
          (work) => work.id === id && workNames(work.id, work.level).some((name) => namesWork(name, run))
        ))
  )
  const ids = (await Promise.all(candidates.map(async (id) => ((await holdsWork(repository, id)) ? [id] : [])))).flat()
  if (ids.length > 1)
    throw new KiError(`${run} names ${ids.sort().join(' and ')}; choose one with ki agent home ${run} --work <id>`, 2)
  if (ids.length === 0)
    throw new KiError(
      `${run} names no work folder in ${repository}; write +/_WORK/<id>/${WORK_ENTRY_FILE}, then ki agent home ${run} --work <id>`,
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
  return folder === undefined ? undefined : recordThread(context, run, { ...recorded, folder })
}

/** The absolute thread folder. */
export const threadPath = (home: ThreadHome): string => join(home.repository, home.folder)

/** The run's decisions log in its tracked folder. */
export const decisionsLog = (home: ThreadHome): string => join(threadPath(home), 'decisions.md')

/** The work folder's type and closed-list folders, none of which is ever a focus folder. */
const typeFolders = new Set(['briefs', 'design', 'reports', 'findings', 'feedback'])

/**
 * The focus folder a brief sits in, `+/_WORK/<id>/<focus>/`, found by the work folder's name in
 * the brief's path, so that a brief in a linked worktree or a moved checkout still names it.
 */
const briefFocus = (home: ThreadHome, brief: string | undefined): string | undefined => {
  if (brief === undefined) return undefined
  const marker = `/${home.folder}/`
  const at = brief.lastIndexOf(marker)
  if (at < 0) return undefined
  const rest = brief.slice(at + marker.length).split('/')
  return rest.length === 2 && rest[0] && !typeFolders.has(rest[0]) ? rest[0] : undefined
}

/**
 * The folder, inside the work folder, where the named agent's report is homed: beside its brief
 * in the focus folder the brief sits in, and otherwise `reports/`, never the top level. Kris set
 * the layout under LAYOUT-PILLARS on 2 November 2026: "one flat folder per focus area holding
 * briefs, reports and designs".
 */
export const reportFolder = (home: ThreadHome, brief?: string | undefined): string =>
  briefFocus(home, brief) ?? 'reports'

/** Where the launcher homes the named agent's final report. */
export const reportPath = (home: ThreadHome, name: string, brief?: string | undefined): string =>
  join(threadPath(home), reportFolder(home, brief), `${name}.report.md`)

/**
 * Every place a reader looks for the named agent's report, relative to the work folder: beside
 * its brief, then `reports/`, then, for the layout's tolerance window, the top level.
 */
export const reportPlaces = (home: ThreadHome, name: string, brief?: string | undefined): readonly string[] => [
  ...new Set([`${reportFolder(home, brief)}/${name}.report.md`, `reports/${name}.report.md`, `${name}.report.md`])
]

/**
 * Every report in the work folder, relative to it: in each focus folder, in `reports/` and, for
 * the tolerance window, at the top level.
 */
export const workReports = async (home: ThreadHome): Promise<readonly string[]> => {
  const folder = threadPath(home)
  const reports: string[] = []
  for (const entry of await readdir(folder, { withFileTypes: true }).catch(() => []))
    if (entry.isFile() && entry.name.endsWith('.report.md')) reports.push(entry.name)
    else if (entry.isDirectory() && (entry.name === 'reports' || !typeFolders.has(entry.name)))
      for (const file of await readdir(join(folder, entry.name)).catch(() => [] as string[]))
        if (file.endsWith('.report.md')) reports.push(`${entry.name}/${file}`)
  return reports
}

/** The brief the agent's launch recorded, absent from a launch made before it was recorded. */
export const launchBrief = async (directory: string, name: string): Promise<string | undefined> => {
  try {
    const { request } = JSON.parse(String(await read(join(directory, `${name}.launch.json`)))) as {
      readonly request?: { readonly brief?: unknown }
    }
    return typeof request?.brief === 'string' ? request.brief : undefined
  } catch {
    return undefined
  }
}

/**
 * Whether Git knows the thread-folder file: staged or tracked in the index, or in any commit
 * reachable from a ref under the folder's present or any earlier name. A shallow clone that
 * lacks the commit answers no.
 */
const held = async (context: AgentContext, home: ThreadHome, files: readonly string[]): Promise<boolean> => {
  const indexed = await git(context, home.repository, [
    'ls-files',
    '--',
    ...files.map((file) => `${home.folder}/${file}`)
  ])
  if (indexed.exitCode === 0 && indexed.output.trim()) return true
  const paths = (await earlierNames(context, home)).flatMap((folder) => files.map((file) => `${folder}/${file}`))
  const logged = await git(context, home.repository, ['log', '-1', '--format=%H', '--all', '--', ...paths])
  return logged.exitCode === 0 && logged.output.trim() !== ''
}

/**
 * The thread folder's name and every name it had before, from the renames in the commits that
 * added files to it, followed back through each earlier name, so that a renamed work folder
 * keeps the history of the reports it retired under its old name.
 */
const earlierNames = async (context: AgentContext, home: ThreadHome): Promise<readonly string[]> => {
  const names = [home.folder]
  for (let index = 0; index < names.length; index++) {
    const name = names[index] as string
    const added = await git(context, home.repository, ['log', '--all', '--diff-filter=A', '--format=%H', '--', name])
    const commits = added.output.split('\n').filter((line) => line.trim())
    if (!commits.length) continue
    const renamed = await git(context, home.repository, [
      'show',
      '-M',
      '--diff-filter=R',
      '--name-status',
      '--format=',
      ...commits
    ])
    // `--diff-filter=R` leaves only `R<score>\t<from>\t<to>` lines.
    for (const line of renamed.output.split('\n')) {
      const [, from = '', to = ''] = line.split('\t')
      if (!to.startsWith(`${name}/`)) continue
      const file = to.slice(name.length)
      const earlier = from.endsWith(file) ? from.slice(0, -file.length) : ''
      if (earlier && !names.includes(earlier)) names.push(earlier)
    }
  }
  return names
}

/**
 * Whether Git knows any of the thread-folder files, each relative to the folder, with the
 * contents of `source`: staged in the index, or in any commit reachable from a ref, under the
 * folder's present or any earlier name. A report a relaunched agent wrote afresh is not held so,
 * though an earlier attempt's report under its name may be.
 */
export const heldAs = async (
  context: AgentContext,
  home: ThreadHome,
  files: readonly string[],
  source: string
): Promise<boolean> => {
  // A failed hash gives an empty object, which neither the index nor history matches.
  const blob = (await git(context, home.repository, ['hash-object', '--', source])).output.trim()
  const indexed = await git(context, home.repository, [
    'ls-files',
    '-s',
    '--',
    ...files.map((file) => `${home.folder}/${file}`)
  ])
  if (indexed.exitCode === 0 && indexed.output.split('\n').some((line) => line.split(/\s+/)[1] === blob)) return true
  const paths = (await earlierNames(context, home)).flatMap((folder) => files.map((file) => `${folder}/${file}`))
  const logged = await git(context, home.repository, [
    'log',
    '-1',
    '--format=%H',
    '--all',
    `--find-object=${blob}`,
    '--',
    ...paths
  ])
  return logged.exitCode === 0 && logged.output.trim() !== ''
}

/**
 * Moves the knowledge files a run kept in its state folder before the tracked home existed,
 * `decisions.md` and each `<name>.report.md`, into the thread folder, so that the launcher is
 * their only writer and no thread copies them by hand. Kris settled this on 2026-10-14: "make
 * the launcher the only writer of the thread folder's log and report files". A file the
 * thread folder holds now, or has ever held in Git, supersedes its state-folder copy, which
 * stays to be archived with the run, so that a report the thread has retired stays retired. A
 * report goes where the launcher homes it, beside its brief or in `reports/`, and a copy in any
 * place a reader looks supersedes it. Returns the paths moved, relative to the thread folder, in
 * name order; with `move` false it moves nothing and returns the paths it would move. Given
 * `agents`, it moves only those agents' reports and leaves `decisions.md`.
 */
export const adoptStateFiles = async (
  context: AgentContext,
  run: string,
  home: ThreadHome,
  move = true,
  agents?: readonly string[]
): Promise<readonly string[]> => {
  const directory = runDirectory(context, run)
  // Resolving the home records `thread.json`, so the state folder always exists here.
  const files = (await readdir(directory))
    .filter((file) =>
      agents === undefined
        ? file === 'decisions.md' || file.endsWith('.report.md')
        : agents.some((name) => file === `${name}.report.md`)
    )
    .sort()
  if (files.length && !isWorkHome(home))
    throw new KiError(
      `${run} is homed in the retired ${home.folder}; record its work folder with ki agent home ${run} --work <id>`,
      2
    )
  if (files.length) await requireWorkFolder(run, home)
  const moved: string[] = []
  for (const file of files) {
    const name = file.endsWith('.report.md') ? file.slice(0, -'.report.md'.length) : undefined
    const brief = name === undefined ? undefined : await launchBrief(directory, name)
    const places = name === undefined ? [file] : reportPlaces(home, name, brief)
    const target = join(threadPath(home), places[0] as string)
    if ((await Promise.all(places.map((place) => exists(join(threadPath(home), place))))).some(Boolean)) continue
    if (await held(context, home, places)) continue
    moved.push(places[0] as string)
    if (!move) continue
    await mkdir(dirname(target), { recursive: true })
    // Copy then remove: the state folder and the repository may sit on different devices.
    await copyFile(join(directory, file), target)
    await rm(join(directory, file))
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
  const home = await relocatedHome(context, run, parsed)
  if (!isWorkHome(home)) return home
  const id = home.folder.slice(`${WORK_DIRECTORY}/`.length)
  const folder =
    (await resolvedWorkFolder(home.repository, id)) ??
    ((await holdsWork(home.repository, id)) || !(await repositoryPresent(home.repository))
      ? undefined
      : await renamedWorkFolder(context, home.repository, id))
  return folder === undefined ? home : { ...home, folder }
}

/**
 * The work folder a gone one was renamed to, as the package history shows it: the one folder
 * every rename of its files leads to, followed through each later rename until a folder holds
 * its entry file. A history that shows none, or a split, leaves the choice to
 * `ki agent home --work`.
 */
const renamedWorkFolder = async (
  context: AgentContext,
  repository: string,
  id: string
): Promise<string | undefined> => {
  const seen = new Set([id])
  for (let current = id; ; ) {
    const from = `${workFolder(current)}/`
    // `--full-diff` keeps the new side of a rename the pathspec alone would show as a deletion.
    const renamed = await git(context, repository, [
      'log',
      '--all',
      '-M',
      '--full-diff',
      '--diff-filter=R',
      '--name-status',
      '--format=',
      '--',
      from
    ]).catch(() => undefined)
    if (renamed?.exitCode !== 0) return undefined
    const targets = new Set(
      renamed.output.split('\n').flatMap((line) => {
        const [, source = '', target = ''] = line.split('\t')
        const next = target.split('/')[2]
        return source.startsWith(from) && target.startsWith(`${WORK_DIRECTORY}/`) && next && next !== current
          ? [next]
          : []
      })
    )
    const [next] = targets
    if (targets.size !== 1 || next === undefined || seen.has(next)) return undefined
    if (await holdsWork(repository, next)) return workFolder(next)
    seen.add(next)
    current = next
  }
}

/**
 * The ids the work in the home was known by before: its legacy names and the work folders the
 * package history shows it renamed from, so that a control record made under one still binds.
 */
export const formerWorkIds = async (context: AgentContext, home: ThreadHome): Promise<readonly string[]> => {
  const id = home.folder.slice(`${WORK_DIRECTORY}/`.length)
  // readThread has read these definitions already, so they read here too.
  const definition = (await readWorkDefinitions(home.repository)).find((work) => work.id === id)
  const names = definition === undefined ? [] : workNames(definition.id, definition.level)
  const folders = (await earlierNames(context, home)).filter((folder) => folder.startsWith(`${WORK_DIRECTORY}/`))
  return [...new Set([...names, ...folders.map((folder) => folder.slice(`${WORK_DIRECTORY}/`.length))])].filter(
    (name) => name !== id
  )
}

/**
 * A recorded home whose repository has moved is found again and the new path recorded, so moving
 * a checkout means updating nothing by hand: Kris asked on 1 November 2026 for it to be fixed "so
 * we don't have to deal with this every time". It is found through the local repository registry
 * by the repository's key, or else as the one registered repository or current checkout with the
 * same `origin` remote that holds the home's work folder. Each move is recorded in the run's
 * `thread-moves.jsonl`. A home found neither way is returned as recorded, and nothing writes
 * into it: see requireRepository.
 */
const relocatedHome = async (context: AgentContext, run: string, home: ThreadHome): Promise<ThreadHome> => {
  // A relative home names no place of its own, so it is never followed: see requireRepository.
  if (!isAbsolute(home.repository) || (await repositoryPresent(home.repository))) return home
  const found = await movedRepository(context, home)
  if (found === undefined) return home
  await appendFile(
    join(runDirectory(context, run), 'thread-moves.jsonl'),
    `${JSON.stringify({ at: instant(context), from: home.repository, to: found.repository, by: found.by })}\n`
  )
  return recordThread(context, run, { ...home, repository: found.repository })
}

/** The repositories the run's home was recorded in before each move `thread-moves.jsonl` logs, oldest first. */
export const movedFrom = async (context: AgentContext, run: string): Promise<readonly string[]> =>
  ((await read(join(runDirectory(context, run), 'thread-moves.jsonl'))) ?? '').split('\n').flatMap((line) => {
    try {
      const { from } = JSON.parse(line) as { readonly from?: unknown }
      return typeof from === 'string' ? [from] : []
    } catch {
      return []
    }
  })

/** `https://<host>/<owner>/<repo>` in lower case, from an HTTPS or SSH remote, so that two spellings of one remote match. */
export const remoteKey = (url: string): string =>
  url
    .trim()
    .replace(/^ssh:\/\/git@([^/]+)\//, 'https://$1/')
    .replace(/^git@([^:]+):/, 'https://$1/')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
    .toLowerCase()

const originOf = async (context: AgentContext, repository: string): Promise<string | undefined> => {
  const result = await git(context, repository, ['remote', 'get-url', 'origin']).catch(() => undefined)
  return result?.exitCode === 0 && result.output.trim() ? remoteKey(result.output) : undefined
}

/** Whether the repository holds the home's work folder, under its id or a name it now goes by. */
const holdsFolder = async (repository: string, folder: string): Promise<boolean> => {
  const id = folder.slice(`${WORK_DIRECTORY}/`.length)
  return (
    (await holdsWork(repository, id)) || (await resolvedWorkFolder(repository, id).catch(() => undefined)) !== undefined
  )
}

/**
 * The checkout a gone repository moved to: the registered one under its key, or the one
 * registered repository or current checkout whose `origin` is the one recorded, or, for a home
 * recorded before its origin was, whose origin names a repository of the gone one's name, and
 * which holds the home's work folder. Two such checkouts are no answer.
 */
const movedRepository = async (
  context: AgentContext,
  home: ThreadHome
): Promise<{ readonly repository: string; readonly by: string } | undefined> => {
  const name = basename(home.repository)
  const registry = await requiredLocalRegistry(context.stateDirectory)
  const keyed = registry.find((candidate) => candidate.key === name)
  if (keyed !== undefined && (await exists(keyed.path))) return { repository: keyed.path, by: `registry key ${name}` }
  const matches = (origin: string | undefined): boolean =>
    origin !== undefined &&
    (home.origin === undefined ? origin.split('/').pop() === name.toLowerCase() : origin === home.origin)
  const current = await gitPrimaryWorkingTreeRoot(context.workingDirectory, context.runner, context.environment).catch(
    () => undefined
  )
  const candidates = [
    ...registry.filter((entry) => matches(remoteKey(entry.repository))).map((entry) => entry.path),
    ...(current !== undefined && matches(await originOf(context, current)) ? [current] : [])
  ]
  const found = new Set<string>()
  for (const candidate of candidates)
    if ((await repositoryPresent(candidate)) && (!isWorkHome(home) || (await holdsFolder(candidate, home.folder))))
      found.add(await realpath(candidate))
  const [repository] = found
  return found.size === 1 && repository !== undefined ? { repository, by: 'origin remote and work folder' } : undefined
}

const exists = async (path: string): Promise<boolean> => (await stat(path).catch(() => undefined)) !== undefined

/** Whether the repository is an absolute path to an existing directory. */
export const repositoryPresent = async (repository: string): Promise<boolean> =>
  isAbsolute(repository) && (await stat(repository).catch(() => undefined))?.isDirectory() === true

/**
 * Refuses to write into a home whose repository is relative or gone, rather than recreate the
 * old path: a relative one resolves against whatever directory the command runs in, and so once
 * recreated another territory's tree inside the principal.
 */
const requireRepository = async (run: string, home: ThreadHome): Promise<void> => {
  if (!isAbsolute(home.repository))
    throw new KiError(
      `${run}'s home repository ${home.repository} is a relative path; record an absolute home with ki agent home ${run} --work <id> --repo <dir>`,
      2
    )
  if (!(await repositoryPresent(home.repository)))
    throw new KiError(
      `${run}'s home repository ${home.repository} is gone and ${basename(home.repository)} is not registered elsewhere; register it with ki registry add, or record a new home with ki agent home ${run} --work <id>`,
      2
    )
}

/**
 * Refuses to write into a home whose work folder is gone from its repository, rather than
 * recreate it there: a work renamed where the package history does not show it needs its new id.
 */
const requireWorkFolder = async (run: string, home: ThreadHome): Promise<void> => {
  await requireRepository(run, home)
  const id = home.folder.slice(`${WORK_DIRECTORY}/`.length)
  if (isWorkHome(home) && !(await holdsWork(home.repository, id)))
    throw new KiError(
      `${run}'s work folder ${home.folder} is gone from ${home.repository}; record its work folder with ki agent home ${run} --work <id>`,
      2
    )
}

/**
 * Refuses, before anything moves, a home `close` would write into unless it is an existing
 * absolute directory inside a repository the local registry holds.
 */
export const requireHome = async (context: AgentContext, run: string, home: ThreadHome): Promise<void> => {
  await requireRepository(run, home)
  const physical = await realpath(home.repository)
  const registered = await Promise.all(
    (await requiredLocalRegistry(context.stateDirectory)).map((entry) => realpath(entry.path).catch(() => undefined))
  )
  if (!registered.some((root) => root !== undefined && (physical === root || physical.startsWith(`${root}/`))))
    throw new KiError(
      `${run}'s home repository ${home.repository} is in no registered repository; register it with ki registry add, or record a new home with ki agent home ${run} --work <id> --repo <dir>`,
      2
    )
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
  launch?: string | undefined,
  requireWorkHome = false
): Promise<ThreadHome> => {
  const { existing, repository } = await homeRepository(context, run, repo, launch)
  if (existing && isWorkHome(existing)) return write ? recordThread(context, run, existing) : existing
  // A retired home is followed into its work folder; read alone, one with none stays readable.
  const resolved = await runHome(context, repository, run).catch((error: unknown) => {
    if (existing && !write && !requireWorkHome) return undefined
    throw error
  })
  if (resolved === undefined) return existing as ThreadHome
  const home: ThreadHome = resolved
  return write ? recordThread(context, run, home) : home
}

/** A member checkout is a session seat; a local regular exception always wins. */
const runHome = async (context: AgentContext, repository: string, run: string): Promise<ThreadHome> => {
  try {
    return { repository, folder: await runWorkFolder(repository, run) }
  } catch (error) {
    // Ambiguity is not absence and must never trigger a different home.
    if (!(error instanceof KiError) || !error.message.includes('names no work folder')) throw error
    const capital = await capitalRoot(repository, context.stateDirectory)
    if (typeof capital !== 'string' || capital === repository) throw error
    const folder = await runWorkFolder(capital, run)
    const work = (await readWorkDefinitions(capital)).find((work) => workFolder(work.id) === folder)
    if (work?.level !== 'project') throw error
    return { repository: capital, folder }
  }
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
  // A home whose repository is gone, as after a rename the registry cannot
  // follow, may be re-recorded in the repository named explicitly.
  const gone = existing !== undefined && !(await repositoryPresent(existing.repository))
  if (existing && !gone && requested !== undefined && requested !== existing.repository)
    throw new KiError(`${run} belongs to ${existing.repository}, not ${requested}`, 2)
  if (existing && !gone) return { existing, repository: existing.repository }
  if (gone)
    return requested === undefined
      ? { existing, repository: existing.repository }
      : { existing: undefined, repository: requested }
  return { existing, repository: requested ?? (await launchRoot(context, run, launch)) }
}

/**
 * Records `+/_WORK/<id>/` as the run's home, for a new run or one homed elsewhere, once the
 * repository holds the work's entry file, `_index.md` or the former `work.md`. It moves no file:
 * the work folder's owner moves the thread folder's contents, and the home then follows them.
 */
export const rehomeThread = async (
  context: AgentContext,
  run: string,
  id: string,
  repo?: string | undefined
): Promise<ThreadHome> => {
  if (!isWorkId(id)) throw new KiError(`--work must be a dotted work id: '${id}'`, 2)
  let { repository } = await homeRepository(context, run, repo)
  let folder = (await resolvedWorkFolder(repository, id)) ?? workFolder(id)
  if (!(await holdsWork(repository, folder.slice(`${WORK_DIRECTORY}/`.length)))) {
    const capital = await capitalRoot(repository, context.stateDirectory)
    if (typeof capital === 'string' && capital !== repository) {
      const candidate = await resolvedWorkFolder(capital, id)
      const work = (await readWorkDefinitions(capital)).find((work) => workFolder(work.id) === candidate)
      if (work?.level === 'project') {
        repository = capital
        folder = workFolder(work.id)
      }
    }
  }
  if (!(await holdsWork(repository, folder.slice(`${WORK_DIRECTORY}/`.length))))
    throw new KiError(
      `${join(repository, workFolder(id))} has no ${WORK_ENTRY_FILE} or ${LEGACY_WORK_ENTRY_FILE}; write the work file first`,
      2
    )
  return recordThread(context, run, { repository, folder })
}

/** Records the home with its repository's `origin`, read once when the home does not carry it already. */
const recordThread = async (context: AgentContext, run: string, home: ThreadHome): Promise<ThreadHome> => {
  const origin =
    home.origin ?? ((await repositoryPresent(home.repository)) ? await originOf(context, home.repository) : undefined)
  const recorded: ThreadHome = { repository: home.repository, folder: home.folder, ...(origin ? { origin } : {}) }
  await mkdir(runDirectory(context, run), { recursive: true })
  await writeFile(threadFile(context, run), `${JSON.stringify(recorded)}\n`)
  return recorded
}

/** The `ki-coordination` decision classes, which tell the `close` gate what home an entry needs. */
export const decisionClasses = ['operational', 'rule', 'standalone', 'held'] as const

export type DecisionClass = (typeof decisionClasses)[number]

/** One entry of a decisions log, with the line range it spans. */
export interface DecisionEntry {
  /** The heading's text after `## `. */
  readonly heading: string
  /** The number of a `## Decision <n>` heading, kept as history in a log written before the work model. */
  readonly number: number | undefined
  readonly home: string | undefined
  /** As written, so an entry with a class `ki` does not know is still read. */
  readonly class: string | undefined
  /** Index of the heading line and of the first line after the entry. */
  readonly start: number
  readonly end: number
}

const numbered = /^Decision (\d+)\b/
const homeLine = /^home: (.+)$/
const classLine = /^class: (.+)$/

const field = (lines: readonly string[], pattern: RegExp): string | undefined =>
  lines.map((line) => pattern.exec(line)?.[1]).find((value) => value !== undefined)

/**
 * The entries of a log, in file order: every `## ` heading opens one, since the log holds nothing
 * else, and an entry runs to the next. Timestamped, dated and numbered headings all read alike.
 */
export const parseDecisions = (text: string): readonly DecisionEntry[] => {
  const all = text.split('\n')
  const sections = all.flatMap((line, index) => (line.startsWith('## ') ? [index] : []))
  return sections.map((start, position) => {
    const heading = (all[start] as string).slice(3).trim()
    const number = numbered.exec(heading)?.[1]
    const end = sections[position + 1] ?? all.length
    const body = all.slice(start + 1, end)
    return {
      heading,
      number: number === undefined ? undefined : Number(number),
      home: field(body, homeLine),
      class: field(body, classLine),
      start,
      end
    }
  })
}

/** How the close gate and `reconcile` name an entry: its number where it has one, else its heading. */
export const decisionName = (entry: DecisionEntry): string =>
  entry.number === undefined ? entry.heading : String(entry.number)

export interface DecisionRequest {
  readonly text: string
  /** A log to append instead of the thread's own. */
  readonly log?: string | undefined
  /** The decision's durable home: a committed path or a work-record identifier. */
  readonly home?: string | undefined
  readonly class?: DecisionClass | undefined
  /** The heading's title; a `<TAG> - <letter>` answer defaults to `<TAG> <letter>)`, other text to `owner decision`. */
  readonly title?: string | undefined
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
): Promise<{ readonly text: string; readonly title: string; readonly source?: string }> => {
  if (bareLetter.test(text))
    throw new KiError(`'${text}' is a bare option letter; give its query tag, as '<TAG> - ${text.charAt(0)}'`, 2)
  const match = taggedLetter.exec(text)
  if (!match) return { text, title: 'owner decision' }
  const [, tag, letter] = match as unknown as [string, string, string]
  const thread = await readThread(context, run)
  const folder = thread && threadPath(thread)
  const reports: { readonly file: string; readonly at: number }[] = []
  for (const file of thread ? await workReports(thread) : [])
    reports.push({ file, at: (await stat(join(folder as string, file))).mtimeMs })
  reports.sort((left, right) => right.at - left.at)
  for (const { file } of reports) {
    const options = queryOptions((await read(join(folder as string, file))) as string, tag)
    if (options === undefined) continue
    const source = join((thread as ThreadHome).folder, file)
    const wording = options.get(letter)
    if (wording === undefined) throw new KiError(`${source} has no option ${letter}) under ${tag}`, 1)
    return { text: `${letter}) ${wording}`, title: `${tag} ${letter})`, source }
  }
  throw new KiError(`no report in the thread folder of ${run} carries a ${tag} query`, 1)
}

/**
 * Appends an unnumbered owner decision headed `<YYYY-MM-DD HH:MM zone> - <title>`; returns its
 * heading, the log written and the state-folder files moved into the thread folder first.
 */
export const appendDecision = async (
  context: AgentContext,
  run: string,
  request: DecisionRequest
): Promise<{ readonly heading: string; readonly path: string; readonly adopted: readonly string[] }> => {
  if (!request.text.trim()) throw new KiError('a decision needs text', 2)
  if (request.home !== undefined && !request.home.trim()) throw new KiError('a home needs a path or identifier', 2)
  if (request.title !== undefined && !request.title.trim()) throw new KiError('a title needs text', 2)
  const answer = await resolveLetter(context, run, request.text.trim())
  let adopted: readonly string[] = []
  let path: string
  if (request.log === undefined) {
    const home = await threadHome(context, run, request.repo)
    await requireWorkFolder(run, home)
    adopted = await adoptStateFiles(context, run, home)
    path = decisionsLog(home)
  } else path = resolve(context.workingDirectory, request.log)
  const existing = await read(path)
  if (existing === undefined) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, '# Decisions\n')
  }
  const fields = [
    ...(request.home === undefined ? [] : [`home: ${request.home.trim()}\n`]),
    ...(request.class === undefined ? [] : [`class: ${request.class}\n`]),
    ...(answer.source === undefined ? [] : [`source: ${answer.source}\n`])
  ].join('')
  const heading = `${localTime(context, true)} - ${request.title?.trim() ?? answer.title}`
  await appendFile(path, `\n## ${heading}\n\n${fields}${fields ? '\n' : ''}- ${answer.text}\n`)
  return { heading, path, adopted }
}

/** Writes or replaces the `home:` or `class:` line of one entry in the thread's tracked log. */
export const reconcileDecision = async (
  context: AgentContext,
  run: string,
  name: string,
  change: { readonly home?: string | undefined; readonly class?: DecisionClass | undefined }
): Promise<string> => {
  if (change.home === undefined && change.class === undefined) throw new KiError('give a home, --class or both', 2)
  if (change.home !== undefined && !change.home.trim()) throw new KiError('a home needs a path or identifier', 2)
  const existing = await followThread(context, run)
  if (existing === undefined) throw new KiError(`${run} has no work folder yet; record a decision first`, 1)
  const path = decisionsLog(existing)
  const text = await read(path)
  if (text === undefined) throw new KiError(`no decisions log at ${path}`, 1)
  const wanted = name.trim()
  const matches = parseDecisions(text).filter(
    (candidate) =>
      candidate.heading === wanted ||
      candidate.heading.startsWith(`${wanted} `) ||
      (/^\d+$/.test(wanted) && candidate.number === Number(wanted))
  )
  if (matches.length > 1)
    throw new KiError(`${matches.length} entries in ${path} match '${wanted}'; give more of the heading`, 1)
  const entry = matches[0]
  if (entry === undefined) throw new KiError(`no entry '${wanted}' in ${path}`, 1)
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
