import { realpath } from 'node:fs/promises'
import { stripVTControlCharacters } from 'node:util'
import { KiError } from '../errors.ts'
import type {
  AuditOutcome,
  RubricFamily,
  RubricProgressEvent,
  RubricPublication,
  RubricScope,
  RubricSession,
  RubricSubject,
  SkillRubricDefinition
} from '../rubric/index.ts'
import { prepareRubricPublication } from '../rubric/publication.ts'
import type {
  EvidenceProgress,
  Finding,
  FindingLevel,
  GatheredSkillAudit,
  ItemAuditState,
  ItemProgress,
  PreparedRubricItem,
  PreparedSkill,
  RubricProgressReport,
  RuntimeScope,
  SkillAuditResult,
  SubjectAuditState
} from './types.ts'

/** The host's own name for the span between a session being asked for and it being ready. */
export const EVIDENCE_STAGE_LABEL = 'gathering evidence'

interface InternalAudit {
  readonly session: RubricSession<unknown>
  readonly items: readonly ItemAuditState[]
  readonly findings: readonly Finding[]
  readonly scope: RubricScope
  readonly publication: GatheredSkillAudit['publication']
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * A progress event is rubric-supplied and lands directly in the host's display, so it is
 * validated exactly as an audit outcome is. A label may carry a repository path or a command
 * line, so its control characters are stripped before it can reach a terminal.
 */
const validateProgressEvent = (value: unknown, identity: string): RubricProgressReport => {
  const invalid = (detail: string): KiError => new KiError(`${identity} rubric progress event ${detail}`, 1)
  if (!isRecord(value)) throw invalid('is not an object')
  const { kind, label, code, edge, completed, total } = value
  if (typeof label !== 'string' || !label) throw invalid('has no label')
  if (code !== undefined && typeof code !== 'string') throw invalid('has a non-string code')
  const named = { label: stripVTControlCharacters(label), ...(code === undefined ? {} : { code }) }
  if (kind === 'stage') {
    if (edge !== 'start' && edge !== 'end') throw invalid('has an invalid stage edge')
    return { kind, edge, ...named }
  }
  if (kind !== 'step') throw invalid('has an unknown kind')
  if (completed === undefined && total === undefined) return { kind, ...named }
  if (typeof completed !== 'number' || typeof total !== 'number') throw invalid('reports a partial step count')
  return { kind, ...named, count: { completed, total } }
}

const validateRubricSession = (
  value: unknown,
  definition: SkillRubricDefinition<unknown>,
  identity: string
): RubricSession<unknown> => {
  if (!isRecord(value)) throw new KiError(`${identity} rubric context must return a session table`, 1)
  const { subjects, proposal } = value
  if (!Array.isArray(subjects)) throw new KiError(`${identity} rubric session must contain a subjects array`, 1)
  if (typeof proposal !== 'function')
    throw new KiError(`${identity} rubric session must provide a proposal function`, 1)
  const familyCodes = new Set(definition.families.map(({ code }) => code))
  const validatedSubjects = subjects.map((subject, index): RubricSubject<unknown> => {
    if (!isRecord(subject)) throw new KiError(`${identity} rubric subject ${index} must be a table`, 1)
    const { context, families, subject: label } = subject
    if (typeof context !== 'function')
      throw new KiError(`${identity} rubric subject ${index} must provide a context function`, 1)
    if (!Array.isArray(families) || families.some((family) => typeof family !== 'string' || !familyCodes.has(family)))
      throw new KiError(`${identity} rubric subject ${index} families must name only declared rubric families`, 1)
    if (new Set(families).size !== families.length)
      throw new KiError(`${identity} rubric subject ${index} repeats a family`, 1)
    if (label !== undefined && typeof label !== 'string')
      throw new KiError(`${identity} rubric subject ${index} has an invalid subject label`, 1)
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
  if (typeof message !== 'string' || !message)
    throw new KiError(`rubric item ${code} audit outcome ${index} must have a message`, 1)
  if (subject !== undefined && typeof subject !== 'string')
    throw new KiError(`rubric item ${code} audit outcome ${index} has an invalid subject`, 1)
  if (level !== undefined) {
    if (status !== 'VIOLATION')
      throw new KiError(`rubric item ${code} audit outcome ${index} sets a level outside VIOLATION`, 1)
    if (
      (level !== 'FAIL' && level !== 'WARN') ||
      (level !== mechanical.level && !mechanical.overrideLevels?.includes(level))
    )
      throw new KiError(`rubric item ${code} audit outcome ${index} uses an undeclared level`, 1)
  }
  return {
    status,
    message,
    ...(subject === undefined ? {} : { subject }),
    ...(level === undefined ? {} : { level: level as 'FAIL' | 'WARN' })
  }
}

export const findingForOutcome = (prepared: PreparedRubricItem, outcome: AuditOutcome): Finding => {
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

const applicableSubjects = (
  session: RubricSession<unknown>,
  family: RubricFamily<unknown>
): readonly RubricSubject<unknown>[] => session.subjects.filter((subject) => subject.families.includes(family.code))

const auditSubject = async (item: PreparedRubricItem, subject: RubricSubject<unknown>): Promise<SubjectAuditState> => {
  const rootContext = await subject.context()
  const context = await item.family.selectContext(rootContext)
  const raw = await item.item.mechanical.audit.run(context)
  if (!Array.isArray(raw)) throw new KiError(`rubric item ${item.code} audit must return an outcomes array`, 1)
  const outcomes = raw.map((outcome, index) => {
    const validated = validateOutcome(outcome, item, index)
    return validated.subject === undefined && subject.subject !== undefined
      ? { ...validated, subject: subject.subject }
      : validated
  })
  return { subject, outcomes }
}

const auditItem = async (item: PreparedRubricItem, session: RubricSession<unknown>): Promise<ItemAuditState> => {
  const subjects: SubjectAuditState[] = []
  for (const subject of applicableSubjects(session, item.family)) subjects.push(await auditSubject(item, subject))
  return { item, subjects, outcomes: subjects.flatMap(({ outcomes }) => outcomes) }
}

const gatherSkillAudit = async (
  scope: RuntimeScope,
  prepared: PreparedSkill,
  mode: 'audit' | 'conform',
  progress?: EvidenceProgress
): Promise<GatheredSkillAudit> => {
  const { skill, definition } = prepared
  const definitionScope = definition.scope as RubricScope
  if (definitionScope.kind === 'user-home') {
    const state = await scope.lstat(scope.userHome).catch(() => undefined)
    if (!state?.isDirectory() || state.isSymbolicLink())
      throw new KiError('user home must be an existing physical directory', 1)
    scope = { ...scope, userHome: await realpath(scope.userHome) }
  }
  const preparedPublication = await prepareRubricPublication(skill, definition, scope.repository, scope.lstat)
  const publicationDraft: GatheredSkillAudit['publication'] = { conforming: false }
  const publication: RubricPublication = {
    ...preparedPublication.evidence,
    propose: () => {
      if (mode !== 'conform' || !publicationDraft.conforming)
        throw new KiError('rubric publication can be proposed only from a conform action', 1)
      publicationDraft.write = preparedPublication.proposal()
    }
  }
  const emit = progress?.onProgressEvent
  emit?.({ kind: 'stage', edge: 'start', label: EVIDENCE_STAGE_LABEL })
  const session = validateRubricSession(
    await definition.createSession({
      mode,
      repository: scope.repository,
      userHome: scope.userHome,
      configuration: skill.declaration.configuration,
      packageScriptClaims: scope.packageScriptClaims,
      ...(scope.repositorySkills ? { repositorySkills: scope.repositorySkills } : {}),
      // Withheld when nothing is displaying, so a rubric can tell that emitting is pointless
      // rather than formatting reports no one will read.
      ...(emit ? { emit: (event: RubricProgressEvent) => emit(validateProgressEvent(event, skill.identity)) } : {}),
      publication
    }),
    definition,
    skill.identity
  )
  emit?.({ kind: 'stage', edge: 'end', label: EVIDENCE_STAGE_LABEL })
  return { session, scope: definitionScope, publication: publicationDraft }
}

const auditGatheredSkill = async (
  prepared: PreparedSkill,
  gathered: GatheredSkillAudit,
  progress?: ItemProgress
): Promise<InternalAudit> => {
  const { items: plannedItems } = prepared
  const { session } = gathered
  const items: ItemAuditState[] = []
  for (const item of plannedItems) {
    progress?.onItemStart?.(item)
    items.push(await auditItem(item, session))
    progress?.onItemComplete?.(item)
  }
  const findings = items.flatMap((state) =>
    state.outcomes.flatMap((outcome) => {
      return [findingForOutcome(state.item, outcome)]
    })
  )
  return { ...gathered, items, findings }
}

export const auditSkill = async (
  scope: RuntimeScope,
  prepared: PreparedSkill,
  mode: 'audit' | 'conform',
  progress?: ItemProgress
): Promise<InternalAudit> =>
  auditGatheredSkill(prepared, await gatherSkillAudit(scope, prepared, mode, progress), progress)

/** Gathers one audit session before the host starts the mechanical-item phase. */
export const gatherSkillAuditEvidence = async (
  scope: RuntimeScope,
  prepared: PreparedSkill,
  progress?: EvidenceProgress
): Promise<GatheredSkillAudit> => gatherSkillAudit(scope, prepared, 'audit', progress)

/** Runs one gathered audit session's mechanical items in its already-validated context. */
export const runGatheredSkillAudit = async (
  prepared: PreparedSkill,
  gathered: GatheredSkillAudit,
  progress?: ItemProgress
): Promise<SkillAuditResult> => {
  const { items, findings } = await auditGatheredSkill(prepared, gathered, progress)
  return { findings, items }
}

export const runSkillAudit = async (
  scope: RuntimeScope,
  prepared: PreparedSkill,
  progress?: ItemProgress
): Promise<SkillAuditResult> => {
  const { items, findings } = await auditSkill(scope, prepared, 'audit', progress)
  return { findings, items }
}
