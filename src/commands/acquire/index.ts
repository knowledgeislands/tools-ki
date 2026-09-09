import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import {
  type GranolaImportOptions,
  type GranolaImportResult,
  type ImportCaptureResult,
  type ImportOptions,
  importCapture,
  importGranola
} from '../../core/acquire/index.ts'

const renderImportResult = (result: ImportCaptureResult): string =>
  [
    `${result.dryRun ? 'KEP plan' : 'KEP created'}: ${result.output}`,
    `Package: ${result.packageId}`,
    `Inventory: ${result.recordCount} records, ${result.assetCount} assets, ${result.relationshipCount} relationships`,
    `Omissions: ${JSON.stringify(result.omissions)}`,
    'Boundary: user-provided files only; no network, credentials, repository discovery, or archive extraction.',
    ...(result.dryRun ? ['Dry run: no files written.'] : [])
  ].join('\n')

const renderGranolaResult = (result: GranolaImportResult): string =>
  [
    `${result.dryRun ? 'Granola acquisition plan' : 'Granola acquisition complete'}: ${result.repository}`,
    `Interval: ${result.since} through ${result.until} (complete exhaustive revalidation)`,
    `Coverage: ${result.discovered} discovered, ${result.selected} selected, ${result.excluded} routed elsewhere`,
    `Routing: ${result.unfoldered} unfoldered, ${result.duplicated} intentionally duplicated`,
    `Packages: ${result.created} new, ${result.amended} amended, ${result.unchanged} unchanged`,
    `Omissions: ${result.omissions} meetings without an available transcript`,
    `Ledger: ${result.ledgerChanged ? (result.dryRun ? 'would advance' : 'advanced after package verification') : 'unchanged'}`,
    'Boundary: read-only Granola MCP; no source mutation, harvesting, cross-repository write, archive, or deletion.',
    ...(result.dryRun ? ['Dry run: no repository files written.'] : [])
  ].join('\n')

export const createAcquireCommand = (context: KiContext): Command => {
  const command = new Command('acquire').description(
    'import source material into verified immutable Knowledge Export Packages'
  )
  const importer = new Command('import')
    .description('import a local capture into an immutable Knowledge Export Package')
    .argument('<capture-directory>')
    .requiredOption('--output <kep-directory>', 'new output directory for the KEP')
    .option('--dry-run', 'validate and report without writing')
    .action(async (captureDirectory: string, options: ImportOptions) => {
      const result = await importCapture(captureDirectory, options)
      context.stdout.write(`${renderImportResult(result)}\n`)
    })

  const chatgpt = new Command('chatgpt').description('local ChatGPT capture acquisition').addCommand(importer)
  const granolaImporter = new Command('import')
    .description('acquire complete Granola history into the selected repository Harbour')
    .option('--repo <path>', 'explicit receiving KI repository')
    .option('--since <date>', 'inclusive history start in YYYY-MM-DD', '1970-01-01')
    .option('--until <date>', 'inclusive history end in YYYY-MM-DD')
    .option('--dry-run', 'read and validate without writing repository files')
    .action(
      async (
        options: Omit<GranolaImportOptions, 'repository' | 'until'> & {
          readonly repo?: string
          readonly until?: string
        }
      ) => {
        const { repo, ...importOptions } = options
        const result = await importGranola(
          {
            ...importOptions,
            repository: repo,
            until: options.until ?? new Date(context.now()).toISOString().slice(0, 10)
          },
          context
        )
        context.stdout.write(`${renderGranolaResult(result)}\n`)
      }
    )
  const granola = new Command('granola')
    .description('read-only Granola meeting acquisition')
    .addCommand(granolaImporter)
  return command.addCommand(chatgpt).addCommand(granola)
}
