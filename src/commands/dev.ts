import { Command } from 'commander'
import type { InstalledAgent } from '../agents/index.ts'
import {
  configuredAgents,
  installBootstrapSkills,
  installedBootstrapSkillSources,
  localBootstrapHarness,
  refreshUserConfiguration
} from '../agents/index.ts'
import type { KiContext } from '../context.ts'
import { enableCanonicalHarnessDevelopment, restoreCanonicalHarness } from '../core/registry.ts'

const configured = (context: KiContext) =>
  configuredAgents({ homeDirectory: context.homeDirectory, configurationDirectory: context.paths.config })

const reportProjections = (
  context: KiContext,
  projections: readonly { readonly agent: InstalledAgent; readonly skill: string; readonly installed: boolean }[]
): void => {
  for (const { agent, skill, installed } of projections) {
    context.stdout.write(`${skill} for ${agent.descriptor.id} ${installed ? 'installed' : 'already installed'}\n`)
  }
}

export const createDevCommand = (context: KiContext): Command => {
  const command = new Command('dev').description('switch the canonical harness between a local checkout and its verified archive')
  command
    .command('on <path>')
    .description('link the canonical harness payload to a local harness checkout')
    .action(async (path: string) => {
      const local = await localBootstrapHarness(path)
      const agents = await configured(context)
      const harness = await enableCanonicalHarnessDevelopment(context.paths.data, local.harness)
      const skills = await installedBootstrapSkillSources(context.paths.data)
      const projections = await installBootstrapSkills(skills, agents, { replace: true })
      const refreshed = await refreshUserConfiguration(context.paths.config, context.paths.data, agents, harness)
      context.stdout.write(`development harness enabled ${harness}\n`)
      context.stdout.write(
        `refreshed ki configuration: ${agents.length} agents, ${refreshed.harnesses} harnesses, ${refreshed.skills} skills\n`
      )
      reportProjections(context, projections)
    })
  command
    .command('off')
    .description('restore the verified canonical harness archive')
    .action(async () => {
      const agents = await configured(context)
      const installation = await restoreCanonicalHarness(context.paths.config, context.paths.data, context.fetcher)
      const skills = await installedBootstrapSkillSources(context.paths.data)
      const projections = await installBootstrapSkills(skills, agents, { replace: true })
      const refreshed = await refreshUserConfiguration(context.paths.config, context.paths.data, agents)
      context.stdout.write(
        `development harness disabled; canonical harness ${installation.installed ? 'installed' : 'already installed'}\tarchive ${installation.archiveSha256}\n`
      )
      context.stdout.write(
        `refreshed ki configuration: ${agents.length} agents, ${refreshed.harnesses} harnesses, ${refreshed.skills} skills\n`
      )
      reportProjections(context, projections)
    })
  return command
}
