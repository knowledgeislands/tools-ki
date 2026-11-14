import { KiError } from '../../errors.ts'
import { sameBackpack } from '../identity.ts'
import { canonicalBackpackIdentifier, type InstalledBackpack } from '../inspection.ts'
import type {
  BackpackInstallationPort,
  BackpackInstallationResult,
  BackpackInventoryPort,
  BackpackReinstallationPort,
  BackpackUninstallationPort
} from './types.ts'

const backpackIdentifierPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

const requireBackpackIdentifier = (identifier: string): void => {
  if (!backpackIdentifierPattern.test(identifier))
    throw new KiError('backpack identifier must be an owner/name identifier', 2)
}

const installedBackpack = async (
  port: BackpackInventoryPort,
  identifier: string,
  missingMessage = `backpack ${identifier} is not installed`
): Promise<InstalledBackpack> => {
  const backpacks = await port.discoverInstalled()
  const backpack = backpacks.find((candidate) => sameBackpack(candidate.id, identifier))
  if (!backpack) throw new KiError(missingMessage, 1)
  return backpack
}

const activeRemovalActions = async (
  port: Pick<BackpackReinstallationPort, 'activeSkillDeclarations'>,
  backpack: InstalledBackpack
): Promise<readonly string[]> => {
  const names = new Set(backpack.capabilities.map((capability) => capability.name))
  const prefix = `${backpack.id}:`
  return (await port.activeSkillDeclarations()).flatMap((declaration) =>
    declaration.startsWith(prefix) && names.has(declaration.slice(prefix.length))
      ? [`ki skill remove ${declaration.slice(prefix.length)}`]
      : []
  )
}

const requireInactive = async (
  port: Pick<BackpackReinstallationPort, 'activeSkillDeclarations'>,
  backpack: InstalledBackpack,
  action: 'reinstall' | 'uninstall'
): Promise<void> => {
  const removals = await activeRemovalActions(port, backpack)
  if (removals.length) {
    throw new KiError(
      `cannot ${action} ${backpack.id} while it has active skills; run ${removals.join(' and ')} first`,
      1
    )
  }
}

export const installConfiguredBackpack = async (
  port: BackpackInstallationPort,
  identifier: string
): Promise<BackpackInstallationResult> => {
  const installation = await port.install(identifier)
  await port.recordInstalled(identifier, true)
  return installation
}

export const reinstallInstalledBackpack = async (
  port: BackpackReinstallationPort,
  identifier: string
): Promise<BackpackInstallationResult> => {
  requireBackpackIdentifier(identifier)
  const backpack = await installedBackpack(
    port,
    identifier,
    `backpack ${identifier} is not installed; run ki backpack install ${identifier} first`
  )
  await requireInactive(port, backpack, 'reinstall')
  if (await port.developmentLinked(identifier)) {
    throw new KiError(`backpack ${identifier} is development-linked; run ki dev local off before reinstalling`, 1)
  }
  const installation = await port.install(identifier, { replace: true })
  await port.recordInstalled(identifier, true)
  return installation
}

export const uninstallInstalledBackpack = async (
  port: BackpackUninstallationPort,
  identifier: string
): Promise<void> => {
  requireBackpackIdentifier(identifier)
  const backpack = await installedBackpack(port, identifier)
  if (sameBackpack(identifier, canonicalBackpackIdentifier)) {
    throw new KiError(`the canonical backpack ${identifier} cannot be uninstalled`, 1)
  }
  if (await port.developmentLinked(identifier)) {
    throw new KiError(`backpack ${identifier} is development-linked; run ki dev local off before uninstalling`, 1)
  }
  await requireInactive(port, backpack, 'uninstall')
  await port.requireWritableRegistry()
  await port.uninstall(identifier)
  await port.recordInstalled(identifier, false)
}
