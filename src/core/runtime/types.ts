import type { lstat } from 'node:fs/promises'
import type { ResolvedSkill } from '../configuration/index.ts'
import type { NativeWrite } from '../filesystem/index.ts'
import type {
  AuditOutcome,
  ConformCommand,
  PackageScriptClaim,
  RepositorySkillActivation,
  RubricFamily,
  RubricItem,
  RubricScope,
  RubricSession,
  RubricSubject,
  SkillRubricDefinition
} from '../rubric/index.ts'

export interface RepositoryRuntimeScope {
  readonly kind: 'repository'
  readonly repository: string
  readonly userHome: string
  readonly lstat: typeof lstat
  readonly repositorySkills?: RepositorySkillActivation
  readonly packageScriptClaims: readonly PackageScriptClaim[]
}

export type RuntimeScope = RepositoryRuntimeScope

export type FindingLevel = 'fail' | 'warn' | 'info' | 'not-applicable' | 'pass'

export interface Finding {
  readonly level: FindingLevel
  readonly code: string
  /** The rubric item's human-facing title, retained for host-owned reporting. */
  readonly title: string
  readonly message: string
  /** The optional specific file, path, or other evidence subject supplied by the item. */
  readonly subject?: string
}

export interface ItemAuditState {
  readonly item: PreparedRubricItem
  readonly outcomes: readonly AuditOutcome[]
  readonly subjects: readonly SubjectAuditState[]
}

export interface SubjectAuditState {
  readonly subject: RubricSubject<unknown>
  readonly outcomes: readonly AuditOutcome[]
}

/** One mechanical catalogue item paired with the family that selects its evidence. */
export interface PreparedRubricItem {
  readonly family: RubricFamily<unknown>
  readonly item: RubricItem<unknown> & { readonly mechanical: NonNullable<RubricItem<unknown>['mechanical']> }
  readonly code: string
  readonly familyIndex: number
  readonly itemIndex: number
}

export interface SkillAuditResult {
  readonly findings: readonly Finding[]
  readonly items: readonly ItemAuditState[]
}

/** A validated rubric definition and its execution order, loaded once by the repository host. */
export interface PreparedSkill {
  readonly skill: ResolvedSkill
  readonly definition: SkillRubricDefinition<unknown>
  readonly items: readonly PreparedRubricItem[]
}

/** The static maintenance catalogue a declared skill exposes through `ki repo educate`. */
export interface SkillEducationResult {
  readonly identity: string
  readonly concern: string
  readonly scope: RubricScope
  readonly families: readonly RubricFamily<unknown>[]
}

export interface SkillConformResult {
  readonly findings: readonly Finding[]
  readonly writes: readonly NativeWrite[]
  readonly commands: readonly ConformCommand[]
  readonly scope: RubricScope
  /** Items whose pre-conform audit produced at least one VIOLATION outcome — candidates for a post-conform FIXED line. */
  readonly fixable: readonly ItemAuditState[]
}

export interface FixedItem {
  readonly code: string
  readonly title: string
  readonly message: string
  readonly subject?: string
}

/**
 * The validated form of a rubric progress event. A step's two counters are optional in the
 * contract but meaningless apart, so validation pairs them here and every consumer downstream
 * sees one countable step or an uncounted one.
 */
export type RubricProgressReport =
  | { readonly kind: 'stage'; readonly edge: 'start' | 'end'; readonly label: string; readonly code?: string }
  | {
      readonly kind: 'step'
      readonly label: string
      readonly code?: string
      readonly count?: { readonly completed: number; readonly total: number }
    }

export interface EvidenceProgress {
  readonly onProgressEvent?: (event: RubricProgressReport) => void
}

export interface GatheredSkillAudit {
  readonly session: RubricSession<unknown>
  readonly scope: RubricScope
  readonly publication: { write?: NativeWrite; conforming: boolean }
}

/**
 * Item progress is reported at both edges of the await. A caller rendering a live
 * line needs the item that is running, not the one that has finished; reporting
 * only completion leaves the display naming the previous item for the whole of a
 * slow item's execution.
 */
export interface ItemProgress {
  readonly onItemStart?: (item: PreparedRubricItem) => void
  readonly onItemComplete?: (item: PreparedRubricItem) => void
  /**
   * Receives the stage and step reports that name work no item edge covers. The host brackets
   * session construction itself, so the phase is named whether or not the rubric emits: a
   * session that declines the channel still reports as gathering evidence, indeterminately.
   */
  readonly onProgressEvent?: (event: RubricProgressReport) => void
}
