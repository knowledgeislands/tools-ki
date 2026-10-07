import { Command, Option } from 'commander'
import type { KiContext } from '../../context.ts'
import { KiError } from '../../core/errors.ts'
import {
  listTerritories,
  type OpenTargetName,
  openLocalTarget,
  openTargetNames,
  resolveTerritory
} from '../../core/territory/index.ts'
import type { TerritorySelection } from '../../core/territory/resolution.ts'
import { renderTree } from '../presentation/index.ts'
import { createTerritoryInspectCommand } from './inspect.ts'
import { territoryOptions } from './selection.ts'

type Options = TerritorySelection & {
  readonly filter: readonly string[]
  readonly null?: boolean
  readonly verbose?: boolean
  readonly target?: OpenTargetName
}
export const createTerritoryCommand = (context: KiContext): Command => {
  const resolve = (options: Options) => resolveTerritory(context.paths.state, { ...options, filters: options.filter })
  const command = new Command('territory').description('discover and select territories from their Capitals')
  command.addCommand(
    new Command('list').description('list registered territory Capitals').action(async () => {
      const territories = await listTerritories(context.paths.state)
      context.stdout.write(
        `${renderTree({ title: 'KI TERRITORIES', entries: territories.map((territory) => ({ label: `${territory.handle}: ${territory.name} (Capital: ${territory.capital.key}, members: ${territory.members})` })) }).join('\n')}\n`
      )
    })
  )
  command.addCommand(
    territoryOptions(new Command('roots').description('write selected physical roots for machine consumption'))
      .option('-0, --null', 'terminate roots with NUL instead of line feeds')
      .action(async (options: Options) => {
        const profile = await resolve(options)
        const separator = options.null ? '\0' : '\n'
        context.stdout.write(`${profile.roots.map((root) => root.root).join(separator)}${separator}`)
      })
  )
  command.addCommand(
    territoryOptions(new Command('show').description('show selected territory or estate repositories'))
      .option('-v, --verbose', 'show canonical identities and physical paths')
      .action(async (options: Options) => {
        const profile = await resolve(options)
        context.stdout.write(
          `${renderTree({ title: 'KI TERRITORY', entries: [{ label: `${profile.id}: ${profile.title}`, children: profile.roots.map((member) => ({ label: member.key, ...(options.verbose ? { children: [{ label: member.repository }, { label: member.root }] } : {}) })) }, { label: `summary: REPOSITORIES=${profile.roots.length}` }] }).join('\n')}\n`
        )
      })
  )
  command.addCommand(
    territoryOptions(new Command('audit').description('validate a selected territory or estate')).action(
      async (options: Options) => {
        const profile = await resolve(options)
        context.stdout.write(
          `${renderTree({ title: 'KI TERRITORY AUDIT', entries: [{ label: `${profile.id}: healthy` }, { label: `summary: REPOSITORIES=${profile.roots.length} FINDINGS=0` }] }).join('\n')}\n`
        )
      }
    )
  )
  command.addCommand(
    territoryOptions(new Command('open').description('open selected repositories in a local target'))
      .addOption(new Option('--target <target>', 'local target to open').choices(openTargetNames).makeOptionMandatory())
      .action(async (options: Options & { readonly target: OpenTargetName }) => {
        const profile = await resolve(options)
        const result = await openLocalTarget(
          options.target,
          profile.roots.map((root) => root.root),
          { runner: context.runner, environment: context.environment },
          { preserveProjectionOrder: true, ownerRoot: profile.roots.find((root) => root.kind === 'owner')?.root }
        )
        if (result.exitCode)
          throw new KiError(
            `could not open territory ${profile.id}: ${result.output.trim() || result.failureMessage}`,
            result.exitCode
          )
        context.stdout.write(
          `ki territory open ${profile.id} --target ${options.target}: opened ${profile.roots.length} repositories\n`
        )
      })
  )
  command.addCommand(createTerritoryInspectCommand(context))
  return command
}
