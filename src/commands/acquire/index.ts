import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { type ImportOptions, importCapture } from '../../core/kep.ts'

export const createAcquireCommand = (context: KiContext): Command => {
  const importer = new Command('import')
    .description('import a local capture into an immutable Knowledge Export Package')
    .argument('<capture-directory>')
    .requiredOption('--output <kep-directory>', 'new output directory for the KEP')
    .option('--dry-run', 'validate and report without writing')
    .action((captureDirectory: string, options: ImportOptions) => importCapture(context, captureDirectory, options))

  const chatgpt = new Command('chatgpt').description('local ChatGPT capture acquisition').addCommand(importer)
  return new Command('acquire').description('import a local user-prepared capture').addCommand(chatgpt)
}
