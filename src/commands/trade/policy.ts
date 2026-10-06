import { resolve } from 'node:path'
import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { KiError } from '../../core/errors.ts'
import { repositoryIdentity } from '../../core/trade/configuration.ts'
import { localTerritoryPolicy } from '../../core/trade/estate.ts'
import { compareRoutes, inspectTerritory } from '../../core/trade/policy.ts'
import { renderTree } from '../presentation/index.ts'
import type { TradeSelection } from './selection.ts'
import { requireText } from './shared.ts'

const identities = (repositories: readonly string[]): string => repositories.map(repositoryIdentity).join(', ')

const items = (values: readonly string[]): readonly { readonly label: string }[] =>
  values.length ? values.map((label) => ({ label })) : [{ label: 'none' }]

export const createTradePolicyCommand = (context: KiContext, selection: TradeSelection): Command =>
  new Command('policy')
    .description('inspect and check the territory Capital trade policy')
    .addCommand(
      new Command('show')
        .description("show the territory Capital's channels, standing grants and knowledge subtypes")
        .action(async () => {
          const { policy } = await localTerritoryPolicy(await selection.one())
          const subtypes = Object.entries(policy.subtypes)
          context.stdout.write(
            `${renderTree({
              title: 'KI TRADE POLICY',
              context: [
                { label: `capital: ${policy.capital}` },
                { label: `territory: ${policy.name} (${policy.members.length} members)` }
              ],
              entries: [
                {
                  label: `channels (${policy.channels.length})`,
                  children: items(
                    policy.channels.map(
                      (channel) =>
                        `${channel.id} [${channel.kinds.join(', ')}]: ${identities(channel.from)} -> ${identities(channel.to)}`
                    )
                  )
                },
                {
                  label: `standing (${policy.standing.length})`,
                  children: items(
                    policy.standing.map(
                      (grant) => `${grant.subtype}: ${identities(grant.from)} -> ${identities(grant.to)}`
                    )
                  )
                },
                {
                  label: `subtypes (${subtypes.length})`,
                  children: items(subtypes.map(([name, description]) => `${name}: ${description}`))
                },
                {
                  label: `summary: CHANNELS=${policy.channels.length} STANDING=${policy.standing.length} SUBTYPES=${subtypes.length}`
                }
              ]
            }).join('\n')}\n`
          )
        })
    )
    .addCommand(
      new Command('check')
        .description('check every territory member against the Capital policy through the local registry')
        .action(async () => {
          const { policy, members } = await inspectTerritory(await selection.one())
          const count = (state: string): number => members.filter((member) => member.state === state).length
          const failing = count('failing')
          context.stdout.write(
            `${renderTree({
              title: 'KI TRADE POLICY CHECK',
              context: [{ label: `capital: ${policy.capital}` }],
              entries: [
                {
                  label: `members (${members.length})`,
                  children: members.map((member) => ({
                    label: `${repositoryIdentity(member.repository)}: ${member.state}${member.finding ? ` (${member.finding})` : ''}`
                  }))
                },
                {
                  label: `summary: MEMBERS=${members.length} CONFORMING=${count('conforming')} WARNING=${count('warning')} FAILING=${failing} UNVERIFIABLE=${count('unverifiable')}`
                }
              ]
            }).join('\n')}\n`
          )
          if (failing) throw new KiError(`trade policy check found ${failing} failing repositories`, 1)
        })
    )
    .addCommand(
      new Command('compare')
        .description('compare active routes with a saved ki/trade-routes/v1 report')
        .requiredOption('--baseline <path>', 'saved `ki repo --estate trade routes list --format json` output')
        .action(async (options: { readonly baseline?: string }) => {
          const result = await compareRoutes(
            context,
            resolve(context.workingDirectory, requireText(options.baseline, '--baseline'))
          )
          context.stdout.write(
            `${renderTree({
              title: 'KI TRADE POLICY COMPARISON',
              entries: [
                { label: `lost (${result.lost.length})`, children: items(result.lost) },
                { label: `added (${result.added.length})`, children: items(result.added) },
                {
                  label: `summary: COVERED=${result.covered.length} LOST=${result.lost.length} ADDED=${result.added.length}`
                }
              ]
            }).join('\n')}\n`
          )
          if (result.lost.length)
            throw new KiError(`trade policy comparison lost ${result.lost.length} active routes`, 1)
        })
    )
