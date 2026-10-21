import { randomUUID } from 'node:crypto'
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { KiError } from '../errors.ts'
import type { AgentProcesses } from './processes.ts'

/** Process birth and host identify a holder for explicit offline recovery; never a takeover heuristic. */
const holder = { machine: hostname(), pid: process.pid, birth: new Date(performance.timeOrigin).toISOString() }
const recovery = 'see docs/guides/user/background-agents.md#recover-an-abandoned-lock'

export const withRunLock = async <T>(
  directory: string,
  kind: 'control' | 'events',
  action: () => Promise<T>,
  onExit: AgentProcesses['onExit'],
  retries = 100
): Promise<T> => {
  const lock = join(directory, `${kind}.lock`)
  const contents = `${JSON.stringify({ ...holder, token: randomUUID() })}\n`
  let acquired = false
  for (let retry = 0; retry < retries; retry += 1) {
    try {
      writeFileSync(lock, contents, { flag: 'wx' })
      acquired = true
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
        throw new KiError(`${kind}-transaction-unavailable: ${String(error)}`, 1)
      if (retry + 1 < retries) await delay(20)
    }
  }
  if (!acquired) {
    const identity = await readFile(lock, 'utf8').catch((error: unknown) => `unreadable holder: ${String(error)}`)
    throw new KiError(
      `${kind}-transaction-busy: holder ${identity.trim()}; retry after the holder finishes`,
      1,
      recovery
    )
  }
  let released = false
  const release = (): void => {
    if (released) return
    // Synchronous so SIGINT, SIGTERM and normal process exit can finish before termination.
    if (readFileSync(lock, 'utf8') !== contents)
      throw new KiError(`${kind}-transaction-unverified: lock ownership changed; preserve all evidence`, 1, recovery)
    unlinkSync(lock)
    released = true
  }
  const unregister = onExit?.(() => {
    try {
      release()
    } catch {
      /* Unverified ownership or I/O leaves the holder evidence for offline recovery. */
    }
  })
  try {
    return await action()
  } finally {
    try {
      release()
    } finally {
      unregister?.()
    }
  }
}
