import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { KiError } from '../../core/errors.ts'
import { loopback, type SearchMode } from '../../core/kb/contract.ts'
import { indexKb, searchKb, statusKb } from '../../core/kb/search.ts'

export const createKbCommand = (context: KiContext): Command => {
  const kb = new Command('kb').description('index and search one explicitly registered Knowledge Base')
  const perform = async (action: () => Promise<unknown>): Promise<void> => {
    try {
      context.stdout.write(`${JSON.stringify(await action(), null, 2)}\n`)
    } catch (error) {
      throw new KiError(
        error instanceof Error && error.message.startsWith('KB search unavailable:')
          ? error.message
          : 'KB search unavailable: invalid or missing scoped state',
        1
      )
    }
  }
  kb.addCommand(
    new Command('index')
      .description('build a fresh private independent qmd index')
      .option('--kb <id>', 'stable local registry KB ID; defaults to current root')
      .option('--daemon-url <origin>', 'explicit numeric loopback HTTP origin')
      .action(async (options: { kb?: string; daemonUrl?: string }) =>
        perform(() =>
          indexKb(context, options.kb, options.daemonUrl === undefined ? null : loopback(options.daemonUrl))
        )
      )
  )
  kb.addCommand(
    new Command('search')
      .description('search current authorized Markdown with bounded typed qmd retrieval')
      .argument('<query>', 'plain text query, at most 1024 bytes')
      .option('--kb <id>', 'stable local registry KB ID; defaults to current root')
      .option('--mode <mode>', 'query, search or vsearch', 'query')
      .option('--limit <count>', 'result count from 1 to 50', '10')
      .option('--zone <name>', 'one canonical declared zone')
      .option('--path-prefix <path>', 'safe repository-relative path prefix')
      .action(
        async (
          query: string,
          options: { kb?: string; mode: SearchMode; limit: string; zone?: string; pathPrefix?: string }
        ) =>
          perform(() =>
            searchKb(context, options.kb, {
              query,
              mode: options.mode,
              limit: Number(options.limit),
              ...(options.zone !== undefined ? { zone: options.zone } : {}),
              ...(options.pathPrefix !== undefined ? { pathPrefix: options.pathPrefix } : {})
            })
          )
      )
  )
  kb.addCommand(
    new Command('status')
      .description('report scoped configured binding and daemon reachability without identity attestation')
      .option('--kb <id>', 'stable local registry KB ID; defaults to current root')
      .action(async (options: { kb?: string }) => perform(() => statusKb(context, options.kb)))
  )
  return kb
}
