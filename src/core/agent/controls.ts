import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { KiError } from '../errors.ts'
import { type AgentContext, checkName, instant, read, runDirectory } from './context.ts'
import {
  type AttemptIdentity,
  beginOperation,
  type ControlReceipt,
  type ControlStore,
  canonical,
  controlTransaction,
  effectIdentity,
  finishOperation,
  loadControl,
  saveControl,
  verifyStore
} from './control-store.ts'
import { readEvents, recordEvent } from './events.ts'
import type { ScopeObservation } from './processes.ts'
import { ownsScope as owned } from './scope.ts'
import { authorityReference, sha256 } from './selection.ts'

const storeFor = async (context: AgentContext, run: string): Promise<ControlStore> => {
  checkName(run, 'run')
  const store = await loadControl(runDirectory(context, run))
  if (!store)
    throw new KiError('ownership-unverified: legacy packet has no immutable attempt identity; no signal sent', 1)
  await verifyStore(context, run, store)
  return store
}

const stopCommand = (attempt: AttemptIdentity): string =>
  `ki agent stop ${attempt.run} ${attempt.agent} --attempt ${attempt.attempt} --reason <text>`
const event = async (
  context: AgentContext,
  directory: string,
  attempt: AttemptIdentity,
  kind: 'stop-requested' | 'stopped' | 'dequeued' | 'blocked',
  operation: string,
  text: string
): Promise<number> => {
  await recordEvent(
    context,
    directory,
    undefined,
    attempt.agent,
    kind,
    `${operation}: ${text}`,
    operation,
    attempt.attempt
  )
  const events = await readEvents(directory)
  return (events.find((entry) => entry.operation === operation && entry.kind === kind) as { seq: number }).seq
}

const terminal = async (directory: string, attempt: AttemptIdentity): Promise<'done' | 'failed' | undefined> => {
  if (attempt.state === 'done' || attempt.state === 'failed') return attempt.state
  if (/(?:^|\n)DONE$/.test((await read(join(directory, `${attempt.agent}.status`)))?.trimEnd() ?? ''))
    return (await read(join(directory, `${attempt.agent}.report.md`))) === undefined ? 'failed' : 'done'
  return undefined
}

export interface StopRequest {
  readonly run: string
  readonly name: string
  readonly attempt: number
  readonly reason: string
  readonly grace: number
  readonly request?: string | undefined
}

export const stopAgent = async (context: AgentContext, request: StopRequest): Promise<ControlReceipt> => {
  checkName(request.name, 'name')
  if (
    !Number.isSafeInteger(request.attempt) ||
    request.attempt < 1 ||
    !request.reason.trim() ||
    !Number.isSafeInteger(request.grace) ||
    request.grace < 1 ||
    request.grace > 120
  )
    throw new KiError('invalid stop attempt, reason or grace (1-120 seconds)', 2)
  await storeFor(context, request.run)
  return controlTransaction(context, request.run, async (directory) => {
    const store = await storeFor(context, request.run)
    const body = {
      run: request.run,
      name: request.name,
      attempt: request.attempt,
      reason: request.reason,
      grace: request.grace
    }
    const retry = request.request === undefined ? undefined : store.operations[request.request]
    const queued = Object.values(store.entries).find(
      (entry) =>
        entry.name === request.name &&
        entry.attempt === request.attempt &&
        (entry.state === 'queued' || entry.state === 'claimed')
    )
    if (
      queued ||
      (retry?.operation === 'stop' && (retry.previousState === 'queued' || retry.previousState === 'claimed'))
    ) {
      const target = queued ?? (retry?.target as { id: string; state: string })
      const operation = await beginOperation(
        context,
        directory,
        store,
        'stop',
        body,
        target,
        target.state,
        request.request
      )
      if (operation.receipt) return operation.receipt
      const entry = store.entries[(operation.target as { id: string }).id]
      const command = `ki agent dequeue ${request.run} ${request.name} --entry ${(operation.target as { id: string }).id} --reason <text>`
      return finishOperation(context, directory, store, operation, {
        resultingState: entry?.state ?? operation.previousState,
        outcome: 'queued-use-dequeue',
        reason: command,
        dequeueCommand: command,
        exitCode: 1
      })
    }
    const active = store.attempts[request.name]
    const attempt =
      active?.attempt === request.attempt
        ? active
        : Object.values(store.history).find(
            (attempt) => attempt.agent === request.name && attempt.attempt === request.attempt
          )
    if (!attempt) throw new KiError('attempt-mismatch: no recorded immutable attempt', 1)
    if (store.attempts[request.name]?.token === attempt.token) store.attempts[request.name] = attempt
    else if (!['done', 'failed', 'stopped'].includes(attempt.state))
      throw new KiError('ownership-unverified: historical attempt has no confirmed terminal scope', 1)
    const operation = await beginOperation(
      context,
      directory,
      store,
      'stop',
      body,
      { ...attempt },
      attempt.state,
      request.request
    )
    if (operation.receipt) return operation.receipt
    const finish = (
      outcome: string,
      reason: string,
      exitCode: 0 | 1,
      eventSequence?: number
    ): Promise<ControlReceipt> =>
      finishOperation(context, directory, store, operation, {
        resultingState: attempt.state,
        outcome,
        reason,
        exitCode,
        eventSequence
      })
    if (attempt.state === 'stopped')
      return operation.previousState === 'stopped'
        ? finish('already-stopped', request.reason, 0)
        : finish(
            'stopped',
            request.reason,
            0,
            await event(context, directory, attempt, 'stopped', operation.id, request.reason)
          )
    const adapter = context.processes.control
    const natural = await terminal(directory, attempt)
    if (natural && (!adapter || !attempt.owner || attempt.state === 'done' || attempt.state === 'failed')) {
      attempt.state = natural
      return finish('already-terminal', natural, 0)
    }
    if (!adapter || !attempt.owner)
      return finish(
        'containment-unverified',
        'the native adapter has no verified descendant-containment evidence; no signal sent',
        1
      )
    const previous = attempt.state
    attempt.state = 'stop-requested'
    await saveControl(directory, store)
    await event(context, directory, attempt, 'stop-requested', operation.id, request.reason)
    let observation: ScopeObservation
    try {
      observation = await adapter.inspect(attempt)
    } catch {
      attempt.state = 'unconfirmed'
      return finish(
        'ownership-unverified',
        'ownership observation failed; no signal sent',
        1,
        await event(context, directory, attempt, 'blocked', operation.id, 'ownership-unverified')
      )
    }
    if (!owned(attempt, observation) || !observation.containment) {
      attempt.state = 'unconfirmed'
      const outcome = owned(attempt, observation) ? 'containment-unverified' : 'ownership-unverified'
      return finish(
        outcome,
        'no signal sent',
        1,
        await event(context, directory, attempt, 'blocked', operation.id, outcome)
      )
    }
    if (observation.empty && observation.fenced && (natural || observation.terminal)) {
      attempt.state = observation.terminal === 'failed' ? 'failed' : (natural ?? 'failed')
      return finish('already-terminal', attempt.state, 0)
    }
    if (observation.empty && observation.fenced && previous !== 'stop-requested' && previous !== 'stop-timeout') {
      attempt.state = 'failed'
      return finish('already-terminal', 'dead before stop request: failed', 0)
    }
    try {
      if (!observation.empty) await adapter.terminate(attempt, effectIdentity(operation))
    } catch {
      attempt.state = 'unconfirmed'
      return finish(
        'ownership-unverified',
        'SIGTERM was refused or its outcome is uncertain',
        1,
        await event(context, directory, attempt, 'blocked', operation.id, 'ownership-unverified')
      )
    }
    const deadline = context.now() + request.grace * 1000
    for (;;) {
      try {
        observation = await adapter.inspect(attempt)
      } catch {
        attempt.state = 'unconfirmed'
        return finish(
          'ownership-unverified',
          'observation lost after SIGTERM',
          1,
          await event(context, directory, attempt, 'blocked', operation.id, 'ownership-unverified')
        )
      }
      if (!owned(attempt, observation) || !observation.containment) {
        attempt.state = 'unconfirmed'
        return finish(
          'ownership-unverified',
          'whole-scope ownership lost after SIGTERM',
          1,
          await event(context, directory, attempt, 'blocked', operation.id, 'ownership-unverified')
        )
      }
      if (observation.empty && observation.fenced) {
        if (observation.terminal) {
          attempt.state =
            observation.terminal === 'done' ? ((await terminal(directory, attempt)) ?? 'failed') : 'failed'
          return finish('already-terminal', attempt.state, 0)
        }
        attempt.state = 'stopped'
        await saveControl(directory, store)
        return finish(
          'stopped',
          request.reason,
          0,
          await event(context, directory, attempt, 'stopped', operation.id, request.reason)
        )
      }
      if (context.now() >= deadline) {
        attempt.state = 'stop-timeout'
        return finish(
          'stop-timeout',
          'the attempt remains live or can still spawn; no escalation sent',
          1,
          await event(context, directory, attempt, 'blocked', operation.id, 'stop-timeout')
        )
      }
      await context.processes.sleep(Math.min(100, deadline - context.now()))
    }
  })
}

export interface DequeueRequest {
  readonly run: string
  readonly name: string
  readonly entry: string
  readonly reason: string
  readonly request?: string | undefined
}
export const dequeueAgent = async (context: AgentContext, request: DequeueRequest): Promise<ControlReceipt> => {
  checkName(request.name, 'name')
  checkName(request.entry, 'entry')
  if (!request.reason.trim()) throw new KiError('dequeue needs a reason', 2)
  await storeFor(context, request.run)
  return controlTransaction(context, request.run, async (directory) => {
    const store = await storeFor(context, request.run)
    const entry = store.entries[request.entry]
    if (!entry || entry.name !== request.name) throw new KiError('unknown-entry: no matching queue identity', 1)
    const attempt =
      store.attempts[entry.name]?.token === entry.token ? store.attempts[entry.name] : store.history[entry.token]
    const operation = await beginOperation(
      context,
      directory,
      store,
      'dequeue',
      { run: request.run, name: request.name, entry: request.entry, reason: request.reason },
      entry,
      entry.state,
      request.request
    )
    if (operation.receipt) return operation.receipt
    const finish = (outcome: string, exitCode: 0 | 1, eventSequence?: number): Promise<ControlReceipt> =>
      finishOperation(context, directory, store, operation, {
        resultingState: entry.state,
        outcome,
        reason: request.reason,
        exitCode,
        eventSequence,
        ...(outcome === 'already-started' && attempt ? { stopCommand: stopCommand(attempt) } : {})
      })
    if (entry.state === 'cancelled') {
      if (entry.disposition !== 'dequeued') return finish('already-terminal', 0)
      return entry.cancellationOperation === operation.id
        ? finish(
            'cancelled-before-start',
            0,
            await event(
              context,
              directory,
              { agent: entry.name, attempt: entry.attempt } as AttemptIdentity,
              'dequeued',
              operation.id,
              request.reason
            )
          )
        : finish('already-dequeued', 0)
    }
    if (
      attempt?.entry === entry.id &&
      (['done', 'failed', 'stopped'].includes(attempt.state) ||
        (store.attempts[entry.name]?.token === entry.token && (await terminal(directory, attempt))))
    )
      return finish('already-terminal', 0)
    if (entry.state === 'started')
      return attempt?.entry === entry.id ? finish('already-started', 1) : finish('claim-unconfirmed', 1)
    if (entry.state === 'unconfirmed') return finish('claim-unconfirmed', 1)
    entry.state = 'cancelled'
    entry.disposition = 'dequeued'
    entry.cancellationOperation = operation.id
    await saveControl(directory, store)
    const target = { ...attempt, agent: entry.name, attempt: entry.attempt } as AttemptIdentity
    return finish(
      'cancelled-before-start',
      0,
      await event(context, directory, target, 'dequeued', operation.id, request.reason)
    )
  })
}

export const inspectRecovery = async (context: AgentContext, run: string, id: string): Promise<unknown> => {
  checkName(id, 'operation')
  const store = await storeFor(context, run)
  const operation = store.operations[id]
  if (!operation) throw new KiError('unknown-operation', 1)
  const path = join(runDirectory(context, run), 'control.journal.jsonl')
  const journal = ((await read(path)) as string)
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { phase: string; id?: string })
  const position = journal.findIndex((entry) => entry.phase === 'intent' && entry.id === id)
  if (position < 0) throw new KiError('journal-unverified: the original intent is unavailable', 1)
  const confirmed = operation.receipt !== undefined || operation.resolvedBy !== undefined
  return {
    schema: 'ki/agent-control/v1',
    operationId: id,
    operation: 'recover-inspect',
    run,
    target: operation.target,
    previousState: operation.previousState,
    resultingState: operation.receipt?.resultingState ?? operation.previousState,
    outcome: 'inspected',
    reason: confirmed ? 'confirmed' : 'unconfirmed',
    timestamp: instant(context),
    exitCode: 0,
    inspectedOperation: operation,
    journal: { path, intent: position + 1, tail: journal.length },
    requiredEvidence: confirmed
      ? null
      : {
          schema: 'ki/agent-reconciliation/v1',
          operation_id: id,
          target_id: (operation.target as AttemptIdentity).token,
          observations:
            operation.operation === 'spawn' || operation.operation === 'spawn-supervisor'
              ? ['spawn-started', 'spawn-not-started']
              : [],
          proofs:
            'non-empty absolute local adapter evidence references and SHA-256 digests; adapter-verified frozen operation and current containment identity; other operation kinds require owner-assisted local inspection'
        }
  }
}

interface RecoveryRequest {
  readonly run: string
  readonly operation: string
  readonly evidence: string
  readonly authority: string
  readonly request?: string | undefined
}
export const resolveRecovery = async (context: AgentContext, request: RecoveryRequest): Promise<ControlReceipt> => {
  checkName(request.operation, 'operation')
  const authority = await authorityReference(context, request.authority)
  const evidenceText = await readFile(resolve(context.workingDirectory, request.evidence), 'utf8').catch(
    () => undefined
  )
  let evidence: Record<string, unknown>
  try {
    evidence = JSON.parse(evidenceText ?? '') as Record<string, unknown>
  } catch {
    throw new KiError('reconciliation-unconfirmed: evidence is unavailable or invalid JSON', 1)
  }
  if (typeof evidence !== 'object' || evidence === null || Array.isArray(evidence))
    throw new KiError('reconciliation-unconfirmed: evidence must be an object', 1)
  await storeFor(context, request.run)
  return controlTransaction(context, request.run, async (directory) => {
    const store = await storeFor(context, request.run)
    const original = store.operations[request.operation]
    if (!original || !['spawn', 'spawn-supervisor'].includes(original.operation) || original.receipt)
      throw new KiError('reconciliation-unconfirmed: no uncertain spawn operation', 1)
    const attempt = structuredClone(original.target as AttemptIdentity)
    const current = store.attempts[attempt.agent]
    if (current && current.token !== attempt.token && current.attempt >= attempt.attempt)
      throw new KiError('reconciliation-unconfirmed: attempt identity changed', 1)
    const entry = attempt.entry === undefined ? undefined : store.entries[attempt.entry]
    const payload = {
      run: request.run,
      operation: request.operation,
      evidence: sha256(evidenceText as string),
      evidencePath: resolve(context.workingDirectory, request.evidence),
      authority
    }
    const repeated = request.request === undefined ? undefined : store.operations[request.request]
    if (repeated && (repeated.operation !== 'recover-resolve' || repeated.payload !== canonical(payload)))
      throw new KiError('request-conflict: operation ID has different arguments', 1)
    if (original.resolvedBy) {
      const resolved = store.operations[original.resolvedBy]
      const old =
        resolved && (JSON.parse(resolved.payload) as { evidence?: string; authority?: unknown; evidencePath?: string })
      if (
        resolved?.receipt &&
        old?.evidence === payload.evidence &&
        old.evidencePath === payload.evidencePath &&
        canonical(old.authority) === canonical(authority)
      )
        return resolved.receipt
      throw new KiError('reconciliation-unconfirmed: prior resolution differs or remains uncertain', 1)
    }
    const operation = await beginOperation(
      context,
      directory,
      store,
      'recover-resolve',
      payload,
      original.target,
      entry?.state ?? attempt.state,
      request.request
    )
    if (operation.receipt) return operation.receipt
    const finish = (outcome: string, exitCode: 0 | 1, observation?: ScopeObservation): Promise<ControlReceipt> =>
      finishOperation(context, directory, store, operation, {
        resultingState: entry?.state ?? attempt.state,
        outcome,
        reason: request.operation,
        exitCode,
        ...(outcome === 'spawn-started' ? { stopCommand: stopCommand(attempt) } : {}),
        evidence: {
          originalOperation: original.id,
          authority,
          path: resolve(context.workingDirectory, request.evidence),
          sha256: sha256(evidenceText as string),
          observation,
          verifiedAt: instant(context)
        }
      })
    if (
      evidence['schema'] !== 'ki/agent-reconciliation/v1' ||
      evidence['operation_id'] !== original.id ||
      evidence['target_id'] !== attempt.token ||
      !Array.isArray(evidence['proofs']) ||
      evidence['proofs'].length === 0 ||
      !context.processes.control
    )
      return finish('reconciliation-unconfirmed', 1)
    for (const proof of evidence['proofs'] as unknown[]) {
      if (typeof proof !== 'object' || proof === null) return finish('reconciliation-unconfirmed', 1)
      const item = proof as Record<string, unknown>
      if (typeof item['path'] !== 'string' || !item['path'].startsWith('/') || typeof item['sha256'] !== 'string')
        return finish('reconciliation-unconfirmed', 1)
      const content = await readFile(item['path'], 'utf8').catch(() => undefined)
      if (content === undefined || sha256(content) !== item['sha256']) return finish('reconciliation-unconfirmed', 1)
    }
    let observation: ScopeObservation
    try {
      const verified = await context.processes.control.verifyRecovery(attempt, evidence, effectIdentity(original))
      if (!verified) return finish('reconciliation-unconfirmed', 1)
      observation = await context.processes.control.inspect(attempt)
      if (canonical(verified) !== canonical(observation)) return finish('reconciliation-unconfirmed', 1, observation)
    } catch {
      return finish('reconciliation-unconfirmed', 1)
    }
    if (
      !observation.ownership ||
      observation.token !== attempt.token ||
      observation.scope !== attempt.scope ||
      !observation.containment
    )
      return finish('reconciliation-unconfirmed', 1, observation)
    if (
      evidence['observation'] === 'spawn-started' &&
      observation.workerStarted &&
      observation.owner &&
      owned(attempt, observation)
    ) {
      if (entry?.state === 'cancelled') return finish('reconciliation-unconfirmed', 1, observation)
      attempt.owner = observation.owner
      attempt.state = 'running'
      store.attempts[attempt.agent] = attempt
      if (entry) entry.state = 'started'
      original.resolvedBy = operation.id
      return finish('spawn-started', 0, observation)
    }
    if (
      evidence['observation'] === 'spawn-not-started' &&
      !observation.authorisationConsumed &&
      !observation.workerStarted &&
      observation.fenced &&
      (observation.owner === undefined || owned(attempt, observation))
    ) {
      if (entry && entry.state !== 'cancelled') entry.state = 'queued'
      attempt.state = 'failed'
      store.attempts[attempt.agent] = attempt
      if (entry) entry.operation = undefined
      original.resolvedBy = operation.id
      return finish('spawn-not-started', 0, observation)
    }
    return finish('reconciliation-unconfirmed', 1, observation)
  })
}
