import { installerEnvironment, requireCurrentInstallerReceipt } from '../backpack/installation.ts'
import type { BackpackRefreshResult } from '../backpack/operations/types.ts'
import { KiError } from '../errors.ts'
import type { Environment, KiInstallationMode } from '../paths.ts'
import type { Runner } from '../runtime/runner.ts'

export interface ManageUpdatePort {
  readonly runner: Runner
  readonly refreshBackpacks: () => Promise<readonly BackpackRefreshResult[]>
}

export interface ManageUpdateOptions {
  readonly cliOnly: boolean
  readonly executable: string
  readonly installation: KiInstallationMode
  readonly stateDirectory: string
  readonly environment: Environment
}

export interface ManageUpdateResult {
  readonly cli: { readonly kind: 'updated' } | { readonly kind: 'unavailable'; readonly detail: string }
  readonly backpacks?: readonly BackpackRefreshResult[]
}

const updateExecutable = async (port: ManageUpdatePort, options: ManageUpdateOptions): Promise<void> => {
  if (options.installation === 'local') {
    throw new KiError('CLI executable is a local development installation; update its checkout directly', 1)
  }
  const receipt = await requireCurrentInstallerReceipt(options.stateDirectory, options.executable)
  const result = await port.runner('bash', [receipt.installer], installerEnvironment(options.environment, receipt))
  if (result.exitCode !== 0) {
    const detail = result.output.trim()
    throw new KiError(`verified installer update failed${detail ? `: ${detail}` : ''}`, 1)
  }
}

export const runManageUpdate = async (
  port: ManageUpdatePort,
  options: ManageUpdateOptions
): Promise<ManageUpdateResult> => {
  if (options.cliOnly) {
    await updateExecutable(port, options)
    return { cli: { kind: 'updated' } }
  }
  let cli: ManageUpdateResult['cli']
  try {
    await updateExecutable(port, options)
    cli = { kind: 'updated' }
  } catch (error) {
    if (!(error instanceof KiError)) throw error
    cli = { kind: 'unavailable', detail: error.message }
  }
  return { cli, backpacks: await port.refreshBackpacks() }
}
