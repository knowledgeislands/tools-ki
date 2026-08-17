import type { ResolvedSkill } from '../../configuration/index.ts'
import type { ConformWrite } from '../../rubric/index.ts'
import type { PreparedRubricPublication } from '../../rubric/publication.ts'
import type { BootstrapInstallationResult, BootstrapRefreshResult } from '../bootstrap/index.ts'

export interface DevelopmentConfigurationInspection {
  readonly local: string | null
}

export interface DevelopmentProjectionView {
  readonly agentId: string
  readonly skill: string
  readonly installed: boolean
}

export interface DevelopmentSource<Skill> {
  readonly harness: string
  readonly skills: readonly Skill[]
}

export interface SetDevelopmentSourcePort<Agent, Skill> {
  readonly developmentEnabled: () => Promise<boolean>
  readonly inspectLocalHarness: (path: string) => Promise<DevelopmentSource<Skill>>
  readonly configuredAgents: () => Promise<readonly Agent[]>
  readonly setLocalHarness: (harness: string) => Promise<void>
}

export interface EnableDevelopmentPort<Agent, Skill, Projection> {
  readonly inspectConfiguration: () => Promise<DevelopmentConfigurationInspection>
  readonly inspectLocalHarness: (path: string) => Promise<DevelopmentSource<Skill>>
  readonly configuredAgents: () => Promise<readonly Agent[]>
  readonly enableDevelopment: (harness: string) => Promise<string>
  readonly installSkills: (skills: readonly Skill[], agents: readonly Agent[]) => Promise<readonly Projection[]>
  readonly refreshConfiguration: (
    agents: readonly Agent[],
    local: string | undefined
  ) => Promise<BootstrapRefreshResult>
  readonly projectionView: (projection: Projection) => DevelopmentProjectionView
}

export interface DisableDevelopmentPort<Agent, Skill, Projection> {
  readonly configuredAgents: () => Promise<readonly Agent[]>
  readonly inspectConfiguration: () => Promise<DevelopmentConfigurationInspection>
  readonly restoreCanonicalHarness: () => Promise<BootstrapInstallationResult>
  readonly installedSkills: () => Promise<readonly Skill[]>
  readonly installSkills: (skills: readonly Skill[], agents: readonly Agent[]) => Promise<readonly Projection[]>
  readonly refreshConfiguration: (
    agents: readonly Agent[],
    local: string | undefined
  ) => Promise<BootstrapRefreshResult>
  readonly projectionView: (projection: Projection) => DevelopmentProjectionView
}

export interface DevelopmentSourceResult {
  readonly harness: string
  readonly agents: number
}

export interface EnabledDevelopmentResult extends BootstrapRefreshResult {
  readonly harness: string
  readonly agents: number
  readonly projections: readonly DevelopmentProjectionView[]
}

export interface DisabledDevelopmentResult extends BootstrapRefreshResult, BootstrapInstallationResult {
  readonly agents: number
  readonly projections: readonly DevelopmentProjectionView[]
}

export interface DevelopmentRubricPort {
  readonly resolveSkill: (skill: string) => Promise<ResolvedSkill>
  readonly preparePublication: (skill: ResolvedSkill) => Promise<PreparedRubricPublication>
  readonly lstat: typeof import('node:fs/promises').lstat
  readonly publish: (root: string, write: ConformWrite) => Promise<void>
}

export type DevelopmentRubricEvent =
  | { readonly kind: 'written'; readonly target: string }
  | { readonly kind: 'in-sync'; readonly identity: string }
  | { readonly kind: 'out-of-sync'; readonly identity: string; readonly reason: 'is missing' | 'is stale' }
