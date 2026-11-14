import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, rename, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { acquireVerifiedArchive, extractArchive, type Fetcher } from '../backpack/acquire.ts'
import { bootstrapUserSkills, minimumBootstrapUserSkills } from '../backpack/bootstrap-capabilities.ts'
import { sameBackpack } from '../backpack/identity.ts'
import {
  canonicalBackpackIdentifier,
  discoverInstalledBackpacks,
  type InstalledBackpack,
  inspectInstalledBackpackRoot,
  parkedPayloadEntry,
  readInstalledBackpack,
  requireUniqueBackpackPrefixes
} from '../backpack/inspection.ts'
import { KiError } from '../errors.ts'
import type { Environment } from '../paths.ts'
import type { Runner } from '../runtime/runner.ts'
import {
  backpackDirectory,
  backpackIdentifierPattern,
  backpackMetadataFile,
  ensureDirectory,
  payloadRoots,
  physicalDirectory
} from './backpack-paths.ts'
import { createInstallStagingArtifact } from './managed-artifacts.ts'
import { readBackpackRegistry } from './registry.ts'

export type { Fetcher } from '../backpack/acquire.ts'

export interface BackpackInstallationOptions {
  /** Capabilities the replacement must retain, so active projections remain valid. */
  readonly requiredCapabilities?: readonly string[]
  /** Give canonical bootstrap inventory failures their actionable archive diagnostic. */
  readonly requiredCapabilitiesContext?: 'canonical-bootstrap'
  /** Replace an existing verified backpack only after the replacement is fully inspected. */
  readonly replace?: boolean
  /** Restore the exact backpack whose recognised development projection is active. */
  readonly allowDevelopmentReplace?: boolean
}

export interface BackpackInstallation {
  readonly installed: boolean
  readonly replaced: boolean
  readonly archiveSha256: string
}

const requireCapabilities = (backpack: InstalledBackpack, options: BackpackInstallationOptions): void => {
  // A canonical backpack may still offer the retired bootstrap skills for this one release.
  const required = new Set(
    options.requiredCapabilitiesContext === 'canonical-bootstrap'
      ? bootstrapUserSkills(backpack.capabilities.map((capability) => capability.name))
      : (options.requiredCapabilities ?? [])
  )
  for (const capability of required) {
    if (!backpack.capabilities.some((candidate) => candidate.name === capability)) {
      if (options.requiredCapabilitiesContext === 'canonical-bootstrap') {
        throw new KiError(`canonical backpack is incomplete: missing required bootstrap skill ${capability}`, 1)
      }
      throw new KiError(`backpack ${backpack.id} does not provide skill ${capability}`, 1)
    }
  }
}

export const installBackpack = async (
  configurationDirectory: string,
  dataDirectory: string,
  stateDirectory: string,
  identifier: string,
  fetcher: Fetcher,
  runner: Runner,
  environment: Environment,
  options: BackpackInstallationOptions = {}
): Promise<BackpackInstallation> => {
  if (!backpackIdentifierPattern.test(identifier))
    throw new KiError('backpack identifier must be an owner/name identifier', 2)
  const releases = await readBackpackRegistry(configurationDirectory)
  const release = releases.find((candidate) => sameBackpack(candidate.id, identifier))
  if (!release) throw new KiError(`backpack ${identifier} is not configured in the immutable release registry`, 1)
  const owner = identifier.slice(0, identifier.indexOf('/'))
  const backpacks = join(dataDirectory, 'backpacks')
  await ensureDirectory(backpacks, 'installed backpacks directory')
  const ownerDirectory = join(backpacks, owner)
  await ensureDirectory(ownerDirectory, `installed backpack owner ${owner}`)
  const destination = backpackDirectory(dataDirectory, identifier)
  const existing = await lstat(destination).catch(() => undefined)
  if (existing) {
    const developmentLink = existing.isSymbolicLink()
    // A replaced development link may no longer resolve, so only the verified candidate's inventory is required.
    if (!options.replace || !developmentLink)
      requireCapabilities(await readInstalledBackpack(dataDirectory, identifier), options)
    if (!options.replace) return { installed: false, replaced: false, archiveSha256: release.sha256 }
    if (developmentLink && !options.allowDevelopmentReplace)
      throw new KiError(`backpack ${identifier} is development-linked; run ki dev local off before replacing it`, 1)
  }

  const payload = await acquireVerifiedArchive(fetcher, release, { runner, environment })

  const artifact = await createInstallStagingArtifact(stateDirectory, dataDirectory, owner)
  const staging = artifact.staging
  try {
    await mkdir(staging)
    await artifact.transition('active')
    await extractArchive(payload, staging)
    const candidate = await inspectInstalledBackpackRoot(staging, identifier)
    requireCapabilities(candidate, options)
    // The slot being replaced may be a development link whose checkout is gone, so it is not read.
    const installed = await discoverInstalledBackpacks(dataDirectory, { except: identifier })
    requireUniqueBackpackPrefixes([...installed, candidate])
    if (!existing) {
      await artifact.transition('retired')
      await rename(staging, destination)
      await artifact.retire()
      return { installed: true, replaced: false, archiveSha256: release.sha256 }
    }
    const previous = join(ownerDirectory, parkedPayloadEntry(randomUUID(), basename(destination)))
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

export const restoreBackpack = async (
  configurationDirectory: string,
  dataDirectory: string,
  stateDirectory: string,
  identifier: string,
  fetcher: Fetcher,
  runner: Runner,
  environment: Environment
): Promise<{ readonly installed: boolean; readonly archiveSha256: string }> =>
  installBackpack(configurationDirectory, dataDirectory, stateDirectory, identifier, fetcher, runner, environment, {
    replace: Boolean(
      (await lstat(backpackDirectory(dataDirectory, identifier)).catch(() => undefined))?.isSymbolicLink()
    ),
    allowDevelopmentReplace: true,
    ...(sameBackpack(identifier, canonicalBackpackIdentifier)
      ? {
          requiredCapabilities: minimumBootstrapUserSkills,
          requiredCapabilitiesContext: 'canonical-bootstrap' as const
        }
      : {})
  })

export const restoreCanonicalBackpack = async (
  configurationDirectory: string,
  dataDirectory: string,
  stateDirectory: string,
  fetcher: Fetcher,
  runner: Runner,
  environment: Environment
): Promise<{ readonly installed: boolean; readonly archiveSha256: string }> =>
  restoreBackpack(
    configurationDirectory,
    dataDirectory,
    stateDirectory,
    canonicalBackpackIdentifier,
    fetcher,
    runner,
    environment
  )

export const uninstallBackpack = async (dataDirectory: string, identifier: string): Promise<void> => {
  // The public command validates both conditions before calling this filesystem primitive; retain its defensive core guard.
  /* v8 ignore next -- no public CLI path can bypass the command validation. */
  if (!backpackIdentifierPattern.test(identifier))
    throw new KiError('backpack identifier must be an owner/name identifier', 2)
  /* v8 ignore next -- no public CLI path can bypass the command validation. */
  if (sameBackpack(identifier, canonicalBackpackIdentifier))
    throw new KiError(`the canonical backpack ${identifier} cannot be uninstalled`, 1)

  await readInstalledBackpack(dataDirectory, identifier)
  const owner = identifier.slice(0, identifier.indexOf('/'))
  const backpacks = join(dataDirectory, 'backpacks')
  const ownerDirectory = join(backpacks, owner)
  await physicalDirectory(ownerDirectory, `installed backpack owner ${owner}`)
  const destination = backpackDirectory(dataDirectory, identifier)
  await physicalDirectory(destination, `installed backpack ${identifier}`)
  const entries = await readdir(destination, { withFileTypes: true })
  if (
    !entries.length ||
    entries.some(
      (entry) =>
        (entry.name !== backpackMetadataFile && !payloadRoots.includes(entry.name as (typeof payloadRoots)[number])) ||
        (entry.name === backpackMetadataFile
          ? !entry.isFile() || entry.isSymbolicLink()
          : !entry.isDirectory() || entry.isSymbolicLink())
    )
  ) {
    throw new KiError(`installed backpack ${identifier} has unrecognised state and will not be removed`, 1)
  }
  const removal = join(ownerDirectory, `.uninstall-${randomUUID()}`)
  await rename(destination, removal)
  try {
    await inspectInstalledBackpackRoot(removal, identifier)
    await rm(removal, { recursive: true, force: true })
    return
    /* v8 ignore start -- Recovery needs a filesystem failure or replacement after the successful rename; no single CLI input can cause it. */
  } catch (error) {
    await rename(removal, destination).catch(() => undefined)
    throw error
  }
  /* v8 ignore stop */
}
