import { lstat, readFile, realpath } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { parse } from 'smol-toml'
import { KiError } from './errors.ts'

export interface InstallerReceipt {
  readonly executable: string
  readonly manual: string
  readonly installer: string
}

const receiptName = 'installation.toml'

const receiptField = (value: Record<string, unknown>, name: string): string => {
  const field = value[name]
  if (typeof field !== 'string' || !field.startsWith('/'))
    throw new KiError(`installer receipt ${name} must be an absolute path`, 1)
  return field
}

const regularFile = async (path: string, description: string): Promise<void> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isFile() || state.isSymbolicLink()) throw new KiError(`${description} must be a regular file`, 1)
}

export const readInstallerReceipt = async (stateDirectory: string): Promise<InstallerReceipt | undefined> => {
  const path = resolve(stateDirectory, receiptName)
  const state = await lstat(path).catch(() => undefined)
  if (!state) return undefined
  if (!state.isFile() || state.isSymbolicLink()) throw new KiError('installer receipt must be a regular file', 1)
  let record: Record<string, unknown> & { schema?: unknown; distribution?: unknown }
  try {
    record = parse(await readFile(path, 'utf8')) as Record<string, unknown> & {
      schema?: unknown
      distribution?: unknown
    }
  } catch {
    throw new KiError('installer receipt must be valid TOML', 1)
  }
  if (record.schema !== 1 || record.distribution !== 'installer') {
    throw new KiError('installer receipt must use schema 1 for the installer distribution', 1)
  }
  const receipt = {
    executable: receiptField(record, 'executable'),
    manual: receiptField(record, 'manual'),
    installer: receiptField(record, 'installer')
  }
  await regularFile(receipt.installer, 'installer receipt installer')
  return receipt
}

export const requireCurrentInstallerReceipt = async (
  stateDirectory: string,
  executable: string
): Promise<InstallerReceipt> => {
  const receipt = await readInstallerReceipt(stateDirectory)
  if (!receipt) throw new KiError('CLI executable is not installer-managed; update it with its distribution manager', 1)
  const current = await realpath(executable).catch(() => undefined)
  const recorded = await realpath(receipt.executable).catch(() => undefined)
  if (!current || !recorded || current !== recorded) {
    throw new KiError('installer receipt does not own the running CLI executable', 1)
  }
  await regularFile(receipt.manual, 'installer receipt manual')
  return receipt
}

export const installerEnvironment = (environment: NodeJS.ProcessEnv, receipt: InstallerReceipt): NodeJS.ProcessEnv => ({
  ...environment,
  KI_CLI_INSTALL_DIR: dirname(receipt.executable),
  KI_MAN_INSTALL_DIR: dirname(receipt.manual)
})
