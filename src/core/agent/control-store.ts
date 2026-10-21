import { createHash, randomUUID } from 'node:crypto'
import { appendFile, mkdir, readdir, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { KiError } from '../errors.ts'
import { type AgentContext, checkName, instant, runDirectory } from './context.ts'
import type { AgentEffectIdentity, AttemptIdentity, DependencyIdentity, ProcessIdentity } from './identities.ts'
import { withRunLock } from './locking.ts'
import { readThread, type ThreadHome, threadPath } from './thread.ts'

export type { AttemptIdentity } from './identities.ts'

export interface QueueIdentity {
  readonly registered: number
  readonly dependencies: Record<string, DependencyIdentity | null>
  readonly requestedDependencies: Record<string, DependencyIdentity | null>
  readonly id: string
  readonly name: string
  readonly attempt: number
  readonly token: string
  readonly scope: string
  readonly request: unknown
  readonly brief: string
  disposition?: 'dequeued' | 'failed' | 'blocked' | undefined
  cancellationOperation?: string | undefined
  state: 'queued' | 'claimed' | 'started' | 'cancelled' | 'unconfirmed'
  operation?: string | undefined
}

export interface ControlReceipt {
  readonly schema: 'ki/agent-control/v1'
  readonly operationId: string
  readonly operation: string
  readonly run: string
  readonly target: unknown
  readonly previousState: string
  readonly resultingState: string
  readonly outcome: string
  readonly reason: string
  readonly timestamp: string
  readonly exitCode: 0 | 1
  readonly eventSequence?: number | undefined
  readonly evidence?: unknown
  readonly stopCommand?: string | undefined
  readonly dequeueCommand?: string | undefined
  readonly recoveryCommand?: string | undefined
}

export interface ControlOperation {
  readonly id: string
  readonly operation: string
  readonly payload: string
  readonly target: unknown
  readonly timestamp: string
  readonly previousState: string
  receipt?: ControlReceipt | undefined
  resolvedBy?: string | undefined
}

export interface ControlStore {
  nextIdentity: number
  readonly schema: 'ki/agent-control-state/v1'
  readonly machine: string
  readonly workHome: string
  readonly work: string
  readonly attempts: Record<string, AttemptIdentity>
  readonly history: Record<string, AttemptIdentity>
  readonly entries: Record<string, QueueIdentity>
  readonly operations: Record<string, ControlOperation>
}

const activeTransactions = new Map<string, ControlStore | undefined>()
const controlRead = async (path: string): Promise<string | undefined> => {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw new KiError(`control-state-unverified: cannot read ${path}: ${String(error)}`, 1)
  }
}

export const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item: unknown) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, (item as Record<string, unknown>)[key]])
        )
      : item
  )

const dictionaries = (store: ControlStore): ControlStore => ({
  ...store,
  attempts: Object.assign(Object.create(null), store.attempts),
  history: Object.assign(Object.create(null), store.history),
  entries: Object.assign(Object.create(null), store.entries),
  operations: Object.assign(Object.create(null), store.operations)
})

const immutableIdentity = (attempt: AttemptIdentity): string =>
  canonical([
    attempt.run,
    attempt.agent,
    attempt.attempt,
    attempt.token,
    attempt.registered,
    attempt.requestedDependencies,
    attempt.runtime,
    attempt.workdir,
    attempt.workHome,
    attempt.work,
    attempt.machine,
    attempt.launcher,
    attempt.scope,
    attempt.entry
  ])

/** Replay completed writes and fence unfinished effects; a projection is never the sole journal authority. */
const replay = async (directory: string, store: ControlStore): Promise<ControlStore> => {
  const journal = await controlRead(join(directory, 'control.journal.jsonl'))
  if (journal === undefined && Object.keys(store.operations).length > 0)
    throw new KiError('control-state-unverified: the operation journal is unavailable', 1)
  const intents = new Set<string>()
  for (const line of (journal ?? '').split('\n').filter(Boolean)) {
    const entry = JSON.parse(line) as ControlOperation & { phase: string }
    if (entry.phase === 'intent') {
      intents.add(entry.id)
      const old = store.operations[entry.id]
      if (
        old &&
        (old.operation !== entry.operation ||
          old.payload !== entry.payload ||
          canonical(old.target) !== canonical(entry.target))
      )
        throw new KiError('control-state-unverified: frozen operation differs from the journal', 1)
      if (!old) store.operations[entry.id] = entry
    } else {
      const receipt = entry.receipt
      const operation = receipt && store.operations[receipt.operationId]
      if (!receipt || !operation || (operation.receipt && canonical(operation.receipt) !== canonical(receipt)))
        throw new KiError('control-state-unverified: observed receipt differs from its journal authority', 1)
      operation.receipt = receipt
    }
  }
  for (const operation of Object.values(store.operations)) {
    if (!intents.has(operation.id)) throw new KiError('control-state-unverified: operation has no journal intent', 1)
    if (!operation.receipt) {
      const text = await controlRead(join(directory, 'control-receipts', `${operation.id}.json`))
      if (text !== undefined) operation.receipt = JSON.parse(text) as ControlReceipt
    }
    const receipt = operation.receipt
    if (!receipt) continue
    if (
      receipt.schema !== 'ki/agent-control/v1' ||
      receipt.operationId !== operation.id ||
      receipt.operation !== operation.operation ||
      canonical(receipt.target) !== canonical(operation.target)
    )
      throw new KiError('control-state-unverified: receipt does not match its frozen operation', 1)
    const target = operation.target as AttemptIdentity & QueueIdentity
    const attempt = typeof target.agent === 'string' ? store.attempts[target.agent] : undefined
    const entry = store.entries[operation.operation === 'dequeue' ? target.id : (target.entry ?? '')]
    if (
      operation.operation === 'spawn' &&
      receipt.outcome === 'started' &&
      attempt?.token === target.token &&
      !attempt.stoppedBy
    )
      attempt.state = 'running'
    if (operation.operation === 'stop' && attempt?.token === target.token && !attempt.stoppedBy) {
      attempt.state = receipt.resultingState as AttemptIdentity['state']
      if (receipt.outcome === 'stopped') attempt.stoppedBy = operation.id
    }
    if (operation.operation === 'dequeue' && entry) {
      entry.state = receipt.resultingState as QueueIdentity['state']
      if (receipt.outcome === 'cancelled-before-start') {
        entry.disposition = 'dequeued'
        entry.cancellationOperation = operation.id
      }
    }
    if (operation.operation === 'recover-resolve' && receipt.exitCode === 0) {
      const evidence = receipt.evidence as { originalOperation: string; observation: { owner?: ProcessIdentity } }
      const original = store.operations[evidence.originalOperation]
      if (original) original.resolvedBy = operation.id
    }
  }
  // loadControl returns the transaction snapshot before reaching replay when a lease is active.
  for (const operation of Object.values(store.operations)) {
    if (operation.receipt || operation.resolvedBy) continue
    const target = operation.target as AttemptIdentity & QueueIdentity
    if (operation.operation === 'spawn' || operation.operation === 'spawn-supervisor') {
      const attempt = store.attempts[target.agent]
      if (attempt?.token === target.token) attempt.state = 'unconfirmed'
      const entry = store.entries[target.entry ?? '']
      if (entry) {
        entry.operation = operation.id
        if (entry.state !== 'cancelled') entry.state = 'unconfirmed'
      }
    }
    if (
      operation.operation === 'stop' &&
      typeof target.agent === 'string' &&
      store.attempts[target.agent]?.token === target.token
    ) {
      const attempt = store.attempts[target.agent]
      if (attempt && attempt.state !== 'stopped') attempt.state = 'stop-requested'
    }
  }
  bindDependants(store)
  for (const attempt of Object.values(store.attempts)) store.history[attempt.token] = structuredClone(attempt)
  return store
}

export const loadControl = async (directory: string): Promise<ControlStore | undefined> => {
  if (activeTransactions.has(directory)) {
    const active = activeTransactions.get(directory)
    return active === undefined ? undefined : dictionaries(structuredClone(active))
  }
  const text = await controlRead(join(directory, 'control.json'))
  if (text === undefined) {
    const evidence = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return []
      throw new KiError(`control-state-unverified: cannot inspect prior evidence: ${String(error)}`, 1)
    })
    if (
      evidence.some(
        (name) =>
          name === 'control.journal.jsonl' ||
          name === 'control-receipts' ||
          (name.startsWith('control-') && name.endsWith('.tmp'))
      )
    )
      throw new KiError('control-state-unverified: projection missing beside prior control evidence', 1)
    for (const name of evidence.filter((name) => name.endsWith('.launch.json'))) {
      const launchText = await controlRead(join(directory, name))
      if (launchText === undefined) throw new KiError('control-state-unverified: launch evidence disappeared', 1)
      const launch = JSON.parse(launchText) as { identity?: unknown }
      if (launch.identity) throw new KiError('control-state-unverified: immutable launch evidence has no projection', 1)
    }
    return undefined
  }
  try {
    const parsed = JSON.parse(text) as ControlStore
    if (
      parsed?.schema !== 'ki/agent-control-state/v1' ||
      !parsed.attempts ||
      !parsed.history ||
      !parsed.entries ||
      !parsed.operations ||
      !Number.isSafeInteger(parsed.nextIdentity) ||
      parsed.nextIdentity < 0
    )
      throw new Error('shape')
    if (
      [...Object.values(parsed.attempts), ...Object.values(parsed.history), ...Object.values(parsed.entries)].some(
        (item) =>
          !item.dependencies ||
          typeof item.dependencies !== 'object' ||
          Array.isArray(item.dependencies) ||
          !item.requestedDependencies ||
          typeof item.requestedDependencies !== 'object' ||
          Array.isArray(item.requestedDependencies)
      )
    )
      throw new Error('dependency shape')
    return await replay(directory, dictionaries(parsed))
  } catch {
    throw new KiError('control-state-unverified: invalid control journal projection', 1)
  }
}

/** A corrupt/foreign home is never repaired by guessing from the caller's directory. */
export const controlHome = async (context: AgentContext, run: string): Promise<{ home: string; work: string }> => {
  const thread = await readThread(context, run)
  if (!thread) throw new KiError('control-home-unverified: the run has no recorded work home', 1)
  return verifyWorkHome(thread)
}

export const verifyWorkHome = async (thread: ThreadHome): Promise<{ home: string; work: string }> => {
  const home = await realpath(threadPath(thread)).catch(() => undefined)
  if (!home) throw new KiError('control-home-unverified: the recorded work home is unavailable', 1)
  const work = thread.folder.startsWith('+/_WORK/') ? thread.folder.slice('+/_WORK/'.length) : undefined
  const text = await readFile(join(home, 'work.md'), 'utf8').catch(() => undefined)
  if (text === undefined) throw new KiError('control-home-unverified: work record is unavailable', 1)
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1]
  const recorded = /^id:\s*([^\s]+)\s*$/m.exec(frontmatter ?? '')?.[1]
  if (!work || (recorded !== undefined && recorded !== work) || !home.endsWith(`/${work}`))
    throw new KiError('control-home-unverified: mismatched work identity', 1)
  return { home, work }
}

export const newStore = async (context: AgentContext, run: string): Promise<ControlStore> => {
  const { home, work } = await controlHome(context, run)
  return dictionaries({
    schema: 'ki/agent-control-state/v1',
    nextIdentity: 0,
    machine: hostname(),
    workHome: home,
    work,
    attempts: {},
    history: {},
    entries: {},
    operations: {}
  })
}

export const verifyStore = async (context: AgentContext, run: string, store: ControlStore): Promise<void> => {
  const { home, work } = await controlHome(context, run)
  if (store.machine !== hostname() || store.workHome !== home || store.work !== work)
    throw new KiError(
      `control-home-unverified: foreign machine or changed work home (stored machine ${store.machine}; current machine ${hostname()})`,
      1
    )
  if (
    [...Object.values(store.attempts), ...Object.values(store.history)].some(
      (attempt) =>
        attempt.run !== run || attempt.work !== work || attempt.workHome !== home || attempt.machine !== store.machine
    )
  )
    throw new KiError('ownership-unverified: attempt belongs to a different work or machine', 1)
  if (
    Object.values(store.entries).some(
      (entry) =>
        (entry.request as { run?: string; name?: string } | undefined)?.run !== run ||
        (entry.request as { name?: string } | undefined)?.name !== entry.name
    )
  )
    throw new KiError('queue-home-unverified: queue entry belongs to another run', 1)
  for (const attempt of [...Object.values(store.attempts), ...Object.values(store.history)]) {
    const recorded = Object.values(store.operations).filter(
      (operation) =>
        (operation.operation === 'spawn' || operation.operation === 'spawn-supervisor') &&
        (operation.target as AttemptIdentity).token === attempt.token
    )
    if (
      recorded.some(
        (operation) => immutableIdentity(operation.target as AttemptIdentity) !== immutableIdentity(attempt)
      )
    )
      throw new KiError('ownership-unverified: immutable attempt identity changed', 1)
  }
}

export const saveControl = async (directory: string, store: ControlStore): Promise<void> => {
  bindDependants(store)
  for (const attempt of Object.values(store.attempts)) store.history[attempt.token] = structuredClone(attempt)
  const temporary = join(directory, `control-${randomUUID()}.tmp`)
  await writeFile(temporary, `${JSON.stringify(store)}\n`)
  await rename(temporary, join(directory, 'control.json'))
  // Every writer enters through controlTransaction; publication updates that transaction's snapshot.
  activeTransactions.set(directory, dictionaries(structuredClone(store)))
}

/** One protocol for queue append/claim/cancel, gates, launch and stop. No age-based lock theft. */
export const controlTransaction = async <T>(
  context: AgentContext,
  run: string,
  action: (directory: string) => Promise<T>,
  retries = 100
): Promise<T> => {
  const directory = runDirectory(context, run)
  await mkdir(directory, { recursive: true })
  return withRunLock(
    directory,
    'control',
    async () => {
      try {
        const recovered = await loadControl(directory)
        if (recovered) await verifyStore(context, run, recovered)
        activeTransactions.set(directory, recovered)
        return await action(directory)
      } finally {
        activeTransactions.delete(directory)
      }
    },
    context.processes.onExit,
    retries
  )
}
/** Wait through the longest supported stop grace; never silently wait forever on an abandoned lock. */
export const pendingControl = async <T>(
  context: AgentContext,
  run: string,
  action: (directory: string) => Promise<T>
): Promise<T> => {
  const started = context.now()
  for (;;) {
    try {
      return await controlTransaction(context, run, action, 2)
    } catch (error) {
      if (!(error instanceof KiError) || !error.message.startsWith('control-transaction-busy:')) throw error
      if (context.now() - started >= 120_000) throw new KiError(`${error.message}; waited 120 seconds`, 1, error.next)
      await context.processes.sleep(1000)
    }
  }
}

export const beginOperation = async (
  context: AgentContext,
  directory: string,
  store: ControlStore,
  operation: string,
  payload: unknown,
  target: unknown,
  previousState: string,
  request?: string
): Promise<ControlOperation> => {
  const id = request === undefined ? randomUUID() : checkName(request, 'request')
  const frozen = canonical(payload)
  if (operation === 'spawn' || operation === 'spawn-supervisor') {
    const identity = target as AttemptIdentity
    if (
      Object.values(store.operations).some(
        (previous) =>
          (previous.operation === 'spawn' || previous.operation === 'spawn-supervisor') &&
          (previous.target as AttemptIdentity).token === identity.token &&
          previous.payload !== frozen
      )
    )
      throw new KiError('selection-conflict: an attempt cannot change its frozen launch selection', 1)
  }
  const old = store.operations[id]
  if (old) {
    if (old.operation !== operation || old.payload !== frozen)
      throw new KiError('request-conflict: operation ID has different arguments', 1)
    return old
  }
  const started: ControlOperation = {
    id,
    operation,
    payload: frozen,
    target: structuredClone(target),
    timestamp: instant(context),
    previousState
  }
  store.operations[id] = started
  await appendFile(join(directory, 'control.journal.jsonl'), `${JSON.stringify({ phase: 'intent', ...started })}\n`)
  await saveControl(directory, store)
  return started
}

export const finishOperation = async (
  context: AgentContext,
  directory: string,
  store: ControlStore,
  operation: ControlOperation,
  result: Omit<
    ControlReceipt,
    'schema' | 'operationId' | 'operation' | 'run' | 'target' | 'previousState' | 'timestamp'
  >
): Promise<ControlReceipt> => {
  const receipt: ControlReceipt = {
    schema: 'ki/agent-control/v1',
    operationId: operation.id,
    operation: operation.operation,
    run: directory.slice(directory.lastIndexOf('/') + 1),
    target: operation.target,
    previousState: operation.previousState,
    timestamp: instant(context),
    ...result
  }
  await saveControl(directory, store)
  await mkdir(join(directory, 'control-receipts'), { recursive: true })
  await writeFile(join(directory, 'control-receipts', `${operation.id}.json`), `${JSON.stringify(receipt)}\n`, {
    flag: 'wx'
  })
  await appendFile(join(directory, 'control.journal.jsonl'), `${JSON.stringify({ phase: 'observed', receipt })}\n`)
  operation.receipt = receipt
  await saveControl(directory, store)
  return receipt
}

const registryTargets = (store: ControlStore): DependencyIdentity[] => {
  const targets = new Map<string, DependencyIdentity>()
  for (const attempt of [...Object.values(store.history), ...Object.values(store.attempts)])
    targets.set(attempt.token, {
      agent: attempt.agent,
      attempt: attempt.attempt,
      token: attempt.token,
      entry: attempt.entry,
      registered: attempt.registered
    })
  for (const entry of Object.values(store.entries))
    targets.set(entry.token, {
      agent: entry.name,
      attempt: entry.attempt,
      token: entry.token,
      entry: entry.id,
      registered: entry.registered
    })
  return [...targets.values()]
}

export const nextIdentity = (store: ControlStore): number => {
  if (store.nextIdentity >= Number.MAX_SAFE_INTEGER)
    throw new KiError('identity-capacity: no further identity can be reserved safely', 1)
  store.nextIdentity += 1
  return store.nextIdentity
}

export const dependencyTargets = (
  store: ControlStore,
  names: readonly string[]
): Record<string, DependencyIdentity | null> =>
  Object.fromEntries(
    names.map((name) => {
      const current = store.attempts[name]
      const target = current
        ? {
            agent: current.agent,
            attempt: current.attempt,
            token: current.token,
            entry: current.entry,
            registered: current.registered
          }
        : registryTargets(store)
            .filter((target) => target.agent === name)
            .sort((left, right) => right.registered - left.registered)[0]
      return [name, target ?? null]
    })
  )

/** Registration order preserves first-future binding across crashes, even when a later
 * attempt is already present before the dependent next polls. Binding and registration
 * persist in the same atomic snapshot; replay reconstructs either interrupted projection.
 */
const bindDependants = (store: ControlStore): void => {
  const targets = registryTargets(store)
  for (const item of [...Object.values(store.attempts), ...Object.values(store.entries)]) {
    if (item.state !== 'held' && item.state !== 'queued' && item.state !== 'claimed') continue
    for (const name of Object.keys(item.dependencies)) {
      const after = targets
        .filter((target) => target.agent === name && target.registered > item.registered)
        .sort((left, right) => left.registered - right.registered)[0]
      const target = item.requestedDependencies[name] ?? after
      if (target && item.dependencies[name] === null) item.dependencies[name] = structuredClone(target)
      else if (canonical(item.dependencies[name]) !== canonical(target ?? null))
        throw new KiError('control-state-unverified: a dependency binding changed', 1)
    }
  }
}

export const effectIdentity = (operation: ControlOperation): AgentEffectIdentity => ({
  operationId: operation.id,
  operation: operation.operation,
  payloadSha256: createHash('sha256').update(operation.payload).digest('hex')
})

export const identity = (
  context: AgentContext,
  store: ControlStore,
  run: string,
  name: string,
  runtime: string,
  workdir: string,
  entry?: QueueIdentity,
  waitFor: readonly string[] = [],
  minimumAttempt = 1
): AttemptIdentity => ({
  dependencies: structuredClone(entry?.dependencies ?? dependencyTargets(store, waitFor)),
  requestedDependencies: structuredClone(entry?.requestedDependencies ?? dependencyTargets(store, waitFor)),
  registered: entry?.registered ?? nextIdentity(store),
  run,
  agent: name,
  attempt:
    entry?.attempt ??
    Math.max(
      minimumAttempt - 1,
      store.attempts[name]?.attempt ?? 0,
      ...Object.values(store.entries)
        .filter((entry) => entry.name === name)
        .map((entry) => entry.attempt)
    ) + 1,
  token: entry?.token ?? randomUUID(),
  runtime,
  workdir,
  workHome: store.workHome,
  work: store.work,
  machine: store.machine,
  launcher: context.launcher.join(' '),
  scope: entry?.scope ?? randomUUID(),
  entry: entry?.id,
  state: 'held'
})
