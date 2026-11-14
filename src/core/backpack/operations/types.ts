import type { InstalledBackpack } from '../inspection.ts'

export interface BackpackInstallationOptions {
  readonly replace?: boolean
  readonly requiredCapabilities?: readonly string[]
}

export interface BackpackInstallationResult {
  readonly installed: boolean
  readonly archiveSha256: string
}

export interface BackpackInventoryPort {
  readonly discoverInstalled: () => Promise<readonly InstalledBackpack[]>
}

export interface BackpackQueryPort extends BackpackInventoryPort {
  readonly readInstalled: (identifier: string) => Promise<InstalledBackpack>
}

export interface BackpackInstallationPort {
  readonly install: (identifier: string, options?: BackpackInstallationOptions) => Promise<BackpackInstallationResult>
  readonly recordInstalled: (identifier: string, installed: boolean) => Promise<void>
}

interface BackpackActivationPort {
  readonly activeSkillDeclarations: () => Promise<readonly string[]>
}

export interface BackpackReinstallationPort
  extends BackpackInventoryPort,
    BackpackInstallationPort,
    BackpackActivationPort {
  readonly developmentLinked: (identifier: string) => Promise<boolean>
}

export interface BackpackUninstallationPort extends BackpackInventoryPort, BackpackActivationPort {
  readonly developmentLinked: (identifier: string) => Promise<boolean>
  readonly recordInstalled: (identifier: string, installed: boolean) => Promise<void>
  readonly requireWritableRegistry: () => Promise<void>
  readonly uninstall: (identifier: string) => Promise<void>
}

export interface BackpackRefreshPort {
  readonly configuredReleaseIds: () => Promise<readonly string[]>
  readonly install: (identifier: string, options?: BackpackInstallationOptions) => Promise<BackpackInstallationResult>
}

export interface BackpackInventory {
  readonly backpacks: readonly InstalledBackpack[]
  readonly capabilityCount: number
}

export type BackpackRefreshResult =
  | { readonly kind: 'refreshed'; readonly id: string; readonly archiveSha256: string }
  | { readonly kind: 'unavailable'; readonly id: string }
