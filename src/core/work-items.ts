import { lstat, readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { KiError } from './errors.ts'
import { prepareWrites, publishWrites } from './transaction.ts'

const ROADMAP_DIRECTORY = 'docs/roadmap'
const requiredFields = ['id', 'title', 'theme', 'horizon', 'status', 'blocks', 'blocked-by', 'baseline-ref'] as const
type RequiredField = (typeof requiredFields)[number]
type WorkItemField = RequiredField | 'candidate' | 'transferred-from'
type WorkItemFields = Partial<Record<WorkItemField, string>>

const allowedFields = new Set<WorkItemField>([...requiredFields, 'candidate', 'transferred-from'])
export const workItemHorizons = ['now', 'next', 'soon', 'waiting-for', 'parked', 'future'] as const
export type WorkItemHorizon = (typeof workItemHorizons)[number]
const horizons = new Set<WorkItemHorizon>(workItemHorizons)
const statuses = new Set<WorkItemStatus>(['draft', 'ready', 'in-progress', 'awaiting-review', 'done'])

export type WorkItemStatus = 'draft' | 'ready' | 'in-progress' | 'awaiting-review' | 'done'

export interface WorkItem {
  readonly id: string
  readonly title: string
  readonly theme: string
  readonly horizon: WorkItemHorizon
  readonly status: WorkItemStatus
  readonly blocks: readonly string[]
  readonly blockedBy: readonly string[]
  readonly baselineRef: null | string
  readonly candidate?: true
  readonly transferredFrom?: string
}

interface WorkItemRecord {
  readonly item: WorkItem
  readonly file: string
  readonly path: string
  readonly contents: string
}

const itemError = (file: string, message: string): KiError => new KiError(`work item ${file} ${message}`, 2)

const parseList = (value: string, file: string, field: string): readonly string[] => {
  if (!/^\[(?:[A-Z0-9-]+(?:, [A-Z0-9-]+)*)?\]$/.test(value))
    throw itemError(file, `${field} must be an identifier array`)
  return value.slice(1, -1).split(', ').filter(Boolean)
}

const parseScalar = (value: string): string => {
  const quote = value.at(0)
  return (quote === "'" || quote === '"') && value.endsWith(quote) ? value.slice(1, -1) : value
}

const frontmatter = (contents: string, file: string): Readonly<WorkItemFields> => {
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(contents)
  if (!match?.[1]) throw itemError(file, 'must declare canonical frontmatter')
  const fields: WorkItemFields = {}
  for (const line of match[1].split('\n')) {
    const entry = /^([a-z-]+): (.+)$/.exec(line)
    if (!entry?.[1] || entry[2] === undefined) throw itemError(file, 'frontmatter must contain simple key-value fields')
    const [, key, value] = entry
    if (!allowedFields.has(key as WorkItemField) || Object.hasOwn(fields, key))
      throw itemError(file, `has unsupported or repeated field ${key}`)
    fields[key as WorkItemField] = parseScalar(value)
  }
  for (const field of requiredFields) if (!fields[field]) throw itemError(file, `must declare ${field}`)
  return fields
}

const readItem = async (directory: string, file: string): Promise<WorkItemRecord> => {
  /* v8 ignore next -- readWorkItems only passes .md directory entries. */
  if (!file.endsWith('.md')) throw itemError(file, 'must use the .md extension')
  const path = join(directory, file)
  const state = await lstat(path)
  if (!state.isFile() || state.isSymbolicLink()) throw itemError(file, 'must be a regular file')
  const contents = await readFile(path, 'utf8')
  const fields = frontmatter(contents, file)
  const id = fields.id as string
  if (!/^[A-Z][A-Z0-9-]*-\d{3}$/.test(id) || !file.startsWith(`${id}-`))
    throw itemError(file, 'must use a matching work-item identifier')
  if (!fields.title || !/^[a-z0-9-]+$/.test(fields.theme as string) || !horizons.has(fields.horizon as WorkItemHorizon))
    throw itemError(file, 'has invalid title, theme, or horizon')
  if (!statuses.has(fields.status as WorkItemStatus)) throw itemError(file, 'has an invalid lifecycle status')
  if (fields.horizon === 'future' ? fields.candidate !== 'true' : fields.candidate !== undefined)
    throw itemError(file, 'must use candidate: true only for future items')
  const baseline = fields['baseline-ref']
  if (baseline !== 'null' && !/^[a-f0-9]{40}$/.test(baseline as string))
    throw itemError(file, 'baseline-ref must be null or a full commit ID')
  const item: WorkItem = {
    id,
    title: fields.title as string,
    theme: fields.theme as string,
    horizon: fields.horizon as WorkItemHorizon,
    status: fields.status as WorkItemStatus,
    blocks: parseList(fields.blocks as string, file, 'blocks'),
    blockedBy: parseList(fields['blocked-by'] as string, file, 'blocked-by'),
    baselineRef: baseline === 'null' ? null : (baseline as string),
    ...(fields.candidate ? { candidate: true } : {}),
    ...(fields['transferred-from'] ? { transferredFrom: fields['transferred-from'] } : {})
  }
  return { item, file, path, contents }
}

const readWorkItemRecords = async (repository: string): Promise<readonly WorkItemRecord[]> => {
  const directory = join(repository, ROADMAP_DIRECTORY)
  const state = await lstat(directory).catch(() => undefined)
  if (!state?.isDirectory() || state.isSymbolicLink())
    throw new KiError(`repository ${repository} has no physical docs/roadmap directory`, 2)
  const entries = await readdir(directory)
  const records = await Promise.all(
    entries.filter((entry) => entry.endsWith('.md')).map((entry) => readItem(directory, entry))
  )
  return records.sort((left, right) => left.item.id.localeCompare(right.item.id))
}

export const readWorkItems = async (repository: string): Promise<readonly WorkItem[]> =>
  (await readWorkItemRecords(repository)).map(({ item }) => item)

const workItemRecord = async (repository: string, id: string): Promise<WorkItemRecord> => {
  const matches = (await readWorkItemRecords(repository)).filter((record) => record.item.id === id)
  // The CLI resolves this exact cardinality before calling the publisher; retain the core guard for future callers.
  /* v8 ignore next */
  if (matches.length !== 1) throw new KiError(`repository ${repository} must contain exactly one work item ${id}`, 2)
  return matches[0] as WorkItemRecord
}

const renderHorizon = (contents: string, horizon: WorkItemHorizon): string => {
  return contents.replace(/^---\n([\s\S]*?)\n---/, (_frontmatter, fields: string) => {
    const withHorizon = fields.replace(/^horizon: .+$/m, `horizon: ${horizon}`)
    const next =
      horizon === 'future'
        ? withHorizon.replace(/^horizon: .+$/m, '$&\ncandidate: true')
        : withHorizon
            .split('\n')
            .filter((line) => !line.startsWith('candidate: '))
            .join('\n')
    return `---\n${next}\n---`
  })
}

export const updateWorkItemHorizon = async (
  repository: string,
  id: string,
  horizon: WorkItemHorizon
): Promise<WorkItem> => {
  const record = await workItemRecord(repository, id)
  const content = renderHorizon(record.contents, horizon)
  const writes = await prepareWrites(repository, [{ path: join(ROADMAP_DIRECTORY, record.file), content }])
  await publishWrites(writes, false)
  const { candidate: _candidate, ...item } = record.item
  return { ...item, horizon, ...(horizon === 'future' ? { candidate: true } : {}) }
}

export const pruneDoneWorkItems = async (repository: string, id?: string): Promise<readonly WorkItem[]> => {
  const records = await readWorkItemRecords(repository)
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
