import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { declaredRepositoryIdentity, readRepositoryDeclaration } from '../configuration/index.ts'
import { KiError } from '../errors.ts'
import { prepareWrites, publishWrites } from '../filesystem/index.ts'
import { resolveRepositoryTargets } from '../repository/index.ts'
import type { LocatedTrade } from '../trade/model.ts'
import {
  hasWorkItemRoot,
  isAllowedHorizon,
  type LegacyWorkItemHorizon,
  readWorkItemInventoryIfPresent,
  readWorkItemRecordInventory,
  readWorkItems,
  removeWorkItemRecords,
  selectTerminalWorkItems,
  updateWorkItemHorizon,
  type WorkItem,
  type WorkItemFault,
  type WorkItemHold,
  type WorkItemHorizon,
  workItemHorizons,
  workItemLane
} from './items.ts'
import { migrateWorkItem, type WorkItemMigration } from './migration.ts'
import { type RepositoryPlanningSource, readDeclaredPlanningSource, readRepositoryPlanningSource } from './planning.ts'
import {
  commitPrune,
  type PruneCommitContext,
  type PruneCommitMessage,
  preflightPruneCommit,
  pruneCommitMessage
} from './prune-commit.ts'
import { loadProjectRegistry, type RoadmapGrouping, type WorkItemGroup, workItemGroup } from './registry.ts'
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

export interface RoadmapPruneOptions {
  /** Commit the deletions per repository with the standardised message; false only deletes. */
  readonly commit: boolean
  /** Select and preflight exactly as a real prune would, then report without deleting or committing. */
  readonly dryRun?: boolean
}

export interface RoadmapListOptions {
  readonly horizon?: string
  readonly status?: string
  readonly includeProjection?: boolean
  readonly by?: RoadmapGrouping
}

/** Registry grouping for one repository's listed records; an unavailable registry is a warning. */
export interface RoadmapGroupingResult {
  readonly by: RoadmapGrouping
  readonly registryWarning?: string
  readonly groups: ReadonlyMap<string, WorkItemGroup>
}

export interface RoadmapListItem extends WorkItem {
  readonly record: string
}

interface RoadmapItemEvidence {
  readonly repository: string
  readonly repositoryIdentity?: string
  readonly repositoryUrl?: string
  readonly items?: readonly WorkItem[]
  readonly projectedItems?: readonly RoadmapListItem[]
  readonly faults?: readonly WorkItemFault[]
  readonly roadmap?: 'absent'
  readonly diagnostic?: string
  readonly grouping?: RoadmapGroupingResult
}

export interface RoadmapItemResult extends RoadmapItemEvidence {
  readonly tradeInventory: 'not-requested'
}

export interface RoadmapListResult extends RoadmapItemEvidence {
  readonly tradeInventory: 'available' | 'unavailable'
  readonly trades: readonly LocatedTrade[]
  readonly tradeDiagnostic?: string
}

export interface RoadmapItemList {
  readonly results: readonly RoadmapItemResult[]
}

export interface RoadmapList {
  readonly estate: readonly LocatedTrade[]
  readonly results: readonly RoadmapListResult[]
}

export interface RoadmapPruneResult {
  readonly repository: string
  readonly items: readonly WorkItem[]
  /** Present when the deletions were committed. */
  readonly commit?: { readonly id: string; readonly message: PruneCommitMessage }
  /** Present on a committing dry run: the message the prune commit would carry. */
  readonly plannedCommit?: PruneCommitMessage
}

export interface RoadmapMoveResult {
  readonly id: string
  readonly from: WorkItemHorizon
  readonly to: WorkItemHorizon
}

export interface RoadmapMigrateOptions {
  /** Write the migrated records; false previews the comparison without changing anything. */
  readonly apply: boolean
}

export interface RoadmapMigrateResult {
  readonly repository: string
  readonly roadmap?: 'absent'
  readonly faults: readonly WorkItemFault[]
  readonly migrations: readonly Omit<WorkItemMigration, 'contents'>[]
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
  operation: 'prune' | 'migrate' | RoadmapMove
): Promise<ResolvedRepository> => {
  const repositories = await resolveTargets(context, selection)
  const repository = repositories[0]
  if (repositories.length !== 1 || !repository)
    throw new KiError(`ki repo roadmap ${operation} requires exactly one repository target`, 2)
  return repository
}

/** Filters by model placement, so legacy Waiting for and Parked list under Hold and Triage intake as triage. */
const filterItems = (items: readonly WorkItem[], options: RoadmapListOptions): readonly WorkItem[] =>
  items.filter((item) => {
    const lane = workItemLane(item)
    const status = lane === 'triage' ? 'triage' : item.status
    return (!options.horizon || lane === options.horizon) && (!options.status || status === options.status)
  })

const groupItems = async (
  repository: string,
  stateDirectory: string,
  by: RoadmapGrouping,
  items: readonly WorkItem[]
): Promise<RoadmapGroupingResult> => {
  const lookup = await loadProjectRegistry(repository, stateDirectory)
  const registry = 'registry' in lookup ? lookup.registry : undefined
  return {
    by,
    ...('unavailable' in lookup ? { registryWarning: `project registry unavailable: ${lookup.unavailable}` } : {}),
    groups: new Map(items.map((item) => [item.id, workItemGroup(item, by, registry)]))
  }
}

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

const legacyHorizons = new Set<string>(['waiting-for', 'parked'] satisfies LegacyWorkItemHorizon[])

const moveHorizon = (
  item: WorkItem,
  operation: RoadmapMove,
  requested?: string,
  hold?: WorkItemHold
): WorkItemHorizon => {
  const lane = workItemLane(item)
  if (lane === 'triage')
    throw new KiError(`work item ${item.id} at triage must be adopted through the planning workflow`, 2)
  if (lane === 'done' || lane === 'cancelled')
    throw new KiError(`work item ${item.id} is ${lane} and has no horizon`, 2)
  if (legacyHorizons.has(item.horizon as string))
    throw new KiError(
      `work item ${item.id} is at the legacy ${item.horizon} horizon; run ki repo roadmap migrate first`,
      2
    )
  const current = workItemHorizons.indexOf(item.horizon as WorkItemHorizon)
  const direction = operation === 'promote' ? -1 : 1
  const target = requested === undefined ? current + direction : workItemHorizons.indexOf(requested as WorkItemHorizon)
  if (requested !== undefined && target === -1)
    throw new KiError(`roadmap ${operation} horizon must be one of ${workItemHorizons.join(', ')}`, 2)
  if (requested === undefined && item.horizon === 'hold' && operation === 'promote')
    throw new KiError(`leaving hold re-decides the horizon: name the destination for ${item.id}`, 2)
  if (target < 0 || target >= workItemHorizons.length)
    throw new KiError(`work item ${item.id} is already at the ${operation} limit`, 2)
  if ((operation === 'promote' && target >= current) || (operation === 'demote' && target <= current))
    throw new KiError(
      `roadmap ${operation} must move ${item.id} ${operation === 'promote' ? 'toward now' : 'toward hold'}`,
      2
    )
  const destination = workItemHorizons[target] as WorkItemHorizon
  if ((destination === 'hold') !== (hold !== undefined))
    throw new KiError(
      destination === 'hold'
        ? `moving ${item.id} to hold requires --reason and --condition`
        : '--reason, --condition and --review apply only to a move to hold',
      2
    )
  if (!isAllowedHorizon(item.status, destination))
    throw new KiError(`work item ${item.id} at status ${item.status} cannot move to ${destination}`, 2)
  return destination
}

export const listRoadmapItems = async (
  context: RoadmapOperationContext,
  selection: RoadmapSelection,
  options: RoadmapListOptions
): Promise<RoadmapItemList> => {
  const repositories = await resolveTargets(context, selection)
  const results = await Promise.all(
    repositories.map(async (repository): Promise<RoadmapItemResult> => {
      let projection: Pick<RoadmapItemResult, 'repositoryIdentity' | 'repositoryUrl'> = {}
      try {
        const repositoryUrl = options.includeProjection
          ? declaredRepositoryIdentity(await readRepositoryDeclaration(repository.declaration))
          : undefined
        projection = repositoryUrl ? { repositoryIdentity: repositoryIdentity(repositoryUrl), repositoryUrl } : {}
        const planning = await readDeclaredPlanningSource(repository.declaration)
        const inventory = planning && (await readWorkItemInventoryIfPresent(repository.root, planning))
        const items = inventory === undefined ? undefined : filterItems(inventory.items, options)
        const grouping =
          options.by && items ? await groupItems(repository.root, context.stateDirectory, options.by, items) : undefined
        return {
          repository: repository.root,
          ...projection,
          tradeInventory: 'not-requested',
          ...(planning === undefined || inventory === undefined
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
                faults: inventory.faults,
                ...(grouping ? { grouping } : {})
              })
        }
      } catch (error) {
        /* v8 ignore next -- inventory failures are always KiError instances. */
        const diagnostic = error instanceof Error ? error.message : String(error)
        return {
          repository: repository.root,
          ...projection,
          tradeInventory: 'not-requested',
          diagnostic
        }
      }
    })
  )
  return { results }
}

export const listRoadmap = async (
  context: RoadmapOperationContext,
  selection: RoadmapSelection,
  options: RoadmapListOptions
): Promise<RoadmapList> => {
  const [items, inventory] = await Promise.all([
    listRoadmapItems(context, selection, options),
    context
      .locateTrades()
      .then((estate) => ({ state: 'available' as const, estate }))
      .catch((error) => ({
        state: 'unavailable' as const,
        estate: [] as readonly LocatedTrade[],
        // locateTrades normalizes every failure to a KiError before this boundary.
        /* v8 ignore next */
        diagnostic: error instanceof Error ? error.message : String(error)
      }))
  ])
  return {
    estate: inventory.estate,
    results: items.results.map((item) => ({
      ...item,
      tradeInventory: inventory.state,
      trades: inventory.estate.filter((trade) => trade.root === item.repository),
      ...('diagnostic' in inventory ? { tradeDiagnostic: inventory.diagnostic } : {})
    }))
  }
}

export const pruneRoadmap = async (
  context: RoadmapOperationContext & PruneCommitContext,
  selection: RoadmapSelection,
  id: string | undefined,
  options: RoadmapPruneOptions
): Promise<readonly RoadmapPruneResult[]> => {
  const repositories =
    id === undefined ? await resolveTargets(context, selection) : [await oneMutationTarget(context, selection, 'prune')]
  const sources = (
    await Promise.all(
      repositories.map(async (repository) => {
        if (id !== undefined)
          return [{ repository, planning: await readRepositoryPlanningSource(repository.declaration) }]
        // Like the list, a bulk prune treats an undeclared adapter or absent adapter root as contributing no roadmap.
        const planning = await readDeclaredPlanningSource(repository.declaration)
        return planning && (await hasWorkItemRoot(repository.root, planning)) ? [{ repository, planning }] : []
      })
    )
  ).flat()
  await Promise.all(sources.map(({ repository, planning }) => readWorkItems(repository.root, planning)))
  const selected = await Promise.all(
    sources.map(async ({ repository, planning }) => ({
      repository: repository.root,
      records: await selectTerminalWorkItems(repository.root, planning, id)
    }))
  )
  // Validate every repository before deleting anything, so one refusal leaves the whole selection untouched.
  if (options.commit)
    for (const { repository, records } of selected)
      if (records.length) await preflightPruneCommit(context, repository, records)
  if (options.dryRun)
    return selected.map(({ repository, records }) => ({
      repository,
      items: records.map(({ item }) => item),
      ...(options.commit && records.length
        ? { plannedCommit: pruneCommitMessage(records.map(({ item }) => item.id)) }
        : {})
    }))
  const results: RoadmapPruneResult[] = []
  for (const { repository, records } of selected) {
    const items = records.map(({ item }) => item)
    if (!records.length || !options.commit) {
      await removeWorkItemRecords(repository, records)
      results.push({ repository, items })
      continue
    }
    try {
      const { commit, message } = await commitPrune(context, repository, records)
      results.push({ repository, items, commit: { id: commit, message } })
    } catch (error) {
      const committed = results.flatMap(({ repository: root, commit }) => (commit ? [`${root} at ${commit.id}`] : []))
      if (!committed.length) throw error
      throw new KiError(
        `${(error as Error).message}\nalready committed: ${committed.join(', ')}`,
        error instanceof KiError ? error.exitCode : 1
      )
    }
  }
  return results
}

export const moveRoadmapItem = async (
  context: RoadmapOperationContext,
  selection: RoadmapSelection,
  operation: RoadmapMove,
  id: string,
  requested?: string,
  hold?: WorkItemHold
): Promise<RoadmapMoveResult> => {
  const repository = await oneMutationTarget(context, selection, operation)
  const planning = await readRepositoryPlanningSource(repository.declaration)
  const item = await selectedItem(repository.root, planning, id)
  const destination = moveHorizon(item, operation, requested, hold)
  await updateWorkItemHorizon(repository.root, planning, id, destination, hold, context.now())
  return { id, from: item.horizon as WorkItemHorizon, to: destination }
}

/**
 * Previews, or with `apply` writes, the mechanical model migration. Writing needs exactly one repository and a roadmap
 * with no unreadable record; nothing is staged or committed.
 */
export const migrateRoadmap = async (
  context: RoadmapOperationContext,
  selection: RoadmapSelection,
  options: RoadmapMigrateOptions
): Promise<readonly RoadmapMigrateResult[]> => {
  const repositories = options.apply
    ? [await oneMutationTarget(context, selection, 'migrate')]
    : await resolveTargets(context, selection)
  const now = context.now()
  const results = await Promise.all(
    repositories.map(async (repository) => {
      const planning = await readDeclaredPlanningSource(repository.declaration)
      if (!planning || !(await hasWorkItemRoot(repository.root, planning)))
        return { repository: repository.root, roadmap: 'absent' as const, faults: [], migrations: [], writes: [] }
      const { records, faults } = await readWorkItemRecordInventory(repository.root, planning)
      const migrations = records.flatMap(({ item, file, contents }) => {
        const migration = migrateWorkItem(item, file, contents, now)
        return migration ? [migration] : []
      })
      return {
        repository: repository.root,
        faults,
        migrations,
        writes: migrations.map(({ file, contents }) => ({ path: join(planning.directory, file), content: contents }))
      }
    })
  )
  for (const result of results) {
    if (!options.apply || !result.writes.length) continue
    if (result.faults.length)
      throw new KiError(`repository ${result.repository} has unreadable work items; fix them before migrating`, 2)
    await publishWrites(await prepareWrites(result.repository, result.writes), false)
  }
  return results.map(({ writes: _writes, migrations, ...result }) => ({
    ...result,
    migrations: migrations.map(({ contents: _contents, ...migration }) => migration)
  }))
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
  const listed = await listRoadmapItems(context, selection, {})
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
