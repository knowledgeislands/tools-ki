// Executes a loaded rubric definition (CLI-004 T1.2): runs mechanical items' audit in
// phase order, renders findings, and — for conform — collects RepairProposals from
// violated items into the host-owned transaction (see ./transaction.ts). Judgment items
// are catalogue data only; the runtime never executes them.

import { KiError } from './errors.ts'
import type { ResolvedSkill } from './resolution.ts'
import { type AuditOutcome, type MechanicalRubricItem, RUBRIC_PHASES, type SkillRubricDefinition } from './rubric.ts'
import { loadRubricDefinition } from './runtime-loader.ts'
import type { NativeWrite } from './transaction.ts'

export interface NativeFinding {
  readonly level: 'fail' | 'warn' | 'info'
  readonly code: string
  readonly message: string
}

export interface ItemAuditState {
  readonly item: MechanicalRubricItem<unknown>
  readonly outcomes: readonly AuditOutcome[]
}

export interface SkillAuditResult {
  readonly findings: readonly NativeFinding[]
  readonly items: readonly ItemAuditState[]
}

export interface SkillConformResult {
  readonly findings: readonly NativeFinding[]
  readonly writes: readonly NativeWrite[]
  /** Items whose pre-conform audit produced at least one VIOLATION outcome — candidates for a post-conform FIXED line. */
  readonly fixable: readonly ItemAuditState[]
}

export interface FixedItem {
  readonly code: string
  readonly message: string
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const validateOutcome = (value: unknown, code: string, index: number): AuditOutcome => {
  if (!isRecord(value)) throw new KiError(`rubric item ${code} audit outcome ${index} must be a table`, 1)
  const { status, message, subject } = value
  if (status !== 'PASS' && status !== 'VIOLATION' && status !== 'NOT_APPLICABLE' && status !== 'INFO')
    throw new KiError(`rubric item ${code} audit outcome ${index} has an invalid status`, 1)
  if (typeof message !== 'string' || !message) throw new KiError(`rubric item ${code} audit outcome ${index} must have a message`, 1)
  if (subject !== undefined && typeof subject !== 'string')
    throw new KiError(`rubric item ${code} audit outcome ${index} has an invalid subject`, 1)
  return subject === undefined ? { status, message } : { status, message, subject }
}

const validateRepairProposal = (value: unknown, code: string): readonly NativeWrite[] => {
  if (!isRecord(value)) throw new KiError(`rubric item ${code} repair must return a table`, 1)
  const { writes } = value
  if (!Array.isArray(writes)) throw new KiError(`rubric item ${code} repair must return a writes array`, 1)
  return writes.map((write, index) => {
    if (!isRecord(write)) throw new KiError(`rubric item ${code} repair write ${index} must have string path and content`, 1)
    const { path, content } = write
    if (typeof path !== 'string' || typeof content !== 'string')
      throw new KiError(`rubric item ${code} repair write ${index} must have string path and content`, 1)
    return { path, content }
  })
}

interface OrderedItem {
  readonly item: MechanicalRubricItem<unknown>
  readonly familyIndex: number
  readonly itemIndex: number
}

const orderedMechanicalItems = (definition: SkillRubricDefinition<unknown>): readonly MechanicalRubricItem<unknown>[] => {
  const entries: OrderedItem[] = []
  definition.families.forEach((family, familyIndex) => {
    family.items.forEach((item, itemIndex) => {
      if (item.kind === 'mechanical') entries.push({ item, familyIndex, itemIndex })
    })
  })
  return entries
    .slice()
    .sort((left, right) => {
      const phaseDelta = RUBRIC_PHASES.indexOf(left.item.phase) - RUBRIC_PHASES.indexOf(right.item.phase)
      if (phaseDelta !== 0) return phaseDelta
      if (left.familyIndex !== right.familyIndex) return left.familyIndex - right.familyIndex
      return left.itemIndex - right.itemIndex
    })
    .map((entry) => entry.item)
}

const findingForOutcome = (item: MechanicalRubricItem<unknown>, outcome: AuditOutcome): NativeFinding | undefined => {
  if (outcome.status === 'PASS' || outcome.status === 'NOT_APPLICABLE') return undefined
  const level = outcome.status === 'INFO' ? 'info' : item.level === 'FAIL' ? 'fail' : 'warn'
  const message = outcome.subject ? `${outcome.message} — ${outcome.subject}` : outcome.message
  return { level, code: item.code, message }
}

const auditItem = async (item: MechanicalRubricItem<unknown>, context: unknown): Promise<ItemAuditState> => {
  const raw = await item.audit(context)
  if (!Array.isArray(raw)) throw new KiError(`rubric item ${item.code} audit must return an outcomes array`, 1)
  return { item, outcomes: raw.map((outcome, index) => validateOutcome(outcome, item.code, index)) }
}

interface InternalAudit {
  readonly context: unknown
  readonly items: readonly ItemAuditState[]
  readonly findings: readonly NativeFinding[]
}

const auditSkill = async (repository: string, skill: ResolvedSkill): Promise<InternalAudit> => {
  const definition = await loadRubricDefinition(skill)
  const context = await definition.createContext({ repository, configuration: skill.declaration.configuration })
  const items = await Promise.all(orderedMechanicalItems(definition).map((item) => auditItem(item, context)))
  const findings = items.flatMap((state) =>
    state.outcomes.flatMap((outcome) => {
      const finding = findingForOutcome(state.item, outcome)
      return finding ? [finding] : []
    })
  )
  return { context, items, findings }
}

export const runSkillAudit = async (repository: string, skill: ResolvedSkill): Promise<SkillAuditResult> => {
  const { items, findings } = await auditSkill(repository, skill)
  return { findings, items }
}

// A violated item that declares a repair is only actually "fixed this round" once its
// repair proposes at least one write — an empty proposal means it had nothing safe to
// change, so its violation still surfaces like any other unaddressed finding below.
const attemptRepair = async (state: ItemAuditState, context: unknown): Promise<readonly NativeWrite[] | undefined> => {
  if (!state.item.repair || !state.outcomes.some((outcome) => outcome.status === 'VIOLATION')) return undefined
  const writes = validateRepairProposal(await state.item.repair(context), state.item.code)
  return writes.length ? writes : undefined
}

export const runSkillConform = async (repository: string, skill: ResolvedSkill): Promise<SkillConformResult> => {
  const { context, items } = await auditSkill(repository, skill)
  const attempts = await Promise.all(items.map((state) => attemptRepair(state, context)))

  const findings: NativeFinding[] = []
  const writes: NativeWrite[] = []
  const fixable: ItemAuditState[] = []
  items.forEach((state, index) => {
    const proposed = attempts[index]
    if (proposed) {
      writes.push(...proposed)
      fixable.push(state)
      return
    }
    for (const outcome of state.outcomes) {
      const finding = findingForOutcome(state.item, outcome)
      if (finding) findings.push(finding)
    }
  })
  return { findings, writes, fixable }
}

/** Compares a conform's pre-conform violated items against a post-conform re-audit to name what got fixed. */
export const detectFixed = (fixable: readonly ItemAuditState[], postItems: readonly ItemAuditState[]): readonly FixedItem[] => {
  const postByCode = new Map(postItems.map((state) => [state.item.code, state]))
  return fixable.flatMap((state) => {
    const post = postByCode.get(state.item.code)
    // Unreachable via any real CLI path: `postItems` is always a fresh re-audit of the same
    // rubric definition that produced `fixable`, so every fixable item's code is guaranteed
    // to reappear here. Guarded defensively rather than asserted, since detectFixed's inputs
    // are plain data with no type-level link between the two audits.
    /* v8 ignore next */
    if (!post) return []
    if (post.outcomes.some((outcome) => outcome.status === 'VIOLATION')) return []
    const passOutcome = post.outcomes.find((outcome) => outcome.status === 'PASS')
    return passOutcome ? [{ code: state.item.code, message: passOutcome.message }] : []
  })
}
