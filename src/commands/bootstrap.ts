import { Command } from 'commander'
import { configureBootstrapAgents, installBootstrapSkills } from '../agents/index.ts'
import type { KiContext } from '../core/context.ts'

export const createBootstrapCommand = (context: KiContext): Command =>
  new Command('bootstrap')
    .description('configure detected agents and install the KI bootstrap skill')
    .option('--redetect', 'refresh the generated agent configuration from installed runtimes')
    .action(async (options: { redetect?: boolean }) => {
      const configuration = await configureBootstrapAgents({
        homeDirectory: context.homeDirectory,
        configurationDirectory: context.paths.config,
        redetect: options.redetect
      })
      const agents = configuration.agents
      context.stdout.write(
        configuration.disposition === 'created'
          ? `created KI agent configuration for ${agents.map((agent) => agent.descriptor.id).join(', ') || 'no detected agents'}\n`
          : configuration.disposition === 'redetected'
            ? `redetected KI agents: ${agents.map((agent) => agent.descriptor.id).join(', ') || 'none'}\n`
            : `using existing KI agent configuration for ${agents.map((agent) => agent.descriptor.id).join(', ') || 'no agents'}\n`
      )
      await installBootstrapSkills(context.paths.data, agents)
      context.stdout.write(
        agents.length
          ? `installed ki-bootstrap for ${agents.map((agent) => agent.descriptor.id).join(', ')}\n`
          : 'no configured agents support ki-bootstrap installation\n'
      )
    })
