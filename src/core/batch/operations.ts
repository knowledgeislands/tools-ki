import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { declaredRepositoryIdentity, readRepositoryDeclaration } from '../configuration/index.ts'
import { KiError } from '../errors.ts'
import { prepareWrites, publishWrites } from '../filesystem/index.ts'
import { resolveRepository } from '../repository/index.ts'
import type { Runner } from '../runtime/runner.ts'
import { readWorkItems } from '../work/items.ts'
import { readRepositoryPlanningSource } from '../work/planning.ts'
import {
  appendCloseEvidence,
  appendLedgerEntry,
  appendRunStart,
  type BatchAuthorityMode,
  type BatchCompletionTarget,
  type BatchItemResult,
  type BatchLedgerEntry,
  type BatchRecord,
  parseBatchRecord,
  renderBatchRecord,
  validCommit
} from './codec.ts'

const batchDirectory = '+/_BATCHES'
const batchName = /^([A-Z0-9][A-Z0-9-]*)-BATCH-(\d{3})\.md$/

export interface PrepareBatchOptions {
  readonly repository?: string
  readonly approved?: boolean
  readonly authorityMode: string
  readonly authorityEvidence?: string
  readonly expiresAt: string
  readonly itemIds: readonly string[]
  readonly completionTarget: string
}

export interface BatchRecordOptions {
  readonly repository?: string
  readonly record: string
}

export interface RunBatchOptions extends BatchRecordOptions {
  readonly item?: string
  readonly result?: string
  readonly baseline?: string
  readonly resultCommit?: string
  readonly exception?: string
}

export interface CloseBatchOptions extends BatchRecordOptions {
  readonly completionTarget: string
  readonly evidenceCommit: string
}

export interface BatchOperationResult {
  readonly id: string
  readonly path: string
  readonly shape: BatchRecord['shape']
  readonly itemCount: number
  readonly runStarted: boolean
  readonly closed: boolean
  readonly changed: boolean
}

export interface BatchOperationContext {
  readonly workingDirectory: string
  readonly homeDirectory: string
  readonly environment: NodeJS.ProcessEnv
  readonly runner: Runner
  readonly now: () => number
}

interface ResolvedBatchRepository {
  readonly root: string
  readonly declaration: string
  readonly identity: string
  readonly repoCode: string
}

interface LocatedBatch {
  readonly repository: ResolvedBatchRepository
  readonly path: string
  readonly relativePath: string
  readonly record: BatchRecord
}

const fail = (message: string): never => {
  throw new KiError(message)
}

const utcSecond = (milliseconds: number): string =>
  new Date(Math.floor(milliseconds / 1000) * 1000).toISOString().replace('.000Z', 'Z')

const authorityMode = (value: string): BatchAuthorityMode => {
  /* v8 ignore next -- Commander constrains every caller to the declared closed choices. */
  if (value !== 'reviewed-items' && value !== 'outcome')
    return fail('--authority-mode must be reviewed-items or outcome')
  return value
}

const completionTarget = (value: string): BatchCompletionTarget => {
  /* v8 ignore next -- Commander constrains every caller to the declared closed choices. */
  if (value !== 'awaiting-review' && value !== 'done')
    return fail('--completion-target must be awaiting-review or done')
  return value
}

const itemResult = (value: string): BatchItemResult => {
  /* v8 ignore next -- Commander constrains every caller to the declared closed choices. */
  if (!['awaiting-review', 'done', 'parked', 'stopped'].includes(value))
    return fail('--result must be awaiting-review, done, parked, or stopped')
  return value as BatchItemResult
}

const resolveBatchRepository = async (
  repository: string | undefined,
  context: BatchOperationContext
): Promise<ResolvedBatchRepository> => {
  const location = await resolveRepository({
    repository,
    workingDirectory: context.workingDirectory,
    homeDirectory: context.homeDirectory
  })
  const declaration = await readRepositoryDeclaration(location.declaration)
  const identity = declaredRepositoryIdentity(declaration)
  const repoType = declaration.skills.find((skill) => skill.name === 'ki-repo')?.configuration['repo_type']
  const repoCode = declaration.skills.find((skill) => skill.name === 'ki-repo')?.configuration['repo_code']
  if (typeof repoCode !== 'string' || !/^[A-Z0-9][A-Z0-9-]{1,23}$/.test(repoCode))
    return fail('[skills.ki-repo].repo_code must be a stable uppercase identifier')
  const adapter = declaration.skills.find((skill) => skill.name === 'ki-work')?.configuration['adapter']
  if (adapter !== 'roadmap' && adapter !== 'kb-streams')
    return fail('ki batch requires a locally executable roadmap or kb-streams adapter')
  if ((repoType === 'kb' && adapter !== 'kb-streams') || (repoType !== 'kb' && adapter !== 'roadmap'))
    return fail(`ki batch cannot use ${adapter} for this repository kind`)
  return { root: location.root, declaration: location.declaration, identity, repoCode }
}

const canonicalTimestamp = (value: string, label: string): string => {
  const milliseconds = Date.parse(value)
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) ||
    Number.isNaN(milliseconds) ||
    utcSecond(milliseconds) !== value
  )
    return fail(`${label} must be a canonical UTC timestamp`)
  return value
}

const nextBatchId = async (repository: ResolvedBatchRepository): Promise<string> => {
  const directory = join(repository.root, batchDirectory)
  const state = await lstat(directory).catch(() => undefined)
  if (state && (!state.isDirectory() || state.isSymbolicLink()))
    return fail(`${batchDirectory} must be a physical directory`)
  const entries = state ? await readdir(directory, { withFileTypes: true }) : []
  let highest = 0
  for (const entry of entries) {
    const match = batchName.exec(entry.name)
    if (!match?.[1] || !match[2] || match[1] !== repository.repoCode) continue
    if (!entry.isFile() || entry.isSymbolicLink()) return fail(`${batchDirectory}/${entry.name} must be a regular file`)
    highest = Math.max(highest, Number.parseInt(match[2], 10))
  }
  return `${repository.repoCode}-BATCH-${String(highest + 1).padStart(3, '0')}`
}

const assertDependencyOrder = (itemIds: readonly string[], items: Awaited<ReturnType<typeof readWorkItems>>): void => {
  const byId = new Map(items.map((item) => [item.id, item]))
  const positions = new Map(itemIds.map((id, index) => [id, index]))
  for (const [index, id] of itemIds.entries()) {
    const item = byId.get(id) ?? fail(`batch item ${id} is not a canonical work record`)
    for (const dependency of item.blockedBy) {
      const position = positions.get(dependency)
      if (position !== undefined && position >= index)
        fail(`batch item ${id} must follow its in-batch dependency ${dependency}`)
      if (position === undefined && byId.get(dependency)?.status !== 'done')
        fail(`batch item ${id} has unsatisfied dependency ${dependency}`)
    }
  }
}

const batchItems = async (repository: ResolvedBatchRepository, itemIds: readonly string[]) => {
  const planning = await readRepositoryPlanningSource(repository.declaration)
  const items = await readWorkItems(repository.root, planning)
  assertDependencyOrder(itemIds, items)
  return new Map(items.map((item) => [item.id, item]))
}

const assertReadyItems = async (repository: ResolvedBatchRepository, itemIds: readonly string[]): Promise<void> => {
  const items = await batchItems(repository, itemIds)
  for (const id of itemIds) if (items.get(id)?.status !== 'ready') return fail(`batch item ${id} is not ready`)
}

const canonicalRecordPath = async (
  repository: ResolvedBatchRepository,
  recordArgument: string
): Promise<{ readonly path: string; readonly relativePath: string }> => {
  const name = /^[A-Z0-9][A-Z0-9-]*-BATCH-\d{3}$/.test(recordArgument) ? `${recordArgument}.md` : recordArgument
  const path = isAbsolute(name)
    ? resolve(name)
    : resolve(repository.root, name.startsWith(`${batchDirectory}/`) ? name : join(batchDirectory, name))
  const directory = join(repository.root, batchDirectory)
  const relativePath = relative(directory, path)
  if (!relativePath || relativePath.startsWith('..') || relativePath.includes('/') || !relativePath.endsWith('.md'))
    return fail('batch record must be a canonical file directly beneath +/_BATCHES')
  const directoryState = await lstat(directory).catch(() => undefined)
  if (!directoryState?.isDirectory() || directoryState.isSymbolicLink())
    return fail(`${batchDirectory} must be a physical directory`)
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isFile() || state.isSymbolicLink()) return fail('batch record must be an existing regular file')
  /* v8 ignore next -- the physical directory and regular non-link file checks above make divergent real paths unreachable. */
  if ((await realpath(path)) !== path) return fail('batch record must remain physically contained in its repository')
  return { path, relativePath: `${batchDirectory}/${relativePath}` }
}

const locateBatch = async (options: BatchRecordOptions, context: BatchOperationContext): Promise<LocatedBatch> => {
  const repository = await resolveBatchRepository(options.repository, context)
  const location = await canonicalRecordPath(repository, options.record)
  const contents = await readFile(location.path, 'utf8')
  const record = parseBatchRecord(contents, basename(location.path), repository.identity)
  return { repository, ...location, record }
}

const assertActive = (record: BatchRecord, now: number): void => {
  if (record.shape !== 'current') fail('retained legacy batch records are read-only')
  if (Date.parse(record.expiresAt) <= now) fail('batch record has expired')
}

const publishReplacement = async (located: LocatedBatch, contents: string): Promise<void> => {
  // A changed source requires a fresh parse and decision; overwriting it would lose an independently appended ledger row.
  /* v8 ignore next -- Requires another process to replace the record during one in-process CLI invocation. */
  if ((await readFile(located.path, 'utf8')) !== located.record.contents)
    return fail('batch record changed before publication')
  const writes = await prepareWrites(located.repository.root, [{ path: located.relativePath, content: contents }])
  await publishWrites(writes, false)
}

const assertCommitExists = async (
  repository: ResolvedBatchRepository,
  value: string,
  label: string,
  context: BatchOperationContext
): Promise<void> => {
  const evidence = await context.runner(
    'git',
    ['-C', repository.root, 'cat-file', '-e', `${value}^{commit}`],
    context.environment
  )
  if (evidence.exitCode !== 0) return fail(`${label} does not resolve in the repository`)
}

const operationResult = (located: LocatedBatch, changed: boolean): BatchOperationResult => ({
  id: located.record.id,
  path: located.path,
  shape: located.record.shape,
  itemCount: located.record.itemIds.length,
  runStarted: located.record.runStarted,
  closed: Boolean(located.record.closed),
  changed
})

export const prepareBatch = async (
  options: PrepareBatchOptions,
  context: BatchOperationContext
): Promise<BatchOperationResult> => {
  /* v8 ignore next -- Commander's required boolean option rejects the only public path without this assertion. */
  if (!options.approved) return fail('batch prepare requires explicit --approved')
  const repository = await resolveBatchRepository(options.repository, context)
  const mode = authorityMode(options.authorityMode)
  const target = completionTarget(options.completionTarget)
  if (!options.itemIds.length) return fail('batch prepare requires at least one item identifier')
  if (new Set(options.itemIds).size !== options.itemIds.length) return fail('batch prepare repeats an item identifier')
  if (mode === 'outcome' && !options.authorityEvidence?.trim())
    return fail('outcome authority requires --authority-evidence')
  if (mode === 'reviewed-items' && options.authorityEvidence !== undefined)
    return fail('reviewed-items authority must not use --authority-evidence')
  const expiresAt = canonicalTimestamp(options.expiresAt, '--expires-at')
  const now = context.now()
  if (Date.parse(expiresAt) <= now) return fail('--expires-at must be in the future')
  await assertReadyItems(repository, options.itemIds)
  const id = await nextBatchId(repository)
  const relativePath = `${batchDirectory}/${id}.md`
  const contents = renderBatchRecord({
    id,
    repository: repository.identity,
    approvedAt: utcSecond(now),
    authorityMode: mode,
    ...(options.authorityEvidence ? { authorityEvidence: options.authorityEvidence.trim() } : {}),
    expiresAt,
    itemIds: options.itemIds,
    completionTarget: target
  })
  const writes = await prepareWrites(repository.root, [{ path: relativePath, content: contents, create: true }])
  await publishWrites(writes, false)
  const record = parseBatchRecord(contents, `${id}.md`, repository.identity)
  return operationResult({ repository, path: join(repository.root, relativePath), relativePath, record }, true)
}

export const validateBatch = async (
  options: BatchRecordOptions,
  context: BatchOperationContext
): Promise<BatchOperationResult> => {
  const located = await locateBatch(options, context)
  if (located.record.shape === 'current') {
    assertActive(located.record, context.now())
    if (!located.record.runStarted) await assertReadyItems(located.repository, located.record.itemIds)
    else await batchItems(located.repository, located.record.itemIds)
    if (located.record.closed)
      await assertCommitExists(located.repository, located.record.closed.commit, 'batch close evidence commit', context)
  }
  return operationResult(located, false)
}

const ledgerEntry = (options: RunBatchOptions): BatchLedgerEntry | undefined => {
  if (!options.item && !options.result && !options.baseline && !options.resultCommit && !options.exception)
    return undefined
  if (!options.item || !options.result || !options.baseline)
    return fail('a run result requires --item, --result, and --baseline together')
  const result = itemResult(options.result)
  if (options.baseline !== '—' && !validCommit(options.baseline)) return fail('--baseline must be a full commit or —')
  if (options.resultCommit && !validCommit(options.resultCommit)) return fail('--result-commit must be a full commit')
  if ((result === 'awaiting-review' || result === 'done') && !options.resultCommit)
    return fail(`${result} result requires --result-commit`)
  if (options.exception && /[|\r\n]/.test(options.exception))
    return fail('--exception must be one plain table-safe line')
  return {
    itemId: options.item,
    result,
    baseline: options.baseline,
    ...(options.resultCommit ? { resultCommit: options.resultCommit } : {}),
    ...(options.exception ? { exception: options.exception } : {})
  }
}

export const runBatch = async (
  options: RunBatchOptions,
  context: BatchOperationContext
): Promise<BatchOperationResult> => {
  const located = await locateBatch(options, context)
  assertActive(located.record, context.now())
  if (located.record.closed) return fail('batch record is already closed')
  const entry = ledgerEntry(options)
  if (located.record.runStarted && !entry) return fail('batch run is already started; supply one explicit item result')
  if (!located.record.runStarted) await assertReadyItems(located.repository, located.record.itemIds)
  const items = entry ? await batchItems(located.repository, located.record.itemIds) : undefined
  if (entry && !located.record.itemIds.includes(entry.itemId))
    return fail(`batch result names unapproved item ${entry.itemId}`)
  if (entry && located.record.entries.some((existing) => existing.itemId === entry.itemId))
    return fail(`batch run already records item ${entry.itemId}`)
  const item = entry && items?.get(entry.itemId)
  if (entry?.result === 'awaiting-review' && item?.status !== 'awaiting-review')
    return fail(`batch item ${entry.itemId} is not awaiting review`)
  if (entry?.result === 'done' && item?.status !== 'done') return fail(`batch item ${entry.itemId} is not done`)
  if (entry?.baseline !== undefined && entry.baseline !== '—')
    await assertCommitExists(located.repository, entry.baseline, '--baseline', context)
  if (entry?.resultCommit) await assertCommitExists(located.repository, entry.resultCommit, '--result-commit', context)

  let contents = located.record.runStarted ? located.record.contents : appendRunStart(located.record)
  if (entry) contents = appendLedgerEntry(contents, located.record, entry)
  await publishReplacement(located, contents)
  const record = parseBatchRecord(contents, basename(located.path), located.repository.identity)
  return operationResult({ ...located, record }, true)
}

export const closeBatch = async (
  options: CloseBatchOptions,
  context: BatchOperationContext
): Promise<BatchOperationResult> => {
  const located = await locateBatch(options, context)
  assertActive(located.record, context.now())
  const target = completionTarget(options.completionTarget)
  if (target !== located.record.completionTarget) return fail('--completion-target does not match batch authority')
  if (!validCommit(options.evidenceCommit)) return fail('--evidence-commit must be a full commit')
  if (located.record.closed) {
    if (located.record.closed.completionTarget !== target || located.record.closed.commit !== options.evidenceCommit)
      return fail('batch record is already closed with different evidence')
    await assertCommitExists(located.repository, located.record.closed.commit, 'batch close evidence commit', context)
    return operationResult(located, false)
  }
  if (!located.record.runStarted) return fail('batch run must be started before close')
  const entries = new Map(located.record.entries.map((entry) => [entry.itemId, entry]))
  if (
    entries.size !== located.record.itemIds.length ||
    located.record.itemIds.some((id) => entries.get(id)?.result !== target)
  )
    return fail(`batch close requires one ${target} ledger result for every named item`)
  const items = await batchItems(located.repository, located.record.itemIds)
  for (const id of located.record.itemIds)
    if (items.get(id)?.status !== target) return fail(`batch item ${id} is not ${target}`)
  await assertCommitExists(located.repository, options.evidenceCommit, '--evidence-commit', context)
  const contents = appendCloseEvidence(located.record, { completionTarget: target, commit: options.evidenceCommit })
  await publishReplacement(located, contents)
  const record = parseBatchRecord(contents, basename(located.path), located.repository.identity)
  return operationResult({ ...located, record }, true)
}
