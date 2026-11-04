export type TerritoryRootKind = 'owner' | 'member'
export interface TerritoryMember {
  readonly key: string
  readonly root: string
  readonly repository: string
  readonly kind: TerritoryRootKind
}
export type TerritoryRoot = TerritoryMember
export interface TerritoryProfile {
  readonly id: string
  readonly title: string
  readonly home?: TerritoryMember
  readonly members: readonly TerritoryMember[]
  readonly roots: readonly TerritoryRoot[]
  readonly system: boolean
  /** Declared member identities with no registry entry, reported only when the selection asks for them. */
  readonly unregistered?: readonly string[]
  /** Every member that could not be resolved and why, the unregistered included; reported only when asked. */
  readonly absent?: readonly TerritoryAbsence[]
}
/**
 * Why a member has no usable checkout on this machine, read from local evidence alone:
 * - `unregistered`: no registry entry names it and no registered checkout declares it;
 * - `renamed`: its registry entry and its checkout disagree on the name, so `declared` is the other one;
 * - `missing`: its registered checkout is no longer on disk;
 * - `unreadable`: its checkout cannot be read as this member, `reason` saying why;
 * - `elsewhere`: its checkout names another Capital, given as `declared`.
 */
export type TerritoryAbsenceCondition = 'unregistered' | 'renamed' | 'missing' | 'unreadable' | 'elsewhere'
export interface TerritoryAbsence {
  readonly identity: string
  readonly condition: TerritoryAbsenceCondition
  /** The registry entry that holds or claims the member, absent when unregistered. */
  readonly key?: string
  readonly path?: string
  /** For `renamed`, the name the registry or checkout gives instead; for `elsewhere`, the Capital the checkout names. */
  readonly declared?: string
  /** For `unreadable`, what failed when the checkout was read. */
  readonly reason?: string
}
