import type { InstalledBackpack } from '../inspection.ts'
import type { BackpackRefreshPort, BackpackRefreshResult } from './types.ts'

const retainedCapabilities = (backpack: InstalledBackpack): readonly string[] =>
  backpack.capabilities.map((capability) => capability.name)

export const refreshInstalledBackpacks = async (
  port: BackpackRefreshPort,
  backpacks: readonly InstalledBackpack[]
): Promise<readonly BackpackRefreshResult[]> => {
  const configured = new Set(await port.configuredReleaseIds())
  const results: BackpackRefreshResult[] = []
  for (const backpack of [...backpacks].sort((left, right) => left.id.localeCompare(right.id))) {
    if (!configured.has(backpack.id)) {
      results.push({ kind: 'unavailable', id: backpack.id })
      continue
    }
    const installation = await port.install(backpack.id, {
      replace: true,
      requiredCapabilities: retainedCapabilities(backpack)
    })
    results.push({ kind: 'refreshed', id: backpack.id, archiveSha256: installation.archiveSha256 })
  }
  return results
}
