import { Command } from 'commander'
import { inspectUserConfiguration } from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
import { KiError } from '../../core/errors.ts'
import {
  type DevelopmentProjectionView,
  type DevelopmentRubricEvent,
  disableDevelopment,
  enableDevelopment,
  inspectDevelopmentRubric,
  setDevelopmentSource
} from '../../core/harness/index.ts'
import {
  developmentRubricPort,
  disableDevelopmentPort,
  enableDevelopmentPort,
  setDevelopmentSourcePort
} from './operations.ts'

const renderRubricEvent = (event: DevelopmentRubricEvent): string => {
  switch (event.kind) {
    case 'written':
      return `write ${event.target}\n`
    case 'in-sync':
      return `ki dev skill rubric: ${event.identity} references/rubric.md is in sync\n`
    case 'out-of-sync':
      return `ki dev skill rubric: ${event.identity} references/rubric.md ${event.reason}; run with --write from a dev-linked harness\n`
  }
}

const createRubricCommand = (context: KiContext): Command =>
  new Command('rubric')
    .description("render a skill's generated rubric catalogue, or verify it against references/rubric.md")
    .argument('<skill>', 'skill capability name whose rubric to render')
    .option('--write', 'publish the rendered catalogue to references/rubric.md (dev-linked harness installs only)')
    .action(async (skill: string, options: { write?: boolean }) => {
      await inspectDevelopmentRubric(developmentRubricPort(context), skill, Boolean(options.write), (event) =>
        context.stdout.write(renderRubricEvent(event))
      )
    })

const reportProjections = (context: KiContext, projections: readonly DevelopmentProjectionView[]): void => {
  for (const { agentId, skill, installed } of projections) {
    context.stdout.write(`${skill} for ${agentId} ${installed ? 'installed' : 'already installed'}\n`)
  }
}

const configuredLocalHarnesses = async (context: KiContext): Promise<readonly string[]> => {
  const configuration = await inspectUserConfiguration(context.paths.config)
  if (configuration.state === 'missing')
    throw new KiError('ki environment is not bootstrapped; run `ki bootstrap` first', 1)
  if (configuration.state === 'invalid')
    throw new KiError(`ki configuration is invalid: ${configuration.errors.join('; ')}`, 1)
  if (!configuration.locals.length)
    throw new KiError('no local development source is configured; run ki dev local set <harness-id> <path>', 1)
  return configuration.locals.map((local) => local.harness)
}

const reportEnabled = async (context: KiContext, identifier: string): Promise<void> => {
  const result = await enableDevelopment(enableDevelopmentPort(context), identifier)
  context.stdout.write(`development harness enabled ${result.identifier}\t${result.harness}\n`)
  context.stdout.write(
    `refreshed ki configuration: ${result.agents} agents, ${result.harnesses} harnesses, ${result.skills} skills\n`
  )
  reportProjections(context, result.projections)
}

const reportDisabled = async (context: KiContext, identifier: string): Promise<void> => {
  const result = await disableDevelopment(disableDevelopmentPort(context), identifier)
  // A sandbox cannot verify the pinned canonical archive needed by the fresh-install arm.
  /* v8 ignore next */
  context.stdout.write(
    `development harness disabled ${result.identifier}; verified harness ${result.installed ? 'installed' : 'already installed'}\tarchive ${result.archiveSha256}\n`
  )
  context.stdout.write(
    `refreshed ki configuration: ${result.agents} agents, ${result.harnesses} harnesses, ${result.skills} skills\n`
  )
  reportProjections(context, result.projections)
}

export const createDevCommand = (context: KiContext): Command => {
  const command = new Command('dev').description(
    'switch installed harnesses independently between local checkouts and verified archives'
  )
  const local = command.command('local').description('manage local development for installed harnesses')
  local
    .command('set <harness-id> <local-harness-path>')
    .description('validate and remember a checkout for one installed harness without enabling it')
    .action(async (identifier: string, path: string) => {
      const result = await setDevelopmentSource(setDevelopmentSourcePort(context), identifier, path)
      context.stdout.write(`development harness set ${result.identifier}\t${result.harness}\n`)
      context.stdout.write(`configured ${result.agents} agents\n`)
    })
  local
    .command('on [harness-id]')
    .description('switch one configured harness, or every configured harness, to its complete local checkout root')
    .action(async (identifier?: string) => {
      const identifiers = identifier ? [identifier] : await configuredLocalHarnesses(context)
      for (const harness of identifiers) await reportEnabled(context, harness)
    })
  local
    .command('off [harness-id]')
    .description('restore one configured harness, or every configured harness, from its verified archive')
    .action(async (identifier?: string) => {
      const identifiers = identifier ? [identifier] : await configuredLocalHarnesses(context)
      for (const harness of identifiers) await reportDisabled(context, harness)
    })
  command.addCommand(
    new Command('skill').description('development-only skill operations').addCommand(createRubricCommand(context))
  )
  return command
}
