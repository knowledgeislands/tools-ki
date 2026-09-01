import { inspectUserConfiguration } from '../../agents/index.ts'
import type { KiContext } from '../../context.ts'
import {
  discoverInstalledHarnesses,
  type HarnessInstallationPort,
  type HarnessQueryPort,
  type HarnessRefreshPort,
  type HarnessReinstallationPort,
  type HarnessUninstallationPort,
  readInstalledHarness
} from '../../core/harness/index.ts'
import {
  installHarness,
  isHarnessDevelopmentLinked,
  readHarnessRegistry,
  recordInstalledHarness,
  requireWritableHarnessRegistry,
  uninstallHarness
} from '../../core/storage/index.ts'

export const harnessQueryPort = (context: KiContext): HarnessQueryPort => ({
  discoverInstalled: () => discoverInstalledHarnesses(context.paths.data),
  readInstalled: (identifier) => readInstalledHarness(context.paths.data, identifier)
})

const harnessInstaller =
  (context: KiContext): HarnessInstallationPort['install'] =>
  (identifier, options) =>
    installHarness(
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

export const harnessInstallationPort = (context: KiContext): HarnessInstallationPort => ({
  install: harnessInstaller(context),
  recordInstalled: (identifier, installed) => recordInstalledHarness(context.paths.config, identifier, installed)
})

export const harnessReinstallationPort = (context: KiContext): HarnessReinstallationPort => ({
  discoverInstalled: () => discoverInstalledHarnesses(context.paths.data),
  ...harnessInstallationPort(context),
  activeSkillDeclarations: () => activeSkillDeclarations(context),
  developmentLinked: (identifier) => isHarnessDevelopmentLinked(context.paths.data, identifier)
})

export const harnessUninstallationPort = (context: KiContext): HarnessUninstallationPort => ({
  discoverInstalled: () => discoverInstalledHarnesses(context.paths.data),
  developmentLinked: (identifier) => isHarnessDevelopmentLinked(context.paths.data, identifier),
  activeSkillDeclarations: () => activeSkillDeclarations(context),
  recordInstalled: (identifier, installed) => recordInstalledHarness(context.paths.config, identifier, installed),
  requireWritableRegistry: () => requireWritableHarnessRegistry(context.paths.config),
  uninstall: (identifier) => uninstallHarness(context.paths.data, identifier)
})

export const harnessRefreshPort = (context: KiContext): HarnessRefreshPort => ({
  configuredReleaseIds: async () => (await readHarnessRegistry(context.paths.config)).map((release) => release.id),
  install: harnessInstaller(context)
})
