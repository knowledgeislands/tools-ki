import { KiError } from '../errors.ts'
import { resolveRepositoryTargets } from '../repository/index.ts'
import type { LocatedTrade } from '../trade/model.ts'
import {
  pruneDoneWorkItems,
  readWorkItems,
  readWorkItemsIfPresent,
  updateWorkItemHorizon,
  type WorkItem,
  type WorkItemHorizon,
  workItemHorizons
} from './items.ts'
import { type RepositoryPlanningSource, readRepositoryPlanningSource } from './planning.ts'

export interface RoadmapSelection {
  readonly repositories: readonly string[]
  readonly agora?: string
  readonly estate?: boolean
}

export interface RoadmapOperationContext {
  readonly configurationDirectory: string
  readonly stateDirectory: string
  readonly workingDirectory: string
  readonly homeDirectory: string
  readonly locateTrades: () => Promise<readonly LocatedTrade[]>
}

export interface RoadmapListOptions {
  readonly horizon?: string
  readonly status?: string
}

export interface RoadmapListResult {
  readonly repository: string
  readonly trades: readonly LocatedTrade[]
  readonly tradeDiagnostic?: string
  readonly items?: readonly WorkItem[]
  readonly roadmap?: 'absent'
  readonly diagnostic?: string
}

export interface RoadmapList {
  readonly estate: readonly LocatedTrade[]
  readonly results: readonly RoadmapListResult[]
}

export interface RoadmapPruneResult {
  readonly repository: string
  readonly items: readonly WorkItem[]
}

export interface RoadmapMoveResult {
  readonly id: string
  readonly from: WorkItemHorizon
  readonly to: WorkItemHorizon
}

type RoadmapMove = 'promote' | 'demote'
type ResolvedRepository = Awaited<ReturnType<typeof resolveRepositoryTargets>>[number]

const resolveTargets = (
  context: RoadmapOperationContext,
  selection: RoadmapSelection
): Promise<readonly ResolvedRepository[]> =>
  resolveRepositoryTargets({
    ...selection,
    configurationDirectory: context.configurationDirectory,
    stateDirectory: context.stateDirectory,
    workingDirectory: context.workingDirectory,
    homeDirectory: context.homeDirectory
  })

const oneMutationTarget = async (
  context: RoadmapOperationContext,
  selection: RoadmapSelection,
  operation: 'prune' | RoadmapMove
): Promise<ResolvedRepository> => {
  const repositories = await resolveTargets(context, selection)
  const repository = repositories[0]
  if (repositories.length !== 1 || !repository)
    throw new KiError(`ki repo roadmap ${operation} requires exactly one repository target`, 2)
  return repository
}

const filterItems = (items: readonly WorkItem[], options: RoadmapListOptions): readonly WorkItem[] =>
  items.filter(
    (item) =>
      (!options.horizon || item.horizon === options.horizon) && (!options.status || item.status === options.status)
  )

const selectedItem = async (repository: string, planning: RepositoryPlanningSource, id: string): Promise<WorkItem> => {
  const items = (await readWorkItems(repository, planning)).filter((item) => item.id === id)
  if (items.length !== 1) throw new KiError(`repository ${repository} must contain exactly one work item ${id}`, 2)
  return items[0] as WorkItem
}

const moveHorizon = (item: WorkItem, operation: RoadmapMove, requested?: string): WorkItemHorizon => {
  const current = workItemHorizons.indexOf(item.horizon)
  const direction = operation === 'promote' ? -1 : 1
  const target = requested === undefined ? current + direction : workItemHorizons.indexOf(requested as WorkItemHorizon)
  if (requested !== undefined && target === -1)
    throw new KiError(`roadmap ${operation} horizon must be one of ${workItemHorizons.join(', ')}`, 2)
  if (target < 0 || target >= workItemHorizons.length)
    throw new KiError(`work item ${item.id} is already at the ${operation} limit`, 2)
  if ((operation === 'promote' && target >= current) || (operation === 'demote' && target <= current))
    throw new KiError(
      `roadmap ${operation} must move ${item.id} ${operation === 'promote' ? 'toward now' : 'toward future'}`,
      2
    )
  return workItemHorizons[target] as WorkItemHorizon
}

export const listRoadmap = async (
  context: RoadmapOperationContext,
  selection: RoadmapSelection,
  options: RoadmapListOptions
): Promise<RoadmapList> => {
  const repositories = await resolveTargets(context, selection)
  const inventory: { readonly estate: readonly LocatedTrade[]; readonly diagnostic?: string } = await context
    .locateTrades()
    .then((estate) => ({ estate }))
    .catch((error) => ({
      estate: [] as readonly LocatedTrade[],
      // locateTrades normalizes every failure to a KiError before this boundary.
      /* v8 ignore next */
      diagnostic: error instanceof Error ? error.message : String(error)
    }))
  const results = await Promise.all(
    repositories.map(async (repository): Promise<RoadmapListResult> => {
      const trades = inventory.estate.filter((trade) => trade.root === repository.root)
      const tradeContext = inventory.diagnostic ? { tradeDiagnostic: inventory.diagnostic } : {}
      try {
        const planning = await readRepositoryPlanningSource(repository.declaration)
        const items = await readWorkItemsIfPresent(repository.root, planning)
        return {
          repository: repository.root,
          trades,
          ...tradeContext,
          ...(items === undefined ? { roadmap: 'absent' as const } : { items: filterItems(items, options) })
        }
      } catch (error) {
        /* v8 ignore next -- inventory failures are always KiError instances. */
        const diagnostic = error instanceof Error ? error.message : String(error)
        return {
          repository: repository.root,
          trades,
          ...tradeContext,
          diagnostic
        }
      }
    })
  )
  return { estate: inventory.estate, results }
}

export const pruneRoadmap = async (
  context: RoadmapOperationContext,
  selection: RoadmapSelection,
  id?: string
): Promise<readonly RoadmapPruneResult[]> => {
  const repositories =
    id === undefined ? await resolveTargets(context, selection) : [await oneMutationTarget(context, selection, 'prune')]
  const sources = await Promise.all(
    repositories.map(async (repository) => ({
      repository,
      planning: await readRepositoryPlanningSource(repository.declaration)
    }))
  )
  await Promise.all(sources.map(({ repository, planning }) => readWorkItems(repository.root, planning)))
  return Promise.all(
    sources.map(async ({ repository, planning }) => ({
      repository: repository.root,
      items: await pruneDoneWorkItems(repository.root, planning, id)
    }))
  )
}

export const moveRoadmapItem = async (
  context: RoadmapOperationContext,
  selection: RoadmapSelection,
  operation: RoadmapMove,
  id: string,
  requested?: string
): Promise<RoadmapMoveResult> => {
  const repository = await oneMutationTarget(context, selection, operation)
  const planning = await readRepositoryPlanningSource(repository.declaration)
  const item = await selectedItem(repository.root, planning, id)
  const destination = moveHorizon(item, operation, requested)
  await updateWorkItemHorizon(repository.root, planning, id, destination)
  return { id, from: item.horizon, to: destination }
}
