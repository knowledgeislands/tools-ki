import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { discoverInstalledBackpacks, refreshInstalledBackpacks } from '../../core/backpack/index.ts'
import { runManageUpdate } from '../../core/manage/index.ts'
import { renderTree } from '../presentation/index.ts'
import { backpackRefreshPort } from '../shared/backpack-ports.ts'

const cliResult = (result: Awaited<ReturnType<typeof runManageUpdate>>['cli']): string =>
  result.kind === 'updated'
    ? 'CLI executable: updated with the verified installer'
    : `CLI executable: unavailable (${result.detail})`

export const createUpdateCommand = (context: KiContext): Command =>
  new Command('update')
    .description('update an installer-managed CLI and refresh installed configured backpacks')
    .option('--cli', 'update only the installer-managed CLI executable')
    .action(async (options: { cli?: boolean }) => {
      const result = await runManageUpdate(
        {
          runner: context.runner,
          refreshBackpacks: async () => {
            const backpacks = await discoverInstalledBackpacks(context.paths.data)
            return refreshInstalledBackpacks(backpackRefreshPort(context), backpacks)
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
            title: 'KI UPDATE',
            entries: [{ label: 'CLI', children: [{ label: cliResult(result.cli) }] }, { label: 'summary: CLI=UPDATED' }]
          }).join('\n')}\n`
        )
        return
      }
      /* v8 ignore next -- the only result without backpacks is the CLI-only branch returned above. */
      const refreshed = (result.backpacks ?? []).map((refresh) =>
        refresh.kind === 'refreshed'
          ? `${refresh.id}: refreshed archive ${refresh.archiveSha256}`
          : `${refresh.id}: unavailable (no configured immutable release)`
      )
      context.stdout.write(
        `${renderTree({
          title: 'KI UPDATE',
          entries: [
            { label: 'CLI', children: [{ label: cliResult(result.cli) }] },
            {
              label: `backpacks (${refreshed.length})`,
              children: refreshed.length ? refreshed.map((label) => ({ label })) : [{ label: 'none' }]
            },
            { label: `summary: BACKPACK_RESULTS=${refreshed.length}` }
          ]
        }).join('\n')}\n`
      )
    })
