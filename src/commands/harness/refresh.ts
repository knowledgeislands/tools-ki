import type { KiContext } from '../../context.ts'
import type { InstalledHarness } from '../../core/harness.ts'
import { installHarness, readHarnessRegistry } from '../../core/storage/index.ts'

const retainedCapabilities = (harness: InstalledHarness): readonly string[] =>
  harness.capabilities.map((capability) => capability.name)

export const refreshHarnesses = async (
  context: KiContext,
  harnesses: readonly InstalledHarness[]
): Promise<readonly string[]> => {
  const registry = await readHarnessRegistry(context.paths.config)
  const configured = new Set(registry.map((release) => release.id))
  const lines: string[] = []
  for (const harness of [...harnesses].sort((left, right) => left.id.localeCompare(right.id))) {
    if (!configured.has(harness.id)) {
      lines.push(`${harness.id}: unavailable (no configured immutable release)`)
      continue
    }
    const result = await installHarness(
      context.paths.config,
      context.paths.data,
      context.paths.state,
      harness.id,
      context.fetcher,
      context.runner,
      context.environment,
      { replace: true, requiredCapabilities: retainedCapabilities(harness) }
    )
    lines.push(`${harness.id}: refreshed archive ${result.archiveSha256}`)
  }
  return lines
}
