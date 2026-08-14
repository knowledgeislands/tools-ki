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
  /** Relative expected effort within this catalogue; omitted means one progress unit. */
  readonly cost?: number
  readonly overrideLevels?: readonly ViolationLevel[]
  readonly heuristic?: boolean
  readonly remediation: MechanicalRemediation
  readonly audit: RubricExecution<Context, readonly AuditOutcome[]>
  readonly conform?: RubricExecution<Context, void>
  readonly conformOn?: readonly 'INFO'[]
}

export type MechanicalRemediation =
  | { readonly class: 'automatic' }
  | { readonly class: 'diagnostic' | 'guarded'; readonly guidance: string }

export interface JudgmentRubric {
  readonly scope: string
  readonly prompt: string
  readonly outcomes: readonly [string, ...string[]]
  readonly guidance: string
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
  readonly mode: 'audit' | 'conform'
  readonly repository: string
  readonly userHome: string
  readonly configuration: Readonly<Record<string, unknown>>
  /**
   * Reports progress while the session works. Absent when the host is not displaying
   * progress; a rubric must produce identical findings either way and must never depend on
   * an emitted event being observed.
   */
  readonly emit?: RubricEmitter
  /** Host-validated generated-publication evidence for this skill's catalogue. */
  readonly publication: RubricPublication
}

/**
 * A progress report from inside a rubric session.
 *
 * `stage` brackets a named span of work — gathering evidence for a subject, or executing one
 * criterion — and `step` reports movement within the current span. `completed` and `total`
 * are supplied together or not at all and describe countable work such as files scanned.
 */
export type RubricProgressEvent =
  | { readonly kind: 'stage'; readonly edge: 'start' | 'end'; readonly label: string; readonly code?: string }
  | {
      readonly kind: 'step'
      readonly label: string
      readonly code?: string
      readonly completed?: number
      readonly total?: number
    }

export type RubricEmitter = (event: RubricProgressEvent) => void

export type RubricPublicationState = 'in-sync' | 'missing' | 'stale'

/**
 * A criterion-agnostic capability for a skill's derived rubric publication.
 *
 * The host determines the canonical bytes and controls the resulting write. A
 * rubric may inspect the evidence and request publication during CONFORM, but
 * it cannot select a path or replacement content.
 */
export interface RubricPublication {
  readonly target: string
  readonly rendered: string
  readonly existing?: string
  readonly state: RubricPublicationState
  readonly propose: () => void
}

export interface RubricSubject<RootContext> {
  readonly context: () => Promise<RootContext> | RootContext
  readonly families: readonly string[]
  readonly subject?: string
}

export interface RubricSession<RootContext> {
  readonly subjects: readonly RubricSubject<RootContext>[]
  readonly proposal: () => Promise<ConformProposal> | ConformProposal
}

export interface SkillRubricDefinition<RootContext = unknown> {
  readonly contract: typeof RUBRIC_CONTRACT_VERSION
  readonly name: string
  readonly concern: string
  readonly scope?: RubricScope
  /**
   * Builds one operation-scoped session. AUDIT callbacks remain read-only;
   * CONFORM callbacks may change only the session's private in-memory draft.
   */
  readonly createSession: (
    options: RubricContextOptions
  ) => Promise<RubricSession<RootContext>> | RubricSession<RootContext>
  readonly families: readonly RubricFamily<RootContext>[]
}

/** The sole canonical module for a rubric-bearing skill. */
export const RUBRIC_MODULE_PATH = 'scripts/rubric/items/index.ts'

/** The catalogue is the module's default export. */
export const RUBRIC_MODULE_EXPORT = 'default'
