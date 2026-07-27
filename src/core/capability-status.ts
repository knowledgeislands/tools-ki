import { inspectUserConfiguration } from '../agents/index.ts'
import { type DeclaredSkill, readDeclaredSkills } from './configuration.ts'
import { KiError } from './errors.ts'
import { discoverInstalledHarnesses, type InstalledHarness } from './harness.ts'
import { readHarnessRegistry } from './registry.ts'

export interface MissingCapability {
  readonly scope: 'user' | 'repository'
  readonly name: string
}

export interface AmbiguousCapability {
  readonly name: string
  readonly providers: readonly string[]
}

export interface OutdatedEvidenceGap {
  readonly harness: string
  readonly reason: 'no-configured-release' | 'installed-release-unrecorded'
}

export interface CapabilityStatus {
  readonly missing: readonly MissingCapability[]
  readonly ambiguous: readonly AmbiguousCapability[]
  readonly outdatedEvidenceGaps: readonly OutdatedEvidenceGap[]
}

const identities = (harnesses: readonly InstalledHarness[]): ReadonlySet<string> =>
  new Set(harnesses.flatMap((harness) => harness.capabilities.map((capability) => `${harness.id}:${capability.name}`)))

const providers = (harnesses: readonly InstalledHarness[], skill: DeclaredSkill): readonly string[] =>
  harnesses
    .flatMap((harness) => harness.capabilities.filter((capability) => capability.name === skill.name).map(() => harness.id))
    .sort((left, right) => left.localeCompare(right))

export const collectCapabilityStatus = async (options: {
  readonly configurationDirectory: string
  readonly dataDirectory: string
  readonly repositoryConfiguration?: string
}): Promise<CapabilityStatus> => {
  const [configuration, harnesses, repositorySkills] = await Promise.all([
    inspectUserConfiguration(options.configurationDirectory),
    discoverInstalledHarnesses(options.dataDirectory),
    options.repositoryConfiguration ? readDeclaredSkills(options.repositoryConfiguration) : Promise.resolve<readonly DeclaredSkill[]>([])
  ])
  if (configuration.state === 'invalid') throw new KiError(`ki configuration is invalid: ${configuration.errors.join('; ')}`, 1)
  const registry = await readHarnessRegistry(options.configurationDirectory)

  const installed = identities(harnesses)
  const missing: MissingCapability[] = configuration.skills
    .filter((identity) => !installed.has(identity))
    .map((name) => ({ scope: 'user', name }))
  const ambiguous: AmbiguousCapability[] = []
  for (const skill of repositorySkills) {
    const candidates = providers(harnesses, skill)
    if (!candidates.length) missing.push({ scope: 'repository', name: skill.name })
    else if (candidates.length > 1) ambiguous.push({ name: skill.name, providers: candidates })
  }
  const configured = new Set(registry.map((release) => release.id))
  const outdatedEvidenceGaps = harnesses
    .map(({ id }) => ({
      harness: id,
      reason: configured.has(id) ? ('installed-release-unrecorded' as const) : ('no-configured-release' as const)
    }))
    .sort((left, right) => left.harness.localeCompare(right.harness))
  return {
    missing: missing.sort((left, right) => `${left.scope}:${left.name}`.localeCompare(`${right.scope}:${right.name}`)),
    ambiguous: ambiguous.sort((left, right) => left.name.localeCompare(right.name)),
    outdatedEvidenceGaps
  }
}
