import { advancedTimestamp, type HoldReason, renderHold, type WorkItem, type WorkItemHold } from './items.ts'

/** The record's frontmatter lines before and after the mechanical pass, for a reviewed comparison. */
export interface WorkItemMigration {
  readonly id: string
  readonly file: string
  readonly before: readonly string[]
  readonly after: readonly string[]
  readonly notes: readonly string[]
  readonly contents: string
}

/** Stands in for a release condition the record's prose does not state, so review cannot miss it. */
export const HOLD_CONDITION_PLACEHOLDER = 'REVIEW: name the release condition'

const CONDITION_CUE = /\b(?:waiting (?:for|on)|waits? for|until|parked|on hold|blocked (?:by|on)|depends on|once)\b/i
const CONDITION_LIMIT = 200

/** Lifts the first prose sentence that states a waiting or parking condition, skipping headings and code. */
export const liftHoldCondition = (contents: string): string | undefined => {
  const body = contents.replace(/^---\n[\s\S]*?\n---(?:\n|$)/, '')
  let fenced = false
  for (const line of body.split('\n')) {
    if (/^\s*(?:```|~~~)/.test(line)) fenced = !fenced
    if (fenced || /^\s*(?:#|```|~~~|\||$)/.test(line)) continue
    const prose = line
      .replace(/^\s*(?:[-*+]|\d+\.)\s+(?:\[[ x]\]\s+)?/, '')
      .replace(/\s+/g, ' ')
      .trim()
    for (const sentence of prose.split(/(?<=[.!?])\s+/)) {
      if (!CONDITION_CUE.test(sentence)) continue
      if (sentence.length <= CONDITION_LIMIT) return sentence
      const cut = sentence.slice(0, CONDITION_LIMIT - 3)
      return `${cut.slice(0, cut.lastIndexOf(' '))}...`
    }
  }
  return undefined
}

const field = (lines: readonly string[], key: string): string | undefined => {
  const prefix = `${key}: `
  const line = lines.find((candidate) => candidate.startsWith(prefix))
  return line === undefined ? undefined : line.slice(prefix.length).replace(/^(['"])(.*)\1$/, '$2')
}

/**
 * Applies the mechanical pass to one record: Triage horizon to `status: triage`; Waiting for and Parked to Hold with
 * a lifted or placeholder condition and `waiting_on_trades` as `hold.trades`; a terminal Triage disposition to
 * `status: cancelled` with its `resolution`. It never touches `theme`, `kind`, `project` or `purpose`. Returns
 * undefined when the record needs no mechanical change, which makes the pass idempotent.
 */
export const migrateWorkItem = (
  item: WorkItem,
  file: string,
  contents: string,
  now: number
): WorkItemMigration | undefined => {
  const match = /^---\n([\s\S]*?)\n---/.exec(contents) as RegExpExecArray
  const before = (match[1] as string).split('\n')
  const disposition = field(before, 'intake_disposition')
  const notes: string[] = []
  let status: string | undefined
  let hold: WorkItemHold | undefined
  let resolution: readonly string[] = []
  if (item.horizon === 'triage' && item.status === 'draft') status = 'triage'
  else if (item.horizon === 'triage' && item.status === 'done' && disposition) {
    status = 'cancelled'
    const target = field(before, 'intake_disposition_target')
    resolution = [`resolution: ${disposition}`, ...(target ? [`resolution_target: ${target}`] : [])]
    notes.push('add a ## Cancelled section recording the approved disposition')
  } else if ((item.horizon === 'waiting-for' || item.horizon === 'parked') && item.status !== 'done') {
    const lifted = liftHoldCondition(contents)
    const held = [...new Set(field(before, 'waiting_on_trades')?.match(/TRD-[0-9a-f]{8}/g) ?? [])]
    hold = {
      reason: item.horizon as HoldReason,
      condition: lifted ?? HOLD_CONDITION_PLACEHOLDER,
      ...(held.length ? { trades: held } : {})
    }
    notes.push(lifted ? 'review the hold condition lifted from the record prose' : 'state the hold release condition')
  } else return undefined
  const updatedAt = advancedTimestamp(item.updatedAt, now)
  const after: string[] = []
  for (let index = 0; index < before.length; index++) {
    const line = before[index] as string
    const key = /^([a-z_-]+):/.exec(line)?.[1]
    if (key === 'waiting_on_trades' || key === 'intake_disposition' || key === 'intake_disposition_target') continue
    if (key === 'horizon') {
      if (hold) after.push('horizon: hold', ...renderHold(hold))
      continue
    }
    if (key === 'status' && status) {
      after.push(`status: ${status}`, ...resolution)
      continue
    }
    after.push(key === 'updated_at' ? `updated_at: ${updatedAt}` : line)
  }
  return {
    id: item.id,
    file,
    before: before.filter((line) => !after.includes(line)),
    after: after.filter((line) => !before.includes(line)),
    notes,
    contents: contents.replace(/^---\n[\s\S]*?\n---/, () => `---\n${after.join('\n')}\n---`)
  }
}
