import type { AttemptIdentity, ProcessIdentity } from './identities.ts'
import type { ScopeObservation } from './processes.ts'

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
