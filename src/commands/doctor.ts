import { Command } from 'commander'
import type { KiContext } from '../core/context.ts'
import { KI_VERSION } from '../version.ts'
import { formatPaths } from './paths.ts'

export const createDoctorCommand = (context: KiContext): Command =>
  new Command('doctor')
    .description('report CLI installation mode and resolved XDG paths')
    .option('--json', 'emit a versioned JSON result')
    .action((options: { json?: boolean }) => {
      if (options.json) {
        context.stdout.write(
          `${JSON.stringify({
            version: 1,
            ki_version: KI_VERSION,
            installation: context.installation,
            ...context.paths,
            working_directory: context.workingDirectory,
            repository: context.repository?.root ?? null
          })}\n`
        )
        return
      }
      context.stdout.write(`ki version: ${KI_VERSION}\ninstallation: ${context.installation}\n${formatPaths(context)}`)
    })
