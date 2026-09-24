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
    readonly theme: string
    readonly title: string
    readonly horizon: string
    readonly status: string
    readonly blocks: readonly string[]
    readonly blockedBy: readonly string[]
    readonly createdAt: string
    readonly updatedAt: string
    readonly record: string
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
      theme: item.theme,
      title: item.title,
      horizon: item.horizon,
      status: item.status,
      blocks: item.blocks,
      blockedBy: item.blockedBy,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      record: item.record
    }))
  })
})
