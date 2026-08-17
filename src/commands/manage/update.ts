import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { KiError } from '../../core/errors.ts'
import { discoverInstalledHarnesses } from '../../core/harness/index.ts'
import { installerEnvironment, requireCurrentInstallerReceipt } from '../../core/harness/installation.ts'
import { renderTree } from '../../core/presentation/index.ts'
import { refreshHarnesses } from '../harness/refresh.ts'

const updateExecutable = async (context: KiContext): Promise<string> => {
  if (context.installation === 'local') {
    throw new KiError('CLI executable is a local development installation; update its checkout directly', 1)
  }
  const receipt = await requireCurrentInstallerReceipt(context.paths.state, context.executable)
  const result = await context.runner('bash', [receipt.installer], installerEnvironment(context.environment, receipt))
  if (result.exitCode !== 0) {
    const detail = result.output.trim()
    throw new KiError(`verified installer update failed${detail ? `: ${detail}` : ''}`, 1)
  }
  return 'CLI executable: updated with the verified installer'
}

export const createUpdateCommand = (context: KiContext): Command =>
  new Command('update')
    .description('update an installer-managed CLI and refresh installed configured harnesses')
    .option('--cli', 'update only the installer-managed CLI executable')
    .action(async (options: { cli?: boolean }) => {
      if (options.cli) {
        context.stdout.write(
          `${renderTree({
            title: 'KI MANAGE UPDATE',
            entries: [
              { label: 'CLI', children: [{ label: await updateExecutable(context) }] },
              { label: 'summary: CLI=UPDATED' }
            ]
          }).join('\n')}\n`
        )
        return
      }
      let cliResult: string
      try {
        cliResult = await updateExecutable(context)
      } catch (error) {
        if (!(error instanceof KiError)) throw error
        cliResult = `CLI executable: unavailable (${error.message})`
      }
      const harnesses = await discoverInstalledHarnesses(context.paths.data)
      const refreshed = await refreshHarnesses(context, harnesses)
      const harnessResults = refreshed.length ? refreshed.map((label) => ({ label })) : [{ label: 'none' }]
      context.stdout.write(
        `${renderTree({
          title: 'KI MANAGE UPDATE',
          entries: [
            { label: 'CLI', children: [{ label: cliResult }] },
            { label: `harnesses (${refreshed.length})`, children: harnessResults },
            { label: `summary: HARNESS_RESULTS=${refreshed.length}` }
          ]
        }).join('\n')}\n`
      )
    })
