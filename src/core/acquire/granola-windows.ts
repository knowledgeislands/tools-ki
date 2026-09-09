import { KiError } from '../errors.ts'
import type { GranolaMeeting, GranolaSource, GranolaWindow } from './granola-source.ts'
import { sha256, stableJson } from './granola-source.ts'

export interface GranolaWindowEvidence extends GranolaWindow {
  readonly scope: string
  readonly count: number
  readonly responseSha256: string
  readonly saturated: boolean
}

export interface GranolaEnumeration {
  readonly meetings: ReadonlyMap<string, GranolaMeeting>
  readonly evidence: readonly GranolaWindowEvidence[]
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY = 86_400_000

const dayNumber = (value: string): number => {
  const match = DATE.exec(value)
  if (!match) throw new KiError('Granola dates must use YYYY-MM-DD')
  const milliseconds = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const canonical = new Date(milliseconds).toISOString().slice(0, 10)
  if (canonical !== value) throw new KiError(`Granola date is invalid: ${value}`)
  return milliseconds / DAY
}

const dateFromDay = (value: number): string => new Date(value * DAY).toISOString().slice(0, 10)

export const granolaInterval = (since: string, until: string): GranolaWindow => {
  if (dayNumber(since) > dayNumber(until)) throw new KiError('Granola --since must not be after --until')
  return { since, until }
}

const children = (window: GranolaWindow): readonly GranolaWindow[] => {
  const first = dayNumber(window.since)
  const last = dayNumber(window.until)
  if (first === last) return []
  if (last - first === 1)
    return [
      { since: window.since, until: window.since },
      { since: window.until, until: window.until }
    ]
  const middle = Math.floor((first + last) / 2)
  return [
    { since: window.since, until: dateFromDay(middle) },
    { since: dateFromDay(middle), until: window.until }
  ]
}

const addMeeting = (meetings: Map<string, GranolaMeeting>, meeting: GranolaMeeting): void => {
  const previous = meetings.get(meeting.id)
  if (previous && stableJson(previous.projection) !== stableJson(meeting.projection))
    throw new KiError(`Granola meeting ${meeting.id} has conflicting discovery projections`)
  meetings.set(meeting.id, meeting)
}

export const enumerateGranolaMeetings = async (
  source: GranolaSource,
  interval: GranolaWindow,
  folderId?: string
): Promise<GranolaEnumeration> => {
  const scope = folderId ? `folder:${folderId}` : 'global'
  const evidence: GranolaWindowEvidence[] = []
  const meetings = new Map<string, GranolaMeeting>()
  const visit = async (window: GranolaWindow): Promise<void> => {
    const response = await source.meetings(window, folderId)
    const saturated = response.meetings.length === 100
    evidence.push({
      ...window,
      scope,
      count: response.meetings.length,
      responseSha256: response.projectionSha256,
      saturated
    })
    if (saturated) {
      const split = children(window)
      if (!split.length)
        throw new KiError(`Granola ${scope} window ${window.since} is saturated; complete enumeration cannot be proven`)
      for (const child of split) await visit(child)
      return
    }
    for (const meeting of response.meetings) addMeeting(meetings, meeting)
  }
  await visit(interval)
  return { meetings, evidence }
}

export const identityCheckpointSha256 = (
  global: GranolaEnumeration,
  folders: ReadonlyMap<string, GranolaEnumeration>
): string =>
  sha256(
    stableJson({
      global: [...global.meetings.keys()].sort(),
      folders: [...folders.entries()]
        .sort(([left], [right]) => left.localeCompare(right, 'en'))
        .map(([id, result]) => ({ id, meetings: [...result.meetings.keys()].sort() })),
      windows: [...global.evidence, ...[...folders.values()].flatMap((result) => result.evidence)]
    })
  )
