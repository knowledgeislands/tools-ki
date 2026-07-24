import { Command } from 'commander'
import { bootstrapAgents } from '../agents/index.ts'
import type { KiContext } from '../core/context.ts'

export const createBootstrapCommand = (context: KiContext): Command =>
  new Command('bootstrap').description('detect installed agents and create the KI environment configuration').action(async () => {
    const agents = await bootstrapAgents({
      homeDirectory: context.homeDirectory,
      configurationDirectory: context.paths.config
    })
    context.stdout.write(
      agents.length
        ? `bootstrapped KI environment for ${agents.map((agent) => agent.descriptor.id).join(', ')}\n`
        : 'bootstrapped KI environment with no detected agents\n'
    )
  })
