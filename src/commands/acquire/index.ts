import { isAbsolute, resolve } from 'node:path'
import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import {
  type AcquisitionAdapterInventory,
  type AcquisitionAdapterInventoryItem,
  acquisitionAdapterInventory,
  type GranolaImportResult,
  type GranolaOperationContext,
  type GranolaStatusResult,
  granolaStatus,
  importCapture,
  importGranola,
  reconcileGranola,
  resetGranola,
  selectAcquisitionAdapters
} from '../../core/acquire/index.ts'
import { KiError } from '../../core/errors.ts'
import type { AcquisitionAction } from '../../core/harness/index.ts'

interface SelectionOptions {
  readonly adapter?: string
  readonly all?: boolean
  readonly repo?: string
}

interface ImportOptions extends SelectionOptions {
  readonly since: string
  readonly until?: string
  readonly dryRun?: boolean
  readonly refreshTranscripts?: boolean
  readonly capture?: string
  readonly output?: string
}

interface ResetOptions extends SelectionOptions {
  readonly source?: string
  readonly component?: string
  readonly rebuild?: boolean
  readonly confirm?: boolean
}

const granolaOperationContext = (context: KiContext): GranolaOperationContext => ({
  workingDirectory: context.workingDirectory,
  homeDirectory: context.homeDirectory,
  stateDirectory: context.paths.state,
  environment: context.environment,
  runner: context.runner,
  now: context.now
})

const inventory = (context: KiContext, repository?: string): Promise<AcquisitionAdapterInventory> =>
  acquisitionAdapterInventory({
    repository,
    workingDirectory: context.workingDirectory,
    homeDirectory: context.homeDirectory,
    dataDirectory: context.paths.data
  })

const renderInventory = (value: AcquisitionAdapterInventory): string => {
  const lines = [`Acquisition adapters · ${value.repository}`]
  if (!value.items.length) {
    lines.push('  No acquisition adapters are published by installed Harnesses.')
    lines.push('  Install the applicable Harness skill, then declare it in this repository .ki.toml.')
    return lines.join('\n')
  }
  for (const item of value.items) {
    lines.push(`  ${item.adapter} · ${item.state}`)
    lines.push(`    Skill: ${item.skill}`)
    lines.push(`    Resolved: ${item.resolved ? 'yes' : 'no'} · Configuration: ${item.configuration}`)
    lines.push(`    Actions: ${item.actions.length ? item.actions.join(', ') : 'none'}`)
    lines.push(`    Executable: ${item.executable ? 'available' : 'missing'}`)
    if (item.issue) lines.push(`    Issue: ${item.issue}`)
    lines.push(`    Hint: ${item.hint}`)
  }
  return lines.join('\n')
}

const renderGranolaResult = (result: GranolaImportResult): string =>
  [
    `${result.dryRun ? 'Granola acquisition plan' : 'Granola acquisition complete'}: ${result.repository}`,
    `Interval: ${result.since} through ${result.until} (complete identity enumeration)`,
    `Coverage: ${result.discovered} discovered, ${result.selected} selected, ${result.excluded} routed elsewhere`,
    `Routing: ${result.unfoldered} unfoldered, ${result.duplicated} intentionally duplicated`,
    `Meetings: ${result.created} new, ${result.amended} amended, ${result.unchanged} unchanged`,
    `Transcripts: ${result.transcriptReads} provider reads, ${result.omissions} omissions, ${result.resumed} resumed`,
    `Checkpoint: ${result.ledgerChanged ? (result.dryRun ? 'would advance' : 'advanced atomically') : 'unchanged'}`,
    'Boundary: read-only Granola MCP; no source mutation, harvesting, cross-repository write, archive, or deletion.',
    ...(result.dryRun ? ['Dry run: no repository files written.'] : [])
  ].join('\n')

const renderCaptureResult = (result: Awaited<ReturnType<typeof importCapture>>): string =>
  [
    `${result.dryRun ? 'KEP plan' : 'KEP created'}: ${result.output}`,
    `Package: ${result.packageId}`,
    `Inventory: ${result.recordCount} records, ${result.assetCount} assets, ${result.relationshipCount} relationships`,
    `Omissions: ${JSON.stringify(result.omissions)}`,
    'Boundary: user-provided files only; no network, credentials, repository discovery, or archive extraction.',
    ...(result.dryRun ? ['Dry run: no files written.'] : [])
  ].join('\n')

const renderStatus = (adapter: string, status: GranolaStatusResult): string =>
  [
    `${adapter} acquisition status · ${status.repository}`,
    `Checkpoint: ${status.checkpoint}${status.generation ? ` · ${status.generation}` : ''}`,
    `Meetings: ${status.meetings}`,
    `Transcripts: ${status.availableTranscripts} available, ${status.retryingTranscripts} retrying, ${status.durableOmissions} durable omissions`,
    `Disposition: ${
      Object.entries(status.dispositions)
        .sort(([left], [right]) => left.localeCompare(right, 'en'))
        .map(([state, count]) => `${state}=${count}`)
        .join(', ') || 'none'
    }`,
    `Journal: ${status.journal}${status.journal === 'in-progress' ? ` · ${status.remaining} remaining, ${status.failures} failures` : ''}`
  ].join('\n')

const addSelection = (command: Command): Command =>
  command
    .option('--adapter <name>', 'select exactly one repository acquisition adapter')
    .option('--all', 'run every applicable enabled repository acquisition adapter')
    .option('--repo <path>', 'explicit receiving KI repository')

const selected = async (
  context: KiContext,
  action: AcquisitionAction,
  options: SelectionOptions
): Promise<{
  readonly inventory: AcquisitionAdapterInventory
  readonly adapters: readonly AcquisitionAdapterInventoryItem[]
}> => {
  const value = await inventory(context, options.repo)
  return { inventory: value, adapters: selectAcquisitionAdapters(value, action, options) }
}

const rejectAdapterOverrides = (options: ImportOptions): void => {
  const properties = [
    options.refreshTranscripts ? '--refresh-transcripts' : undefined,
    options.capture ? '--capture' : undefined,
    options.output ? '--output' : undefined
  ].filter((value): value is string => Boolean(value))
  if (!properties.length) return
  if (options.all) throw new KiError(`${properties.join(', ')} cannot be combined with --all`, 2)
  if (!options.adapter) throw new KiError(`${properties.join(', ')} requires explicit --adapter <name>`, 2)
}

const configurationString = (item: AcquisitionAdapterInventoryItem, key: string): string | undefined => {
  const value = item.repositoryConfiguration?.[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !value.trim())
    throw new KiError(`[skills.${item.skill}].${key} must be non-empty string`)
  return value
}

const runImport = async (context: KiContext, options: ImportOptions): Promise<void> => {
  rejectAdapterOverrides(options)
  const selection = await selected(context, 'import', options)
  for (const adapter of selection.adapters) {
    if (adapter.adapter === 'granola') {
      const result = await importGranola(
        {
          repository: selection.inventory.root,
          since: options.since,
          until: options.until ?? new Date(context.now()).toISOString().slice(0, 10),
          dryRun: options.dryRun,
          refreshTranscripts: options.refreshTranscripts
        },
        granolaOperationContext(context)
      )
      context.stdout.write(`${renderGranolaResult(result)}\n`)
      continue
    }
    const capture = options.capture ?? configurationString(adapter, 'capture_path')
    const output = options.output ?? configurationString(adapter, 'output_path')
    if (!capture || !output) {
      throw new KiError('chatgpt import requires --capture and --output or persistent capture_path and output_path', 2)
    }
    const result = await importCapture(resolve(selection.inventory.root, capture), {
      output: isAbsolute(output) ? output : resolve(selection.inventory.root, output),
      dryRun: options.dryRun
    })
    context.stdout.write(`${renderCaptureResult(result)}\n`)
  }
}

const runStatus = async (context: KiContext, options: SelectionOptions, reconcile: boolean): Promise<void> => {
  const action: AcquisitionAction = reconcile ? 'reconcile' : 'status'
  const selection = await selected(context, action, options)
  for (const adapter of selection.adapters) {
    if (adapter.adapter !== 'granola') {
      throw new KiError(`acquisition adapter ${adapter.adapter} has no executable ${action} implementation`)
    }
    const status = await (reconcile ? reconcileGranola : granolaStatus)({
      repository: selection.inventory.root,
      workingDirectory: context.workingDirectory,
      homeDirectory: context.homeDirectory,
      stateDirectory: context.paths.state
    })
    context.stdout.write(`${renderStatus(adapter.adapter, status)}\n`)
  }
}

const runReset = async (context: KiContext, options: ResetOptions): Promise<void> => {
  if (options.component && options.component !== 'detail' && options.component !== 'transcript') {
    throw new KiError('--component must be detail or transcript', 2)
  }
  const selection = await selected(context, 'reset', options)
  for (const adapter of selection.adapters) {
    if (adapter.adapter !== 'granola') {
      throw new KiError(`acquisition adapter ${adapter.adapter} has no executable reset implementation`)
    }
    const result = await resetGranola(
      {
        repository: selection.inventory.root,
        source: options.source,
        component: options.component as 'detail' | 'transcript' | undefined,
        rebuild: options.rebuild,
        confirm: options.confirm
      },
      granolaOperationContext(context)
    )
    context.stdout.write(
      `${result.plan}\n${result.changed ? 'Reset applied.' : 'No changes made; repeat with --confirm.'}\n`
    )
  }
}

export const createAcquireCommand = (context: KiContext): Command => {
  const command = new Command('acquire').description('run repository-enabled acquisition adapters')
  command.addCommand(
    new Command('list')
      .description('list enabled, available, and invalid repository acquisition adapters')
      .option('--repo <path>', 'explicit KI repository')
      .action(async (options: { readonly repo?: string }) => {
        context.stdout.write(`${renderInventory(await inventory(context, options.repo))}\n`)
      })
  )
  command.addCommand(
    addSelection(new Command('import').description('acquire source material into repository Harbour'))
      .option('--since <date>', 'inclusive history start in YYYY-MM-DD', '1970-01-01')
      .option('--until <date>', 'inclusive history end in YYYY-MM-DD')
      .option('--dry-run', 'read and validate without writing repository files')
      .option('--refresh-transcripts', 'Granola: explicitly re-read transcripts')
      .option('--capture <path>', 'ChatGPT: local capture directory')
      .option('--output <path>', 'ChatGPT: Knowledge Export Package output directory')
      .action((options: ImportOptions) => runImport(context, options))
  )
  command.addCommand(
    addSelection(new Command('status').description('show local adapter checkpoints and recovery state')).action(
      (options: SelectionOptions) => runStatus(context, options, false)
    )
  )
  command.addCommand(
    addSelection(new Command('reconcile').description('verify adapter checkpoints and dispositions')).action(
      (options: SelectionOptions) => runStatus(context, options, true)
    )
  )
  command.addCommand(
    addSelection(new Command('reset').description('preview or confirm destructive local acquisition reset'))
      .option('--source <identity>', 'limit reset to one provider source identity')
      .option('--component <name>', 'limit source reset to detail or transcript')
      .option('--rebuild', 'remove all local adapter acquisition state and staged documents')
      .option('--confirm', 'apply the displayed destructive local reset plan')
      .action((options: ResetOptions) => runReset(context, options))
  )
  return command
}
