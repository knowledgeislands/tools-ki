import { createHash } from 'node:crypto'
import { parse } from 'yaml'
import { KiError } from '../errors.ts'

export type BatchAuthorityMode = 'reviewed-items' | 'outcome'
export type BatchCompletionTarget = 'awaiting-review' | 'done'
export type BatchItemResult = BatchCompletionTarget | 'parked' | 'stopped'

export interface BatchLedgerEntry {
  readonly itemId: string
  readonly result: BatchItemResult
  readonly baseline: string
  readonly resultCommit?: string
  readonly exception?: string
}

export interface BatchCloseEvidence {
  readonly completionTarget: BatchCompletionTarget
  readonly commit: string
}

export interface BatchRecord {
  readonly shape: 'current' | 'retained-legacy'
  readonly id: string
  readonly repository: string
  readonly approvedAt: string
  readonly authorityMode: BatchAuthorityMode
  readonly authorityEvidence?: string
  readonly approvedPayloadSha256: string
  readonly expiresAt: string
  readonly itemIds: readonly string[]
  readonly completionTarget: BatchCompletionTarget
  readonly runId: string
  readonly runStarted: boolean
  readonly entries: readonly BatchLedgerEntry[]
  readonly closed?: BatchCloseEvidence
  readonly contents: string
}

export interface RenderBatchOptions {
  readonly id: string
  readonly repository: string
  readonly approvedAt: string
  readonly authorityMode: BatchAuthorityMode
  readonly authorityEvidence?: string
  readonly expiresAt: string
  readonly itemIds: readonly string[]
  readonly completionTarget: BatchCompletionTarget
}

const CURRENT_FIELDS = new Set([
  'id',
  'repository',
  'approved',
  'approved_at',
  'authority_mode',
  'authority_evidence',
  'approved_payload_sha256',
  'expires_at',
  'item_ids',
  'completion_target',
  'policy'
])

const RETAINED_FIELDS = new Set([
  'id',
  'repository',
  'approved',
  'approved_at',
  'authority_mode',
  'authority_evidence',
  'approved_payload_sha256',
  'run_id',
  'timebox_ends_at',
  'item_ids',
  'completion_target',
  'mandatory_stops',
  'closure_item_ids'
])

const identifier = /^[A-Z][A-Z0-9-]*-\d{3}$/
const batchIdentifier = /^[A-Z][A-Z0-9-]*-BATCH-\d{3}$/
const commit = /^[a-f0-9]{40}$/
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
const runLedgerHeading = /^## Run ledger[ \t]*$/m

const fail = (message: string): never => {
  throw new KiError(`batch record ${message}`)
}

const timestamp = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !timestampPattern.test(value) || Number.isNaN(Date.parse(value)))
    return fail(`${label} must be a canonical UTC timestamp`)
  return value
}

const identifiers = (value: unknown): readonly string[] => {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.some((item) => typeof item !== 'string' || !identifier.test(item))
  )
    return fail('item_ids must be a non-empty identifier array')
  const values = value as readonly string[]
  if (new Set(values).size !== values.length) return fail('repeats an item identifier')
  return values
}

const optionalIdentifiers = (value: unknown): readonly string[] => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !identifier.test(item)))
    return fail('closure_item_ids must be an identifier array')
  const values = value as readonly string[]
  if (new Set(values).size !== values.length) return fail('repeats a closure item identifier')
  return values
}

const nonEmptyStrings = (value: unknown, label: string): readonly string[] => {
  if (!Array.isArray(value) || !value.length || value.some((item) => typeof item !== 'string' || !item.trim()))
    return fail(`${label} must be a non-empty string array`)
  return value as readonly string[]
}

const frontmatter = (contents: string): { readonly fields: Record<string, unknown>; readonly body: string } => {
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(contents)
  if (!match?.[1]) return fail('has invalid frontmatter')
  try {
    const value = parse(match[1]) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('has invalid frontmatter')
    return { fields: value as Record<string, unknown>, body: contents.slice(match[0].length) }
  } catch (error) {
    if (error instanceof KiError) throw error
    return fail('has invalid frontmatter')
  }
}

const payloadBody = (body: string): string => {
  const sections = body.split(runLedgerHeading)
  if (sections.length > 2) return fail('contains more than one run ledger')
  const protectedBody = sections[0] as string
  if (sections.length !== 2) return protectedBody
  return protectedBody.endsWith('\n\n') ? protectedBody.slice(0, -1) : protectedBody
}

export const approvedPayloadSha256 = (contents: string): string => {
  const parsed = frontmatter(contents)
  const protectedFields = Object.fromEntries(
    Object.entries(parsed.fields)
      .filter(([field]) => field !== 'approved_payload_sha256')
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
  )
  const payload = JSON.stringify({ frontmatter: protectedFields, body: payloadBody(parsed.body) })
  return createHash('sha256').update(payload).digest('hex')
}

const optionalCommit = (value: string): string | undefined => {
  if (value === '—') return undefined
  return /^`([a-f0-9]{40})`$/.exec(value)?.[1]
}

const parseCurrentLedger = (
  body: string,
  id: string,
  payloadSha256: string
): Pick<BatchRecord, 'runStarted' | 'entries' | 'closed'> => {
  const sections = body.split(runLedgerHeading)
  if (sections.length === 1) return { runStarted: false, entries: [] }
  const lines = (sections[1] as string).trim().split('\n')
  const marker = /^<!-- ki-batch-run: ([A-Z][A-Z0-9-]*-RUN-\d{3}) ([a-f0-9]{64}) -->$/.exec(lines[0] as string)
  if (!marker) return fail('run ledger lacks an approval binding')
  if (marker[1] !== `${id}-RUN-001` || marker[2] !== payloadSha256)
    return fail('run ledger binds another approval payload or run')

  const remaining = lines.slice(1).filter((line) => line.length > 0)
  let closed: BatchCloseEvidence | undefined
  const closeLine = remaining.at(-1)
  const closeMatch =
    /^<!-- ki-batch-close: [A-Z][A-Z0-9-]*-BATCH-\d{3} (awaiting-review|done) ([a-f0-9]{40}) -->$/.exec(closeLine ?? '')
  if (closeMatch) {
    const closeValue = closeLine as string
    if (!closeValue.startsWith(`<!-- ki-batch-close: ${id} `)) return fail('close evidence names another batch')
    closed = { completionTarget: closeMatch[1] as BatchCompletionTarget, commit: closeMatch[2] as string }
    remaining.pop()
  }

  if (!remaining.length) return { runStarted: true, entries: [], ...(closed ? { closed } : {}) }
  if (
    remaining[0] !== '| Item | Result | Baseline | Result commit | Exception |' ||
    remaining[1] !== '| --- | --- | --- | --- | --- |'
  )
    return fail('run ledger table is malformed')

  const entries = remaining.slice(2).map((line): BatchLedgerEntry => {
    const match =
      /^\| ([A-Z][A-Z0-9-]*-\d{3}) \| (awaiting-review|done|parked|stopped) \| (`[a-f0-9]{40}`|—) \| (`[a-f0-9]{40}`|—) \| ([^|\r\n]+) \|$/.exec(
        line
      )
    if (!match) return fail(`run ledger row is malformed: ${line}`)
    const baseline = match[3] as string
    const resultCommit = match[4] as string
    return {
      itemId: match[1] as string,
      result: match[2] as BatchItemResult,
      baseline: optionalCommit(baseline) ?? '—',
      ...(optionalCommit(resultCommit) ? { resultCommit: optionalCommit(resultCommit) } : {}),
      ...(match[5] === 'None' ? {} : { exception: match[5] })
    }
  })
  if (new Set(entries.map((entry) => entry.itemId)).size !== entries.length)
    return fail('run ledger repeats an item result')
  return { runStarted: true, entries, ...(closed ? { closed } : {}) }
}

const parseRetainedBinding = (body: string, runId: string, payloadSha256: string): boolean => {
  const sections = body.split(runLedgerHeading)
  if (sections.length === 1) return false
  const marker = /^<!-- ki-batch-run: ([A-Z][A-Z0-9-]*-RUN-\d{3}) ([a-f0-9]{64}) -->$/m.exec(sections[1] as string)
  if (!marker) return fail('run ledger lacks an approval binding')
  if (marker[1] !== runId || marker[2] !== payloadSha256)
    return fail('run ledger binds another approval payload or run')
  return true
}

const completionTarget = (value: unknown): BatchCompletionTarget => {
  if (value !== 'awaiting-review' && value !== 'done') return fail('has an invalid completion target')
  return value
}

export const parseBatchRecord = (contents: string, filename: string, repositoryIdentity: string): BatchRecord => {
  const { fields, body } = frontmatter(contents)
  const current = fields['policy'] !== undefined || fields['expires_at'] !== undefined
  const allowed = current ? CURRENT_FIELDS : RETAINED_FIELDS
  if (Object.keys(fields).some((field) => !allowed.has(field))) return fail('has unsupported fields')

  const id = fields['id']
  if (typeof id !== 'string' || !batchIdentifier.test(id) || filename !== `${id}.md`)
    return fail('has an invalid identity or filename')
  if (current && payloadBody(body).trim() !== `# ${id}`)
    return fail('body must contain only its matching identity heading before the run ledger')
  if (fields['repository'] !== repositoryIdentity) return fail('names another repository')
  if (fields['approved'] !== true) return fail('is not explicitly approved')

  const authorityMode = fields['authority_mode']
  if (authorityMode !== 'reviewed-items' && authorityMode !== 'outcome') return fail('has an invalid authority mode')
  const authorityEvidence = fields['authority_evidence']
  if (authorityMode === 'outcome' && (typeof authorityEvidence !== 'string' || !authorityEvidence.trim()))
    return fail('outcome authority lacks current human evidence')
  if (authorityMode === 'reviewed-items' && authorityEvidence !== undefined)
    return fail('reviewed-item authority must not claim outcome evidence')

  const approvedAt = timestamp(fields['approved_at'], 'approved_at')
  const expiresAt = timestamp(current ? fields['expires_at'] : fields['timebox_ends_at'], 'expires_at')
  const itemIds = identifiers(fields['item_ids'])
  const target = completionTarget(fields['completion_target'])
  const payloadSha256 = fields['approved_payload_sha256']
  if (typeof payloadSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(payloadSha256))
    return fail('has an invalid approved payload hash')
  if (payloadSha256 !== approvedPayloadSha256(contents)) return fail('payload no longer matches its approval')

  if (!current) {
    const runId = fields['run_id']
    if (typeof runId !== 'string' || !new RegExp(`^${id}-RUN-\\d{3}$`).test(runId))
      return fail('has an invalid retained run identity')
    nonEmptyStrings(fields['mandatory_stops'], 'mandatory_stops')
    const closureItemIds = optionalIdentifiers(fields['closure_item_ids'])
    if (closureItemIds.some((itemId) => !itemIds.includes(itemId)))
      return fail('closure_item_ids names an item outside item_ids')
    if (
      target === 'done' &&
      (closureItemIds.length !== itemIds.length || itemIds.some((itemId) => !closureItemIds.includes(itemId)))
    )
      return fail('done retained record must close every named item')
    const runStarted = parseRetainedBinding(body, runId, payloadSha256)
    return {
      shape: 'retained-legacy',
      id,
      repository: repositoryIdentity,
      approvedAt,
      authorityMode,
      ...(typeof authorityEvidence === 'string' ? { authorityEvidence: authorityEvidence.trim() } : {}),
      approvedPayloadSha256: payloadSha256,
      expiresAt,
      itemIds,
      completionTarget: target,
      runId,
      runStarted,
      entries: [],
      contents
    }
  }

  if (fields['policy'] !== 'safe-local-v1') return fail('has an invalid policy')
  const ledger = parseCurrentLedger(body, id, payloadSha256)
  if (ledger.entries.some((entry) => !itemIds.includes(entry.itemId)))
    return fail('run ledger names an item outside item_ids')
  if (
    ledger.entries.some(
      (entry) => (entry.result === 'awaiting-review' || entry.result === 'done') && !entry.resultCommit
    )
  )
    return fail('run ledger completion result lacks a result commit')
  if (ledger.closed?.completionTarget !== undefined && ledger.closed.completionTarget !== target)
    return fail('close evidence does not match the approved completion target')
  if (
    ledger.closed &&
    (ledger.entries.length !== itemIds.length ||
      itemIds.some((itemId) => ledger.entries.find((entry) => entry.itemId === itemId)?.result !== target))
  )
    return fail(`close evidence requires one ${target} result for every named item`)
  return {
    shape: 'current',
    id,
    repository: repositoryIdentity,
    approvedAt,
    authorityMode,
    ...(typeof authorityEvidence === 'string' ? { authorityEvidence: authorityEvidence.trim() } : {}),
    approvedPayloadSha256: payloadSha256,
    expiresAt,
    itemIds,
    completionTarget: target,
    runId: `${id}-RUN-001`,
    ...ledger,
    contents
  }
}

export const renderBatchRecord = (options: RenderBatchOptions): string => {
  const placeholder = '0'.repeat(64)
  const contents = [
    '---',
    `id: ${options.id}`,
    `repository: ${options.repository}`,
    'approved: true',
    `approved_at: ${options.approvedAt}`,
    `authority_mode: ${options.authorityMode}`,
    ...(options.authorityEvidence ? [`authority_evidence: ${JSON.stringify(options.authorityEvidence)}`] : []),
    `approved_payload_sha256: ${placeholder}`,
    `expires_at: ${options.expiresAt}`,
    `item_ids: [${options.itemIds.join(', ')}]`,
    `completion_target: ${options.completionTarget}`,
    'policy: safe-local-v1',
    '---',
    '',
    `# ${options.id}`,
    ''
  ].join('\n')
  return contents.replace(placeholder, approvedPayloadSha256(contents))
}

const commitCell = (value?: string): string => (value ? `\`${value}\`` : '—')

export const appendRunStart = (record: BatchRecord): string =>
  `${record.contents.trimEnd()}\n\n## Run ledger\n\n<!-- ki-batch-run: ${record.runId} ${record.approvedPayloadSha256} -->\n`

export const appendLedgerEntry = (contents: string, record: BatchRecord, entry: BatchLedgerEntry): string => {
  const header = record.entries.length
    ? '\n'
    : '\n| Item | Result | Baseline | Result commit | Exception |\n| --- | --- | --- | --- | --- |\n'
  const exception = entry.exception ?? 'None'
  return `${contents.trimEnd()}${header}| ${entry.itemId} | ${entry.result} | ${commitCell(entry.baseline === '—' ? undefined : entry.baseline)} | ${commitCell(entry.resultCommit)} | ${exception} |\n`
}

export const appendCloseEvidence = (record: BatchRecord, evidence: BatchCloseEvidence): string =>
  `${record.contents.trimEnd()}\n\n<!-- ki-batch-close: ${record.id} ${evidence.completionTarget} ${evidence.commit} -->\n`

export const validCommit = (value: string): boolean => commit.test(value)
