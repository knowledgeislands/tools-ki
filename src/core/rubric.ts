// The versioned direct-catalogue contract for rubric-bearing skills.
//
// A skill owns one canonical catalogue at `scripts/rubric/items/index.ts`. The
// module default-exports its complete definition: publication metadata, root
// context factory, heterogeneous families, and distributed item definitions.
// The host validates that structure before executing any skill code.

export const RUBRIC_CONTRACT_VERSION = 1

export const RUBRIC_PHASES = ['PREPARE', 'INSPECT', 'PRIMARY', 'DERIVED', 'NORMALISE'] as const
export type RubricPhase = (typeof RUBRIC_PHASES)[number]

export const VIOLATION_LEVELS = ['FAIL', 'WARN'] as const
export type ViolationLevel = (typeof VIOLATION_LEVELS)[number]

export const AUDIT_STATUSES = ['PASS', 'VIOLATION', 'NOT_APPLICABLE', 'INFO'] as const
export type AuditStatus = (typeof AUDIT_STATUSES)[number]

export interface AuditOutcome {
  readonly status: AuditStatus
  readonly message: string
  readonly subject?: string
  /** A VIOLATION may use the item's default level or one of its declared overrides. */
  readonly level?: ViolationLevel
}

export interface ConformWrite {
  readonly path: string
  readonly content: string
  readonly create?: boolean
}

export interface ConformCommand {
  readonly program: string
  readonly arguments: readonly string[]
}

/** A conform action describes desired changes; only the host is allowed to publish them. */
export interface ConformProposal {
  readonly writes: readonly ConformWrite[]
  readonly commands?: readonly ConformCommand[]
}

export interface RepositoryRubricScope {
  readonly kind: 'repository'
}

export interface UserHomeRubricScope {
  readonly kind: 'user-home'
  readonly paths: readonly string[]
}

export type RubricScope = RepositoryRubricScope | UserHomeRubricScope

export interface RubricExecution<Context, Result> {
  readonly phase: RubricPhase
  readonly run: (context: Context) => Promise<Result> | Result
}

export interface MechanicalRubric<Context> {
  readonly level: ViolationLevel
  readonly overrideLevels?: readonly ViolationLevel[]
  readonly heuristic?: boolean
  readonly audit: RubricExecution<Context, readonly AuditOutcome[]>
  readonly conform?: RubricExecution<Context, ConformProposal>
  readonly conformOn?: readonly 'INFO'[]
}

export interface JudgmentRubric {
  readonly prompt: string
}

export interface RubricItem<Context> {
  readonly code: string
  readonly title: string
  readonly description: string
  readonly sources: readonly [string, ...string[]]
  readonly mechanical?: MechanicalRubric<Context>
  readonly judgment?: JudgmentRubric
}

export interface RubricFamily<RootContext, FamilyContext = unknown> {
  readonly code: string
  readonly title: string
  readonly description: string
  readonly standard: string
  readonly selectContext: (root: RootContext) => Promise<FamilyContext> | FamilyContext
  readonly items: readonly RubricItem<FamilyContext>[]
}

export interface RubricContextOptions {
  readonly repository: string
  readonly userHome: string
  readonly configuration: Readonly<Record<string, unknown>>
}

export interface SkillRubricDefinition<RootContext = unknown> {
  readonly contract: typeof RUBRIC_CONTRACT_VERSION
  readonly name: string
  readonly concern: string
  readonly scope?: RubricScope
  /** Builds read-only root evidence; it must never write. */
  readonly createContext: (options: RubricContextOptions) => Promise<RootContext> | RootContext
  readonly families: readonly RubricFamily<RootContext>[]
}

/** The sole canonical module for a rubric-bearing skill. */
export const RUBRIC_MODULE_PATH = 'scripts/rubric/items/index.ts'

/** The catalogue is the module's default export. */
export const RUBRIC_MODULE_EXPORT = 'default'
