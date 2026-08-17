import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { discoverInstalledHarnesses, refreshInstalledHarnesses } from '../../core/harness/index.ts'
import { runManageUpdate } from '../../core/manage/index.ts'
import { harnessRefreshPort } from '../harness/operations.ts'
import { renderTree } from '../presentation/index.ts'

const cliResult = (result: Awaited<ReturnType<typeof runManageUpdate>>['cli']): string =>
  result.kind === 'updated'
    ? 'CLI executable: updated with the verified installer'
    : `CLI executable: unavailable (${result.detail})`

export const createUpdateCommand = (context: KiContext): Command =>
  new Command('update')
    .description('update an installer-managed CLI and refresh installed configured harnesses')
    .option('--cli', 'update only the installer-managed CLI executable')
    .action(async (options: { cli?: boolean }) => {
      const result = await runManageUpdate(
        {
          runner: context.runner,
          refreshHarnesses: async () => {
            const harnesses = await discoverInstalledHarnesses(context.paths.data)
            return refreshInstalledHarnesses(harnessRefreshPort(context), harnesses)
          }
        },
        {
          cliOnly: Boolean(options.cli),
          executable: context.executable,
          installation: context.installation,
          stateDirectory: context.paths.state,
          environment: context.environment
        }
      )
      if (options.cli) {
        context.stdout.write(
          `${renderTree({
            title: 'KI MANAGE UPDATE',
            entries: [{ label: 'CLI', children: [{ label: cliResult(result.cli) }] }, { label: 'summary: CLI=UPDATED' }]
          }).join('\n')}\n`
        )
        return
      }
      const refreshed = (result.harnesses ?? []).map((refresh) =>
        refresh.kind === 'refreshed'
          ? `${refresh.id}: refreshed archive ${refresh.archiveSha256}`
          : `${refresh.id}: unavailable (no configured immutable release)`
      )
      context.stdout.write(
        `${renderTree({
          title: 'KI MANAGE UPDATE',
          entries: [
            { label: 'CLI', children: [{ label: cliResult(result.cli) }] },
            {
              label: `harnesses (${refreshed.length})`,
              children: refreshed.length ? refreshed.map((label) => ({ label })) : [{ label: 'none' }]
            },
            { label: `summary: HARNESS_RESULTS=${refreshed.length}` }
          ]
        }).join('\n')}\n`
      )
    })
