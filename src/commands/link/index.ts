import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { KiError } from '../../core/errors.ts'
import { recordLink } from '../../core/work/index.ts'

export const createLinkCommand = (context: KiContext): Command =>
  new Command('link')
    .description('print the Markdown link to each roadmap work record')
    .argument('<identifier...>', 'roadmap record identifier, such as KI-TOOL-KI-CLI-127')
    .action(async (identifiers: readonly string[]) => {
      const reasons: string[] = []
      for (const identifier of identifiers) {
        const result = await recordLink(
          { stateDirectory: context.paths.state, environment: context.environment, runner: context.runner },
          identifier
        )
        if ('link' in result) context.stdout.write(`${result.link}\n`)
        else reasons.push(result.reason)
      }
      if (reasons.length) throw new KiError(reasons.join('; '), 1)
    })
