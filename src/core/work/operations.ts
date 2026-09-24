import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { declaredRepositoryIdentity, readRepositoryDeclaration } from '../configuration/index.ts'
import { KiError } from '../errors.ts'
import { resolveRepositoryTargets } from '../repository/index.ts'
import type { LocatedTrade } from '../trade/model.ts'
import {
  pruneDoneWorkItems,
  readWorkItemInventoryIfPresent,
  readWorkItems,
  updateWorkItemHorizon,
  type WorkItem,
  type WorkItemFault,
  type WorkItemHorizon,
  workItemHorizons
} from './items.ts'
import { type RepositoryPlanningSource, readRepositoryPlanningSource } from './planning.ts'
import { type RoadmapStatistics, roadmapStatistics } from './statistics.ts'

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
  readonly now: () => number
  readonly locateTrades: () => Promise<readonly LocatedTrade[]>
}

export interface RoadmapListOptions {
  readonly horizon?: string
  readonly status?: string
  readonly includeProjection?: boolean
}

export interface RoadmapListItem extends WorkItem {
  readonly record: string
}

export interface RoadmapListResult {
  readonly repository: string
  readonly repositoryIdentity?: string
  readonly repositoryUrl?: string
  readonly trades: readonly LocatedTrade[]
  readonly tradeDiagnostic?: string
  readonly items?: readonly WorkItem[]
  readonly projectedItems?: readonly RoadmapListItem[]
  readonly faults?: readonly WorkItemFault[]
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

export interface RoadmapStatisticsResult {
  readonly repository: string
  readonly statistics?: RoadmapStatistics
  readonly roadmap?: 'absent'
  readonly diagnostic?: string
  readonly faults: readonly WorkItemFault[]
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

const repositoryIdentity = (repository: string): string => repository.slice('https://github.com/'.length)

const recordUrl = (repository: string, directory: string, file: string): string =>
  `${repository}/blob/HEAD/${`${directory}/${file}`
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`

const projectItems = async (
  root: string,
  repository: string,
  planning: RepositoryPlanningSource,
  items: readonly WorkItem[],
  faults: readonly WorkItemFault[]
): Promise<readonly RoadmapListItem[]> => {
  const faultFiles = new Set(faults.map((fault) => fault.file))
  const available = (await readdir(join(root, planning.directory)))
    .filter((file) => file.endsWith('.md') && !faultFiles.has(file))
    .sort()
  return items.map((item) => {
    const index = available.findIndex((file) => file.startsWith(`${item.id}-`))
    // The work-item reader obtained this item from one matching regular Markdown record.
    /* v8 ignore next -- protects a future inventory implementation that stops retaining its source entry. */
    const file = index === -1 ? undefined : available.splice(index, 1)[0]
    /* v8 ignore next -- protects a future inventory implementation that stops retaining its source entry. */
    if (!file) throw new KiError(`work item ${item.id} has no canonical record`, 2)
    return { ...item, record: recordUrl(repository, planning.directory, file) }
  })
}

const selectedItem = async (repository: string, planning: RepositoryPlanningSource, id: string): Promise<WorkItem> => {
  const items = (await readWorkItems(repository, planning)).filter((item) => item.id === id)
  if (items.length !== 1) throw new KiError(`repository ${repository} must contain exactly one work item ${id}`, 2)
  return items[0] as WorkItem
}

const movableHorizons = workItemHorizons.filter((horizon) => horizon !== 'triage')

const moveHorizon = (item: WorkItem, operation: RoadmapMove, requested?: string): WorkItemHorizon => {
  const current = movableHorizons.indexOf(item.horizon as (typeof movableHorizons)[number])
  const direction = operation === 'promote' ? -1 : 1
  const target =
    requested === undefined
      ? current + direction
      : movableHorizons.indexOf(requested as (typeof movableHorizons)[number])
  if (requested !== undefined && target === -1)
    throw new KiError(`roadmap ${operation} horizon must be one of ${movableHorizons.join(', ')}`, 2)
  if (current === -1)
    throw new KiError(`work item ${item.id} at triage must be adopted through the planning workflow`, 2)
  if (target < 0 || target >= movableHorizons.length)
    throw new KiError(`work item ${item.id} is already at the ${operation} limit`, 2)
  if ((operation === 'promote' && target >= current) || (operation === 'demote' && target <= current))
    throw new KiError(
      `roadmap ${operation} must move ${item.id} ${operation === 'promote' ? 'toward now' : 'toward future'}`,
      2
    )
  return movableHorizons[target] as WorkItemHorizon
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
      let projection: Pick<RoadmapListResult, 'repositoryIdentity' | 'repositoryUrl'> = {}
      try {
        const repositoryUrl = options.includeProjection
          ? declaredRepositoryIdentity(await readRepositoryDeclaration(repository.declaration))
          : undefined
        projection = repositoryUrl ? { repositoryIdentity: repositoryIdentity(repositoryUrl), repositoryUrl } : {}
        const planning = await readRepositoryPlanningSource(repository.declaration)
        const inventory = await readWorkItemInventoryIfPresent(repository.root, planning)
        const items = inventory === undefined ? undefined : filterItems(inventory.items, options)
        return {
          repository: repository.root,
          ...projection,
          trades,
          ...tradeContext,
          ...(inventory === undefined
            ? { roadmap: 'absent' as const }
            : {
                items,
                ...(options.includeProjection
                  ? {
                      projectedItems: await projectItems(
                        repository.root,
                        repositoryUrl as string,
                        planning,
                        items as readonly WorkItem[],
                        inventory.faults
                      )
                    }
                  : {}),
                faults: inventory.faults
              })
        }
      } catch (error) {
        /* v8 ignore next -- inventory failures are always KiError instances. */
        const diagnostic = error instanceof Error ? error.message : String(error)
        return {
          repository: repository.root,
          ...projection,
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
  await updateWorkItemHorizon(repository.root, planning, id, destination, context.now())
  return { id, from: item.horizon, to: destination }
}

export const roadmapStatisticsForSelection = async (
  context: RoadmapOperationContext,
  selection: RoadmapSelection,
  staleAfterSeconds?: number
): Promise<{
  readonly generatedAt: string
  readonly staleAfterSeconds?: number
  readonly aggregate: RoadmapStatistics
  readonly results: readonly RoadmapStatisticsResult[]
}> => {
  const listed = await listRoadmap(context, selection, {})
  const now = context.now()
  const aggregate = roadmapStatistics(
    listed.results.flatMap((result) => result.items ?? []),
    now,
    staleAfterSeconds
  )
  return {
    generatedAt: new Date(Math.floor(now / 1000) * 1000).toISOString().replace('.000Z', 'Z'),
    ...(staleAfterSeconds === undefined ? {} : { staleAfterSeconds }),
    aggregate,
    results: listed.results.map((result) => ({
      repository: result.repository,
      ...(result.roadmap ? { roadmap: result.roadmap } : {}),
      /* v8 ignore next -- target resolution fails before a statistics projection can receive a repository diagnostic. */
      ...(result.diagnostic ? { diagnostic: result.diagnostic } : {}),
      faults: result.faults ?? [],
      ...(result.items ? { statistics: roadmapStatistics(result.items, now, staleAfterSeconds) } : {})
    }))
  }
}
