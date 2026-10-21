import { randomUUID } from 'node:crypto'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { hostname } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { KiError } from '../errors.ts'

/** Process birth and host identify the holder for explicit offline recovery; never a takeover heuristic. */
const holder = { machine: hostname(), pid: process.pid, birth: new Date(performance.timeOrigin).toISOString() }

export const withRunLock = async <T>(
  directory: string,
  kind: 'control' | 'events',
  action: () => Promise<T>
): Promise<T> => {
  const lock = join(directory, `${kind}.lock`)
  const token = randomUUID()
  const contents = `${JSON.stringify({ ...holder, token })}\n`
  let acquired = false
  for (let retry = 0; retry < 100; retry += 1) {
    try {
      await writeFile(lock, contents, { flag: 'wx' })
      acquired = true
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
        throw new KiError(`${kind}-transaction-unavailable: ${String(error)}`, 1)
      await delay(20)
    }
  }
  if (!acquired)
    throw new KiError(
      `${kind}-transaction-busy: retry after the holder finishes; for verified offline recovery see docs/guides/user/background-agents.md#recover-an-abandoned-lock`,
      1
    )
  const release = async (): Promise<void> => {
    // Only the unchanged holder may release its lock.
    if ((await readFile(lock, 'utf8')) !== contents)
      throw new KiError(`${kind}-transaction-unverified: lock ownership changed; preserve all evidence`, 1)
    await rm(lock)
  }
  try {
    return await action()
  } finally {
    await release()
  }
}
