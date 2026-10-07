import { lstat, readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import { KiError } from '../errors.ts'
import { prepareWrites, publishWrites } from '../filesystem/index.ts'
import type { RepositoryPlanningAdapter, RepositoryPlanningSource } from './planning.ts'

const ISSUE_LEDGER = '_ISSUES.md'
const IDEAS_LIST = '_IDEAS.md'
const KB_ROADMAP_INDEX = 'Roadmap.md'
const requiredFields = [
  'id',
  'title',
  'status',
  'blocks',
  'blocked_by',
  'baseline_ref',
  'created_at',
  'updated_at'
] as const
type RequiredField = (typeof requiredFields)[number]
const optionalFields = [
  'area',
  'theme',
  'horizon',
  'kind',
  'purpose',
  'project',
  'initiative',
  'component',
  'resolution',
  'resolution_target',
  'waiting_on_trades',
  'intake_disposition',
  'intake_disposition_target',
  'transferred_from',
  'housekeeping_template',
  'scheduled_for'
] as const
type WorkItemField = RequiredField | (typeof optionalFields)[number]
type WorkItemFields = Partial<Record<WorkItemField, string>> & { task_links?: TaskLinks; hold?: WorkItemHold }

const nestedFields = ['task_links', 'hold'] as const
const allowedFields = new Set<string>([...requiredFields, ...optionalFields, ...nestedFields])
/** Horizons in selection order. */
export const workItemHorizons = ['now', 'next', 'soon', 'future', 'hold'] as const
export type WorkItemHorizon = (typeof workItemHorizons)[number]
/** Former horizons read during the migration tolerance window and reported as legacy. */
export const legacyWorkItemHorizons = ['waiting-for', 'parked', 'triage'] as const
export type LegacyWorkItemHorizon = (typeof legacyWorkItemHorizons)[number]
const horizons = new Set<string>([...workItemHorizons, ...legacyWorkItemHorizons])
export const workItemStatuses = [
  'triage',
  'draft',
  'ready',
  'in-progress',
  'awaiting-review',
  'done',
  'cancelled'
] as const
export type WorkItemStatus = (typeof workItemStatuses)[number]
const statuses = new Set<string>(workItemStatuses)
export const workItemKinds = ['deliver', 'decide', 'investigate', 'audit'] as const
export const workItemPurposes = [
  'capability',
  'corrective',
  'debt',
  'governance',
  'learning',
  'adoption',
  'upkeep'
] as const
export const holdReasons = ['waiting-for', 'parked'] as const
export type HoldReason = (typeof holdReasons)[number]
export const workItemResolutions = ['obsolete', 'rejected', 'duplicate', 'merged', 'superseded'] as const
const targetedResolutions = new Set<string>(['duplicate', 'merged', 'superseded'])
/** Where a record sits in reports: an adopted open horizon, unadopted intake, or a terminal ending. */
export const workItemLanes = [...workItemHorizons, 'triage', 'done', 'cancelled'] as const
export type WorkItemLane = (typeof workItemLanes)[number]
/** Status and horizon combinations the model allows; anything else is a tolerated legacy shape. */
const allowedHorizons: Readonly<Record<WorkItemStatus, readonly WorkItemHorizon[]>> = {
  triage: [],
  draft: workItemHorizons,
  ready: ['now', 'next', 'hold'],
  'in-progress': ['now', 'hold'],
  'awaiting-review': ['now', 'hold'],
  done: [],
  cancelled: []
}
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const WORK_ITEM_ID = /^[A-Z0-9][A-Z0-9-]{1,23}-\d{3,}$/
const TRADE_ID = /^TRD-[0-9a-f]{8}$/
const taskLinkRelations = ['evaluation', 'implementation', 'review', 'integration', 'coordination', 'related'] as const
export type TaskLinkRelation = (typeof taskLinkRelations)[number]
const validTaskLinkRelations = new Set<string>(taskLinkRelations)

export const isWorkItemFile = (file: string, adapter: RepositoryPlanningAdapter): boolean =>
  file.endsWith('.md') &&
  file !== ISSUE_LEDGER &&
  file !== IDEAS_LIST &&
  (adapter !== 'kb-streams' || file !== KB_ROADMAP_INDEX)

export const isAllowedHorizon = (status: WorkItemStatus, horizon: WorkItemHorizon): boolean =>
  allowedHorizons[status].includes(horizon)

export interface WorkItemHold {
  readonly reason: HoldReason
  readonly condition: string
  readonly review?: string
  readonly trades?: readonly string[]
}

export interface TaskLink {
  readonly authority: string
  readonly scope: string
  readonly id: string
  readonly key: string
  readonly url: string
  readonly relation: TaskLinkRelation
}

export type TaskLinks = Readonly<Record<string, readonly TaskLink[]>>

export interface WorkItem {
  readonly id: string
  readonly area?: string
  readonly title: string
  /** Deprecated grouping, read only during the migration tolerance window. */
  readonly theme?: string
  /** Absent on triage and terminal records; a legacy horizon is reported, never rewritten here. */
  readonly horizon?: WorkItemHorizon | LegacyWorkItemHorizon
  readonly status: WorkItemStatus
  readonly kind?: (typeof workItemKinds)[number]
  readonly purpose?: (typeof workItemPurposes)[number]
  readonly project?: string
  readonly initiative?: string
  readonly component?: string
  readonly hold?: WorkItemHold
  readonly resolution?: (typeof workItemResolutions)[number]
  readonly resolutionTarget?: string
  readonly blocks: readonly string[]
  readonly blockedBy: readonly string[]
  readonly baselineRef: null | string
  readonly createdAt: string
  readonly updatedAt: string
  readonly transferredFrom?: string
  readonly taskLinks?: TaskLinks
  /** Deprecated shapes this record still carries, in a stable order; absent when it has none. */
  readonly legacy?: readonly string[]
}

export interface WorkItemRecord {
  readonly item: WorkItem
  readonly file: string
  readonly path: string
  readonly contents: string
}

export interface WorkItemFault {
  readonly file: string
  readonly message: string
}

export interface WorkItemInventory {
  readonly items: readonly WorkItem[]
  readonly faults: readonly WorkItemFault[]
}

const itemError = (file: string, message: string): KiError => new KiError(`work item ${file} ${message}`, 2)

const roadmapDirectoryState = async (directory: string) => {
  try {
    return await lstat(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

const parseList = (value: string, file: string, field: string): readonly string[] => {
  if (!/^\[(?:[A-Z0-9-]+(?:, [A-Z0-9-]+)*)?\]$/.test(value))
    throw itemError(file, `${field} must be an identifier array`)
  return value.slice(1, -1).split(', ').filter(Boolean)
}

const parseScalar = (value: string): string => {
  const quote = value.at(0)
  return (quote === "'" || quote === '"') && value.endsWith(quote) ? value.slice(1, -1) : value
}

const timestamp = (value: string, file: string, field: string): string => {
  const milliseconds = Date.parse(value)
  const canonical = Number.isNaN(milliseconds) ? undefined : new Date(milliseconds).toISOString().replace('.000Z', 'Z')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) || canonical !== value)
    throw itemError(file, `${field} must be a canonical UTC timestamp`)
  return value
}

const parseTaskLinks = (lines: readonly string[], file: string): TaskLinks => {
  let value: unknown
  try {
    value = parse(`task_links:\n${lines.join('\n')}`)
  } catch {
    throw itemError(file, 'task_links must be a provider map of task references')
  }
  const links = (value as { task_links?: unknown } | null)?.task_links
  if (!links || typeof links !== 'object' || Array.isArray(links) || !Object.keys(links).length)
    throw itemError(file, 'task_links must be a non-empty provider map')

  const fields = ['authority', 'scope', 'id', 'key', 'url', 'relation'] as const
  const result: Record<string, readonly TaskLink[]> = {}
  for (const [provider, references] of Object.entries(links)) {
    if (!/^[a-z][a-z0-9-]*$/.test(provider) || !Array.isArray(references) || !references.length)
      throw itemError(file, 'task_links providers must have lower-case names and non-empty reference arrays')
    const seen = new Set<string>()
    result[provider] = references.map((reference: unknown): TaskLink => {
      if (!reference || typeof reference !== 'object' || Array.isArray(reference))
        throw itemError(file, 'task_links references must be field maps')
      const entries = Object.entries(reference)
      if (entries.length !== fields.length || entries.some(([key]) => !fields.includes(key as (typeof fields)[number])))
        throw itemError(file, 'task_links references must contain only authority, scope, id, key, url and relation')
      const record = reference as Record<(typeof fields)[number], unknown>
      if (fields.some((field) => typeof record[field] !== 'string' || !(record[field] as string).trim()))
        throw itemError(file, 'task_links reference fields must be non-empty strings')
      if (!validTaskLinkRelations.has(record.relation as string))
        throw itemError(file, 'task_links reference has an unsupported relation')
      const identity = JSON.stringify([provider, record.authority, record.scope, record.id, record.relation])
      if (seen.has(identity)) throw itemError(file, 'task_links repeats a qualified task relation')
      seen.add(identity)
      return record as unknown as TaskLink
    })
  }
  return result
}

const parseHold = (lines: readonly string[], file: string): WorkItemHold => {
  let value: unknown
  try {
    value = parse(`hold:\n${lines.join('\n')}`)
  } catch {
    throw itemError(file, 'hold must be a mapping with reason and condition')
  }
  const hold = (value as { hold?: unknown } | null)?.hold
  if (!hold || typeof hold !== 'object' || Array.isArray(hold))
    throw itemError(file, 'hold must be a mapping with reason and condition')
  const record = hold as Record<string, unknown>
  if (Object.keys(record).some((key) => !['reason', 'condition', 'review', 'trades'].includes(key)))
    throw itemError(file, 'hold may contain only reason, condition, review and trades')
  if (!holdReasons.includes(record['reason'] as HoldReason))
    throw itemError(file, `hold.reason must be one of ${holdReasons.join(', ')}`)
  if (typeof record['condition'] !== 'string' || !record['condition'].trim())
    throw itemError(file, 'hold.condition must name the release condition')
  if (
    record['review'] !== undefined &&
    (typeof record['review'] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(record['review']))
  )
    throw itemError(file, 'hold.review must be an ISO date')
  const trades = record['trades']
  if (
    trades !== undefined &&
    (!Array.isArray(trades) ||
      trades.some((trade) => typeof trade !== 'string' || !TRADE_ID.test(trade)) ||
      new Set(trades).size !== trades.length)
  )
    throw itemError(file, 'hold.trades must list unique TRD identities')
  return {
    reason: record['reason'] as HoldReason,
    condition: record['condition'],
    ...(record['review'] === undefined ? {} : { review: record['review'] as string }),
    ...(trades === undefined ? {} : { trades: trades as string[] })
  }
}

const frontmatter = (contents: string, file: string, adapter: RepositoryPlanningAdapter): Readonly<WorkItemFields> => {
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(contents)
  if (!match?.[1]) throw itemError(file, 'must declare canonical frontmatter')
  const fields: WorkItemFields = {}
  const seen = new Set<string>()
  let adapterField: string | undefined
  const lines = match[1].split('\n')
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] as string
    const entry = /^([a-z_-]+):(?: (.*))?$/.exec(line)
    if (!entry?.[1]) {
      if (adapter === 'kb-streams' && adapterField && (line === '' || /^\s+/.test(line))) continue
      throw itemError(file, 'frontmatter must contain simple key-value fields')
    }
    const [, key, value] = entry
    const common = allowedFields.has(key)
    if (seen.has(key) || (adapter === 'roadmap' && !common))
      throw itemError(file, `has unsupported or repeated field ${key}`)
    seen.add(key)
    adapterField = common ? undefined : key
    if (!common) continue
    if (key === 'task_links' || key === 'hold') {
      if (value)
        throw itemError(
          file,
          key === 'hold'
            ? 'hold must be a mapping with reason and condition'
            : 'task_links must be a nested provider map'
        )
      const nested: string[] = []
      while (index + 1 < lines.length && (lines[index + 1] === '' || /^\s+/.test(lines[index + 1] as string)))
        nested.push(lines[++index] as string)
      if (key === 'hold') fields.hold = parseHold(nested, file)
      else fields.task_links = parseTaskLinks(nested, file)
      continue
    }
    if (!value) throw itemError(file, 'frontmatter must contain simple key-value fields')
    fields[key as WorkItemField] = parseScalar(value)
  }
  for (const field of requiredFields) if (!fields[field]) throw itemError(file, `must declare ${field}`)
  return fields
}

const enumField = <T extends string>(
  fields: Readonly<WorkItemFields>,
  field: WorkItemField,
  values: readonly T[],
  file: string
): T | undefined => {
  const value = fields[field]
  if (value === undefined) return undefined
  if (!values.includes(value as T)) throw itemError(file, `${field} must be one of ${values.join(', ')}`)
  return value as T
}

const slugField = (fields: Readonly<WorkItemFields>, field: WorkItemField, file: string): string | undefined => {
  const value = fields[field]
  if (value !== undefined && !SLUG.test(value)) throw itemError(file, `${field} must be a lowercase kebab-case slug`)
  return value
}

/** A Project or Initiative reference: a bare slug in the own territory, or one qualified by a territory's Capital key. */
export interface RegistryReference {
  readonly territory?: string
  readonly slug: string
}

const TERRITORY = /^[a-z0-9][a-z0-9._-]*$/

/** Splits `<territory>/<slug>` or a bare `<slug>`, where the territory is the local registry key of its Capital. */
export const parseRegistryReference = (value: string): RegistryReference | undefined => {
  const parts = value.split('/')
  if (parts.length === 1) return SLUG.test(value) ? { slug: value } : undefined
  const [territory, slug] = parts as [string, string]
  return parts.length === 2 && TERRITORY.test(territory) && SLUG.test(slug) ? { territory, slug } : undefined
}

const referenceField = (fields: Readonly<WorkItemFields>, field: WorkItemField, file: string): string | undefined => {
  const value = fields[field]
  if (value !== undefined && !parseRegistryReference(value))
    throw itemError(file, `${field} must be a lowercase kebab-case slug, optionally qualified as <territory>/<slug>`)
  return value
}

const adoptedOpenStatuses = new Set<WorkItemStatus>(['draft', 'ready', 'in-progress', 'awaiting-review'])

/** Names each deprecated shape a record carries, so readers report rather than reject it. */
const legacyShapes = (fields: Readonly<WorkItemFields>, status: WorkItemStatus): readonly string[] => [
  ...(fields.theme ? ['theme'] : []),
  ...(legacyWorkItemHorizons.includes(fields.horizon as LegacyWorkItemHorizon) ? [`horizon ${fields.horizon}`] : []),
  ...(fields.waiting_on_trades ? ['waiting_on_trades'] : []),
  ...(fields.intake_disposition || fields.intake_disposition_target ? ['intake_disposition'] : []),
  ...(status === 'done' && fields.horizon && fields.horizon !== 'triage' ? ['horizon on done'] : []),
  ...(workItemHorizons.includes(fields.horizon as WorkItemHorizon) &&
  !isAllowedHorizon(status, fields.horizon as WorkItemHorizon) &&
  status !== 'done'
    ? [`${status} at ${fields.horizon}`]
    : []),
  // The harness tolerates an adopted record without `kind`; a legacy horizon is reported on its own.
  ...(fields.kind === undefined &&
  adoptedOpenStatuses.has(status) &&
  !legacyWorkItemHorizons.includes(fields.horizon as LegacyWorkItemHorizon)
    ? ['missing kind']
    : [])
]

export const parseWorkItem = (contents: string, file: string, planning: RepositoryPlanningSource): WorkItem => {
  /* v8 ignore next -- Every live and historical inventory filters entries through isWorkItemFile first. */
  if (!file.endsWith('.md')) throw itemError(file, 'must use the .md extension')
  const fields = frontmatter(contents, file, planning.adapter)
  const id = fields.id as string
  if (!WORK_ITEM_ID.test(id) || !file.startsWith(`${id}-`))
    throw itemError(file, 'must use a matching work-item identifier')
  if (
    !fields.title ||
    (fields.theme !== undefined && !SLUG.test(fields.theme)) ||
    (fields.horizon !== undefined && !horizons.has(fields.horizon))
  )
    throw itemError(file, 'has invalid title, theme, or horizon')
  if (!statuses.has(fields.status as string)) throw itemError(file, 'has an invalid lifecycle status')
  const status = fields.status as WorkItemStatus
  const horizon = fields.horizon as WorkItemHorizon | LegacyWorkItemHorizon | undefined
  if ((status === 'triage' || status === 'cancelled') && horizon !== undefined)
    throw itemError(file, `must omit horizon at status ${status}`)
  if (horizon === undefined && status !== 'triage' && status !== 'done' && status !== 'cancelled')
    throw itemError(file, `must declare a horizon at status ${status}`)
  if ((horizon === 'hold') !== (fields.hold !== undefined))
    throw itemError(file, 'must carry a hold mapping exactly when its horizon is hold')
  const resolution = enumField(fields, 'resolution', workItemResolutions, file)
  if ((status === 'cancelled') !== (resolution !== undefined))
    throw itemError(file, 'must carry a resolution exactly when it is cancelled')
  const target = fields.resolution_target
  if (resolution !== undefined && targetedResolutions.has(resolution) !== (target !== undefined))
    throw itemError(
      file,
      `resolution ${resolution} ${targetedResolutions.has(resolution) ? 'requires' : 'forbids'} resolution_target`
    )
  if (target !== undefined && (!WORK_ITEM_ID.test(target) || target === id))
    throw itemError(file, 'resolution_target must be another canonical work-item identifier')
  const baseline = fields['baseline_ref']
  if (baseline !== 'null' && !/^[a-f0-9]{40}$/.test(baseline as string))
    throw itemError(file, 'baseline_ref must be null or a full commit ID')
  const createdAt = timestamp(fields.created_at as string, file, 'created_at')
  const updatedAt = timestamp(fields.updated_at as string, file, 'updated_at')
  if (Date.parse(createdAt) > Date.parse(updatedAt))
    throw itemError(file, 'created_at must not be later than updated_at')
  const kind = enumField(fields, 'kind', workItemKinds, file)
  const purpose = enumField(fields, 'purpose', workItemPurposes, file)
  const project = referenceField(fields, 'project', file)
  const initiative = referenceField(fields, 'initiative', file)
  const component = slugField(fields, 'component', file)
  if (component !== undefined && !planning.components.has(component))
    throw itemError(file, `component ${component} must be declared in [skills.ki-work-roadmap].components`)
  const legacy = legacyShapes(fields, status)
  return {
    id,
    ...(fields.area ? { area: fields.area } : {}),
    title: fields.title as string,
    ...(fields.theme ? { theme: fields.theme } : {}),
    ...(horizon ? { horizon } : {}),
    status,
    ...(kind ? { kind } : {}),
    ...(purpose ? { purpose } : {}),
    ...(project ? { project } : {}),
    ...(initiative ? { initiative } : {}),
    ...(component ? { component } : {}),
    ...(fields.hold ? { hold: fields.hold } : {}),
    ...(resolution ? { resolution } : {}),
    ...(target ? { resolutionTarget: target } : {}),
    blocks: parseList(fields.blocks as string, file, 'blocks'),
    blockedBy: parseList(fields['blocked_by'] as string, file, 'blocked_by'),
    baselineRef: baseline === 'null' ? null : (baseline as string),
    createdAt,
    updatedAt,
    ...(fields.transferred_from ? { transferredFrom: fields.transferred_from } : {}),
    ...(fields.task_links ? { taskLinks: fields.task_links } : {}),
    ...(legacy.length ? { legacy } : {})
  }
}

/** Reads a record into the model: a legacy Triage horizon is intake, and Waiting for and Parked are Hold. */
export const workItemLane = (item: WorkItem): WorkItemLane => {
  if (item.status === 'done' || item.status === 'cancelled') return item.status
  if (item.status === 'triage' || item.horizon === 'triage') return 'triage'
  if (item.horizon === 'waiting-for' || item.horizon === 'parked') return 'hold'
  return item.horizon as WorkItemHorizon
}

/** Open records carry neither terminal status. */
export const isOpenWorkItem = (item: WorkItem): boolean => item.status !== 'done' && item.status !== 'cancelled'

const readItem = async (
  directory: string,
  file: string,
  planning: RepositoryPlanningSource
): Promise<WorkItemRecord> => {
  const path = join(directory, file)
  const state = await lstat(path)
  if (!state.isFile() || state.isSymbolicLink()) throw itemError(file, 'must be a regular file')
  const contents = await readFile(path, 'utf8')
  return { item: parseWorkItem(contents, file, planning), file, path, contents }
}

export interface WorkItemRecordInventory {
  readonly records: readonly WorkItemRecord[]
  readonly faults: readonly WorkItemFault[]
}

export const readWorkItemRecordInventory = async (
  repository: string,
  planning: RepositoryPlanningSource
): Promise<WorkItemRecordInventory> => {
  const roadmapDirectory = planning.directory
  const directory = join(repository, roadmapDirectory)
  const state = await roadmapDirectoryState(directory)
  if (!state?.isDirectory() || state.isSymbolicLink())
    throw new KiError(`repository ${repository} has no physical ${roadmapDirectory} directory`, 2)
  const entries = await readdir(directory)
  const outcomes = await Promise.all(
    entries
      .filter((entry) => isWorkItemFile(entry, planning.adapter))
      .sort()
      .map(async (entry): Promise<{ record: WorkItemRecord } | { fault: WorkItemFault }> => {
        try {
          return { record: await readItem(directory, entry, planning) }
        } catch (error) {
          // readItem normalizes every rejection to a KiError before this boundary.
          /* v8 ignore next */
          return { fault: { file: entry, message: error instanceof Error ? error.message : String(error) } }
        }
      })
  )
  return {
    records: outcomes
      .flatMap((outcome) => ('record' in outcome ? [outcome.record] : []))
      .sort((left, right) => left.item.id.localeCompare(right.item.id)),
    faults: outcomes.flatMap((outcome) => ('fault' in outcome ? [outcome.fault] : []))
  }
}

const readWorkItemRecords = async (
  repository: string,
  planning: RepositoryPlanningSource
): Promise<readonly WorkItemRecord[]> => {
  const { records, faults } = await readWorkItemRecordInventory(repository, planning)
  const fault = faults[0]
  if (fault) throw new KiError(fault.message, 2)
  return records
}

export const readWorkItems = async (
  repository: string,
  planning: RepositoryPlanningSource
): Promise<readonly WorkItem[]> => (await readWorkItemRecords(repository, planning)).map(({ item }) => item)

/** Reports whether the selected adapter root exists; a non-directory root still exists and remains a diagnostic. */
export const hasWorkItemRoot = async (repository: string, planning: RepositoryPlanningSource): Promise<boolean> =>
  (await roadmapDirectoryState(join(repository, planning.directory))) !== undefined

/** Lists no inventory when a repository has not created its selected adapter root yet. One unreadable item becomes a fault; the readable items still list. */
export const readWorkItemInventoryIfPresent = async (
  repository: string,
  planning: RepositoryPlanningSource
): Promise<undefined | WorkItemInventory> => {
  if (!(await hasWorkItemRoot(repository, planning))) return undefined
  const { records, faults } = await readWorkItemRecordInventory(repository, planning)
  return { items: records.map(({ item }) => item), faults }
}

const workItemRecord = async (
  repository: string,
  planning: RepositoryPlanningSource,
  id: string
): Promise<WorkItemRecord> => {
  const matches = (await readWorkItemRecords(repository, planning)).filter((record) => record.item.id === id)
  // The CLI resolves this exact cardinality before calling the publisher; retain the core guard for future callers.
  /* v8 ignore next */
  if (matches.length !== 1) throw new KiError(`repository ${repository} must contain exactly one work item ${id}`, 2)
  return matches[0] as WorkItemRecord
}

export const utcSecond = (milliseconds: number): string =>
  new Date(Math.floor(milliseconds / 1000) * 1000).toISOString().replace('.000Z', 'Z')

/** The next `updated_at` for a governed mutation: now, or one second after the previous value. */
export const advancedTimestamp = (previous: string, now: number): string =>
  utcSecond(Math.max(now, Date.parse(previous) + 1000))

/** Renders a hold mapping as indented frontmatter lines. */
export const renderHold = (hold: WorkItemHold): readonly string[] => [
  'hold:',
  `  reason: ${hold.reason}`,
  `  condition: ${JSON.stringify(hold.condition)}`,
  ...(hold.review ? [`  review: ${JSON.stringify(hold.review)}`] : []),
  ...(hold.trades?.length ? [`  trades: [${hold.trades.join(', ')}]`] : [])
]

const renderHorizon = (
  contents: string,
  horizon: WorkItemHorizon,
  hold: WorkItemHold | undefined,
  updatedAt: string
): string => {
  return contents.replace(/^---\n([\s\S]*?)\n---/, (_frontmatter, fields: string) => {
    const lines: string[] = []
    const source = fields.split('\n')
    for (let index = 0; index < source.length; index++) {
      const line = source[index] as string
      if (line === 'hold:') {
        while (index + 1 < source.length && /^\s+/.test(source[index + 1] as string)) index++
        continue
      }
      if (line.startsWith('horizon: ')) {
        lines.push(`horizon: ${horizon}`, ...(hold ? renderHold(hold) : []))
        continue
      }
      lines.push(line.startsWith('updated_at: ') ? `updated_at: ${updatedAt}` : line)
    }
    return `---\n${lines.join('\n')}\n---`
  })
}

export const updateWorkItemHorizon = async (
  repository: string,
  planning: RepositoryPlanningSource,
  id: string,
  horizon: WorkItemHorizon,
  hold: WorkItemHold | undefined,
  now: number
): Promise<WorkItem> => {
  const record = await workItemRecord(repository, planning, id)
  const updatedAt = advancedTimestamp(record.item.updatedAt, now)
  const content = renderHorizon(record.contents, horizon, hold, updatedAt)
  const writes = await prepareWrites(repository, [{ path: join(planning.directory, record.file), content }])
  await publishWrites(writes, false)
  const { hold: _previous, ...item } = record.item
  return { ...item, horizon, ...(hold ? { hold } : {}), updatedAt }
}

/** A selected terminal (`done` or `cancelled`) record: its item and repository-relative record path. */
export interface PrunableWorkItem {
  readonly item: WorkItem
  readonly path: string
}

/** Selects every terminal record, or exactly the named terminal record, without changing the repository. */
const isOpenRecord = ({ item }: { readonly item: WorkItem }): boolean => isOpenWorkItem(item)

export const selectTerminalWorkItems = async (
  repository: string,
  planning: RepositoryPlanningSource,
  id?: string
): Promise<readonly PrunableWorkItem[]> => {
  const records = await readWorkItemRecords(repository, planning)
  const selected =
    id === undefined
      ? records.filter(({ item }) => !isOpenWorkItem(item))
      : records.filter(({ item }) => item.id === id)
  if (id !== undefined && selected.length !== 1)
    throw new KiError(`repository ${repository} must contain exactly one work item ${id}`, 2)
  if (selected.some(isOpenRecord)) throw new KiError(`work item ${id} must be done or cancelled before pruning`, 2)
  return selected.map(({ item, file }) => ({ item, path: join(planning.directory, file) }))
}

export const removeWorkItemRecords = async (
  repository: string,
  records: readonly PrunableWorkItem[]
): Promise<void> => {
  await Promise.all(records.map(({ path }) => rm(join(repository, path))))
}
