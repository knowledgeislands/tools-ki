import { lstat, readdir, readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import { parse } from 'yaml'
import { REPOSITORY_DECLARATION_FILE } from '../configuration/index.ts'
import { KiError } from '../errors.ts'
import { skillTable } from '../territory/declaration.ts'
import { isMainStateOfPlay, workNames } from './identity.ts'

export const WORK_STATUS_SCHEMA = 'ki/work-status/v1' as const

/** The work folders and, for the work model's tolerance window, the thread-model checkpoints. */
export const WORK_DIRECTORY = '+/_WORK'
export const WORK_REVIEW_DIRECTORY = '+/_WORK_REVIEW'
const CHECKPOINTS_DIRECTORY = '+/_CHECKPOINTS'

export const workLevels = ['territory', 'regular', 'project'] as const
export const workStates = [
  'with-worker',
  'handoff-to-supervisor',
  'with-supervisor',
  'handoff-to-worker',
  'handoff',
  'on-hold',
  'finished'
] as const
export type WorkLevel = (typeof workLevels)[number]
export type WorkState = (typeof workStates)[number]
export type WorkRole = 'worker' | 'supervisor'

export interface WorkHold {
  readonly reason: 'paused' | 'more-expected'
  readonly release: string | null
}

export interface WorkStatusItem {
  readonly id: string
  readonly kind: 'record' | 'run' | 'person'
  readonly holder: string | null
  readonly role: WorkRole | null
  readonly state: WorkState
  readonly target: string | null
  readonly blocking: boolean
  readonly since: string
}

export interface WorkStatusEntry {
  readonly identity: string
  readonly id: string
  readonly level: WorkLevel
  readonly title: string
  /** The work's thread label from its work file, or null when it declares none and the title serves. */
  readonly label: string | null
  readonly theme: string | null
  /** A secondary State of play's main State of play, its territory id; null for all other work. */
  readonly parent: string | null
  /** The work ids a secondary State of play coordinates; empty for all other work. */
  readonly covers: readonly string[]
  readonly worker: string
  readonly supervisor: string
  readonly state: WorkState
  readonly hold: WorkHold | null
  readonly holder: string | null
  readonly role: WorkRole | null
  readonly target: string | null
  readonly blocking: boolean
  readonly since: string
  readonly received: string | null
  readonly beat: string | null
  /** The work file's routing description, or null when it declares none. */
  readonly description: string | null
  /** The harness revision whose guidance the worker last read, from the state file, or null. */
  readonly method_read: string | null
  /** Lines waiting in the work's message queue. */
  readonly messages: number
  readonly path: string
  readonly items: readonly WorkStatusItem[]
}

export interface WorkStatusReport {
  readonly schema: typeof WORK_STATUS_SCHEMA
  readonly repository: string
  readonly generatedAt: string
  readonly work: readonly WorkStatusEntry[]
}

export interface WorkStatus {
  readonly report: WorkStatusReport
  /** Work files held in `+/_WORK_REVIEW/`, shown only as a count. */
  readonly review: number
  readonly warnings: readonly string[]
}

/** A live run whose tracked home is a work folder, read from its state folder by the caller. */
export interface WorkRun {
  readonly run: string
  readonly folder: string
  readonly agents: readonly { readonly name: string; readonly since: string }[]
}

export interface WorkStatusRequest {
  readonly root: string
  readonly identity: string
  readonly now: Date
  readonly runs: readonly WorkRun[]
}

const SEGMENT = '[a-z0-9]+(?:-[a-z0-9]+)*'
const WORK_ID = new RegExp(`^${SEGMENT}(?:\\.${SEGMENT})*$`)
const HOLDER = new RegExp(`^(?:owner|agent|(?:run|person|repo)/[A-Za-z0-9_-]+|work/${SEGMENT}(?:\\.${SEGMENT})*)$`)

/** Whether the value is a dotted work id, such as `ki.ways-of-working`. */
export const isWorkId = (value: string): boolean => WORK_ID.test(value)

/** The reserved second id segment of a secondary State of play, `<territory>.sop.<name>`. */
export const SECONDARY_SEGMENT = 'sop'

/** Whether the id names a secondary State of play, `<territory>.sop.<name>`. */
export const isSecondaryStateOfPlay = (id: string): boolean =>
  id.split('.')[1] === SECONDARY_SEGMENT && !isMainStateOfPlay(id)

/** The work's slug, its id with each `.` written as `-`; never parsed back into an id. */
export const workSlug = (id: string): string => id.replaceAll('.', '-')

/** A UTC RFC 3339 time at second precision, or undefined when the value is not a time. */
const utc = (value: unknown): string | undefined => {
  if (typeof value !== 'string' && !(value instanceof Date)) return undefined
  const time = new Date(value)
  return Number.isNaN(time.getTime()) ? undefined : `${time.toISOString().slice(0, 19)}Z`
}

const frontmatter = (text: string): Record<string, unknown> | undefined => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (!match) return undefined
  try {
    const values: unknown = parse(match[1] as string)
    return values && typeof values === 'object' && !Array.isArray(values)
      ? (values as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

/** The party the work lies with now and that party's role, derived from its state and never stored. */
export const workHolder = (
  state: WorkState,
  worker: string,
  supervisor: string,
  target: string | null
): { readonly holder: string | null; readonly role: WorkRole | null } => {
  if (state === 'with-worker' || state === 'handoff-to-worker') return { holder: worker, role: 'worker' }
  if (state === 'with-supervisor' || state === 'handoff-to-supervisor')
    return { holder: supervisor, role: 'supervisor' }
  if (state === 'handoff') return { holder: target, role: null }
  return { holder: null, role: null }
}

const directories = async (path: string): Promise<readonly string[]> =>
  (await readdir(path, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

const isFile = async (path: string): Promise<boolean> => (await lstat(path).catch(() => undefined))?.isFile() === true

/** The fields a package keeps in `state.md`; any of them left in its `work.md` is stale. */
const STATE_FIELDS = ['state', 'target', 'hold', 'blocking', 'since', 'received', 'beat', 'mark', 'method_read']

/** A revision as written, a bare number such as an all-digit short hash read back as its digits. */
const revision = (value: unknown): string | null =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : null

/** The top-level list lines of a message queue, each one pending message; `None.` and prose count nothing. */
const pending = (text: string): number => text.split(/\r?\n/).filter((line) => line.startsWith('- ')).length

/** The lines beneath one heading of a work file, up to the next heading of the same or a higher level. */
const section = (text: string, heading: string): string => {
  const lines = text.split(/\r?\n/)
  const start = lines.indexOf(heading)
  if (start < 0) return ''
  const end = lines.findIndex((line, index) => index > start && /^#{1,2} /.test(line))
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n')
}

/** Valid same-territory supervision and State of play coverage, independent of session role. */
const statePlacement = (
  id: string,
  level: WorkLevel,
  values: Record<string, unknown>
): { readonly parent: string | null; readonly covers: readonly string[] } | string => {
  const segments = id.split('.')
  const territory = segments[0] as string
  const { parent, covers } = values
  if (level !== 'territory') {
    if (segments[1] === SECONDARY_SEGMENT) return `a ${territory}.${SECONDARY_SEGMENT}.<name> id is territory work`
    if (covers !== undefined) return 'covers belongs to State of play'
    if (
      parent !== undefined &&
      (typeof parent !== 'string' ||
        !WORK_ID.test(parent) ||
        parent === id ||
        (parent !== territory && parent !== `${territory}.sop.main` && !isSecondaryStateOfPlay(parent)) ||
        parent.split('.')[0] !== territory)
    )
      return `parent must name a State of play of territory ${territory}`
    return { parent: (parent as string | undefined) ?? null, covers: [] }
  }
  const main = isMainStateOfPlay(id)
  if (main && parent !== undefined) return 'the main State of play takes no parent'
  if (!main) {
    if (segments.length !== 3 || !isSecondaryStateOfPlay(id))
      return `territory work id must be ${territory} or ${territory}.${SECONDARY_SEGMENT}.<name>`
    if (parent !== territory && parent !== `${territory}.sop.main`)
      return `parent must name the main State of play, ${territory}`
  }
  if (main && covers === undefined) return { parent: null, covers: [] }
  if (!Array.isArray(covers) || (!main && !covers.length))
    return 'covers must list the work ids this State of play coordinates'
  for (const covered of covers) {
    if (typeof covered !== 'string' || !WORK_ID.test(covered)) return 'covers must list dotted work ids'
    if (!covered.startsWith(`${territory}.`) || covered === `${territory}.sop.main` || isSecondaryStateOfPlay(covered))
      return `covers names ${covered}, which is not other work of territory ${territory}`
  }
  return { parent: main ? null : (parent as string), covers: covers as string[] }
}

/** The work file's identity and supervision, or the reason it cannot be read. */
const workDefinition = (folder: string, values: Record<string, unknown>) => {
  const { id, level, title, worker, supervisor } = values
  if (typeof id !== 'string' || !WORK_ID.test(id)) return 'id must be a dotted work id'
  if (id !== folder) return `id ${id} must name its folder`
  if (!workLevels.includes(level as WorkLevel)) return `level must be one of ${workLevels.join(', ')}`
  const kind = id.split('.')[1]
  if ((kind === 'prj' && level !== 'project') || ((kind === 'reg' || kind === 'regular') && level !== 'regular'))
    return 'work type segment must agree with level'
  if (typeof title !== 'string' || !title.trim()) return 'title must be a non-empty string'
  if (typeof worker !== 'string' || !HOLDER.test(worker)) return 'worker must name a holder'
  if (typeof supervisor !== 'string' || !HOLDER.test(supervisor)) return 'supervisor must name a holder'
  const placement = statePlacement(id, level as WorkLevel, values)
  if (typeof placement === 'string') return placement
  return {
    id,
    level: level as WorkLevel,
    title,
    label: typeof values['label'] === 'string' ? values['label'] : null,
    theme: typeof values['theme'] === 'string' ? values['theme'] : null,
    ...placement,
    worker,
    supervisor,
    description: typeof values['description'] === 'string' ? values['description'] : null
  }
}

/** A work file's definition and its path: what a work is, read apart from its state. */
export type WorkDefinition = Exclude<ReturnType<typeof workDefinition>, string> & { readonly path: string }

/**
 * Reads each work definition under `+/_WORK/` without its state, so that a work whose `state.md` cannot be read is
 * still known by its id, title and placement. It writes nothing; `readWorkStatus` names any unreadable file.
 */
export const readWorkDefinitions = async (root: string): Promise<readonly WorkDefinition[]> => {
  const work: WorkDefinition[] = []
  for (const folder of await directories(join(root, WORK_DIRECTORY))) {
    const path = `${WORK_DIRECTORY}/${folder}/work.md`
    const values = frontmatter(await readFile(join(root, path), 'utf8').catch(() => ''))
    const definition = values ? workDefinition(folder, values) : undefined
    if (definition && typeof definition !== 'string') work.push({ ...definition, path })
  }
  const names = new Map<string, string>()
  for (const definition of work)
    for (const name of workNames(definition.id, definition.level)) {
      const previous = names.get(name)
      if (previous !== undefined && previous !== definition.id)
        throw new KiError(`ambiguous work ${name}: ${previous} and ${definition.id}`, 2)
      names.set(name, definition.id)
    }
  return work
}

/** Reads the state fields, from `state.md` in a package and the work file otherwise, or the reason it cannot. */
const workState = (values: Record<string, unknown>, worker: string, supervisor: string) => {
  const { state } = values
  if (!workStates.includes(state as WorkState)) return `state must be one of ${workStates.join(', ')}`
  const since = utc(values['since'])
  if (!since) return 'since must be a UTC time'
  const target = typeof values['target'] === 'string' ? values['target'] : null
  if (state === 'handoff' && (target === null || !HOLDER.test(target))) return 'target must name a holder in handoff'
  const declaredHold = values['hold'] as Record<string, unknown> | null | undefined
  const reason = declaredHold?.['reason']
  if (state === 'on-hold' && reason !== 'paused' && reason !== 'more-expected')
    return 'hold.reason must be paused or more-expected while on hold'
  const hold =
    state === 'on-hold'
      ? {
          reason: reason as WorkHold['reason'],
          release: typeof declaredHold?.['release'] === 'string' ? declaredHold['release'] : null
        }
      : null
  return {
    state: state as WorkState,
    hold,
    ...workHolder(state as WorkState, worker, supervisor, target),
    target: state === 'handoff' ? target : null,
    blocking: values['blocking'] === true,
    since,
    received: utc(values['received']) ?? null,
    beat: utc(values['beat']) ?? null,
    method_read: revision(values['method_read'])
  }
}

/**
 * Reads one work folder in either shape the work-package standard allows: a package, told by its `state.md`, takes
 * its state fields from that file and its queue from `messages.md`; a single-file folder takes both from `work.md`.
 * Returns the entry, if any, and the warnings that name each file it could not read.
 */
const workEntry = async (
  root: string,
  folder: string,
  identity: string,
  items: readonly WorkStatusItem[]
): Promise<{ readonly entry?: WorkStatusEntry; readonly warnings: readonly string[] }> => {
  const relative = (name: string): string => `${WORK_DIRECTORY}/${folder}/${name}`
  const read = (name: string): Promise<string> => readFile(join(root, WORK_DIRECTORY, folder, name), 'utf8')
  const text = await read('work.md')
  const values = frontmatter(text)
  if (!values) return { warnings: [`${relative('work.md')}: has no YAML front matter`] }
  const definition = workDefinition(folder, values)
  if (typeof definition === 'string') return { warnings: [`${relative('work.md')}: ${definition}`] }
  const packaged = await isFile(join(root, WORK_DIRECTORY, folder, 'state.md'))
  const source = relative(packaged ? 'state.md' : 'work.md')
  const stateValues = packaged ? frontmatter(await read('state.md')) : values
  if (!stateValues) return { warnings: [`${source}: has no YAML front matter`] }
  if (packaged && stateValues['id'] !== folder)
    return { warnings: [`${source}: id ${String(stateValues['id'])} must name its folder`] }
  const state = workState(stateValues, definition.worker, definition.supervisor)
  if (typeof state === 'string') return { warnings: [`${source}: ${state}`] }
  const queue = packaged ? await read('messages.md').catch(() => '') : section(text, '## Messages')
  const stale = packaged && STATE_FIELDS.some((field) => field in values)
  return {
    entry: { identity, ...definition, ...state, messages: pending(queue), path: source, items },
    warnings: stale ? [`${relative('work.md')}: carries state fields beside state.md; state.md governs`] : []
  }
}

/** The territory alias legacy ids take: a work file's, else the Capital's first alias or handle, else the folder. */
const territoryAlias = async (root: string, work: readonly WorkStatusEntry[]): Promise<string> => {
  const own = work[0]?.id.split('.')[0]
  if (own) return own
  // The caller has already read this declaration's [skills.ki-repo] table for the repository identity.
  const document = parseToml(await readFile(join(root, REPOSITORY_DECLARATION_FILE), 'utf8'))
  const table = skillTable(document, 'ki-repo') as Record<string, unknown>
  const aliases = table['territory_aliases']
  const alias = Array.isArray(aliases) && typeof aliases[0] === 'string' ? aliases[0] : undefined
  const prefix = typeof table['territory_prefix'] === 'string' ? table['territory_prefix'] : undefined
  return alias ?? prefix ?? basename(root)
}

const legacyStates: Readonly<Record<string, { readonly state: WorkState; readonly hold: WorkHold | null }>> = {
  rest: { state: 'with-supervisor', hold: null },
  busy: { state: 'with-worker', hold: null },
  hold: { state: 'on-hold', hold: { reason: 'paused', release: null } }
}

/** Maps one thread-model checkpoint to an entry under the ki-coordination Work naming rules, or undefined if it is not one. */
const checkpointEntry = (
  stem: string,
  text: string,
  identity: string,
  territory: string
): WorkStatusEntry | string | undefined => {
  const values = frontmatter(text)
  if (values?.['type'] !== 'ki-checkpoint') return undefined
  const since = utc(values['updated_at']) ?? utc(values['created_at'])
  if (!since) return 'updated_at must be a UTC time'
  const project = stem.split('.').slice(1).at(-1)
  const mapped: { readonly id: string; readonly level: WorkLevel } =
    stem === '_state-of-play'
      ? { id: territory, level: 'territory' }
      : project
        ? { id: `${territory}.${project}`, level: 'project' }
        : { id: `${territory}.regular.${stem}`, level: 'regular' }
  const pickUp = /\*\*Status:\*\*\s*([a-z]+)/.exec(text)?.[1] ?? 'rest'
  const { state, hold } = legacyStates[pickUp] ?? (legacyStates['rest'] as (typeof legacyStates)[string])
  return {
    identity,
    ...mapped,
    title: typeof values['label'] === 'string' ? values['label'] : stem,
    label: null,
    theme: null,
    parent: null,
    covers: [],
    worker: 'agent',
    supervisor: 'owner',
    state,
    hold,
    ...workHolder(state, 'agent', 'owner', null),
    target: null,
    blocking: false,
    since,
    received: null,
    beat: null,
    description: null,
    method_read: null,
    messages: 0,
    path: `${CHECKPOINTS_DIRECTORY}/${stem}.md`,
    items: []
  }
}

/**
 * Reads every `+/_WORK/<id>/` work folder in one repository, package or single-file, into the `ki/work-status/v1`
 * report, with the live runs homed in each work folder as its run items, and counts `+/_WORK_REVIEW/`. Through the work model's tolerance
 * window each `+/_CHECKPOINTS/*.md` maps to an entry whose path is the checkpoint, with a warning naming its new home.
 * It writes nothing; an unreadable work file is a warning, never a failure.
 */
export const readWorkStatus = async (request: WorkStatusRequest): Promise<WorkStatus> => {
  const warnings: string[] = []
  const work: WorkStatusEntry[] = []
  const definitions = await readWorkDefinitions(request.root)
  for (const folder of await directories(join(request.root, WORK_DIRECTORY))) {
    if (!(await isFile(join(request.root, WORK_DIRECTORY, folder, 'work.md')))) {
      warnings.push(`${WORK_DIRECTORY}/${folder}/ has no work.md`)
      continue
    }
    const items = request.runs
      .filter(
        (run) =>
          run.folder === `${WORK_DIRECTORY}/${folder}` ||
          definitions.some(
            (definition) =>
              definition.id === folder &&
              workNames(definition.id, definition.level).some((name) => run.folder === `${WORK_DIRECTORY}/${name}`)
          )
      )
      .flatMap((run) =>
        run.agents.map(
          (agent): WorkStatusItem => ({
            id: `${run.run}/${agent.name}`,
            kind: 'run',
            holder: `run/${run.run}`,
            role: 'worker',
            state: 'with-worker',
            target: null,
            blocking: false,
            since: agent.since
          })
        )
      )
    const read = await workEntry(request.root, folder, request.identity, items)
    warnings.push(...read.warnings)
    if (read.entry) work.push(read.entry)
  }
  // Each covered work answers to one secondary State of play; the main covers whatever no secondary does.
  const coveredBy = new Map<string, string>()
  for (const entry of work)
    for (const covered of entry.covers) {
      const other = coveredBy.get(covered)
      if (other) warnings.push(`${entry.path}: covers ${covered}, which ${other} already covers`)
      else coveredBy.set(covered, entry.id)
    }
  const checkpoints = (await readdir(join(request.root, CHECKPOINTS_DIRECTORY)).catch(() => []))
    .filter((name) => name.endsWith('.md') && name !== 'README.md')
    .sort()
  if (checkpoints.length) {
    const territory = await territoryAlias(request.root, work)
    for (const name of checkpoints) {
      const path = join(request.root, CHECKPOINTS_DIRECTORY, name)
      if (!(await isFile(path))) continue
      const entry = checkpointEntry(
        name.slice(0, -'.md'.length),
        await readFile(path, 'utf8'),
        request.identity,
        territory
      )
      if (!entry) continue
      if (typeof entry === 'string') {
        warnings.push(`${CHECKPOINTS_DIRECTORY}/${name}: ${entry}`)
        continue
      }
      warnings.push(`${entry.path} is a thread-model checkpoint; move it to ${WORK_DIRECTORY}/${entry.id}/work.md`)
      work.push(entry)
    }
  }
  const review = (
    await Promise.all(
      (
        await directories(join(request.root, WORK_REVIEW_DIRECTORY))
      ).map((folder) => isFile(join(request.root, WORK_REVIEW_DIRECTORY, folder, 'work.md')))
    )
  ).filter(Boolean).length
  return {
    report: {
      schema: WORK_STATUS_SCHEMA,
      repository: request.identity,
      generatedAt: `${request.now.toISOString().slice(0, 19)}Z`,
      work
    },
    review,
    warnings
  }
}

export const workViews = ['with-you', 'stuck', 'blocked', 'moving', 'on-hold'] as const
export type WorkView = (typeof workViews)[number]

/** One line of a view: the work or item, its holder and since, and for on hold whether a paused hold is overdue. */
export interface WorkViewLine {
  readonly id: string
  readonly holder: string | null
  readonly since: string
  readonly overdue?: true
  /** Lines waiting in the work's message queue, when there are any. */
  readonly pending?: number
}

const STUCK_AFTER = 10 * 60 * 1000
const OVERDUE_AFTER = 31 * 24 * 60 * 60 * 1000

/**
 * Derives the Work Process note's five views from a report: with you holds every work or item whose holder is
 * `owner`, oldest first; stuck, a worker-held item whose later of since and beat is over 10 minutes old; blocked,
 * a blocking send or a handoff to another target; on hold, with a paused hold flagged after 31 days; moving, the rest.
 */
export const deriveWorkViews = (
  work: readonly WorkStatusEntry[],
  now: Date
): Readonly<Record<WorkView, readonly WorkViewLine[]>> => {
  const age = (...times: readonly (string | null)[]): number =>
    now.getTime() - Math.max(...times.filter((time): time is string => time !== null).map(Date.parse))
  const views: Record<WorkView, WorkViewLine[]> = { 'with-you': [], stuck: [], blocked: [], moving: [], 'on-hold': [] }
  for (const entry of work) {
    if (entry.state === 'finished') continue
    const line = {
      id: entry.id,
      holder: entry.holder,
      since: entry.since,
      ...(entry.messages ? { pending: entry.messages } : {})
    }
    const placed: WorkView[] = []
    if (entry.holder === 'owner') placed.push('with-you')
    if (entry.role === 'worker' && entry.state === 'with-worker' && age(entry.since, entry.beat) > STUCK_AFTER)
      placed.push('stuck')
    if (entry.blocking || entry.state === 'handoff') placed.push('blocked')
    if (entry.state === 'on-hold') placed.push('on-hold')
    if (!placed.length) placed.push('moving')
    for (const view of placed)
      views[view].push(
        view === 'on-hold' && entry.hold?.reason === 'paused' && age(entry.since) > OVERDUE_AFTER
          ? { ...line, overdue: true }
          : line
      )
    // Every item is a live run with a worker; its since is its status file's last change.
    for (const item of entry.items)
      views[age(item.since) > STUCK_AFTER ? 'stuck' : 'moving'].push({
        id: item.id,
        holder: item.holder,
        since: item.since
      })
  }
  views['with-you'].sort((left, right) => Date.parse(left.since) - Date.parse(right.since))
  return views
}

/** The modification time of a run agent's status file, its last move or heartbeat, as a UTC time. */
export const statusSince = async (path: string): Promise<string | undefined> => {
  const status = await stat(path).catch(() => undefined)
  return status ? utc(status.mtime) : undefined
}
