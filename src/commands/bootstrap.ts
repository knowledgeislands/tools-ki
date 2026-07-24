import { Command } from 'commander'
import {
  configureBootstrapAgents,
  developmentBootstrapSkillSource,
  installBootstrapSkills,
  installedBootstrapSkillSource
} from '../agents/index.ts'
import type { KiContext } from '../core/context.ts'
import { installCanonicalHarness } from '../core/registry.ts'

export const createBootstrapCommand = (context: KiContext): Command =>
  new Command('bootstrap')
    .description('configure detected agents and install the KI bootstrap skill')
    .option('--redetect', 'refresh the generated agent configuration from installed runtimes')
    .option('--dev-harness <path>', 'link ki-bootstrap from a validated local harness checkout')
    .action(async (options: { redetect?: boolean; devHarness?: string }) => {
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
      const source = options.devHarness
        ? await developmentBootstrapSkillSource(options.devHarness)
        : await (async () => {
            const canonical = await installCanonicalHarness(context.paths.config, context.paths.data)
            context.stdout.write(
              `canonical harness ${canonical.installed ? 'installed' : 'already installed'}\tarchive ${canonical.archiveSha256}\n`
            )
            return installedBootstrapSkillSource(context.paths.data)
          })()
      if (options.devHarness) context.stdout.write(`using development harness ${source}\n`)
      const projections = await installBootstrapSkills(source, agents)
      for (const { agent, installed } of projections) {
        context.stdout.write(`ki-bootstrap for ${agent.descriptor.id} ${installed ? 'installed' : 'already installed'}\n`)
      }
    })
