import { Command } from 'commander'
import { bootstrapAgents } from '../agents/index.ts'
import type { KiContext } from '../core/context.ts'

export const createBootstrapCommand = (context: KiContext): Command =>
  new Command('bootstrap')
    .description('configure detected agents and install the KI bootstrap skill')
    .option('--redetect', 'refresh the generated agent configuration from installed runtimes')
    .action(async (options: { redetect?: boolean }) => {
      const agents = await bootstrapAgents({
        homeDirectory: context.homeDirectory,
        configurationDirectory: context.paths.config,
        dataDirectory: context.paths.data,
        redetect: options.redetect
      })
      context.stdout.write(
        agents.length
          ? `bootstrapped KI environment for ${agents.map((agent) => agent.descriptor.id).join(', ')}\n`
          : 'bootstrapped KI environment with no configured agents\n'
      )
    })
