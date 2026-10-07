import { Command, Option } from 'commander'
import type { KiContext } from '../../context.ts'
import { KiExit } from '../../core/errors.ts'
import {
  compareTerritoryProjection,
  type ObserveTargetName,
  observeLocalTarget,
  observeTargetNames,
  type ProjectionPath,
  resolveTerritory
} from '../../core/territory/index.ts'
import type { TerritorySelection } from '../../core/territory/resolution.ts'
import { renderTree } from '../presentation/index.ts'
import { collectFilters } from './selection.ts'

const pathLabel = (value: ProjectionPath): string => {
  if (value.key) return `${value.key}: ${value.path}`
  if (value.repository) return `${value.repository}: ${value.path}`
  return value.path
}

const paths = (values: readonly ProjectionPath[]): readonly { readonly label: string }[] =>
  values.length ? values.map((value) => ({ label: pathLabel(value) })) : [{ label: 'none' }]

export const createTerritoryInspectCommand = (context: KiContext): Command =>
  new Command('inspect')
    .description('inspect one local editor projection for Territory drift')
    .option('-t, --territory <handle>', 'registered territory handle')
    .option('--estate', 'registered estate')
    .option('-f, --filter <prefix>', 'literal directory-name prefix', collectFilters, [])
    .addOption(
      new Option('--target <target>', 'local target to inspect').choices(observeTargetNames).makeOptionMandatory()
    )
    .requiredOption('--workspace <selector>', 'explicit local editor workspace selector')
    .action(
      async (
        options: TerritorySelection & {
          readonly filter: readonly string[]
          readonly target: ObserveTargetName
          readonly workspace: string
        }
      ) => {
        const territory = await resolveTerritory(context.paths.state, { ...options, filters: options.filter })
        const observation = await observeLocalTarget(options.target, options.workspace, {
          environment: context.environment,
          platform: context.platform
        })
        const report = await compareTerritoryProjection(context.paths.state, territory, options.target, observation)
        const observed =
          report.matched.length + report.extraRegistered.length + report.unregisteredKi.length + report.external.length

        context.stdout.write(
          `${renderTree({
            title: 'KI TERRITORY PROJECTION',
            entries: [
              {
                label: territory.id,
                children: [
                  { label: `target: ${report.target}` },
                  { label: `workspace: ${report.source}` },
                  { label: `status: ${report.exact ? 'exact' : 'drift'}` }
                ]
              },
              { label: `matched (${report.matched.length})`, children: paths(report.matched) },
              { label: `missing (${report.missing.length})`, children: paths(report.missing) },
              {
                label: `extra registered (${report.extraRegistered.length})`,
                children: paths(report.extraRegistered)
              },
              { label: `unregistered KI (${report.unregisteredKi.length})`, children: paths(report.unregisteredKi) },
              { label: `external (${report.external.length})`, children: paths(report.external) },
              {
                label: `summary: EXPECTED=${territory.roots.length} OBSERVED=${observed} MATCHED=${report.matched.length} MISSING=${report.missing.length} EXTRA_REGISTERED=${report.extraRegistered.length} UNREGISTERED_KI=${report.unregisteredKi.length} EXTERNAL=${report.external.length}`
              }
            ]
          }).join('\n')}\n`
        )
        if (!report.exact) throw new KiExit(1)
      }
    )
