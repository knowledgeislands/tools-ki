import type { InstalledBackpack } from '../inspection.ts'
import type { BackpackInventory, BackpackQueryPort } from './types.ts'

export const listInstalledBackpacks = async (port: BackpackQueryPort): Promise<BackpackInventory> => {
  const backpacks = await port.discoverInstalled()
  return {
    backpacks,
    capabilityCount: backpacks.reduce((total, backpack) => total + backpack.capabilities.length, 0)
  }
}

export const inspectInstalledBackpack = (port: BackpackQueryPort, identifier: string): Promise<InstalledBackpack> =>
  port.readInstalled(identifier)
