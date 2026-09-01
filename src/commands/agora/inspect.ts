import { Command, Option } from 'commander'
import type { KiContext } from '../../context.ts'
import {
  compareAgoraProjection,
  type OpenTargetName,
  observeLocalTarget,
  openTargetNames,
  type ProjectionPath,
  resolveAgora
} from '../../core/agora/index.ts'
import { KiExit } from '../../core/errors.ts'
import { renderTree } from '../presentation/index.ts'

const pathLabel = (value: ProjectionPath): string => {
  if (value.key) return `${value.key}: ${value.path}`
  if (value.repository) return `${value.repository}: ${value.path}`
  return value.path
}

const paths = (values: readonly ProjectionPath[]): readonly { readonly label: string }[] =>
  values.length ? values.map((value) => ({ label: pathLabel(value) })) : [{ label: 'none' }]

export const createAgoraInspectCommand = (context: KiContext): Command =>
  new Command('inspect')
    .description('inspect one local editor projection for Agora drift')
    .argument('<agora>', 'Agora name')
    .addOption(
      new Option('--target <target>', 'local target to inspect').choices(openTargetNames).makeOptionMandatory()
    )
    .requiredOption('--workspace <selector>', 'explicit local editor workspace selector')
    .action(async (value: string, options: { readonly target: OpenTargetName; readonly workspace: string }) => {
      const agora = await resolveAgora(context.paths.state, value)
      const observation = await observeLocalTarget(options.target, options.workspace, {
        environment: context.environment,
        platform: context.platform
      })
      const report = await compareAgoraProjection(context.paths.state, agora, options.target, observation)
      const observed =
        report.matched.length + report.extraRegistered.length + report.unregisteredKi.length + report.external.length

      context.stdout.write(
        `${renderTree({
          title: 'KI AGORA PROJECTION',
          entries: [
            {
              label: agora.id,
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
              label: `summary: EXPECTED=${agora.members.length} OBSERVED=${observed} MATCHED=${report.matched.length} MISSING=${report.missing.length} EXTRA_REGISTERED=${report.extraRegistered.length} UNREGISTERED_KI=${report.unregisteredKi.length} EXTERNAL=${report.external.length}`
            }
          ]
        }).join('\n')}\n`
      )
      if (!report.exact) throw new KiExit(1)
    })
