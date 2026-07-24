import { Command } from 'commander'
import {
  configureBootstrapAgents,
  installBootstrapSkills,
  installedBootstrapSkillSource,
  localBootstrapHarness,
  refreshUserConfiguration,
  setLocalBootstrapHarness
} from '../agents/index.ts'
import type { KiContext } from '../core/context.ts'
import { installCanonicalHarness } from '../core/registry.ts'

export const createBootstrapCommand = (context: KiContext): Command =>
  new Command('bootstrap')
    .description('configure detected agents and install the KI bootstrap skill')
    .option('--refresh', 'reconcile agents, harnesses, and skills from installed state')
    .option('--local <path>', 'link ki-bootstrap from a local harness checkout')
    .action(async (options: { refresh?: boolean; local?: string }) => {
      const configuration = await configureBootstrapAgents({
        homeDirectory: context.homeDirectory,
        configurationDirectory: context.paths.config,
        refresh: options.refresh
      })
      const agents = configuration.agents
      if (configuration.disposition === 'created') {
        context.stdout.write(
          `created KI agent configuration for ${agents.map((agent) => agent.descriptor.id).join(', ') || 'no detected agents'}\n`
        )
      }
      if (configuration.disposition === 'refreshed') {
        context.stdout.write(`refreshed KI agents: ${agents.map((agent) => agent.descriptor.id).join(', ') || 'none'}\n`)
      }
      const local = options.local ? await localBootstrapHarness(options.local) : undefined
      const source = local
        ? local.skill
        : await (async () => {
            const installation = await installCanonicalHarness(context.paths.config, context.paths.data)
            context.stdout.write(
              `canonical harness ${installation.installed ? 'installed' : 'already installed'}\tarchive ${installation.archiveSha256}\n`
            )
            return installedBootstrapSkillSource(context.paths.data)
          })()
      if (local) context.stdout.write(`using local harness ${source}\n`)
      const projections = await installBootstrapSkills(source, agents)
      if (options.refresh) {
        const refreshed = await refreshUserConfiguration(context.paths.config, context.paths.data, agents, local?.harness)
        context.stdout.write(
          `refreshed KI configuration: ${agents.length} agents, ${refreshed.harnesses} harnesses, ${refreshed.skills} skills\n`
        )
      } else await setLocalBootstrapHarness(context.paths.config, local?.harness)
      for (const { agent, installed } of projections) {
        context.stdout.write(`ki-bootstrap for ${agent.descriptor.id} ${installed ? 'installed' : 'already installed'}\n`)
      }
    })
