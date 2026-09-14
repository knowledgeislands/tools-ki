import type { WorkItem } from './items.ts'

export interface RoadmapStatistics {
  readonly items: number
  readonly timestamped: number
  readonly missingTimestamps: number
  readonly active: number
  readonly medianAgeSeconds?: number
  readonly maximumAgeSeconds?: number
  readonly medianInactivitySeconds?: number
  readonly maximumInactivitySeconds?: number
  readonly stale: readonly string[]
  readonly futureTimestamps: readonly string[]
}

const median = (values: readonly number[]): number | undefined => {
  if (!values.length) return undefined
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
}

export const roadmapStatistics = (
  items: readonly WorkItem[],
  now: number,
  staleAfterSeconds?: number
): RoadmapStatistics => {
  const timestamped = items.filter((item) => item.createdAt && item.updatedAt)
  const hasFutureTimestamp = (item: WorkItem): boolean =>
    Date.parse(item.createdAt as string) > now || Date.parse(item.updatedAt as string) > now
  const futureTimestamps = timestamped.filter(hasFutureTimestamp).map((item) => item.id)
  const usable = timestamped.filter((item) => !hasFutureTimestamp(item))
  const ages = usable.map((item) => Math.floor((now - Date.parse(item.createdAt as string)) / 1000))
  const inactivity = usable.map((item) => Math.floor((now - Date.parse(item.updatedAt as string)) / 1000))
  const medianAgeSeconds = median(ages)
  const medianInactivitySeconds = median(inactivity)
  const stale =
    staleAfterSeconds === undefined
      ? []
      : usable
          .filter(
            (item) => item.status !== 'done' && now - Date.parse(item.updatedAt as string) >= staleAfterSeconds * 1000
          )
          .map((item) => item.id)
  return {
    items: items.length,
    timestamped: timestamped.length,
    missingTimestamps: items.length - timestamped.length,
    active: items.filter((item) => item.status !== 'done').length,
    ...(medianAgeSeconds === undefined ? {} : { medianAgeSeconds, maximumAgeSeconds: Math.max(...ages) }),
    ...(medianInactivitySeconds === undefined
      ? {}
      : { medianInactivitySeconds, maximumInactivitySeconds: Math.max(...inactivity) }),
    stale,
    futureTimestamps
  }
}
