import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { type StageCaptureResult, stageCapture } from '../../core/kep/index.ts'
import { resolveRepository } from '../../core/repository/index.ts'

const renderStageResult = (result: StageCaptureResult): string =>
  [
    `${result.dryRun ? 'Acquisition plan' : result.staged ? 'Acquisition checkpoint' : 'Acquisition staged'}: ${result.output}`,
    `Package: ${result.packageId}`,
    `Inventory: ${result.recordCount} records, ${result.assetCount} assets, ${result.relationshipCount} relationships`,
    `Omissions: ${JSON.stringify(result.omissions)}`,
    'Boundary: user-provided local source material only; no network, credentials, source deletion, or knowledge harvesting.',
    ...(result.dryRun ? ['Dry run: no files written.'] : [])
  ].join('\n')

export const createSpaceCommand = (context: KiContext): Command => {
  const importer = new Command('import')
    .description('stage a local ChatGPT capture in the current repository Harbour')
    .argument('<capture-directory>')
    .option('--dry-run', 'validate and report without writing')
    .action(async (captureDirectory: string, options: { dryRun?: boolean }) => {
      const repository = await resolveRepository({
        workingDirectory: context.workingDirectory,
        homeDirectory: context.homeDirectory
      })
      const result = await stageCapture(captureDirectory, repository.root, options)
      context.stdout.write(`${renderStageResult(result)}\n`)
    })
  const chatgpt = new Command('chatgpt').description('local ChatGPT capture acquisition').addCommand(importer)
  const acquire = new Command('acquire')
    .description('acquire external source material into this repository')
    .addCommand(chatgpt)
  return new Command('space')
    .description('operate on the current Knowledge Islands repository space')
    .addCommand(acquire)
}
