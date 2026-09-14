import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { KiError } from '../errors.ts'
import { acquireVerifiedArchive, extractArchive, type Fetcher } from '../harness/acquire.ts'
import { minimumBootstrapUserSkills } from '../harness/bootstrap-capabilities.ts'
import {
  canonicalHarnessIdentifier,
  discoverInstalledHarnesses,
  type InstalledHarness,
  inspectInstalledHarnessRoot,
  parkedPayloadEntry,
  readInstalledHarness,
  requireUniqueHarnessPrefixes
} from '../harness/index.ts'
import type { Environment } from '../paths.ts'
import type { Runner } from '../runtime/runner.ts'
import { harnessDevelopmentProjection } from './harness-development.ts'
import {
  ensureDirectory,
  harnessIdentifier,
  harnessMetadataFile,
  payloadRoots,
  physicalDirectory
} from './harness-paths.ts'
import { createInstallStagingArtifact } from './managed-artifacts.ts'
import { readHarnessRegistry } from './registry.ts'

export type { Fetcher } from '../harness/acquire.ts'

export interface HarnessInstallationOptions {
  /** Capabilities the replacement must retain, so active projections remain valid. */
  readonly requiredCapabilities?: readonly string[]
  /** Give canonical bootstrap inventory failures their actionable archive diagnostic. */
  readonly requiredCapabilitiesContext?: 'canonical-bootstrap'
  /** Replace an existing verified harness only after the replacement is fully inspected. */
  readonly replace?: boolean
  /** Restore the exact Harness whose recognised development projection is active. */
  readonly allowDevelopmentReplace?: boolean
}

export interface HarnessInstallation {
  readonly installed: boolean
  readonly replaced: boolean
  readonly archiveSha256: string
}

const requireCapabilities = (harness: InstalledHarness, options: HarnessInstallationOptions): void => {
  const required = new Set(options.requiredCapabilities ?? [])
  for (const capability of required) {
    if (!harness.capabilities.some((candidate) => candidate.name === capability)) {
      if (options.requiredCapabilitiesContext === 'canonical-bootstrap') {
        throw new KiError(`canonical harness is incomplete: missing required bootstrap skill ${capability}`, 1)
      }
      throw new KiError(`harness ${harness.id} does not provide skill ${capability}`, 1)
    }
  }
}

export const installHarness = async (
  configurationDirectory: string,
  dataDirectory: string,
  stateDirectory: string,
  identifier: string,
  fetcher: Fetcher,
  runner: Runner,
  environment: Environment,
  options: HarnessInstallationOptions = {}
): Promise<HarnessInstallation> => {
  if (!harnessIdentifier.test(identifier)) throw new KiError('harness identifier must be an owner/name identifier', 2)
  const releases = await readHarnessRegistry(configurationDirectory)
  const release = releases.find((candidate) => candidate.id === identifier)
  if (!release) throw new KiError(`harness ${identifier} is not configured in the immutable release registry`, 1)
  const [owner, name] = identifier.split('/') as [string, string]
  const harnesses = join(dataDirectory, 'harnesses')
  await ensureDirectory(harnesses, 'installed harnesses directory')
  const ownerDirectory = join(harnesses, owner)
  await ensureDirectory(ownerDirectory, `installed harness owner ${owner}`)
  const destination = join(ownerDirectory, name)
  const existing = await lstat(destination).catch(() => undefined)
  if (existing) {
    requireCapabilities(await readInstalledHarness(dataDirectory, identifier), options)
    if (!options.replace) return { installed: false, replaced: false, archiveSha256: release.sha256 }
    if ((await harnessDevelopmentProjection(dataDirectory, identifier)) && !options.allowDevelopmentReplace)
      throw new KiError(`harness ${identifier} is development-linked; run ki dev local off before replacing it`, 1)
  }

  const payload = await acquireVerifiedArchive(fetcher, release, { runner, environment })

  const artifact = await createInstallStagingArtifact(stateDirectory, dataDirectory, owner)
  const staging = artifact.staging
  try {
    await mkdir(staging)
    await artifact.transition('active')
    await extractArchive(payload, staging)
    const candidate = await inspectInstalledHarnessRoot(staging, identifier)
    requireCapabilities(candidate, options)
    const installed = await discoverInstalledHarnesses(dataDirectory)
    requireUniqueHarnessPrefixes([...installed.filter((harness) => harness.id !== identifier), candidate])
    if (!existing) {
      await artifact.transition('retired')
      await rename(staging, destination)
      await artifact.retire()
      return { installed: true, replaced: false, archiveSha256: release.sha256 }
    }
    const previous = join(ownerDirectory, parkedPayloadEntry(randomUUID(), name))
    await rename(destination, previous)
    await artifact.transition('retired')
    /* v8 ignore start -- Recovery needs a filesystem failure after the old verified payload is parked; no CLI input can cause it. */
    try {
      await rename(staging, destination)
    } catch (error) {
      await rename(previous, destination).catch(() => undefined)
      throw error
    }
    /* v8 ignore stop */
    await rm(previous, { recursive: true, force: true })
    await artifact.retire()
    return { installed: true, replaced: true, archiveSha256: release.sha256 }
  } catch (error) {
    await artifact.transition('recoverable')
    await rm(staging, { recursive: true, force: true })
    await artifact.retire()
    throw error
  }
}

export const restoreHarness = async (
  configurationDirectory: string,
  dataDirectory: string,
  stateDirectory: string,
  identifier: string,
  fetcher: Fetcher,
  runner: Runner,
  environment: Environment
): Promise<{ readonly installed: boolean; readonly archiveSha256: string }> =>
  installHarness(configurationDirectory, dataDirectory, stateDirectory, identifier, fetcher, runner, environment, {
    replace: await harnessDevelopmentProjection(dataDirectory, identifier),
    allowDevelopmentReplace: true,
    ...(identifier === canonicalHarnessIdentifier
      ? {
          requiredCapabilities: minimumBootstrapUserSkills,
          requiredCapabilitiesContext: 'canonical-bootstrap' as const
        }
      : {})
  })

export const restoreCanonicalHarness = async (
  configurationDirectory: string,
  dataDirectory: string,
  stateDirectory: string,
  fetcher: Fetcher,
  runner: Runner,
  environment: Environment
): Promise<{ readonly installed: boolean; readonly archiveSha256: string }> =>
  restoreHarness(
    configurationDirectory,
    dataDirectory,
    stateDirectory,
    canonicalHarnessIdentifier,
    fetcher,
    runner,
    environment
  )

export const uninstallHarness = async (dataDirectory: string, identifier: string): Promise<void> => {
  // The public command validates both conditions before calling this filesystem primitive; retain its defensive core guard.
  /* v8 ignore next -- no public CLI path can bypass the command validation. */
  if (!harnessIdentifier.test(identifier)) throw new KiError('harness identifier must be an owner/name identifier', 2)
  /* v8 ignore next -- no public CLI path can bypass the command validation. */
  if (identifier === canonicalHarnessIdentifier)
    throw new KiError(`the canonical harness ${identifier} cannot be uninstalled`, 1)

  await readInstalledHarness(dataDirectory, identifier)
  const [owner, name] = identifier.split('/') as [string, string]
  const harnesses = join(dataDirectory, 'harnesses')
  const ownerDirectory = join(harnesses, owner)
  await physicalDirectory(ownerDirectory, `installed harness owner ${owner}`)
  const destination = join(ownerDirectory, name)
  await physicalDirectory(destination, `installed harness ${identifier}`)
  const entries = await readdir(destination, { withFileTypes: true })
  if (
    !entries.length ||
    entries.some(
      (entry) =>
        (entry.name !== harnessMetadataFile && !payloadRoots.includes(entry.name as (typeof payloadRoots)[number])) ||
        (entry.name === harnessMetadataFile
          ? !entry.isFile() || entry.isSymbolicLink()
          : !entry.isDirectory() || entry.isSymbolicLink())
    )
  ) {
    throw new KiError(`installed harness ${identifier} has unrecognised state and will not be removed`, 1)
  }
  const removal = join(ownerDirectory, `.uninstall-${randomUUID()}`)
  await rename(destination, removal)
  try {
    await inspectInstalledHarnessRoot(removal, identifier)
    await rm(removal, { recursive: true, force: true })
    return
    /* v8 ignore start -- Recovery needs a filesystem failure or replacement after the successful rename; no single CLI input can cause it. */
  } catch (error) {
    await rename(removal, destination).catch(() => undefined)
    throw error
  }
  /* v8 ignore stop */
}
