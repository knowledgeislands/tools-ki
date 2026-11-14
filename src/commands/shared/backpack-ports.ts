import { inspectUserConfiguration } from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
import {
  type BackpackInstallationPort,
  type BackpackQueryPort,
  type BackpackRefreshPort,
  type BackpackReinstallationPort,
  type BackpackUninstallationPort,
  discoverInstalledBackpacks,
  readInstalledBackpack
} from '../../core/backpack/index.ts'
import {
  installBackpack,
  isBackpackDevelopmentLinked,
  readBackpackRegistry,
  recordInstalledBackpack,
  requireWritableBackpackRegistry,
  uninstallBackpack
} from '../../core/storage/index.ts'

export const backpackQueryPort = (context: KiContext): BackpackQueryPort => ({
  discoverInstalled: () => discoverInstalledBackpacks(context.paths.data),
  readInstalled: (identifier) => readInstalledBackpack(context.paths.data, identifier)
})

const backpackInstaller =
  (context: KiContext): BackpackInstallationPort['install'] =>
  (identifier, options) =>
    installBackpack(
      context.paths.config,
      context.paths.data,
      context.paths.state,
      identifier,
      context.fetcher,
      context.runner,
      context.environment,
      options
    )

const activeSkillDeclarations = async (context: KiContext): Promise<readonly string[]> =>
  (await inspectUserConfiguration(context.paths.config)).skills

export const backpackInstallationPort = (context: KiContext): BackpackInstallationPort => ({
  install: backpackInstaller(context),
  recordInstalled: (identifier, installed) => recordInstalledBackpack(context.paths.config, identifier, installed)
})

export const backpackReinstallationPort = (context: KiContext): BackpackReinstallationPort => ({
  discoverInstalled: () => discoverInstalledBackpacks(context.paths.data),
  ...backpackInstallationPort(context),
  activeSkillDeclarations: () => activeSkillDeclarations(context),
  developmentLinked: (identifier) => isBackpackDevelopmentLinked(context.paths.data, identifier)
})

export const backpackUninstallationPort = (context: KiContext): BackpackUninstallationPort => ({
  discoverInstalled: () => discoverInstalledBackpacks(context.paths.data),
  developmentLinked: (identifier) => isBackpackDevelopmentLinked(context.paths.data, identifier),
  activeSkillDeclarations: () => activeSkillDeclarations(context),
  recordInstalled: (identifier, installed) => recordInstalledBackpack(context.paths.config, identifier, installed),
  requireWritableRegistry: () => requireWritableBackpackRegistry(context.paths.config),
  uninstall: (identifier) => uninstallBackpack(context.paths.data, identifier)
})

export const backpackRefreshPort = (context: KiContext): BackpackRefreshPort => ({
  configuredReleaseIds: async () => (await readBackpackRegistry(context.paths.config)).map((release) => release.id),
  install: backpackInstaller(context)
})
