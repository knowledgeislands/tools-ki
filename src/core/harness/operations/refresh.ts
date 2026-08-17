import type { InstalledHarness } from '../index.ts'
import type { HarnessRefreshPort, HarnessRefreshResult } from './types.ts'

const retainedCapabilities = (harness: InstalledHarness): readonly string[] =>
  harness.capabilities.map((capability) => capability.name)

export const refreshInstalledHarnesses = async (
  port: HarnessRefreshPort,
  harnesses: readonly InstalledHarness[]
): Promise<readonly HarnessRefreshResult[]> => {
  const configured = new Set(await port.configuredReleaseIds())
  const results: HarnessRefreshResult[] = []
  for (const harness of [...harnesses].sort((left, right) => left.id.localeCompare(right.id))) {
    if (!configured.has(harness.id)) {
      results.push({ kind: 'unavailable', id: harness.id })
      continue
    }
    const installation = await port.install(harness.id, {
      replace: true,
      requiredCapabilities: retainedCapabilities(harness)
    })
    results.push({ kind: 'refreshed', id: harness.id, archiveSha256: installation.archiveSha256 })
  }
  return results
}
