import type { ResolvedSkill } from '../../configuration/index.ts'
import type { ConformWrite } from '../../rubric/index.ts'
import type { PreparedRubricPublication } from '../../rubric/publication.ts'
import type { BootstrapInstallationResult, BootstrapRefreshResult } from '../bootstrap/index.ts'

export interface DevelopmentConfigurationInspection {
  readonly locals: readonly { readonly harness: string; readonly path: string }[]
  readonly skills: readonly string[]
}

export interface DevelopmentProjectionView {
  readonly agentId: string
  readonly skill: string
  readonly installed: boolean
}

export interface DevelopmentSource<Skill> {
  readonly harness: string
  readonly prefix: string
  readonly skills: readonly Skill[]
}

export interface SetDevelopmentSourcePort<Agent, Skill> {
  readonly developmentEnabled: (identifier: string) => Promise<boolean>
  readonly requireInstalledHarness: (identifier: string) => Promise<{ readonly prefix?: string }>
  readonly inspectLocalHarness: (path: string, identifier: string) => Promise<DevelopmentSource<Skill>>
  readonly configuredAgents: () => Promise<readonly Agent[]>
  readonly setLocalHarness: (local: { readonly harness: string; readonly path: string }) => Promise<void>
}

export interface EnableDevelopmentPort<Agent, Skill, Projection> {
  readonly inspectConfiguration: () => Promise<DevelopmentConfigurationInspection>
  readonly inspectLocalHarness: (path: string, identifier: string) => Promise<DevelopmentSource<Skill>>
  readonly configuredAgents: () => Promise<readonly Agent[]>
  readonly enableDevelopment: (identifier: string, harness: string) => Promise<string>
  readonly installSkills: (skills: readonly Skill[], agents: readonly Agent[]) => Promise<readonly Projection[]>
  readonly refreshConfiguration: (
    agents: readonly Agent[],
    locals: readonly { readonly harness: string; readonly path: string }[]
  ) => Promise<BootstrapRefreshResult>
  readonly projectionView: (projection: Projection) => DevelopmentProjectionView
}

export interface DisableDevelopmentPort<Agent, Skill, Projection> {
  readonly configuredAgents: () => Promise<readonly Agent[]>
  readonly inspectConfiguration: () => Promise<DevelopmentConfigurationInspection>
  readonly restoreHarness: (identifier: string) => Promise<BootstrapInstallationResult>
  readonly installedSkills: (identifier: string) => Promise<readonly Skill[]>
  readonly installSkills: (skills: readonly Skill[], agents: readonly Agent[]) => Promise<readonly Projection[]>
  readonly refreshConfiguration: (
    agents: readonly Agent[],
    locals: readonly { readonly harness: string; readonly path: string }[]
  ) => Promise<BootstrapRefreshResult>
  readonly projectionView: (projection: Projection) => DevelopmentProjectionView
}

export interface DevelopmentSourceResult {
  readonly identifier: string
  readonly harness: string
  readonly agents: number
}

export interface EnabledDevelopmentResult extends BootstrapRefreshResult {
  readonly identifier: string
  readonly harness: string
  readonly agents: number
  readonly projections: readonly DevelopmentProjectionView[]
}

export interface DisabledDevelopmentResult extends BootstrapRefreshResult, BootstrapInstallationResult {
  readonly identifier: string
  readonly agents: number
  readonly projections: readonly DevelopmentProjectionView[]
}

export interface DevelopmentRubricPort {
  readonly resolveSkill: (skill: string) => Promise<ResolvedSkill>
  readonly preparePublication: (skill: ResolvedSkill) => Promise<PreparedRubricPublication>
  readonly developmentLinked: (identifier: string) => Promise<boolean>
  readonly publish: (root: string, write: ConformWrite) => Promise<void>
}

export type DevelopmentRubricEvent =
  | { readonly kind: 'written'; readonly target: string }
  | { readonly kind: 'in-sync'; readonly identity: string }
  | { readonly kind: 'out-of-sync'; readonly identity: string; readonly reason: 'is missing' | 'is stale' }
