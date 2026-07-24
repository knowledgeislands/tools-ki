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
      if (configuration.disposition === 'created') {
        context.stdout.write(
          `created KI agent configuration for ${agents.map((agent) => agent.descriptor.id).join(', ') || 'no detected agents'}\n`
        )
      }
      if (configuration.disposition === 'redetected') {
        context.stdout.write(`redetected KI agents: ${agents.map((agent) => agent.descriptor.id).join(', ') || 'none'}\n`)
      }
      const projections = await installBootstrapSkills(context.paths.data, agents)
      for (const { agent, installed } of projections) {
        context.stdout.write(`ki-bootstrap for ${agent.descriptor.id} ${installed ? 'installed' : 'already installed'}\n`)
      }
    })
