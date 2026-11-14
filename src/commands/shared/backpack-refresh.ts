import type { KiContext } from '../../context.ts'
import { type InstalledBackpack, refreshInstalledBackpacks } from '../../core/backpack/index.ts'
import { backpackRefreshPort } from './backpack-ports.ts'

export const refreshBackpacks = async (
  context: KiContext,
  backpacks: readonly InstalledBackpack[]
): Promise<readonly string[]> => {
  const results = await refreshInstalledBackpacks(backpackRefreshPort(context), backpacks)
  return results.map((result) =>
    result.kind === 'refreshed'
      ? `${result.id}: refreshed archive ${result.archiveSha256}`
      : `${result.id}: unavailable (no configured immutable release)`
  )
}
