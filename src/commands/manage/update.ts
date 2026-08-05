import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { KiError } from '../../core/errors.ts'
import { discoverInstalledHarnesses } from '../../core/harness.ts'
import { installerEnvironment, requireCurrentInstallerReceipt } from '../../core/installation.ts'
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
      const lines = ['╭─ KI MANAGE UPDATE']
      if (options.cli) {
        lines.push('├─ CLI', `│  ╰─ ${await updateExecutable(context)}`, '╰─ summary: CLI=UPDATED')
        context.stdout.write(`${lines.join('\n')}\n`)
        return
      }
      try {
        lines.push('├─ CLI', `│  ╰─ ${await updateExecutable(context)}`)
      } catch (error) {
        if (!(error instanceof KiError)) throw error
        lines.push('├─ CLI', `│  ╰─ CLI executable: unavailable (${error.message})`)
      }
      const harnesses = await discoverInstalledHarnesses(context.paths.data)
      const refreshed = await refreshHarnesses(context, harnesses)
      lines.push(`├─ harnesses (${refreshed.length})`)
      if (!refreshed.length) lines.push('│  ╰─ none')
      else lines.push(...refreshed.map((line, index) => `│  ${index === refreshed.length - 1 ? '╰─' : '├─'} ${line}`))
      lines.push(`╰─ summary: HARNESS_RESULTS=${refreshed.length}`)
      context.stdout.write(`${lines.join('\n')}\n`)
    })
