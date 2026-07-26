// The versioned rubric-definition contract — the one shape an installed skill exposes
// to the tools-owned governed-rubric runtime (CLI-004 T1.1, handoff constraints 1–5).
//
// An installed skill payload provides `scripts/rubric/index.ts`, default-exporting a
// `SkillRubricDefinition`. The runtime validates the shape structurally at load against
// `RUBRIC_CONTRACT_VERSION` before executing anything. Context builders are read-only;
// repairs declare serialisable write proposals and never write — the host owns the one
// transaction, publishes in dependency order, and derives `FIXED` from the
// post-publication re-audit rather than trusting a skill's claim.

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
}

/**
 * One declared file replacement, relative to the repository root.
 *
 * Existing regular files are replaced transactionally.  A repair must opt in
 * explicitly with `create` to create a previously absent regular file; this
 * keeps accidental path typos from turning into new repository content.
 */
export interface RepairWrite {
  readonly path: string
  readonly content: string
  readonly create?: boolean
}

/** One pathless subprocess command run by the host from the repository root after transactional file writes publish. */
export interface RepairCommand {
  readonly program: string
  readonly arguments: readonly string[]
}

/** A serialisable repair proposal; an item may declare transactional file replacements, bounded host commands, or both. */
export interface RepairProposal {
  readonly writes: readonly RepairWrite[]
  readonly commands?: readonly RepairCommand[]
}

/** Repository rubrics are the default, retaining the original contract shape. */
export interface RepositoryRubricScope {
  readonly kind: 'repository'
}

/**
 * A user-maintenance rubric may inspect the user home and repair only these
 * relative paths beneath it. The host validates both this declaration and each
 * proposed write; a scope is never an arbitrary absolute path.
 */
export interface UserHomeRubricScope {
  readonly kind: 'user-home'
  readonly paths: readonly string[]
}

export type RubricScope = RepositoryRubricScope | UserHomeRubricScope

/** A mechanical item the runtime executes; `repair` is optional and only consulted in conform mode. */
export interface MechanicalRubricItem<Context> {
  readonly kind: 'mechanical'
  readonly code: string
  readonly title: string
  readonly level: ViolationLevel
  readonly phase: RubricPhase
  readonly audit: (context: Context) => Promise<readonly AuditOutcome[]> | readonly AuditOutcome[]
  readonly repair?: (context: Context) => Promise<RepairProposal> | RepairProposal
}

/** A judgment item is carried as catalogue data for educate/reporting surfaces; the runtime never executes it. */
export interface JudgmentRubricItem {
  readonly kind: 'judgment'
  readonly code: string
  readonly title: string
  readonly prompt: string
}

export type RubricItem<Context> = MechanicalRubricItem<Context> | JudgmentRubricItem

export interface RubricFamily<Context> {
  readonly code: string
  readonly title: string
  readonly items: readonly RubricItem<Context>[]
}

export interface RepositoryRubricContextOptions {
  readonly repository: string
  readonly configuration: Readonly<Record<string, unknown>>
}

export interface UserHomeRubricContextOptions {
  readonly userHome: string
  readonly configuration: Readonly<Record<string, unknown>>
}

export type RubricContextOptions = RepositoryRubricContextOptions | UserHomeRubricContextOptions

export interface SkillRubricDefinition<Context = unknown> {
  readonly contract: typeof RUBRIC_CONTRACT_VERSION
  readonly skill: string
  /** Omit for a repository rubric; user maintenance must explicitly declare its bounded user-home scope. */
  readonly scope?: RubricScope
  /** Builds the read-only evidence/context the items evaluate; it must not write anywhere. */
  readonly createContext: (options: RubricContextOptions) => Promise<Context> | Context
  readonly families: readonly RubricFamily<Context>[]
}

/** The payload-relative module every rubric-bearing skill provides. */
export const RUBRIC_MODULE_PATH = 'scripts/rubric/index.ts'

/** The export name the runtime loads; a definition is the module's default export. */
export const RUBRIC_MODULE_EXPORT = 'default'
