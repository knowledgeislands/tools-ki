// Executes a loaded rubric definition (CLI-004 T1.2): runs mechanical items' audit in
// phase order, renders findings, and — for conform — collects ConformProposals from
// violated items into host-owned guarded publication (see ./transaction.ts). Judgment items
// are catalogue data only; the runtime never executes them.

import { type lstat, realpath } from 'node:fs/promises'
import { KiError } from './errors.ts'
import type { ResolvedSkill } from './resolution.ts'
import {
  type AuditOutcome,
  type ConformCommand,
  RUBRIC_PHASES,
  type RubricFamily,
  type RubricItem,
  type RubricPublication,
  type RubricScope,
  type RubricSession,
  type RubricSubject,
  type SkillRubricDefinition
} from './rubric.ts'
import { prepareRubricPublication } from './rubric-publication.ts'
import { loadRubricDefinition } from './runtime-loader.ts'
import type { NativeWrite } from './transaction.ts'

export interface RepositoryRuntimeScope {
  readonly kind: 'repository'
  readonly repository: string
  readonly userHome: string
  readonly lstat: typeof lstat
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

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const validateRubricSession = (value: unknown, definition: SkillRubricDefinition<unknown>, identity: string): RubricSession<unknown> => {
  if (!isRecord(value)) throw new KiError(`${identity} rubric context must return a session table`, 1)
  const { subjects, proposal } = value
  if (!Array.isArray(subjects)) throw new KiError(`${identity} rubric session must contain a subjects array`, 1)
  if (typeof proposal !== 'function') throw new KiError(`${identity} rubric session must provide a proposal function`, 1)
  const familyCodes = new Set(definition.families.map(({ code }) => code))
  const validatedSubjects = subjects.map((subject, index): RubricSubject<unknown> => {
    if (!isRecord(subject)) throw new KiError(`${identity} rubric subject ${index} must be a table`, 1)
    const { context, families, subject: label } = subject
    if (typeof context !== 'function') throw new KiError(`${identity} rubric subject ${index} must provide a context function`, 1)
    if (!Array.isArray(families) || families.some((family) => typeof family !== 'string' || !familyCodes.has(family)))
      throw new KiError(`${identity} rubric subject ${index} families must name only declared rubric families`, 1)
    if (new Set(families).size !== families.length) throw new KiError(`${identity} rubric subject ${index} repeats a family`, 1)
    if (label !== undefined && typeof label !== 'string') throw new KiError(`${identity} rubric subject ${index} has an invalid subject label`, 1)
    return {
      context: context as RubricSubject<unknown>['context'],
      families: families as string[],
      ...(label === undefined ? {} : { subject: label })
    }
  })
  return {
    subjects: validatedSubjects,
    proposal: proposal as RubricSession<unknown>['proposal']
  }
}

const validateOutcome = (value: unknown, item: PreparedRubricItem, index: number): AuditOutcome => {
  const { code, mechanical } = item.item
  if (!isRecord(value)) throw new KiError(`rubric item ${code} audit outcome ${index} must be a table`, 1)
  const { status, message, subject, level } = value
  if (status !== 'PASS' && status !== 'VIOLATION' && status !== 'NOT_APPLICABLE' && status !== 'INFO')
    throw new KiError(`rubric item ${code} audit outcome ${index} has an invalid status`, 1)
  if (typeof message !== 'string' || !message) throw new KiError(`rubric item ${code} audit outcome ${index} must have a message`, 1)
  if (subject !== undefined && typeof subject !== 'string') throw new KiError(`rubric item ${code} audit outcome ${index} has an invalid subject`, 1)
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

export const validateConformProposal = (
  value: unknown,
  identity: string
): { readonly writes: readonly NativeWrite[]; readonly commands: readonly ConformCommand[] } => {
  if (!isRecord(value)) throw new KiError(`${identity} rubric session proposal must return a table`, 1)
  const { writes, commands = [] } = value
  if (!Array.isArray(writes)) throw new KiError(`${identity} rubric session proposal must return a writes array`, 1)
  if (!Array.isArray(commands)) throw new KiError(`${identity} rubric session proposal commands must be an array`, 1)
  const validatedWrites = writes.map((write, index) => {
    if (!isRecord(write)) throw new KiError(`${identity} rubric session proposal write ${index} must have string path and content`, 1)
    const { path, content, create } = write
    if (typeof path !== 'string' || typeof content !== 'string')
      throw new KiError(`${identity} rubric session proposal write ${index} must have string path and content`, 1)
    if (create !== undefined && typeof create !== 'boolean') throw new KiError(`${identity} rubric session proposal write ${index} create must be boolean`, 1)
    return create ? { path, content, create } : { path, content }
  })
  const validatedCommands = commands.map((command, index) => {
    if (!isRecord(command)) throw new KiError(`${identity} rubric session proposal command ${index} must have a program and arguments`, 1)
    const { program, arguments: arguments_ } = command
    if (typeof program !== 'string' || !validProgram.test(program) || !Array.isArray(arguments_))
      throw new KiError(`${identity} rubric session proposal command ${index} must have a program and arguments`, 1)
    if (arguments_.some((argument) => typeof argument !== 'string' || argument.includes('\0')))
      throw new KiError(`${identity} rubric session proposal command ${index} arguments must be strings without NUL bytes`, 1)
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
      const phaseDelta = RUBRIC_PHASES.indexOf(left.item.item.mechanical.audit.phase) - RUBRIC_PHASES.indexOf(right.item.item.mechanical.audit.phase)
      if (phaseDelta !== 0) return phaseDelta
      if (left.familyIndex !== right.familyIndex) return left.familyIndex - right.familyIndex
      return left.itemIndex - right.itemIndex
    })
    .map((entry) => entry.item)
}

const findingForOutcome = (prepared: PreparedRubricItem, outcome: AuditOutcome): Finding => {
  const { item } = prepared
  const violationLevel = outcome.level ?? item.mechanical.level
  const level: FindingLevel =
    outcome.status === 'PASS'
      ? 'pass'
      : outcome.status === 'NOT_APPLICABLE'
        ? 'not-applicable'
        : outcome.status === 'INFO'
          ? 'info'
          : violationLevel === 'FAIL'
            ? 'fail'
            : 'warn'
  return outcome.subject === undefined
    ? { level, code: item.code, title: item.title, message: outcome.message }
    : { level, code: item.code, title: item.title, message: outcome.message, subject: outcome.subject }
}

const applicableSubjects = (session: RubricSession<unknown>, family: RubricFamily<unknown>): readonly RubricSubject<unknown>[] =>
  session.subjects.filter((subject) => subject.families.includes(family.code))

const auditSubject = async (item: PreparedRubricItem, subject: RubricSubject<unknown>): Promise<SubjectAuditState> => {
  const rootContext = await subject.context()
  const context = await item.family.selectContext(rootContext)
  const raw = await item.item.mechanical.audit.run(context)
  if (!Array.isArray(raw)) throw new KiError(`rubric item ${item.code} audit must return an outcomes array`, 1)
  const outcomes = raw.map((outcome, index) => {
    const validated = validateOutcome(outcome, item, index)
    return validated.subject === undefined && subject.subject !== undefined ? { ...validated, subject: subject.subject } : validated
  })
  return { subject, outcomes }
}

const auditItem = async (item: PreparedRubricItem, session: RubricSession<unknown>): Promise<ItemAuditState> => {
  const subjects: SubjectAuditState[] = []
  for (const subject of applicableSubjects(session, item.family)) subjects.push(await auditSubject(item, subject))
  return { item, subjects, outcomes: subjects.flatMap(({ outcomes }) => outcomes) }
}

interface InternalAudit {
  readonly session: RubricSession<unknown>
  readonly items: readonly ItemAuditState[]
  readonly findings: readonly Finding[]
  readonly scope: RubricScope
  readonly publication: { write?: NativeWrite; conforming: boolean }
}

export const prepareSkill = async (skill: ResolvedSkill): Promise<PreparedSkill> => {
  const definition = await loadRubricDefinition(skill)
  return { skill, definition, items: orderedMechanicalItems(definition) }
}

const auditSkill = async (
  scope: RuntimeScope,
  prepared: PreparedSkill,
  mode: 'audit' | 'conform',
  onItemComplete?: (item: PreparedRubricItem) => void
): Promise<InternalAudit> => {
  const { skill, definition, items: plannedItems } = prepared
  const definitionScope = definition.scope as RubricScope
  if (definitionScope.kind === 'user-home') {
    const state = await scope.lstat(scope.userHome).catch(() => undefined)
    if (!state?.isDirectory() || state.isSymbolicLink()) throw new KiError('user home must be an existing physical directory', 1)
    scope = { ...scope, userHome: await realpath(scope.userHome) }
  }
  const preparedPublication = await prepareRubricPublication(skill, definition, scope.repository, scope.lstat)
  const publicationDraft: { write?: NativeWrite; conforming: boolean } = { conforming: false }
  const publication: RubricPublication = {
    ...preparedPublication.evidence,
    propose: () => {
      if (mode !== 'conform' || !publicationDraft.conforming) throw new KiError('rubric publication can be proposed only from a conform action', 1)
      publicationDraft.write = preparedPublication.proposal()
    }
  }
  const session = validateRubricSession(
    await definition.createSession({
      mode,
      repository: scope.repository,
      userHome: scope.userHome,
      configuration: skill.declaration.configuration,
      publication
    }),
    definition,
    skill.identity
  )
  const items: ItemAuditState[] = []
  for (const item of plannedItems) {
    items.push(await auditItem(item, session))
    onItemComplete?.(item)
  }
  const findings = items.flatMap((state) =>
    state.outcomes.flatMap((outcome) => {
      return [findingForOutcome(state.item, outcome)]
    })
  )
  return { session, items, findings, scope: definitionScope, publication: publicationDraft }
}

export const runSkillAudit = async (
  scope: RuntimeScope,
  prepared: PreparedSkill,
  onItemComplete?: (item: PreparedRubricItem) => void
): Promise<SkillAuditResult> => {
  const { items, findings } = await auditSkill(scope, prepared, 'audit', onItemComplete)
  return { findings, items }
}

/** Loads a declared skill's validated rubric catalogue without constructing evidence or executing an item. */
export const educateSkill = async (prepared: PreparedSkill): Promise<SkillEducationResult> => {
  return {
    identity: prepared.skill.identity,
    concern: prepared.definition.concern,
    scope: prepared.definition.scope as RubricScope,
    families: prepared.definition.families
  }
}

const attemptConform = async (state: ItemAuditState, publication: { write?: NativeWrite; conforming: boolean }): Promise<boolean> => {
  const { family, item } = state.item
  const conform = item.mechanical.conform as NonNullable<typeof item.mechanical.conform>
  let attempted = false
  for (const audited of state.subjects) {
    const conformable = audited.outcomes.some(
      (outcome) => outcome.status === 'VIOLATION' || (outcome.status === 'INFO' && item.mechanical.conformOn?.includes('INFO'))
    )
    if (!conformable) continue
    const rootContext = await audited.subject.context()
    const context = await family.selectContext(rootContext)
    publication.conforming = true
    try {
      await conform.run(context)
    } finally {
      publication.conforming = false
    }
    attempted = true
  }
  return attempted
}

export const runSkillConform = async (
  scope: RuntimeScope,
  prepared: PreparedSkill,
  onItemComplete?: (item: PreparedRubricItem) => void
): Promise<SkillConformResult> => {
  const { session, items, scope: definitionScope, publication } = await auditSkill(scope, prepared, 'conform', onItemComplete)
  const conformOrder = items
    .filter((state) => state.item.item.mechanical.conform)
    .slice()
    // The filter above guarantees conform is present; the fallback only protects a future filter refactor.
    /* v8 ignore next */
    .sort((left, right) => {
      const phaseDelta =
        RUBRIC_PHASES.indexOf((left.item.item.mechanical.conform as NonNullable<typeof left.item.item.mechanical.conform>).phase) -
        RUBRIC_PHASES.indexOf((right.item.item.mechanical.conform as NonNullable<typeof right.item.item.mechanical.conform>).phase)
      if (phaseDelta !== 0) return phaseDelta
      if (left.item.familyIndex !== right.item.familyIndex) return left.item.familyIndex - right.item.familyIndex
      return left.item.itemIndex - right.item.itemIndex
    })
  const attempted = new Set<string>()
  for (const state of conformOrder) if (await attemptConform(state, publication)) attempted.add(state.item.code)

  const findings: Finding[] = []
  const fixable: ItemAuditState[] = []
  const proposal = attempted.size
    ? validateConformProposal(await session.proposal(), prepared.skill.identity)
    : { writes: [] as readonly NativeWrite[], commands: [] as readonly ConformCommand[] }
  const writes = attempted.size && publication.write !== undefined ? [...proposal.writes, publication.write] : proposal.writes
  const proposed = writes.length > 0 || proposal.commands.length > 0
  items.forEach((state) => {
    if (proposed && attempted.has(state.item.code)) {
      fixable.push(state)
      return
    }
    for (const outcome of state.outcomes) {
      findings.push(findingForOutcome(state.item, outcome))
    }
  })
  return { findings, writes, commands: proposal.commands, scope: definitionScope, fixable }
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
