// Executes a loaded rubric definition (CLI-004 T1.2): runs mechanical items' audit in
// phase order, renders findings, and — for conform — collects RepairProposals from
// violated items into the host-owned transaction (see ./transaction.ts). Judgment items
// are catalogue data only; the runtime never executes them.

import { KiError } from './errors.ts'
import type { ResolvedSkill } from './resolution.ts'
import {
  type AuditOutcome,
  type MechanicalRubricItem,
  type RepairCommand,
  RUBRIC_PHASES,
  type RubricScope,
  type SkillRubricDefinition
} from './rubric.ts'
import { loadRubricDefinition } from './runtime-loader.ts'
import type { NativeWrite } from './transaction.ts'

export interface RepositoryRuntimeScope {
  readonly kind: 'repository'
  readonly repository: string
}

export interface UserRuntimeScope {
  readonly kind: 'user-home'
  readonly userHome: string
}

export type RuntimeScope = RepositoryRuntimeScope | UserRuntimeScope

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
  readonly commands: readonly RepairCommand[]
  readonly scope: RubricScope
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

const validProgram = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

export const validateRepairProposal = (
  value: unknown,
  code: string
): { readonly writes: readonly NativeWrite[]; readonly commands: readonly RepairCommand[] } => {
  if (!isRecord(value)) throw new KiError(`rubric item ${code} repair must return a table`, 1)
  const { writes, commands = [] } = value
  if (!Array.isArray(writes)) throw new KiError(`rubric item ${code} repair must return a writes array`, 1)
  if (!Array.isArray(commands)) throw new KiError(`rubric item ${code} repair commands must be an array`, 1)
  const validatedWrites = writes.map((write, index) => {
    if (!isRecord(write)) throw new KiError(`rubric item ${code} repair write ${index} must have string path and content`, 1)
    const { path, content, create } = write
    if (typeof path !== 'string' || typeof content !== 'string')
      throw new KiError(`rubric item ${code} repair write ${index} must have string path and content`, 1)
    if (create !== undefined && typeof create !== 'boolean')
      throw new KiError(`rubric item ${code} repair write ${index} create must be boolean`, 1)
    return create ? { path, content, create } : { path, content }
  })
  const validatedCommands = commands.map((command, index) => {
    if (!isRecord(command)) throw new KiError(`rubric item ${code} repair command ${index} must have a program and arguments`, 1)
    const { program, arguments: arguments_ } = command
    if (typeof program !== 'string' || !validProgram.test(program) || !Array.isArray(arguments_))
      throw new KiError(`rubric item ${code} repair command ${index} must have a program and arguments`, 1)
    if (arguments_.some((argument) => typeof argument !== 'string' || argument.includes('\0')))
      throw new KiError(`rubric item ${code} repair command ${index} arguments must be strings without NUL bytes`, 1)
    return { program, arguments: arguments_ }
  })
  return { writes: validatedWrites, commands: validatedCommands }
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
  readonly scope: RubricScope
}

const auditSkill = async (scope: RuntimeScope, skill: ResolvedSkill): Promise<InternalAudit> => {
  const definition = await loadRubricDefinition(skill)
  const definitionScope: RubricScope = definition.scope ?? { kind: 'repository' }
  if (definitionScope.kind !== scope.kind)
    throw new KiError(`${skill.identity} declares ${definitionScope.kind} scope and cannot run in ${scope.kind} mode`, 1)
  const context = await definition.createContext(
    scope.kind === 'repository'
      ? { repository: scope.repository, configuration: skill.declaration.configuration }
      : { userHome: scope.userHome, configuration: skill.declaration.configuration }
  )
  const items = await Promise.all(orderedMechanicalItems(definition).map((item) => auditItem(item, context)))
  const findings = items.flatMap((state) =>
    state.outcomes.flatMap((outcome) => {
      const finding = findingForOutcome(state.item, outcome)
      return finding ? [finding] : []
    })
  )
  return { context, items, findings, scope: definitionScope }
}

export const runSkillAudit = async (scope: RuntimeScope, skill: ResolvedSkill): Promise<SkillAuditResult> => {
  const { items, findings } = await auditSkill(scope, skill)
  return { findings, items }
}

// A violated item that declares a repair is only actually "fixed this round" once its
// repair proposes at least one write — an empty proposal means it had nothing safe to
// change, so its violation still surfaces like any other unaddressed finding below.
const attemptRepair = async (
  state: ItemAuditState,
  context: unknown
): Promise<{ readonly writes: readonly NativeWrite[]; readonly commands: readonly RepairCommand[] } | undefined> => {
  if (!state.item.repair || !state.outcomes.some((outcome) => outcome.status === 'VIOLATION')) return undefined
  const repair = validateRepairProposal(await state.item.repair(context), state.item.code)
  return repair.writes.length || repair.commands.length ? repair : undefined
}

export const runSkillConform = async (scope: RuntimeScope, skill: ResolvedSkill): Promise<SkillConformResult> => {
  const { context, items, scope: definitionScope } = await auditSkill(scope, skill)
  const attempts = await Promise.all(items.map((state) => attemptRepair(state, context)))

  const findings: NativeFinding[] = []
  const writes: NativeWrite[] = []
  const commands: RepairCommand[] = []
  const fixable: ItemAuditState[] = []
  items.forEach((state, index) => {
    const proposed = attempts[index]
    if (proposed) {
      writes.push(...proposed.writes)
      commands.push(...proposed.commands)
      fixable.push(state)
      return
    }
    for (const outcome of state.outcomes) {
      const finding = findingForOutcome(state.item, outcome)
      if (finding) findings.push(finding)
    }
  })
  return { findings, writes, commands, scope: definitionScope, fixable }
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
