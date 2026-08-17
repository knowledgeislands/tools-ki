import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Command } from 'commander'
import {
  clearLocalBootstrapHarness,
  configureBootstrapAgents,
  inspectUserConfiguration,
  installBootstrapSkills,
  installedBootstrapSkillSources,
  localBootstrapHarness,
  migrateLegacyRepositoryRegistry,
  refreshUserConfiguration,
  setConfiguredUserSkills
} from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
import { canonicalHarnessIdentifier } from '../../core/harness/index.ts'
import { canonicalHarnessDevelopmentEnabled, restoreCanonicalHarness } from '../../core/storage/index.ts'

export const createBootstrapCommand = (context: KiContext): Command =>
  new Command('bootstrap')
    .description('configure detected agents and install KI core user skills')
    .option('--refresh', 'reconcile agents, harnesses, and skills from installed state')
    .action(async (options: { refresh?: boolean }) => {
      const previous = await inspectUserConfiguration(context.paths.config)
      const configurationPath = join(context.paths.config, 'config.toml')
      const previousConfiguration = previous.state === 'valid' ? await readFile(configurationPath, 'utf8') : undefined
      const activeLocal =
        previous.local !== null && (await canonicalHarnessDevelopmentEnabled(context.paths.data, previous.local))
          ? await localBootstrapHarness(previous.local)
          : undefined
      const migrated = options.refresh
        ? await migrateLegacyRepositoryRegistry(
            context.paths.config,
            context.paths.state,
            context.runner,
            context.environment
          )
        : 0
      const configuration = await configureBootstrapAgents({
        homeDirectory: context.homeDirectory,
        configurationDirectory: context.paths.config,
        refresh: options.refresh,
        dropLegacyRepositories: Boolean(options.refresh)
      })
      const agents = configuration.agents
      if (configuration.disposition === 'created') {
        context.stdout.write(
          `created KI agent configuration for ${agents.map((agent) => agent.descriptor.id).join(', ') || 'no detected agents'}\n`
        )
      }
      if (configuration.disposition === 'refreshed') {
        context.stdout.write(
          `refreshed KI agents: ${agents.map((agent) => agent.descriptor.id).join(', ') || 'none'}\n`
        )
      }
      let refreshed: Awaited<ReturnType<typeof refreshUserConfiguration>> | undefined
      const reconcileConfiguration = async (
        skills: Awaited<ReturnType<typeof installedBootstrapSkillSources>>
      ): Promise<void> => {
        if (options.refresh) {
          refreshed = await refreshUserConfiguration(
            context.paths.config,
            context.paths.data,
            agents,
            previous.local ?? undefined,
            { dropLegacyRepositories: Boolean(options.refresh) }
          )
          return
        }
        await clearLocalBootstrapHarness(context.paths.config)
        const selected = new Map<string, string>(
          (await inspectUserConfiguration(context.paths.config)).skills.map(
            (identity) => [identity.slice(identity.lastIndexOf(':') + 1), identity] as const
          )
        )
        for (const skill of skills) selected.set(skill.name, `${canonicalHarnessIdentifier}:${skill.name}`)
        await setConfiguredUserSkills(
          context.paths.config,
          context.homeDirectory,
          [...selected.values()].sort((left, right) => left.localeCompare(right))
        )
      }

      let installation: Awaited<ReturnType<typeof restoreCanonicalHarness>>
      let projections: Awaited<ReturnType<typeof installBootstrapSkills>>
      if (activeLocal) {
        const skills = await installedBootstrapSkillSources(context.paths.data, canonicalHarnessIdentifier, {
          preserveHarnessRoot: true
        })
        let restored: Awaited<ReturnType<typeof restoreCanonicalHarness>> | undefined
        try {
          projections = await installBootstrapSkills(skills, agents, {
            replace: true,
            finalize: async () => {
              await reconcileConfiguration(skills)
              restored = await restoreCanonicalHarness(
                context.paths.config,
                context.paths.data,
                context.paths.state,
                context.fetcher,
                context.runner,
                context.environment
              )
            }
          })
        } catch (error) {
          // Active-local transitions always start from a valid configuration snapshot.
          /* v8 ignore next -- The guard protects a future change to active-local detection. */
          if (previousConfiguration === undefined) throw error
          await writeFile(configurationPath, previousConfiguration, 'utf8')
          throw error
        }
        // installBootstrapSkills only returns after its finalize callback has completed.
        /* v8 ignore next -- The guard protects a future change to that callback contract. */
        if (!restored) throw new Error('canonical harness restoration did not complete')
        /* v8 ignore next -- The canonical release digest is pinned in `src/core/storage/registry.ts` and shadows any configured entry, so no fixture archive can verify and this restoration cannot succeed in a sandbox. */
        installation = restored
      } else {
        installation = await restoreCanonicalHarness(
          context.paths.config,
          context.paths.data,
          context.paths.state,
          context.fetcher,
          context.runner,
          context.environment
        )
        const skills = await installedBootstrapSkillSources(context.paths.data)
        projections = await installBootstrapSkills(skills, agents, {
          replace: options.refresh,
          finalize: () => reconcileConfiguration(skills)
        })
      }
      // A sandbox always starts from an installed canonical payload, and its fresh-install arm
      // needs a download that the pinned release digest in `src/core/storage/registry.ts` forbids.
      /* v8 ignore next */
      context.stdout.write(
        `canonical harness ${installation.installed ? 'installed' : 'already installed'}\tarchive ${installation.archiveSha256}\n`
      )
      if (refreshed) {
        context.stdout.write(
          `refreshed ki configuration: ${agents.length} agents, ${refreshed.harnesses} harnesses, ${refreshed.skills} skills\n`
        )
      }
      if (migrated) context.stdout.write(`migrated local KI repository registry: ${migrated} repositories\n`)
      for (const { agent, skill, installed } of projections) {
        context.stdout.write(`${skill} for ${agent.descriptor.id} ${installed ? 'installed' : 'already installed'}\n`)
      }
    })
