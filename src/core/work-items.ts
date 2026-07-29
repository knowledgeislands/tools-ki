import { lstat, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { KiError } from './errors.ts'

const ROADMAP_DIRECTORY = 'docs/roadmap'
const requiredFields = ['id', 'title', 'theme', 'horizon', 'status', 'blocks', 'blocked-by', 'baseline-ref'] as const
type RequiredField = (typeof requiredFields)[number]
type WorkItemField = RequiredField | 'candidate' | 'transferred-from'
type WorkItemFields = Partial<Record<WorkItemField, string>>

const allowedFields = new Set<WorkItemField>([...requiredFields, 'candidate', 'transferred-from'])
const horizons = new Set(['blocking', 'next', 'soon', 'waiting-for', 'parked', 'future'])
const statuses = new Set<WorkItemStatus>(['open', 'ready', 'in-progress', 'acceptance', 'done'])

export type WorkItemStatus = 'open' | 'ready' | 'in-progress' | 'acceptance' | 'done'

export interface WorkItem {
  readonly id: string
  readonly title: string
  readonly theme: string
  readonly horizon: string
  readonly status: WorkItemStatus
  readonly blocks: readonly string[]
  readonly blockedBy: readonly string[]
  readonly baselineRef: null | string
  readonly candidate?: true
  readonly transferredFrom?: string
}

const itemError = (file: string, message: string): KiError => new KiError(`work item ${file} ${message}`, 2)

const parseList = (value: string, file: string, field: string): readonly string[] => {
  if (!/^\[(?:[A-Z0-9-]+(?:, [A-Z0-9-]+)*)?\]$/.test(value)) throw itemError(file, `${field} must be an identifier array`)
  return value.slice(1, -1).split(', ').filter(Boolean)
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
    fields[key as WorkItemField] = value
  }
  for (const field of requiredFields) if (!fields[field]) throw itemError(file, `must declare ${field}`)
  return fields
}

const readItem = async (directory: string, file: string): Promise<WorkItem> => {
  /* v8 ignore next -- readWorkItems only passes .md directory entries. */
  if (!file.endsWith('.md')) throw itemError(file, 'must use the .md extension')
  const path = join(directory, file)
  const state = await lstat(path)
  if (!state.isFile() || state.isSymbolicLink()) throw itemError(file, 'must be a regular file')
  const fields = frontmatter(await readFile(path, 'utf8'), file)
  const id = fields.id as string
  if (!/^[A-Z][A-Z0-9-]*-\d{3}$/.test(id) || !file.startsWith(`${id}-`)) throw itemError(file, 'must use a matching work-item identifier')
  if (!fields.title || !/^[a-z0-9-]+$/.test(fields.theme as string) || !horizons.has(fields.horizon as string))
    throw itemError(file, 'has invalid title, theme, or horizon')
  if (!statuses.has(fields.status as WorkItemStatus)) throw itemError(file, 'has an invalid lifecycle status')
  if (fields.horizon === 'future' ? fields.candidate !== 'true' : fields.candidate !== undefined)
    throw itemError(file, 'must use candidate: true only for future items')
  const baseline = fields['baseline-ref']
  if (baseline !== 'null' && !/^[a-f0-9]{40}$/.test(baseline as string))
    throw itemError(file, 'baseline-ref must be null or a full commit ID')
  return {
    id,
    title: fields.title as string,
    theme: fields.theme as string,
    horizon: fields.horizon as string,
    status: fields.status as WorkItemStatus,
    blocks: parseList(fields.blocks as string, file, 'blocks'),
    blockedBy: parseList(fields['blocked-by'] as string, file, 'blocked-by'),
    baselineRef: baseline === 'null' ? null : (baseline as string),
    ...(fields.candidate ? { candidate: true } : {}),
    ...(fields['transferred-from'] ? { transferredFrom: fields['transferred-from'] } : {})
  }
}

export const readWorkItems = async (repository: string): Promise<readonly WorkItem[]> => {
  const directory = join(repository, ROADMAP_DIRECTORY)
  const state = await lstat(directory).catch(() => undefined)
  if (!state?.isDirectory() || state.isSymbolicLink())
    throw new KiError(`repository ${repository} has no physical docs/roadmap directory`, 2)
  const entries = await readdir(directory)
  const items = await Promise.all(entries.filter((entry) => entry.endsWith('.md')).map((entry) => readItem(directory, entry)))
  return items.sort((left, right) => left.id.localeCompare(right.id))
}
