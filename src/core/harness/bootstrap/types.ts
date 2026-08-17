export interface BootstrapConfigurationInspection {
  readonly state: 'missing' | 'valid' | 'invalid'
  readonly local: { readonly harness: string; readonly path: string } | null
  readonly skills: readonly string[]
}

export interface BootstrapAgentConfiguration<Agent> {
  readonly agents: readonly Agent[]
  readonly disposition: 'created' | 'refreshed' | 'reused'
}

export interface BootstrapRefreshResult {
  readonly harnesses: number
  readonly skills: number
}

export interface BootstrapInstallationResult {
  readonly installed: boolean
  readonly archiveSha256: string
}

export interface BootstrapProjectionView {
  readonly agentId: string
  readonly skill: string
  readonly installed: boolean
}

export interface BootstrapOperationPort<Agent, Skill, Projection> {
  readonly canonicalHarnessIdentifier: string
  readonly inspectConfiguration: () => Promise<BootstrapConfigurationInspection>
  readonly readConfiguration: () => Promise<string>
  readonly restoreConfiguration: (contents: string) => Promise<void>
  readonly developmentEnabled: (local: { readonly harness: string; readonly path: string }) => Promise<boolean>
  readonly inspectLocalHarness: (local: {
    readonly harness: string
    readonly path: string
  }) => Promise<{ readonly harness: string; readonly skills: readonly Skill[] }>
  readonly migrateLegacyRepositories: () => Promise<number>
  readonly configureAgents: (options: {
    readonly refresh?: boolean
    readonly dropLegacyRepositories: boolean
  }) => Promise<BootstrapAgentConfiguration<Agent>>
  readonly installedSkills: (options?: { readonly preserveHarnessRoot?: boolean }) => Promise<readonly Skill[]>
  readonly refreshConfiguration: (
    agents: readonly Agent[],
    local: { readonly harness: string; readonly path: string } | undefined,
    options: { readonly dropLegacyRepositories: boolean }
  ) => Promise<BootstrapRefreshResult>
  readonly clearLocalHarness: () => Promise<void>
  readonly setConfiguredSkills: (skills: readonly string[]) => Promise<void>
  readonly installSkills: (
    skills: readonly Skill[],
    agents: readonly Agent[],
    options: { readonly replace?: boolean; readonly finalize: () => Promise<void> }
  ) => Promise<readonly Projection[]>
  readonly restoreCanonicalHarness: () => Promise<BootstrapInstallationResult>
  readonly agentId: (agent: Agent) => string
  readonly skillName: (skill: Skill) => string
  readonly projectionView: (projection: Projection) => BootstrapProjectionView
}

export type BootstrapOperationEvent =
  | { readonly kind: 'configuration-created'; readonly agentIds: readonly string[] }
  | { readonly kind: 'agents-refreshed'; readonly agentIds: readonly string[] }
  | ({ readonly kind: 'canonical-harness' } & BootstrapInstallationResult)
  | ({ readonly kind: 'configuration-refreshed'; readonly agents: number } & BootstrapRefreshResult)
  | { readonly kind: 'repositories-migrated'; readonly repositories: number }
  | ({ readonly kind: 'skill-projection' } & BootstrapProjectionView)
