import { Command } from 'commander'
import {
  configureBootstrapAgents,
  installBootstrapSkills,
  installedBootstrapSkillSource,
  localBootstrapSkillSource
} from '../agents/index.ts'
import type { KiContext } from '../core/context.ts'
import { installCanonicalHarness } from '../core/registry.ts'

export const createBootstrapCommand = (context: KiContext): Command =>
  new Command('bootstrap')
    .description('configure detected agents and install the KI bootstrap skill')
    .option('--redetect', 'refresh the generated agent configuration from installed runtimes')
    .option('--local <path>', 'link ki-bootstrap from a local harness checkout')
    .action(async (options: { redetect?: boolean; local?: string }) => {
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
      const source = options.local
        ? await localBootstrapSkillSource(options.local)
        : await (async () => {
            const installation = await installCanonicalHarness(context.paths.config, context.paths.data)
            context.stdout.write(
              `canonical harness ${installation.installed ? 'installed' : 'already installed'}\tarchive ${installation.archiveSha256}\n`
            )
            return installedBootstrapSkillSource(context.paths.data)
          })()
      if (options.local) context.stdout.write(`using local harness ${source}\n`)
      const projections = await installBootstrapSkills(source, agents)
      for (const { agent, installed } of projections) {
        context.stdout.write(`ki-bootstrap for ${agent.descriptor.id} ${installed ? 'installed' : 'already installed'}\n`)
      }
    })
