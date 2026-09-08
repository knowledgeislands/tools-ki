import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { grammarError } from '../../core/errors.ts'
import { addStandingRoute, removeStandingRoute } from '../../core/trade/configuration-mutations.ts'
import { localRegisteredConfiguration, localRegisteredRepository } from '../../core/trade/index.ts'
import {
  captureStandingIntake,
  inspectStandingRoutes,
  type StandingRouteInspection
} from '../../core/trade/standing-intake.ts'
import { renderTree } from '../presentation/index.ts'
import { repository, requireText, routeDirection, subtype } from './shared.ts'

interface StandingSelectionOptions {
  readonly direction?: string
  readonly subtype?: string
}

const stateText = (state: StandingRouteInspection['state']): string => state.replaceAll('-', ' ')

const selectedStandingRoutes = async (
  context: KiContext,
  peer: string | undefined,
  options: StandingSelectionOptions
): Promise<readonly StandingRouteInspection[]> => {
  const { configuration } = await localRegisteredConfiguration(context)
  const direction = options.direction ? routeDirection(options.direction) : undefined
  const selectedSubtype = options.subtype ? subtype(options.subtype) : undefined
  return (await inspectStandingRoutes(context, configuration)).filter(
    (route) =>
      (!peer || route.repository === peer) &&
      (!direction || route.direction === direction) &&
      (!selectedSubtype || route.subtype === selectedSubtype)
  )
}

const renderStandingRoutes = (routes: readonly StandingRouteInspection[], title: string): string => {
  const active = routes.filter((route) => route.state === 'active').length
  return renderTree({
    title,
    entries: [
      {
        label: `grants (${routes.length})`,
        children: routes.length
          ? routes.map((route) => ({
              label: `${route.direction} knowledge ${route.subtype} ${route.repository}: ${stateText(route.state)}`
            }))
          : [{ label: 'none' }]
      },
      { label: `summary: GRANTS=${routes.length} ACTIVE=${active}` }
    ]
  }).join('\n')
}

export const createTradeStandingCommand = (context: KiContext): Command =>
  new Command('standing')
    .description('maintain exact standing knowledge-intake grants')
    .addCommand(
      new Command('add')
        .description('declare one local standing knowledge-intake grant')
        .argument('<repository>', 'canonical peer HTTPS GitHub repository')
        .requiredOption('--direction <export|import>', 'whether this repository exports or imports the subtype')
        .requiredOption('--subtype <subtype>', 'exact receiver-owned knowledge subtype')
        .action(async (peer: string, options: StandingSelectionOptions) => {
          const direction = routeDirection(options.direction)
          const name = subtype(options.subtype)
          const target = repository(peer, 'standing route repository')
          const result = await addStandingRoute(
            (await localRegisteredRepository(context)).declaration,
            target,
            direction,
            name
          )
          context.stdout.write(
            `ki trade standing add: ${direction} knowledge ${name} ${result.repository} -> ${target}\n`
          )
        })
    )
    .addCommand(
      new Command('remove')
        .description('remove one local standing knowledge-intake grant')
        .argument('<repository>', 'canonical peer HTTPS GitHub repository')
        .requiredOption('--direction <export|import>', 'whether this repository exports or imports the subtype')
        .requiredOption('--subtype <subtype>', 'exact receiver-owned knowledge subtype')
        .action(async (peer: string, options: StandingSelectionOptions) => {
          const direction = routeDirection(options.direction)
          const name = subtype(options.subtype)
          const target = repository(peer, 'standing route repository')
          const result = await removeStandingRoute(
            (await localRegisteredConfiguration(context)).repository.declaration,
            target,
            direction,
            name
          )
          context.stdout.write(
            `ki trade standing remove: ${direction} knowledge ${name} ${result.repository} -> ${target}\n`
          )
        })
    )
    .addCommand(
      new Command('list')
        .description('list local standing grants and their activation state')
        .option('--incomplete', 'show only standing grants that are not active')
        .action(async (options: { readonly incomplete?: boolean }) => {
          const inspected = await selectedStandingRoutes(context, undefined, {})
          const selected = options.incomplete ? inspected.filter((route) => route.state !== 'active') : inspected
          context.stdout.write(`${renderStandingRoutes(selected, 'KI TRADE STANDING GRANTS')}\n`)
        })
    )
    .addCommand(
      new Command('check')
        .description('check exact standing knowledge-intake activation')
        .argument('[repository]', 'canonical peer HTTPS GitHub repository')
        .option('--direction <export|import>', 'restrict to one standing direction')
        .option('--subtype <subtype>', 'restrict to one receiver-owned subtype')
        .action(async (peer: string | undefined, options: StandingSelectionOptions) => {
          const target = peer ? repository(peer, 'standing route repository') : undefined
          const routes = await selectedStandingRoutes(context, target, options)
          if (target && !routes.length) throw grammarError(`standing route ${target} is not declared locally`)
          context.stdout.write(`${renderStandingRoutes(routes, 'KI TRADE STANDING CHECK')}\n`)
        })
    )
    .addCommand(
      new Command('capture')
        .description('append one receiver-local standing-intake provenance block')
        .argument('<repository>', 'canonical source HTTPS GitHub repository')
        .requiredOption('--subtype <subtype>', 'active receiver-owned knowledge subtype')
        .requiredOption('--source-ref <commit:path#anchor>', 'exact committed source reference')
        .requiredOption('--capture <path#anchor>', 'receiver Markdown file and capture anchor')
        .action(
          async (
            peer: string,
            options: { readonly subtype?: string; readonly sourceRef?: string; readonly capture?: string }
          ) => {
            const local = await localRegisteredConfiguration(context)
            const result = await captureStandingIntake(
              context,
              { root: local.repository.root, configuration: local.configuration },
              {
                source: repository(peer, 'standing source repository'),
                subtype: subtype(options.subtype),
                sourceRef: requireText(options.sourceRef, '--source-ref'),
                capture: requireText(options.capture, '--capture')
              }
            )
            context.stdout.write(`ki trade standing capture: captured ${result.id} in ${result.path}\n`)
          }
        )
    )
