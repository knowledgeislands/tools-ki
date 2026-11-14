import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Warnings that core readers raise while one CLI invocation runs, such as a retired spelling read
 * for its last release. `run` opens a scope for each invocation and prints what was noted, once
 * each, to that invocation's stderr after the command ends, so a reader deep in the core needs no
 * stream of its own and two invocations in one process never share a notice.
 */
const scope = new AsyncLocalStorage<Set<string>>()

/** Runs `operation` in a fresh notice scope, handing every notice raised in it to `report`, once each. */
export const withNotices = async <T>(operation: () => Promise<T>, report: (notice: string) => void): Promise<T> => {
  const notices = new Set<string>()
  try {
    return await scope.run(notices, operation)
  } finally {
    for (const notice of notices) report(notice)
  }
}

/** Notes a warning for the current invocation. */
export const notice = (message: string): void => {
  const notices = scope.getStore()
  // Every CLI invocation opens a scope in `run`; only a direct core call outside the CLI has none.
  /* v8 ignore next */
  if (!notices) return
  notices.add(message)
}

/** Withdraws a warning the invocation has since resolved, such as a retired key it has just renamed. */
export const withdrawNotice = (message: string): void => {
  // `ki repo repair` withdraws only after a read inside its own invocation's scope.
  /* v8 ignore next */
  scope.getStore()?.delete(message)
}
