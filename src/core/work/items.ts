import { lstat, readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import { KiError } from '../errors.ts'
import { prepareWrites, publishWrites } from '../filesystem/index.ts'
import type { RepositoryPlanningAdapter, RepositoryPlanningSource } from './planning.ts'

const ISSUE_LEDGER = '_ISSUES.md'
const KB_ROADMAP_INDEX = 'Roadmap.md'
const requiredFields = [
  'id',
  'title',
  'theme',
  'horizon',
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
  'waiting_on_trades',
  'intake_disposition',
  'intake_disposition_target',
  'transferred_from',
  'housekeeping_template',
  'scheduled_for'
] as const
type WorkItemField = RequiredField | (typeof optionalFields)[number]
type WorkItemFields = Partial<Record<WorkItemField, string>> & { task_links?: TaskLinks }

const allowedFields = new Set<string>([...requiredFields, ...optionalFields, 'task_links'])
export const workItemHorizons = ['now', 'next', 'soon', 'waiting-for', 'parked', 'future', 'triage'] as const
export type WorkItemHorizon = (typeof workItemHorizons)[number]
const horizons = new Set<WorkItemHorizon>(workItemHorizons)
const statuses = new Set<WorkItemStatus>(['draft', 'ready', 'in-progress', 'awaiting-review', 'done'])
const taskLinkRelations = ['evaluation', 'implementation', 'review', 'integration', 'coordination', 'related'] as const
export type TaskLinkRelation = (typeof taskLinkRelations)[number]
const validTaskLinkRelations = new Set<string>(taskLinkRelations)

export const isWorkItemFile = (file: string, adapter: RepositoryPlanningAdapter): boolean =>
  file.endsWith('.md') && file !== ISSUE_LEDGER && (adapter !== 'kb-streams' || file !== KB_ROADMAP_INDEX)

export type WorkItemStatus = 'draft' | 'ready' | 'in-progress' | 'awaiting-review' | 'done'

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
  readonly theme: string
  readonly horizon: WorkItemHorizon
  readonly status: WorkItemStatus
  readonly blocks: readonly string[]
  readonly blockedBy: readonly string[]
  readonly baselineRef: null | string
  readonly createdAt: string
  readonly updatedAt: string
  readonly transferredFrom?: string
  readonly taskLinks?: TaskLinks
}

interface WorkItemRecord {
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
    if (key === 'task_links') {
      if (value) throw itemError(file, 'task_links must be a nested provider map')
      const nested: string[] = []
      while (index + 1 < lines.length && (lines[index + 1] === '' || /^\s+/.test(lines[index + 1] as string)))
        nested.push(lines[++index] as string)
      fields.task_links = parseTaskLinks(nested, file)
      continue
    }
    if (!value) throw itemError(file, 'frontmatter must contain simple key-value fields')
    fields[key as WorkItemField] = parseScalar(value)
  }
  for (const field of requiredFields) if (!fields[field]) throw itemError(file, `must declare ${field}`)
  return fields
}

export const parseWorkItem = (contents: string, file: string, adapter: RepositoryPlanningAdapter): WorkItem => {
  /* v8 ignore next -- Every live and historical inventory filters entries through isWorkItemFile first. */
  if (!file.endsWith('.md')) throw itemError(file, 'must use the .md extension')
  const fields = frontmatter(contents, file, adapter)
  const id = fields.id as string
  if (!/^[A-Z0-9][A-Z0-9-]{1,23}-\d{3,}$/.test(id) || !file.startsWith(`${id}-`))
    throw itemError(file, 'must use a matching work-item identifier')
  if (!fields.title || !/^[a-z0-9-]+$/.test(fields.theme as string) || !horizons.has(fields.horizon as WorkItemHorizon))
    throw itemError(file, 'has invalid title, theme, or horizon')
  if (!statuses.has(fields.status as WorkItemStatus)) throw itemError(file, 'has an invalid lifecycle status')
  const baseline = fields['baseline_ref']
  if (baseline !== 'null' && !/^[a-f0-9]{40}$/.test(baseline as string))
    throw itemError(file, 'baseline_ref must be null or a full commit ID')
  const createdAt = timestamp(fields.created_at as string, file, 'created_at')
  const updatedAt = timestamp(fields.updated_at as string, file, 'updated_at')
  if (Date.parse(createdAt) > Date.parse(updatedAt))
    throw itemError(file, 'created_at must not be later than updated_at')
  return {
    id,
    ...(fields.area ? { area: fields.area } : {}),
    title: fields.title as string,
    theme: fields.theme as string,
    horizon: fields.horizon as WorkItemHorizon,
    status: fields.status as WorkItemStatus,
    blocks: parseList(fields.blocks as string, file, 'blocks'),
    blockedBy: parseList(fields['blocked_by'] as string, file, 'blocked_by'),
    baselineRef: baseline === 'null' ? null : (baseline as string),
    createdAt,
    updatedAt,
    ...(fields.transferred_from ? { transferredFrom: fields.transferred_from } : {}),
    ...(fields.task_links ? { taskLinks: fields.task_links } : {})
  }
}

const readItem = async (
  directory: string,
  file: string,
  adapter: RepositoryPlanningAdapter
): Promise<WorkItemRecord> => {
  const path = join(directory, file)
  const state = await lstat(path)
  if (!state.isFile() || state.isSymbolicLink()) throw itemError(file, 'must be a regular file')
  const contents = await readFile(path, 'utf8')
  return { item: parseWorkItem(contents, file, adapter), file, path, contents }
}

interface WorkItemRecordInventory {
  readonly records: readonly WorkItemRecord[]
  readonly faults: readonly WorkItemFault[]
}

const readWorkItemRecordInventory = async (
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
          return { record: await readItem(directory, entry, planning.adapter) }
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

const utcSecond = (milliseconds: number): string =>
  new Date(Math.floor(milliseconds / 1000) * 1000).toISOString().replace('.000Z', 'Z')

const renderHorizon = (contents: string, horizon: WorkItemHorizon, updatedAt: string): string => {
  return contents.replace(/^---\n([\s\S]*?)\n---/, (_frontmatter, fields: string) => {
    const withHorizon = fields.replace(/^horizon: .+$/m, `horizon: ${horizon}`)
    const withTimestamp = withHorizon.replace(/^updated_at: .+$/m, `updated_at: ${updatedAt}`)
    return `---\n${withTimestamp}\n---`
  })
}

export const updateWorkItemHorizon = async (
  repository: string,
  planning: RepositoryPlanningSource,
  id: string,
  horizon: WorkItemHorizon,
  now: number
): Promise<WorkItem> => {
  const record = await workItemRecord(repository, planning, id)
  const updatedAt = utcSecond(Math.max(now, Date.parse(record.item.updatedAt) + 1000))
  const content = renderHorizon(record.contents, horizon, updatedAt)
  const writes = await prepareWrites(repository, [{ path: join(planning.directory, record.file), content }])
  await publishWrites(writes, false)
  return { ...record.item, horizon, updatedAt }
}

export const pruneDoneWorkItems = async (
  repository: string,
  planning: RepositoryPlanningSource,
  id?: string
): Promise<readonly WorkItem[]> => {
  const records = await readWorkItemRecords(repository, planning)
  const selected =
    id === undefined
      ? records.filter(({ item }) => item.status === 'done')
      : records.filter(({ item }) => item.id === id)
  if (id !== undefined && selected.length !== 1)
    throw new KiError(`repository ${repository} must contain exactly one work item ${id}`, 2)
  if (selected.some(({ item }) => item.status !== 'done'))
    throw new KiError(`work item ${id} must be done before pruning`, 2)
  await Promise.all(selected.map(({ path }) => rm(path)))
  return selected.map(({ item }) => item)
}
