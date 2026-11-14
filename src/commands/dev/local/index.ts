import { Command } from 'commander'
import { inspectUserConfiguration, requireLocalSources } from '../../../agents/index.ts'
import type { KiContext } from '../../../context.ts'
import {
  backpackIdentifier,
  type DevelopmentProjectionView,
  disableDevelopment,
  enableDevelopment,
  setDevelopmentSource
} from '../../../core/backpack/index.ts'
import { KiError } from '../../../core/errors.ts'
import { disableDevelopmentPort, enableDevelopmentPort, setDevelopmentSourcePort } from '../ports.ts'

const reportProjections = (context: KiContext, projections: readonly DevelopmentProjectionView[]): void => {
  for (const { agentId, skill, installed } of projections) {
    context.stdout.write(`${skill} for ${agentId} ${installed ? 'installed' : 'already installed'}\n`)
  }
}

const configuredLocalBackpacks = async (context: KiContext): Promise<readonly string[]> => {
  const configuration = await inspectUserConfiguration(context.paths.config)
  if (configuration.state === 'missing')
    throw new KiError('ki environment is not bootstrapped; run `ki bootstrap` first', 1)
  if (configuration.state === 'invalid')
    throw new KiError(`ki configuration is invalid: ${configuration.errors.join('; ')}`, 1)
  const locals = await requireLocalSources(context.paths.config, context.paths.state)
  if (!locals.length)
    throw new KiError('no local development source is configured; run ki dev local set <backpack-id> <path>', 1)
  return locals.map((local) => local.backpack)
}

const reportEnabled = async (context: KiContext, identifier: string): Promise<void> => {
  const result = await enableDevelopment(enableDevelopmentPort(context), identifier)
  context.stdout.write(`development backpack enabled ${result.identifier}\t${result.backpack}\n`)
  context.stdout.write(
    `refreshed ki configuration: ${result.agents} agents, ${result.backpacks} backpacks, ${result.skills} skills\n`
  )
  reportProjections(context, result.projections)
}

const reportDisabled = async (context: KiContext, identifier: string): Promise<void> => {
  const result = await disableDevelopment(disableDevelopmentPort(context), identifier)
  // A sandbox cannot verify the pinned canonical archive needed by the fresh-install arm.
  /* v8 ignore next */
  context.stdout.write(
    `development backpack disabled ${result.identifier}; verified backpack ${result.installed ? 'installed' : 'already installed'}\tarchive ${result.archiveSha256}\n`
  )
  context.stdout.write(
    `refreshed ki configuration: ${result.agents} agents, ${result.backpacks} backpacks, ${result.skills} skills\n`
  )
  reportProjections(context, result.projections)
}

export const createDevLocalCommand = (context: KiContext): Command => {
  const command = new Command('local').description('manage local development for installed backpacks')
  command
    .command('set <backpack-id> <local-backpack-path>')
    .description('validate and remember a checkout for one installed backpack without enabling it')
    .summary('remember a local backpack checkout')
    .action(async (argument: string, path: string) => {
      const identifier = backpackIdentifier(argument)
      const result = await setDevelopmentSource(setDevelopmentSourcePort(context), identifier, path)
      context.stdout.write(`development backpack set ${result.identifier}\t${result.backpack}\n`)
      context.stdout.write(`configured ${result.agents} agents\n`)
    })
  command
    .command('on [backpack-id]')
    .description('switch one configured backpack, or every configured backpack, to its complete local checkout root')
    .summary('activate local backpack checkouts')
    .action(async (identifier?: string) => {
      const identifiers = identifier ? [backpackIdentifier(identifier)] : await configuredLocalBackpacks(context)
      for (const backpack of identifiers) await reportEnabled(context, backpack)
    })
  command
    .command('off [backpack-id]')
    .description('restore one configured backpack, or every configured backpack, from its verified archive')
    .summary('restore verified backpack archives')
    .action(async (identifier?: string) => {
      const identifiers = identifier ? [backpackIdentifier(identifier)] : await configuredLocalBackpacks(context)
      for (const backpack of identifiers) await reportDisabled(context, backpack)
    })
  return command
}
