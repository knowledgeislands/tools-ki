import type { InstalledHarness } from '../index.ts'
import type { HarnessInventory, HarnessQueryPort } from './types.ts'

export const listInstalledHarnesses = async (port: HarnessQueryPort): Promise<HarnessInventory> => {
  const harnesses = await port.discoverInstalled()
  return {
    harnesses,
    capabilityCount: harnesses.reduce((total, harness) => total + harness.capabilities.length, 0)
  }
}

export const inspectInstalledHarness = (port: HarnessQueryPort, identifier: string): Promise<InstalledHarness> =>
  port.readInstalled(identifier)
