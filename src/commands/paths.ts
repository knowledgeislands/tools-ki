import { Command } from 'commander'
import type { KiContext } from '../core/context.ts'

export const formatPaths = (context: KiContext): string => {
  const { paths } = context
  return `data: ${paths.data}\nconfig: ${paths.config}\ncache: ${paths.cache}\nstate: ${paths.state}\n`
}

export const createPathsCommand = (context: KiContext): Command =>
  new Command('paths')
    .description('print the resolved XDG paths used by KI')
    .option('--json', 'emit a versioned JSON result')
    .action((options: { json?: boolean }) => {
      context.stdout.write(options.json ? `${JSON.stringify({ version: 1, ...context.paths })}\n` : formatPaths(context))
    })
