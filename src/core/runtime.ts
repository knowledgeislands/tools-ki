// Executes a loaded rubric definition (CLI-004 T1.2): runs mechanical items' audit in
// phase order, renders findings, and — for conform — collects RepairProposals from
// violated items into the host-owned transaction (see ./transaction.ts). Judgment items
// are catalogue data only; the runtime never executes them.

import { lstat, realpath } from 'node:fs/promises'
import { KiError } from './errors.ts'
import type { ResolvedSkill } from './resolution.ts'
import {
  type AuditOutcome,
  type RepairCommand,
  RUBRIC_PHASES,
  type RubricFamily,
  type RubricItem,
  type RubricScope,
  type SkillRubricDefinition
} from './rubric.ts'
import { loadRubricDefinition } from './runtime-loader.ts'
import type { NativeWrite } from './transaction.ts'

export interface RepositoryRuntimeScope {
  readonly kind: 'repository'
  readonly repository: string
  readonly userHome: string
}

export type RuntimeScope = RepositoryRuntimeScope

export interface Finding {
  readonly level: 'fail' | 'warn' | 'info'
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
  readonly commands: readonly RepairCommand[]
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

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const validateOutcome = (value: unknown, item: PreparedRubricItem, index: number): AuditOutcome => {
  const { code, mechanical } = item.item
  if (!isRecord(value)) throw new KiError(`rubric item ${code} audit outcome ${index} must be a table`, 1)
  const { status, message, subject, level } = value
  if (status !== 'PASS' && status !== 'VIOLATION' && status !== 'NOT_APPLICABLE' && status !== 'INFO')
    throw new KiError(`rubric item ${code} audit outcome ${index} has an invalid status`, 1)
  if (typeof message !== 'string' || !message) throw new KiError(`rubric item ${code} audit outcome ${index} must have a message`, 1)
  if (subject !== undefined && typeof subject !== 'string')
    throw new KiError(`rubric item ${code} audit outcome ${index} has an invalid subject`, 1)
  if (level !== undefined) {
    if (status !== 'VIOLATION') throw new KiError(`rubric item ${code} audit outcome ${index} sets a level outside VIOLATION`, 1)
    if ((level !== 'FAIL' && level !== 'WARN') || (level !== mechanical.level && !mechanical.overrideLevels?.includes(level)))
      throw new KiError(`rubric item ${code} audit outcome ${index} uses an undeclared level`, 1)
  }
  return {
    status,
    message,
    ...(subject === undefined ? {} : { subject }),
    ...(level === undefined ? {} : { level: level as 'FAIL' | 'WARN' })
  }
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
  readonly item: PreparedRubricItem
  readonly familyIndex: number
  readonly itemIndex: number
}

const orderedMechanicalItems = (definition: SkillRubricDefinition<unknown>): readonly PreparedRubricItem[] => {
  const entries: OrderedItem[] = []
  definition.families.forEach((family, familyIndex) => {
    family.items.forEach((item, itemIndex) => {
      if (item.mechanical) {
        entries.push({
          item: { family, item: item as PreparedRubricItem['item'], code: item.code, familyIndex, itemIndex },
          familyIndex,
          itemIndex
        })
      }
    })
  })
  return entries
    .slice()
    .sort((left, right) => {
      const phaseDelta =
        RUBRIC_PHASES.indexOf(left.item.item.mechanical.audit.phase) - RUBRIC_PHASES.indexOf(right.item.item.mechanical.audit.phase)
      if (phaseDelta !== 0) return phaseDelta
      if (left.familyIndex !== right.familyIndex) return left.familyIndex - right.familyIndex
      return left.itemIndex - right.itemIndex
    })
    .map((entry) => entry.item)
}

const findingForOutcome = (prepared: PreparedRubricItem, outcome: AuditOutcome): Finding | undefined => {
  const { item } = prepared
  if (outcome.status === 'PASS' || outcome.status === 'NOT_APPLICABLE') return undefined
  const violationLevel = outcome.level ?? item.mechanical.level
  const level = outcome.status === 'INFO' ? 'info' : violationLevel === 'FAIL' ? 'fail' : 'warn'
  return outcome.subject === undefined
    ? { level, code: item.code, title: item.title, message: outcome.message }
    : { level, code: item.code, title: item.title, message: outcome.message, subject: outcome.subject }
}

const auditItem = async (item: PreparedRubricItem, rootContext: unknown): Promise<ItemAuditState> => {
  const context = await item.family.selectContext(rootContext)
  const raw = await item.item.mechanical.audit.run(context)
  if (!Array.isArray(raw)) throw new KiError(`rubric item ${item.code} audit must return an outcomes array`, 1)
  return { item, outcomes: raw.map((outcome, index) => validateOutcome(outcome, item, index)) }
}

interface InternalAudit {
  readonly context: unknown
  readonly items: readonly ItemAuditState[]
  readonly findings: readonly Finding[]
  readonly scope: RubricScope
}

export const prepareSkill = async (skill: ResolvedSkill): Promise<PreparedSkill> => {
  const definition = await loadRubricDefinition(skill)
  return { skill, definition, items: orderedMechanicalItems(definition) }
}

const auditSkill = async (
  scope: RuntimeScope,
  prepared: PreparedSkill,
  onItemComplete?: (item: PreparedRubricItem) => void
): Promise<InternalAudit> => {
  const { skill, definition, items: plannedItems } = prepared
  const definitionScope: RubricScope = definition.scope ?? { kind: 'repository' }
  if (definitionScope.kind === 'user-home') {
    const state = await lstat(scope.userHome).catch(() => undefined)
    if (!state?.isDirectory() || state.isSymbolicLink()) throw new KiError('user home must be an existing physical directory', 1)
    scope = { ...scope, userHome: await realpath(scope.userHome) }
  }
  const context = await definition.createContext({
    repository: scope.repository,
    userHome: scope.userHome,
    configuration: skill.declaration.configuration
  })
  const items: ItemAuditState[] = []
  for (const item of plannedItems) {
    items.push(await auditItem(item, context))
    onItemComplete?.(item)
  }
  const findings = items.flatMap((state) =>
    state.outcomes.flatMap((outcome) => {
      const finding = findingForOutcome(state.item, outcome)
      return finding ? [finding] : []
    })
  )
  return { context, items, findings, scope: definitionScope }
}

export const runSkillAudit = async (
  scope: RuntimeScope,
  prepared: PreparedSkill,
  onItemComplete?: (item: PreparedRubricItem) => void
): Promise<SkillAuditResult> => {
  const { items, findings } = await auditSkill(scope, prepared, onItemComplete)
  return { findings, items }
}

/** Loads a declared skill's validated rubric catalogue without constructing evidence or executing an item. */
export const educateSkill = async (prepared: PreparedSkill): Promise<SkillEducationResult> => {
  return {
    identity: prepared.skill.identity,
    concern: prepared.definition.concern,
    scope: prepared.definition.scope ?? { kind: 'repository' },
    families: prepared.definition.families
  }
}

// A violated item that declares a repair is only actually "fixed this round" once its
// repair proposes at least one write — an empty proposal means it had nothing safe to
// change, so its violation still surfaces like any other unaddressed finding below.
const attemptRepair = async (
  state: ItemAuditState,
  rootContext: unknown
): Promise<{ readonly writes: readonly NativeWrite[]; readonly commands: readonly RepairCommand[] } | undefined> => {
  const { family, item } = state.item
  const repairable = state.outcomes.some(
    (outcome) => outcome.status === 'VIOLATION' || (outcome.status === 'INFO' && item.mechanical.repairOn?.includes('INFO'))
  )
  if (!item.mechanical.repair || !repairable) return undefined
  const context = await family.selectContext(rootContext)
  const repair = validateRepairProposal(await item.mechanical.repair.run(context), item.code)
  return repair.writes.length || repair.commands.length ? repair : undefined
}

export const runSkillConform = async (
  scope: RuntimeScope,
  prepared: PreparedSkill,
  onItemComplete?: (item: PreparedRubricItem) => void
): Promise<SkillConformResult> => {
  const { context, items, scope: definitionScope } = await auditSkill(scope, prepared, onItemComplete)
  const repairOrder = items
    .filter((state) => state.item.item.mechanical.repair)
    .slice()
    .sort((left, right) => {
      const phaseDelta =
        RUBRIC_PHASES.indexOf(left.item.item.mechanical.repair?.phase ?? 'NORMALISE') -
        RUBRIC_PHASES.indexOf(right.item.item.mechanical.repair?.phase ?? 'NORMALISE')
      if (phaseDelta !== 0) return phaseDelta
      if (left.item.familyIndex !== right.item.familyIndex) return left.item.familyIndex - right.item.familyIndex
      return left.item.itemIndex - right.item.itemIndex
    })
  const attempts = new Map<string, Awaited<ReturnType<typeof attemptRepair>>>()
  for (const state of repairOrder) attempts.set(state.item.code, await attemptRepair(state, context))

  const findings: Finding[] = []
  const writes: NativeWrite[] = []
  const commands: RepairCommand[] = []
  const fixable: ItemAuditState[] = []
  items.forEach((state) => {
    const proposed = attempts.get(state.item.code)
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
    if (!passOutcome) return []
    return passOutcome.subject === undefined
      ? [{ code: state.item.code, title: state.item.item.title, message: passOutcome.message }]
      : [{ code: state.item.code, title: state.item.item.title, message: passOutcome.message, subject: passOutcome.subject }]
  })
}
