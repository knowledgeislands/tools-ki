import { Command } from 'commander'
import {
  configureBootstrapAgents,
  installBootstrapSkills,
  installedBootstrapSkillSources,
  refreshUserConfiguration,
  setConfiguredUserSkills,
  setLocalBootstrapHarness
} from '../agents/index.ts'
import type { KiContext } from '../context.ts'
import { canonicalHarnessIdentifier } from '../core/harness.ts'
import { restoreCanonicalHarness } from '../core/registry.ts'

export const createBootstrapCommand = (context: KiContext): Command =>
  new Command('bootstrap')
    .description('configure detected agents and install KI core user skills')
    .option('--refresh', 'reconcile agents, harnesses, and skills from installed state')
    .action(async (options: { refresh?: boolean }) => {
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
      const installation = await restoreCanonicalHarness(context.paths.config, context.paths.data, context.fetcher)
      // Fixture archives cannot match the pinned canonical SHA-256; its fresh-install presentation is release-only.
      /* v8 ignore next */
      context.stdout.write(
        `canonical harness ${installation.installed ? 'installed' : 'already installed'}\tarchive ${installation.archiveSha256}\n`
      )
      const skills = await installedBootstrapSkillSources(context.paths.data)
      const projections = await installBootstrapSkills(skills, agents)
      if (options.refresh) {
        const refreshed = await refreshUserConfiguration(context.paths.config, context.paths.data, agents)
        context.stdout.write(
          `refreshed ki configuration: ${agents.length} agents, ${refreshed.harnesses} harnesses, ${refreshed.skills} skills\n`
        )
      } else {
        await setLocalBootstrapHarness(context.paths.config)
        await setConfiguredUserSkills(
          context.paths.config,
          context.homeDirectory,
          skills.map((skill) => `${canonicalHarnessIdentifier}:${skill.name}`)
        )
      }
      for (const { agent, skill, installed } of projections) {
        context.stdout.write(`${skill} for ${agent.descriptor.id} ${installed ? 'installed' : 'already installed'}\n`)
      }
    })
