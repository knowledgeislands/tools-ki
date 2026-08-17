import { KiError } from '../../errors.ts'
import { canonicalHarnessIdentifier, type InstalledHarness } from '../index.ts'
import type {
  HarnessInstallationPort,
  HarnessInstallationResult,
  HarnessInventoryPort,
  HarnessReinstallationPort,
  HarnessUninstallationPort
} from './types.ts'

const harnessIdentifier = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

const requireHarnessIdentifier = (identifier: string): void => {
  if (!harnessIdentifier.test(identifier)) throw new KiError('harness identifier must be an owner/name identifier', 2)
}

const installedHarness = async (
  port: HarnessInventoryPort,
  identifier: string,
  missingMessage = `harness ${identifier} is not installed`
): Promise<InstalledHarness> => {
  const harnesses = await port.discoverInstalled()
  const harness = harnesses.find((candidate) => candidate.id === identifier)
  if (!harness) throw new KiError(missingMessage, 1)
  return harness
}

const activeRemovalActions = async (
  port: Pick<HarnessReinstallationPort, 'activeSkillDeclarations'>,
  harness: InstalledHarness
): Promise<readonly string[]> => {
  const names = new Set(harness.capabilities.map((capability) => capability.name))
  const prefix = `${harness.id}:`
  return (await port.activeSkillDeclarations()).flatMap((declaration) =>
    declaration.startsWith(prefix) && names.has(declaration.slice(prefix.length))
      ? [`ki skill remove ${declaration.slice(prefix.length)}`]
      : []
  )
}

const requireInactive = async (
  port: Pick<HarnessReinstallationPort, 'activeSkillDeclarations'>,
  harness: InstalledHarness,
  action: 'reinstall' | 'uninstall'
): Promise<void> => {
  const removals = await activeRemovalActions(port, harness)
  if (removals.length) {
    throw new KiError(
      `cannot ${action} ${harness.id} while it has active skills; run ${removals.join(' and ')} first`,
      1
    )
  }
}

export const installConfiguredHarness = async (
  port: HarnessInstallationPort,
  identifier: string
): Promise<HarnessInstallationResult> => {
  const installation = await port.install(identifier)
  await port.recordInstalled(identifier, true)
  return installation
}

export const reinstallInstalledHarness = async (
  port: HarnessReinstallationPort,
  identifier: string
): Promise<HarnessInstallationResult> => {
  requireHarnessIdentifier(identifier)
  const harness = await installedHarness(
    port,
    identifier,
    `harness ${identifier} is not installed; run ki harness install ${identifier} first`
  )
  await requireInactive(port, harness, 'reinstall')
  if (identifier === canonicalHarnessIdentifier && (await port.canonicalDevelopmentLinked())) {
    throw new KiError(
      `the canonical harness ${identifier} is development-linked; run ki dev local off before reinstalling`,
      1
    )
  }
  const installation = await port.install(identifier, { replace: true })
  await port.recordInstalled(identifier, true)
  return installation
}

export const uninstallInstalledHarness = async (port: HarnessUninstallationPort, identifier: string): Promise<void> => {
  requireHarnessIdentifier(identifier)
  const harness = await installedHarness(port, identifier)
  if (identifier === canonicalHarnessIdentifier) {
    throw new KiError(`the canonical harness ${identifier} cannot be uninstalled`, 1)
  }
  await requireInactive(port, harness, 'uninstall')
  await port.requireWritableRegistry()
  await port.uninstall(identifier)
  await port.recordInstalled(identifier, false)
}
