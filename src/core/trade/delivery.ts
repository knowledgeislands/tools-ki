import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'
import { tradeKinds } from './configuration.ts'
import { localRegisteredConfiguration, registeredRepositories, requireActiveRoute } from './estate.ts'
import { assertTradeIdentifier as identifier, isTradeIdentifier } from './identifiers.ts'
import { readDirectory } from './inventory.ts'
import {
  type ActiveRegisteredRepository,
  commitExpression,
  type TradeContext,
  type TradeRecord,
  tradeError
} from './model.ts'
import { readPhase, recordFromContents, rewritePhase, tradePath } from './record-codec.ts'

const committedFile = async (
  context: TradeContext,
  root: string,
  path: string
): Promise<{ readonly contents: string; readonly ref: string }> => {
  const revision = await context.runner('git', ['-C', root, 'rev-parse', 'HEAD'], context.environment)
  const ref = revision.output.trim()
  if (revision.exitCode !== 0 || !commitExpression.test(ref))
    throw tradeError(`trade peer ${root} has no usable committed HEAD`)
  const source = await context.runner(
    'git',
    ['-C', root, 'show', `${ref}:${relative(root, path)}`],
    context.environment
  )
  if (source.exitCode !== 0) throw tradeError(`trade record ${relative(root, path)} is not committed at ${ref}`)
  return { contents: source.output, ref }
}

const copyInboundContents = (record: TradeRecord, receivedFromRef: string): string =>
  rewritePhase(record.contents, 'received').replace(
    '\n---\n',
    `\ndecision_status: unconsidered\nreceived_from_ref: ${receivedFromRef}\n---\n`
  )

const receivableTrade = async (
  context: TradeContext,
  local: Awaited<ReturnType<typeof localRegisteredConfiguration>>,
  id: string
): Promise<{
  readonly sender: ActiveRegisteredRepository
  readonly path: string
  readonly record: TradeRecord
  readonly ref: string
}> => {
  const candidates: { sender: ActiveRegisteredRepository; path: string; record: TradeRecord; ref: string }[] = []
  for (const repository of await registeredRepositories(context)) {
    if (!repository.configuration) continue
    for (const kind of tradeKinds) {
      if (!local.configuration.importsFrom[kind].includes(repository.repository)) continue
      const peer = local.configuration.identity
      const path = tradePath(repository.root, 'outbound', peer, id)
      if (!(await lstat(path).catch(() => undefined))?.isFile()) continue
      const committed = await committedFile(context, repository.root, path)
      // A preparation shares the submitted record's path, so it is visible here but not yet
      // receivable: the sender has not frozen it. Skip only on a phase that reads cleanly —
      // a record too malformed to declare one must still reach the reader that can say why.
      const candidatePhase = readPhase(committed.contents)
      if (candidatePhase !== undefined && candidatePhase !== 'submitted') continue
      const record = recordFromContents(committed.contents, path, 'outbound')
      if (record.kind !== kind || record.sender !== repository.configuration.identity || record.receiver !== peer)
        continue
      const sender = await requireActiveRoute(context, local.configuration, repository.repository, 'import', kind)
      candidates.push({ sender, path, record, ref: committed.ref })
    }
  }
  if (candidates.length !== 1)
    throw tradeError(`outbound trade ${id} is unavailable or ambiguous for ${local.configuration.repository}`)
  return candidates[0] as (typeof candidates)[number]
}

export const receiveTrade = async (
  context: TradeContext,
  requestedId: string
): Promise<{ readonly id: string; readonly existing: boolean }> => {
  const local = await localRegisteredConfiguration(context)
  const candidate = await receivableTrade(context, local, identifier(requestedId))
  const destination = tradePath(
    local.repository.root,
    'inbound',
    candidate.sender.configuration.identity,
    candidate.record.id
  )
  if (await lstat(destination).catch(() => undefined)) return { id: candidate.record.id, existing: true }
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, copyInboundContents(candidate.record, candidate.ref), 'utf8')
  return { id: candidate.record.id, existing: false }
}

export const previewReceivableTrades = async (context: TradeContext): Promise<readonly TradeRecord[]> => {
  const local = await localRegisteredConfiguration(context)
  const ids = new Set<string>()
  for (const sender of await registeredRepositories(context)) {
    if (!sender.configuration) continue
    for (const kind of tradeKinds) {
      if (!local.configuration.importsFrom[kind].includes(sender.repository)) continue
      const directory = dirname(tradePath(sender.root, 'outbound', local.configuration.identity, 'TRD-00000000'))
      for (const path of await readDirectory(directory))
        if (isTradeIdentifier(basename(path, '.md'))) ids.add(basename(path, '.md'))
    }
  }
  const records: TradeRecord[] = []
  for (const id of [...ids].sort()) {
    // The directory now holds the sender's preparations alongside its submitted records, so
    // an id here is a candidate rather than a guarantee. Preview lists what is receivable and
    // stays silent about the rest; asking for one by id still reports why it is not.
    const candidate = await receivableTrade(context, local, id).catch(() => undefined)
    if (candidate) records.push(candidate.record)
  }
  return records
}

export interface ObservedPreparation {
  readonly record: TradeRecord
  readonly ref: string
  readonly mode: 'diff' | 'verbatim'
  readonly output: string
  readonly reason?: string
}

export const observeTradePreparation = async (
  context: TradeContext,
  requestedId: string
): Promise<ObservedPreparation> => {
  const id = identifier(requestedId)
  const local = await localRegisteredConfiguration(context)
  const candidates: { root: string; path: string; contents: string; ref: string; record: TradeRecord }[] = []
  for (const sender of await registeredRepositories(context)) {
    if (!sender.configuration) continue
    for (const kind of tradeKinds) {
      if (!sender.configuration.exportsTo[kind].includes(local.configuration.repository)) continue
      const path = tradePath(sender.root, 'preparation', local.configuration.identity, id)
      try {
        const committed = await committedFile(context, sender.root, path)
        const record = recordFromContents(committed.contents, path, 'preparation')
        if (record.kind === kind) candidates.push({ root: sender.root, path, ...committed, record })
      } catch {}
    }
  }
  if (candidates.length !== 1)
    throw tradeError(`preparation ${id} is unavailable or ambiguous for ${local.configuration.repository}`)
  const candidate = candidates[0] as (typeof candidates)[number]
  const record = candidate.record
  const cursor = join(context.paths.state, 'trades', 'observations', record.sender, `${record.id}.ref`)
  const previous = await readFile(cursor, 'utf8').catch(() => '')
  let mode: ObservedPreparation['mode'] = 'verbatim'
  let output = candidate.contents
  let reason = 'first observation has no prior committed reference'
  if (commitExpression.test(previous.trim())) {
    const before = previous.trim()
    const comparable = await context.runner(
      'git',
      ['-C', candidate.root, 'merge-base', '--is-ancestor', before, candidate.ref],
      context.environment
    )
    if (comparable.exitCode === 0) {
      const diff = await context.runner(
        'git',
        ['-C', candidate.root, 'diff', before, candidate.ref, '--', relative(candidate.root, candidate.path)],
        context.environment
      )
      if (diff.exitCode === 0) {
        mode = 'diff'
        output = diff.output
        reason = ''
      }
    } else reason = 'the prior reference is not comparable with the current committed history'
  }
  await mkdir(dirname(cursor), { recursive: true })
  await writeFile(cursor, `${candidate.ref}\n`, 'utf8')
  return { record, ref: candidate.ref, mode, output, ...(reason ? { reason } : {}) }
}
