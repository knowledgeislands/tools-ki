import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { Command } from 'commander'
import type { InstalledAgent } from '../../agents/index.ts'
import {
  configuredAgents,
  inspectUserConfiguration,
  installBootstrapSkills,
  installedBootstrapSkillSources,
  localBootstrapHarness,
  refreshUserConfiguration,
  setLocalBootstrapHarness
} from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
import { resolveInstalledSkill } from '../../core/configuration/index.ts'
import { KiError } from '../../core/errors.ts'
import { discoverInstalledHarnesses } from '../../core/harness/index.ts'
import { loadRubricDefinition } from '../../core/rubric/loader.ts'
import { prepareRubricPublication } from '../../core/rubric/publication.ts'
import {
  canonicalHarnessDevelopmentEnabled,
  enableCanonicalHarnessDevelopment,
  restoreCanonicalHarness
} from '../../core/storage/index.ts'
import { prepareWrites, publishWrites } from '../../core/transaction.ts'

const configured = (context: KiContext) =>
  configuredAgents({ homeDirectory: context.homeDirectory, configurationDirectory: context.paths.config })

const isDevLinkedHarness = async (harnessRoot: string): Promise<boolean> => {
  /* v8 ignore next -- discovery already required this directory; this protects concurrent mutation. */
  const state = await lstat(join(harnessRoot, 'skills')).catch(() => undefined)
  /* v8 ignore next -- lstat can only return a stat object or undefined. */
  return state?.isSymbolicLink() ?? false
}

const createRubricCommand = (context: KiContext): Command =>
  new Command('rubric')
    .description("render a skill's generated rubric catalogue, or verify it against references/rubric.md")
    .argument('<skill>', 'skill capability name whose rubric to render')
    .option('--write', 'publish the rendered catalogue to references/rubric.md (dev-linked harness installs only)')
    .action(async (skill: string, options: { write?: boolean }) => {
      const resolved = resolveInstalledSkill(await discoverInstalledHarnesses(context.paths.data), skill)
      const publication = await prepareRubricPublication(
        resolved,
        await loadRubricDefinition(resolved),
        undefined,
        context.lstat
      )
      if (options.write) {
        if (!(await isDevLinkedHarness(resolved.harness.root)))
          throw new KiError(
            `${resolved.identity} is an installed payload; run ki dev local on before writing its rubric catalogue`,
            1
          )
        if (publication.evidence.state !== 'in-sync')
          await publishWrites(await prepareWrites(publication.publicationRoot, [publication.proposal()]), false)
        context.stdout.write(`write ${publication.displayTarget}\n`)
        return
      }
      if (publication.evidence.state === 'in-sync') {
        context.stdout.write(`ki dev skill rubric: ${resolved.identity} references/rubric.md is in sync\n`)
        return
      }
      const reason = publication.evidence.state === 'missing' ? 'is missing' : 'is stale'
      context.stdout.write(
        `ki dev skill rubric: ${resolved.identity} references/rubric.md ${reason}; run with --write from a dev-linked harness\n`
      )
      throw new KiError(`${resolved.identity} references/rubric.md ${reason}`, 1)
    })

const reportProjections = (
  context: KiContext,
  projections: readonly { readonly agent: InstalledAgent; readonly skill: string; readonly installed: boolean }[]
): void => {
  for (const { agent, skill, installed } of projections) {
    context.stdout.write(`${skill} for ${agent.descriptor.id} ${installed ? 'installed' : 'already installed'}\n`)
  }
}

export const createDevCommand = (context: KiContext): Command => {
  const command = new Command('dev').description(
    'switch the canonical harness between a local checkout and its verified archive'
  )
  const local = command.command('local').description('manage the canonical local development harness')
  local
    .command('set <local-harness-path>')
    .description('validate and remember a local harness checkout without enabling it')
    .action(async (path: string) => {
      if (await canonicalHarnessDevelopmentEnabled(context.paths.data))
        throw new KiError('local development is active; run ki dev local off before setting a new source', 1)
      const local = await localBootstrapHarness(path)
      const agents = await configured(context)
      await setLocalBootstrapHarness(context.paths.config, context.homeDirectory, local.harness)
      context.stdout.write(`development harness set ${local.harness}\n`)
      context.stdout.write(`configured ${agents.length} agents\n`)
    })
  local
    .command('on')
    .description('link the canonical harness payload to the configured local harness checkout')
    .action(async () => {
      const configuration = await inspectUserConfiguration(context.paths.config)
      if (!configuration.local)
        throw new KiError('no local development source is configured; run ki dev local set <path>', 1)
      const local = await localBootstrapHarness(configuration.local)
      const agents = await configured(context)
      const harness = await enableCanonicalHarnessDevelopment(context.paths.data, local.harness)
      const projections = await installBootstrapSkills(local.skills, agents, { replace: true })
      const refreshed = await refreshUserConfiguration(context.paths.config, context.paths.data, agents, harness)
      context.stdout.write(`development harness enabled ${harness}\n`)
      context.stdout.write(
        `refreshed ki configuration: ${agents.length} agents, ${refreshed.harnesses} harnesses, ${refreshed.skills} skills\n`
      )
      reportProjections(context, projections)
    })
  local
    .command('off')
    .description('restore the verified canonical harness archive')
    .action(async () => {
      const agents = await configured(context)
      const configuration = await inspectUserConfiguration(context.paths.config)
      const installation = await restoreCanonicalHarness(
        context.paths.config,
        context.paths.data,
        context.paths.state,
        context.fetcher,
        context.runner,
        context.environment
      )
      const skills = await installedBootstrapSkillSources(context.paths.data)
      const projections = await installBootstrapSkills(skills, agents, { replace: true })
      const refreshed = await refreshUserConfiguration(
        context.paths.config,
        context.paths.data,
        agents,
        configuration.local ?? undefined
      )
      // A sandbox always starts from an installed canonical payload, and its fresh-install arm
      // needs a download that the pinned release digest in `src/core/storage/registry.ts` forbids.
      /* v8 ignore next */
      context.stdout.write(
        `development harness disabled; canonical harness ${installation.installed ? 'installed' : 'already installed'}\tarchive ${installation.archiveSha256}\n`
      )
      context.stdout.write(
        `refreshed ki configuration: ${agents.length} agents, ${refreshed.harnesses} harnesses, ${refreshed.skills} skills\n`
      )
      reportProjections(context, projections)
    })
  command.addCommand(
    new Command('skill').description('development-only skill operations').addCommand(createRubricCommand(context))
  )
  return command
}
