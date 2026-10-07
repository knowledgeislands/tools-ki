import { type TaskLinks, type WorkItemHold, type WorkItemLane, workItemLane } from './items.ts'
import type { RoadmapListResult } from './operations.ts'

const ROADMAP_REPORT_SCHEMA = 'ki/roadmap/v1' as const

interface RoadmapReport {
  readonly schema: typeof ROADMAP_REPORT_SCHEMA
  readonly repositories: readonly {
    readonly identity: string | null
    readonly repository: string | null
    readonly roadmap: 'present' | 'absent' | 'unavailable'
    readonly items: number
  }[]
  readonly items: readonly {
    readonly identity: string
    readonly repository: string
    readonly id: string
    readonly area: string | null
    readonly theme: string | null
    readonly title: string
    readonly horizon: string | null
    readonly status: string
    readonly lane: WorkItemLane
    readonly kind: string | null
    readonly purpose: string | null
    readonly project: string | null
    readonly initiative: string | null
    readonly component: string | null
    readonly hold?: WorkItemHold
    readonly resolution?: string
    readonly resolutionTarget?: string
    readonly legacy: readonly string[]
    readonly blocks: readonly string[]
    readonly blockedBy: readonly string[]
    readonly createdAt: string
    readonly updatedAt: string
    readonly record: string
    readonly taskLinks?: TaskLinks
  }[]
}

const roadmapState = (result: RoadmapListResult): 'present' | 'absent' | 'unavailable' => {
  if (result.diagnostic || result.faults?.length) return 'unavailable'
  return result.roadmap === 'absent' ? 'absent' : 'present'
}

/** Projects validated work evidence without exposing repository roots or renderer state. */
export const roadmapReport = (results: readonly RoadmapListResult[]): RoadmapReport => ({
  schema: ROADMAP_REPORT_SCHEMA,
  repositories: results.map((result) => ({
    identity: result.repositoryIdentity ?? null,
    repository: result.repositoryUrl ?? null,
    roadmap: roadmapState(result),
    items: result.items?.length ?? 0
  })),
  items: results.flatMap((result) => {
    if (!result.repositoryIdentity || !result.repositoryUrl) return []
    return (result.projectedItems ?? []).map((item) => ({
      identity: result.repositoryIdentity as string,
      repository: result.repositoryUrl as string,
      id: item.id,
      area: item.area ?? null,
      theme: item.theme ?? null,
      title: item.title,
      horizon: item.horizon ?? null,
      status: item.status,
      lane: workItemLane(item),
      kind: item.kind ?? null,
      purpose: item.purpose ?? null,
      project: item.project ?? null,
      initiative: item.initiative ?? null,
      component: item.component ?? null,
      ...(item.hold ? { hold: item.hold } : {}),
      ...(item.resolution ? { resolution: item.resolution } : {}),
      ...(item.resolutionTarget ? { resolutionTarget: item.resolutionTarget } : {}),
      legacy: item.legacy ?? [],
      blocks: item.blocks,
      blockedBy: item.blockedBy,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      record: item.record,
      ...(item.taskLinks ? { taskLinks: item.taskLinks } : {})
    }))
  })
})
