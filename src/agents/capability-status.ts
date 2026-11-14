import { discoverInstalledBackpacks, type InstalledBackpack } from '../core/backpack/index.ts'
import { KiError } from '../core/errors.ts'
import { readBackpackRegistry } from '../core/storage/index.ts'
import { inspectUserConfiguration } from './configuration.ts'

export interface MissingCapability {
  readonly name: string
}

export interface OutdatedEvidenceGap {
  readonly backpack: string
  readonly reason: 'no-configured-release' | 'installed-release-unrecorded'
}

export interface CapabilityStatus {
  readonly missing: readonly MissingCapability[]
  readonly outdatedEvidenceGaps: readonly OutdatedEvidenceGap[]
}

const identities = (backpacks: readonly InstalledBackpack[]): ReadonlySet<string> =>
  new Set(
    backpacks.flatMap((backpack) => backpack.capabilities.map((capability) => `${backpack.id}:${capability.name}`))
  )

export const collectCapabilityStatus = async (options: {
  readonly configurationDirectory: string
  readonly dataDirectory: string
}): Promise<CapabilityStatus> => {
  const [configuration, backpacks] = await Promise.all([
    inspectUserConfiguration(options.configurationDirectory),
    discoverInstalledBackpacks(options.dataDirectory)
  ])
  if (configuration.state === 'invalid')
    throw new KiError(`ki configuration is invalid: ${configuration.errors.join('; ')}`, 1)
  const registry = await readBackpackRegistry(options.configurationDirectory)

  const installed = identities(backpacks)
  const missing: MissingCapability[] = configuration.skills
    .filter((identity) => !installed.has(identity))
    .map((name) => ({ name }))
  const configured = new Set(registry.map((release) => release.id))
  const outdatedEvidenceGaps = backpacks
    .map(({ id }) => ({
      backpack: id,
      reason: configured.has(id) ? ('installed-release-unrecorded' as const) : ('no-configured-release' as const)
    }))
    .sort((left, right) => left.backpack.localeCompare(right.backpack))
  return {
    missing: missing.sort((left, right) => left.name.localeCompare(right.name)),
    outdatedEvidenceGaps
  }
}
