import { KiError } from '../errors.ts'
import type { AgentContext } from './context.ts'
import type { ControlStore } from './control-store.ts'
import type { AttemptIdentity, ProcessIdentity } from './identities.ts'
import type { ScopeObservation } from './processes.ts'

/** Notification only: a lost scope never grants replacement or lock takeover. */
export const ownershipLoss = async (
  context: AgentContext,
  store: ControlStore,
  attempt: AttemptIdentity,
  alive: boolean
): Promise<{ operation: string; text: string } | undefined> => {
  if (['stopped', 'done', 'failed'].includes(attempt.state)) return undefined
  let reason = attempt.state === 'held' && !alive ? 'held supervisor unavailable' : undefined
  if (!reason && attempt.owner && context.processes.control) {
    try {
      const scope = await context.processes.control.inspect(attempt)
      if (!ownsScope(attempt, scope) || !scope.containment || (attempt.state === 'held' && scope.empty))
        reason = 'attempt scope ownership or containment unavailable'
    } catch {
      reason = 'attempt scope inspection unavailable'
    }
  }
  if (!reason) return undefined
  const operation = Object.values(store.operations).findLast(
    (operation) =>
      ['stop', 'spawn', 'spawn-supervisor'].includes(operation.operation) &&
      (operation.target as { token: string }).token === attempt.token
  )
  if (!operation) throw new KiError('control-state-unverified: owned attempt has no operation identity', 1)
  return {
    operation: operation.id,
    text: `${operation.id}: ownership-unverified; ${reason}; inspect preserved evidence before recovery or launch --relaunch`
  }
}

/** A PID alone, partial birth record or a different contained scope is never ownership. */
export const ownsScope = (attempt: AttemptIdentity, observation: ScopeObservation): boolean => {
  const owner = observation.owner
  if (!observation.ownership || observation.token !== attempt.token || observation.scope !== attempt.scope || !owner)
    return false
  if (
    !Number.isSafeInteger(owner.pid) ||
    owner.pid < 1 ||
    ![owner.birth, owner.session, owner.group, owner.token, owner.scope, owner.launcher].every(
      (value) => typeof value === 'string' && value.length > 0
    )
  )
    return false
  if (owner.token !== attempt.token || owner.scope !== attempt.scope || owner.launcher !== attempt.launcher)
    return false
  const old = attempt.owner
  const keys: readonly (keyof ProcessIdentity)[] = ['pid', 'birth', 'session', 'group', 'token', 'scope', 'launcher']
  return old === undefined || keys.every((key) => old[key] === owner[key])
}
