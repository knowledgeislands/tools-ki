import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { type ImportCaptureResult, type ImportOptions, importCapture } from '../../core/acquire/index.ts'

const renderImportResult = (result: ImportCaptureResult): string =>
  [
    `${result.dryRun ? 'KEP plan' : 'KEP created'}: ${result.output}`,
    `Package: ${result.packageId}`,
    `Inventory: ${result.recordCount} records, ${result.assetCount} assets, ${result.relationshipCount} relationships`,
    `Omissions: ${JSON.stringify(result.omissions)}`,
    'Boundary: user-provided files only; no network, credentials, repository discovery, or archive extraction.',
    ...(result.dryRun ? ['Dry run: no files written.'] : [])
  ].join('\n')

export const createAcquireCommand = (context: KiContext): Command => {
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
  return new Command('acquire').description('import a local user-prepared capture').addCommand(chatgpt)
}
