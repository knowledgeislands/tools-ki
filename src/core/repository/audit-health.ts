// An island's audit health is read from its latest whole-repository `ki repo audit`, never
// declared, under the `ki-repo` standard's decline rule. Each such audit replaces one record per
// physical checkout in local state, so a newer failed attempt always replaces an older success.

import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Finding } from '../runtime/types.ts'

const RECORD_SCHEMA = 'ki/audit-health-record/v1' as const

export type AuditHealthState = 'sound' | 'decline' | 'ruin' | 'unknown'

export interface AuditHealth {
  readonly state: AuditHealthState
  readonly audit: 'completed' | 'incomplete' | null
  readonly observedAt: string | null
  readonly failures: number | null
  readonly warnings: number | null
}

type AuditOutcome =
  | { readonly audit: 'completed'; readonly failures: number; readonly warnings: number }
  | { readonly audit: 'incomplete' }

const recordPath = (stateDirectory: string, repository: string): string =>
  join(stateDirectory, 'audit-health', `${createHash('sha256').update(repository).digest('hex')}.json`)

/** The outcome of a completed audit; a registration failure fails the audit, so it counts as one. */
export const completedAudit = (findings: readonly Finding[], registration: string | undefined): AuditOutcome => ({
  audit: 'completed',
  failures: findings.filter((finding) => finding.level === 'fail').length + (registration ? 1 : 0),
  warnings: findings.filter((finding) => finding.level === 'warn').length
})

export const incompleteAudit: AuditOutcome = { audit: 'incomplete' }

export const recordAuditHealth = async (
  stateDirectory: string,
  repository: string,
  observedAt: number,
  outcome: AuditOutcome
): Promise<void> => {
  const path = recordPath(stateDirectory, repository)
  const staging = `${path}.${randomUUID()}.tmp`
  await mkdir(join(stateDirectory, 'audit-health'), { recursive: true })
  await writeFile(
    staging,
    `${JSON.stringify({ schema: RECORD_SCHEMA, repository, observedAt: new Date(observedAt).toISOString(), ...outcome }, null, 2)}\n`
  )
  await rename(staging, path)
}

const UNKNOWN: AuditHealth = { state: 'unknown', audit: null, observedAt: null, failures: null, warnings: null }

const count = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0

/** Failure first: an incomplete audit or any failure is ruin, then any warning is decline. */
const fromRecord = (record: Record<string, unknown>, repository: string): AuditHealth => {
  const { observedAt } = record
  if (
    record['schema'] !== RECORD_SCHEMA ||
    record['repository'] !== repository ||
    typeof observedAt !== 'string' ||
    Number.isNaN(Date.parse(observedAt))
  )
    return UNKNOWN
  if (record['audit'] === 'incomplete')
    return { state: 'ruin', audit: 'incomplete', observedAt, failures: null, warnings: null }
  const { failures, warnings } = record
  if (record['audit'] !== 'completed' || !count(failures) || !count(warnings)) return UNKNOWN
  const state = failures ? 'ruin' : warnings ? 'decline' : 'sound'
  return { state, audit: 'completed', observedAt, failures, warnings }
}

/** The recorded health of one checkout, or unknown when it has no readable record. */
export const readAuditHealth = async (stateDirectory: string, repository: string): Promise<AuditHealth> => {
  try {
    const record: unknown = JSON.parse(await readFile(recordPath(stateDirectory, repository), 'utf8'))
    return typeof record === 'object' && record !== null && !Array.isArray(record)
      ? fromRecord(record as Record<string, unknown>, repository)
      : UNKNOWN
  } catch {
    return UNKNOWN
  }
}
