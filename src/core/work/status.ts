import { readStorePackages, type StorePackage } from './store.ts'

/**
 * `ki work status` reads the work packages in the Cairn store, under the `ki-work-package` standard: each package's
 * `_index.md` front matter is its definition and state, `ki-repositories` maps a repository to the packages working in
 * it, and `ki-parent` places each package in its territory's tree. Nothing else in a package is read.
 */
export const WORK_STATUS_SCHEMA = 'ki/work-status/v2' as const

export const workLevels = ['root', 'territory', 'regular', 'project'] as const
export const workStates = [
  'with-worker',
  'handoff-to-supervisor',
  'with-supervisor',
  'handoff-to-worker',
  'handoff',
  'on-hold',
  'finished'
] as const
export const holdReasons = ['paused', 'more-expected', 'snoozing'] as const
export type WorkLevel = (typeof workLevels)[number]
export type WorkState = (typeof workStates)[number]
export type WorkHoldReason = (typeof holdReasons)[number]
/** Whether the holder holds the work as its worker or its supervisor. */
export type WorkHolderRole = 'worker' | 'supervisor'

export interface WorkHold {
  readonly reason: WorkHoldReason
  readonly release: string | null
}

/** One seat under `ki-workers`, each key as written or null. */
export interface WorkSeat {
  readonly role: string | null
  readonly tier: string | null
  readonly id: string | null
  readonly since: string | null
  readonly status: string | null
}

export interface WorkStatusEntry {
  readonly id: string
  readonly level: WorkLevel
  readonly label: string | null
  readonly project: string | null
  /** The node or parent package the package sits beneath; null on the root and a territory's summit. */
  readonly parent: string | null
  /** The package's role, `ki-role`, or null where it declares none. */
  readonly role: string | null
  /** The routing description, or null where it declares none. */
  readonly description: string | null
  readonly worker: string
  readonly supervisor: string
  /** The repositories the package mainly works in, each `<territory folder>/<repository>`. */
  readonly repositories: readonly string[]
  /** The records it works, by full record id. */
  readonly records: readonly string[]
  readonly state: WorkState
  readonly hold: WorkHold | null
  /** The holder the work lies with now, derived from its state and never stored. */
  readonly holder: string | null
  readonly holderRole: WorkHolderRole | null
  readonly target: string | null
  readonly blocking: boolean
  readonly since: string
  readonly received: string | null
  readonly beat: string | null
  readonly mark: string | null
  /** The backpack revision whose guidance the worker last read, or null. */
  readonly method_read: string | null
  readonly workers: readonly WorkSeat[]
  /** The entry file's path within the store. */
  readonly path: string
  /** The package's own change documents, by path within the store. */
  readonly changes: readonly string[]
}

export interface WorkStatusReport {
  readonly schema: typeof WORK_STATUS_SCHEMA
  /** The store read. */
  readonly store: string
  /** The repository whose packages are listed, `<owner>/<name>`, or null when every package is. */
  readonly repository: string | null
  readonly generatedAt: string
  readonly work: readonly WorkStatusEntry[]
}

export interface WorkStatus {
  readonly report: WorkStatusReport
  /** Every readable package in the store, in folder order, so a view can place the listed ones in their tree. */
  readonly packages: readonly WorkStatusEntry[]
  readonly warnings: readonly string[]
}

export interface WorkStatusRequest {
  readonly store: string
  /** The repository to list the packages of, `<owner>/<name>`; every package when absent. */
  readonly repository?: string
  readonly now: Date
}

const SEGMENT = '[a-z0-9]+(?:-[a-z0-9]+)*'
const WORK_ID = new RegExp(`^${SEGMENT}(?:\\.${SEGMENT})*(?:\\+${SEGMENT})*$`)

/** A UTC RFC 3339 time at second precision, or undefined when the value is not a time. */
const utc = (value: unknown): string | undefined => {
  if (typeof value !== 'string' && !(value instanceof Date)) return undefined
  const time = new Date(value)
  return Number.isNaN(time.getTime()) ? undefined : `${time.toISOString().slice(0, 19)}Z`
}

/** A revision as written, a bare number such as an all-digit short hash read back as its digits. */
const revision = (value: unknown): string | null =>
  typeof value === 'string' ? value : typeof value === 'number' ? String(value) : null

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null)

const names = (value: unknown): readonly string[] | undefined =>
  Array.isArray(value) && value.every((name) => typeof name === 'string') ? value : undefined

/** The territory a package belongs to: its id's first segment. */
const territoryOf = (id: string): string => id.split(/[.+]/)[0] as string

/** The party the work lies with now and that party's role, derived from its state and never stored. */
export const workHolder = (
  state: WorkState,
  worker: string,
  supervisor: string,
  target: string | null
): { readonly holder: string | null; readonly holderRole: WorkHolderRole | null } => {
  if (state === 'with-worker' || state === 'handoff-to-worker') return { holder: worker, holderRole: 'worker' }
  if (state === 'with-supervisor' || state === 'handoff-to-supervisor')
    return { holder: supervisor, holderRole: 'supervisor' }
  if (state === 'handoff') return { holder: target, holderRole: null }
  return { holder: null, holderRole: null }
}

const seats = (value: unknown): readonly WorkSeat[] =>
  (Array.isArray(value) ? value : []).flatMap((seat: unknown) => {
    if (!seat || typeof seat !== 'object') return []
    const fields = seat as Record<string, unknown>
    return [
      {
        role: text(fields['role']),
        tier: text(fields['tier']),
        id: text(fields['id']),
        since: utc(fields['since']) ?? null,
        status: text(fields['status'])
      }
    ]
  })

/** The definition: identity, level, placement and the holders, or the reason it cannot be read. */
const definition = (found: StorePackage, values: Record<string, unknown>) => {
  const id = values['ki-id']
  if (typeof id !== 'string' || !WORK_ID.test(id)) return 'ki-id must be a dotted work id'
  if (id !== found.folderId) return `ki-id ${id} must agree with its folder, ${found.folderId}`
  const level = values['ki-level']
  if (!workLevels.includes(level as WorkLevel)) return `ki-level must be one of ${workLevels.join(', ')}`
  const parent = values['ki-parent'] ?? null
  if (found.enclosing !== null && parent !== found.enclosing)
    return `ki-parent must name the parent package, ${found.enclosing}`
  if (parent !== null && (typeof parent !== 'string' || !WORK_ID.test(parent)))
    return 'ki-parent must be a dotted work id'
  const worker = text(values['ki-worker'])
  if (worker === null) return 'ki-worker must name a holder'
  const supervisor = text(values['ki-supervisor'])
  if (supervisor === null) return 'ki-supervisor must name a holder'
  const repositories = names(values['ki-repositories'])
  if (repositories === undefined) return 'ki-repositories must be a list of <territory folder>/<repository> names'
  const records = names(values['ki-records'] ?? [])
  if (records === undefined) return 'ki-records must be a list of record ids'
  return {
    id,
    level: level as WorkLevel,
    label: text(values['ki-label']),
    project: text(values['ki-project']),
    parent: parent as string | null,
    role: text(values['ki-role']),
    description: text(values['ki-description']),
    worker,
    supervisor,
    repositories,
    records
  }
}

/** The state fields, or the reason they cannot be read. */
const workState = (values: Record<string, unknown>, worker: string, supervisor: string) => {
  const state = values['ki-state']
  if (!workStates.includes(state as WorkState)) return `ki-state must be one of ${workStates.join(', ')}`
  const since = utc(values['ki-since'])
  if (!since) return 'ki-since must be a UTC time'
  const target = text(values['ki-target'])
  if (state === 'handoff' && target === null) return 'ki-target must name a holder in handoff'
  const declaredHold: Record<string, unknown> = Object(values['ki-hold'])
  const reason = declaredHold['reason']
  if (state === 'on-hold' && !holdReasons.includes(reason as WorkHoldReason))
    return `ki-hold.reason must be one of ${holdReasons.join(', ')} while on hold`
  return {
    state: state as WorkState,
    hold: state === 'on-hold' ? { reason: reason as WorkHoldReason, release: text(declaredHold['release']) } : null,
    ...workHolder(state as WorkState, worker, supervisor, target),
    target: state === 'handoff' ? target : null,
    blocking: values['ki-blocking'] === true,
    since,
    received: utc(values['ki-received']) ?? null,
    beat: utc(values['ki-beat']) ?? null,
    mark: utc(values['ki-mark']) ?? null,
    method_read: revision(values['ki-method_read'])
  }
}

/** One package's entry, or the reason its entry file cannot be read. */
const packageEntry = (found: StorePackage): WorkStatusEntry | string => {
  if (found.fields === undefined) return 'has no YAML front matter'
  const defined = definition(found, found.fields)
  if (typeof defined === 'string') return defined
  const state = workState(found.fields, defined.worker, defined.supervisor)
  if (typeof state === 'string') return state
  return {
    ...defined,
    ...state,
    workers: seats(found.fields['ki-workers']),
    path: found.path,
    changes: found.changes
  }
}

/** Each `ki-parent` that names no package, crosses into another territory or closes a cycle. */
const treeWarnings = (work: readonly WorkStatusEntry[]): readonly string[] => {
  const byId = new Map(work.map((entry) => [entry.id, entry]))
  const warnings: string[] = []
  for (const entry of work) {
    if (entry.parent === null) continue
    const parent = byId.get(entry.parent)
    if (parent === undefined) warnings.push(`${entry.path}: ki-parent ${entry.parent} names no package in the store`)
    else if (territoryOf(parent.id) !== territoryOf(entry.id))
      warnings.push(`${entry.path}: ki-parent ${entry.parent} is outside territory ${territoryOf(entry.id)}`)
    const seen = new Set<string>()
    for (let next = parent; next !== undefined && !seen.has(next.id); next = byId.get(next.parent as string)) {
      if (next.id === entry.id) {
        warnings.push(`${entry.path}: ki-parent closes a cycle back to ${entry.id}`)
        break
      }
      seen.add(next.id)
    }
  }
  return warnings
}

/** Whether a package names the repository, `<owner>/<name>`, among its own: by the repository's name. */
const listsRepository = (entry: WorkStatusEntry, repository: string): boolean => {
  const name = repository.split('/').at(-1)
  return entry.repositories.some((named) => named.split('/').at(-1) === name)
}

/**
 * Reads every package in the store into the `ki/work-status/v2` report, listing those that name the repository, or
 * every package when none is given. It writes nothing; an unreadable entry file is a warning, never a failure, and a
 * `ki-parent` that does not resolve, leaves its territory or closes a cycle is a warning beside its entry.
 */
export const readWorkStatus = async (request: WorkStatusRequest): Promise<WorkStatus> => {
  const store = await readStorePackages(request.store)
  const warnings = [...store.warnings]
  const packages: WorkStatusEntry[] = []
  for (const found of store.packages) {
    const entry = packageEntry(found)
    if (typeof entry === 'string') warnings.push(`${found.path}: ${entry}`)
    else packages.push(entry)
  }
  warnings.push(...treeWarnings(packages))
  const { repository } = request
  return {
    report: {
      schema: WORK_STATUS_SCHEMA,
      store: request.store,
      repository: repository ?? null,
      generatedAt: `${request.now.toISOString().slice(0, 19)}Z`,
      work: repository === undefined ? packages : packages.filter((entry) => listsRepository(entry, repository))
    },
    packages,
    warnings
  }
}

export const workViews = ['with-you', 'stuck', 'blocked', 'moving', 'on-hold'] as const
export type WorkView = (typeof workViews)[number]

/** One line of a view: the work, its holder and since, and for on hold whether a paused hold is overdue. */
export interface WorkViewLine {
  readonly id: string
  readonly holder: string | null
  readonly since: string
  readonly overdue?: true
}

const STUCK_AFTER = 10 * 60 * 1000
const OVERDUE_AFTER = 31 * 24 * 60 * 60 * 1000

/**
 * Derives the Work Process note's five views from a report: with you holds every work whose holder is `owner`, oldest
 * first; stuck, worker-held work whose later of since and beat is over 10 minutes old; blocked, a blocking send or a
 * handoff to another target; on hold, with a paused hold flagged after 31 days; moving, the rest.
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
    const line = { id: entry.id, holder: entry.holder, since: entry.since }
    const placed: WorkView[] = []
    if (entry.holder === 'owner') placed.push('with-you')
    if (entry.holderRole === 'worker' && entry.state === 'with-worker' && age(entry.since, entry.beat) > STUCK_AFTER)
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
  }
  views['with-you'].sort((left, right) => Date.parse(left.since) - Date.parse(right.since))
  return views
}
