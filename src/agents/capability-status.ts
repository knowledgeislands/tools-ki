import { KiError } from '../core/errors.ts'
import { discoverInstalledHarnesses, type InstalledHarness } from '../core/harness/index.ts'
import { readHarnessRegistry } from '../core/storage/index.ts'
import { inspectUserConfiguration } from './configuration.ts'

export interface MissingCapability {
  readonly name: string
}

export interface OutdatedEvidenceGap {
  readonly harness: string
  readonly reason: 'no-configured-release' | 'installed-release-unrecorded'
}

export interface CapabilityStatus {
  readonly missing: readonly MissingCapability[]
  readonly outdatedEvidenceGaps: readonly OutdatedEvidenceGap[]
}

const identities = (harnesses: readonly InstalledHarness[]): ReadonlySet<string> =>
  new Set(harnesses.flatMap((harness) => harness.capabilities.map((capability) => `${harness.id}:${capability.name}`)))

export const collectCapabilityStatus = async (options: {
  readonly configurationDirectory: string
  readonly dataDirectory: string
}): Promise<CapabilityStatus> => {
  const [configuration, harnesses] = await Promise.all([
    inspectUserConfiguration(options.configurationDirectory),
    discoverInstalledHarnesses(options.dataDirectory)
  ])
  if (configuration.state === 'invalid')
    throw new KiError(`ki configuration is invalid: ${configuration.errors.join('; ')}`, 1)
  const registry = await readHarnessRegistry(options.configurationDirectory)

  const installed = identities(harnesses)
  const missing: MissingCapability[] = configuration.skills
    .filter((identity) => !installed.has(identity))
    .map((name) => ({ name }))
  const configured = new Set(registry.map((release) => release.id))
  const outdatedEvidenceGaps = harnesses
    .map(({ id }) => ({
      harness: id,
      reason: configured.has(id) ? ('installed-release-unrecorded' as const) : ('no-configured-release' as const)
    }))
    .sort((left, right) => left.harness.localeCompare(right.harness))
  return {
    missing: missing.sort((left, right) => left.name.localeCompare(right.name)),
    outdatedEvidenceGaps
  }
}
