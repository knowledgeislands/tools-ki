import type { InstalledHarness } from '../index.ts'

export interface HarnessInstallationOptions {
  readonly replace?: boolean
  readonly requiredCapabilities?: readonly string[]
}

export interface HarnessInstallationResult {
  readonly installed: boolean
  readonly archiveSha256: string
}

export interface HarnessInventoryPort {
  readonly discoverInstalled: () => Promise<readonly InstalledHarness[]>
}

export interface HarnessQueryPort extends HarnessInventoryPort {
  readonly readInstalled: (identifier: string) => Promise<InstalledHarness>
}

export interface HarnessInstallationPort {
  readonly install: (identifier: string, options?: HarnessInstallationOptions) => Promise<HarnessInstallationResult>
  readonly recordInstalled: (identifier: string, installed: boolean) => Promise<void>
}

interface HarnessActivationPort {
  readonly activeSkillDeclarations: () => Promise<readonly string[]>
}

export interface HarnessReinstallationPort
  extends HarnessInventoryPort,
    HarnessInstallationPort,
    HarnessActivationPort {
  readonly developmentLinked: (identifier: string) => Promise<boolean>
}

export interface HarnessUninstallationPort extends HarnessInventoryPort, HarnessActivationPort {
  readonly developmentLinked: (identifier: string) => Promise<boolean>
  readonly recordInstalled: (identifier: string, installed: boolean) => Promise<void>
  readonly requireWritableRegistry: () => Promise<void>
  readonly uninstall: (identifier: string) => Promise<void>
}

export interface HarnessRefreshPort {
  readonly configuredReleaseIds: () => Promise<readonly string[]>
  readonly install: (identifier: string, options?: HarnessInstallationOptions) => Promise<HarnessInstallationResult>
}

export interface HarnessInventory {
  readonly harnesses: readonly InstalledHarness[]
  readonly capabilityCount: number
}

export type HarnessRefreshResult =
  | { readonly kind: 'refreshed'; readonly id: string; readonly archiveSha256: string }
  | { readonly kind: 'unavailable'; readonly id: string }
