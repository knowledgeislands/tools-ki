import { isAbsolute, resolve } from 'node:path'
import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import {
  type AcquisitionAdapterInventory,
  type AcquisitionAdapterInventoryItem,
  acquisitionAdapterInventory,
  type GranolaImportResult,
  type GranolaOperationContext,
  importCapture,
  importGranola,
  importGranolaImages,
  markGranola,
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
  readonly refresh?: boolean
  readonly refreshAcquired?: boolean
  readonly capture?: string
  readonly output?: string
}

interface ImageOptions extends SelectionOptions {
  readonly source: string
  readonly directory: string
  readonly expected: string
  readonly dryRun?: boolean
}

interface MarkOptions extends SelectionOptions {
  readonly source?: readonly string[]
  readonly since: string
  readonly until?: string
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
    `Routing: ${result.unfoldered} unfoldered, ${result.duplicated} intentionally duplicated, ${result.flagged.length} flagged without content acquisition`,
    ...result.unknownFolders.map((folder) => `Unmatched folder: ${folder.id} · ${folder.title ?? 'unknown title'}`),
    ...result.flagged.map(
      (meeting) =>
        `Flagged: ${meeting.id} · ${meeting.reason} · ${meeting.date ?? 'unknown date'} · ${meeting.title ?? 'unknown title'} · folders=${JSON.stringify(meeting.folderIds)}`
    ),
    `Meetings: ${result.created} new, ${result.refreshed} refreshed, ${result.kept.length} kept`,
    ...result.kept.map((meeting) => `Kept: ${meeting.id} · ${meeting.reason}; not overwritten without --refresh`),
    `Omissions: ${result.omissions}`,
    result.attachmentsAvailable
      ? `Attachments: ${result.images} screenshots across ${result.imageMeetings} verified MCP inventories`
      : 'Attachments: not inventoried by Granola MCP; snapshot-bearing notes need separate image verification before deletion.',
    `Acquired: ${result.skipped} skipped on Acquired folder membership`,
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
    options.refresh ? '--refresh' : undefined,
    options.refreshAcquired ? '--refresh-acquired' : undefined,
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
          refresh: options.refresh,
          refreshAcquired: options.refreshAcquired
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

const runImages = async (context: KiContext, options: ImageOptions): Promise<void> => {
  if (options.all || options.adapter !== 'granola') throw new KiError('images requires --adapter granola', 2)
  if (!/^[1-9][0-9]*$/.test(options.expected)) throw new KiError('--expected must be a positive integer', 2)
  const selection = await selected(context, 'import', options)
  const result = await importGranolaImages({
    repository: selection.inventory.root,
    captureRoot: configurationString(selection.adapters[0] as AcquisitionAdapterInventoryItem, 'capture_root'),
    source: options.source,
    directory: options.directory,
    expected: Number(options.expected),
    dryRun: options.dryRun,
    now: context.now
  })
  context.stdout.write(
    `${result.dryRun ? 'Granola image plan' : 'Granola images acquired'}: ${result.count} images, ${result.bytes} bytes\nManifest: ${result.manifest}\nSource count: user-observed; recheck Granola before source deletion.\n`
  )
}

const runMark = async (context: KiContext, options: MarkOptions): Promise<void> => {
  if (options.all || options.adapter !== 'granola') throw new KiError('mark requires --adapter granola', 2)
  const selection = await selected(context, 'mark', options)
  const result = await markGranola(
    {
      repository: selection.inventory.root,
      since: options.since,
      until: options.until ?? new Date(context.now()).toISOString().slice(0, 10),
      sources: options.source,
      confirm: options.confirm
    },
    granolaOperationContext(context)
  )
  context.stdout.write(
    `${[
      `Granola marker ${options.confirm ? 'result' : 'plan'}: ${result.repository}`,
      `Acquired folder: ${result.folder}`,
      `Captures: ${result.ready} verified, ${result.marked} marked, ${result.already} already acquired, ${result.exceptions.length} exceptions`,
      ...result.exceptions.map((item) => `Not marked: ${item.id} · ${item.reason}`),
      options.confirm
        ? 'Original folder memberships retained; no source deletion.'
        : 'No Granola changes; repeat with --confirm to add verified notes to Acquired.'
    ].join('\n')}\n`
  )
  if (result.exceptions.length)
    throw new KiError('Some Granola notes lack current, complete committed preservation evidence')
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
      .option('--refresh', 'Granola: explicitly overwrite existing captures with the current source')
      .option('--refresh-acquired', 'Granola: also re-acquire notes already in the Acquired folder')
      .option('--capture <path>', 'ChatGPT: local capture directory')
      .option('--output <path>', 'ChatGPT: Knowledge Export Package output directory')
      .action((options: ImportOptions) => runImport(context, options))
  )
  command.addCommand(
    addSelection(new Command('images').description('acquire Granola desktop image exports beside a staged meeting'))
      .requiredOption('--source <uuid>', 'Granola meeting UUID with one capture in the receiving repository')
      .requiredOption('--directory <path>', 'directory containing only attachment-UUID image exports')
      .requiredOption('--expected <count>', 'image count observed in the Granola desktop stack')
      .option('--dry-run', 'verify exports and destination without writing files')
      .action((options: ImageOptions) => runImages(context, options))
  )
  command.addCommand(
    addSelection(
      new Command('mark').description('verify committed Granola captures and explicitly add Acquired membership')
    )
      .option('--since <date>', 'inclusive history start in YYYY-MM-DD', '1970-01-01')
      .option('--until <date>', 'inclusive history end in YYYY-MM-DD')
      .option('--source <UUID...>', 'mark only these owned note identities in the requested interval')
      .option('--confirm', 'add only verified committed captures to the private Acquired folder')
      .action((options: MarkOptions) => runMark(context, options))
  )
  return command
}
