import type { KiContext } from '../../context.ts'
import { type InstalledHarness, refreshInstalledHarnesses } from '../../core/harness/index.ts'
import { harnessRefreshPort } from './harness-ports.ts'

export const refreshHarnesses = async (
  context: KiContext,
  harnesses: readonly InstalledHarness[]
): Promise<readonly string[]> => {
  const results = await refreshInstalledHarnesses(harnessRefreshPort(context), harnesses)
  return results.map((result) =>
    result.kind === 'refreshed'
      ? `${result.id}: refreshed archive ${result.archiveSha256}`
      : `${result.id}: unavailable (no configured immutable release)`
  )
}
