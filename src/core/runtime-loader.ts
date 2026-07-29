// Loads and structurally validates one installed skill's canonical
// `scripts/rubric/items/index.ts` catalogue. Harness discovery has already
// established containment and rejected symlinks before this loader runs.

import { pathToFileURL } from 'node:url'
import { KiError } from './errors.ts'
import type { ResolvedSkill } from './resolution.ts'
import {
  type MechanicalRubric,
  RUBRIC_CONTRACT_VERSION,
  RUBRIC_MODULE_EXPORT,
  RUBRIC_PHASES,
  type RubricExecution,
  type RubricFamily,
  type RubricItem,
  type RubricScope,
  type SkillRubricDefinition,
  VIOLATION_LEVELS,
  type ViolationLevel
} from './rubric.ts'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const nonEmptyString = (value: unknown): value is string => typeof value === 'string' && Boolean(value)

const safeRelativePath = (value: string): boolean =>
  Boolean(value) && !value.startsWith('/') && value.split('/').every((part) => part && part !== '.' && part !== '..')

const validateScope = (value: unknown, identity: string): RubricScope => {
  if (value === undefined) return { kind: 'repository' }
  if (!isRecord(value)) throw new KiError(`${identity} rubric definition scope must be a table`, 1)
  const { kind, paths } = value
  if (kind === 'repository') return { kind: 'repository' }
  if (kind !== 'user-home' || !Array.isArray(paths) || !paths.length) throw new KiError(`${identity} rubric definition user-home scope must declare paths`, 1)
  if (paths.some((path) => typeof path !== 'string' || !safeRelativePath(path)))
    throw new KiError(`${identity} rubric definition user-home scope paths must be safe relative paths`, 1)
  if (new Set(paths).size !== paths.length) throw new KiError(`${identity} rubric definition user-home scope repeats a path`, 1)
  return { kind: 'user-home', paths: paths as string[] }
}

const validatePhaseExecution = <Result>(value: unknown, identity: string, code: string, aspect: 'audit' | 'conform'): RubricExecution<unknown, Result> => {
  if (!isRecord(value)) throw new KiError(`${identity} rubric item ${code} ${aspect} must be a table`, 1)
  const { phase, run } = value
  if (typeof phase !== 'string' || !(RUBRIC_PHASES as readonly string[]).includes(phase))
    throw new KiError(`${identity} rubric item ${code} ${aspect} has an invalid phase`, 1)
  if (typeof run !== 'function') throw new KiError(`${identity} rubric item ${code} ${aspect} must have a run function`, 1)
  return { phase: phase as (typeof RUBRIC_PHASES)[number], run: run as RubricExecution<unknown, Result>['run'] }
}

const validateLevels = (value: unknown, identity: string, code: string): readonly ViolationLevel[] | undefined => {
  if (!Array.isArray(value) || value.some((level) => !(VIOLATION_LEVELS as readonly unknown[]).includes(level)))
    throw new KiError(`${identity} rubric item ${code} overrideLevels must contain only FAIL or WARN`, 1)
  if (new Set(value).size !== value.length) throw new KiError(`${identity} rubric item ${code} repeats an override level`, 1)
  return value as ViolationLevel[]
}

const validateMechanical = (value: unknown, identity: string, code: string): MechanicalRubric<unknown> | undefined => {
  if (value === undefined) return undefined
  if (!isRecord(value)) throw new KiError(`${identity} rubric item ${code} mechanical aspect must be a table`, 1)
  const { level, overrideLevels, heuristic, audit, conform, conformOn } = value
  if (typeof level !== 'string' || !(VIOLATION_LEVELS as readonly string[]).includes(level))
    throw new KiError(`${identity} rubric item ${code} has an invalid level`, 1)
  if (heuristic !== undefined && typeof heuristic !== 'boolean') throw new KiError(`${identity} rubric item ${code} heuristic must be boolean`, 1)
  if (conformOn !== undefined && (!Array.isArray(conformOn) || conformOn.some((status) => status !== 'INFO') || new Set(conformOn).size !== conformOn.length))
    throw new KiError(`${identity} rubric item ${code} conformOn must contain unique INFO statuses`, 1)
  return {
    level: level as ViolationLevel,
    ...(overrideLevels === undefined ? {} : { overrideLevels: validateLevels(overrideLevels, identity, code) }),
    ...(heuristic === undefined ? {} : { heuristic }),
    audit: validatePhaseExecution(audit, identity, code, 'audit'),
    ...(conform === undefined ? {} : { conform: validatePhaseExecution(conform, identity, code, 'conform') }),
    ...(conformOn === undefined ? {} : { conformOn: conformOn as 'INFO'[] })
  }
}

const validateItem = (value: unknown, identity: string, seenCodes: Set<string>): RubricItem<unknown> => {
  if (!isRecord(value)) throw new KiError(`${identity} rubric item must be a table`, 1)
  const { code, title, description, sources, mechanical: rawMechanical, judgment: rawJudgment } = value
  if (!nonEmptyString(code)) throw new KiError(`${identity} rubric item must have a code`, 1)
  if (!nonEmptyString(title)) throw new KiError(`${identity} rubric item ${code} must have a title`, 1)
  if (!nonEmptyString(description)) throw new KiError(`${identity} rubric item ${code} must have a description`, 1)
  if (!Array.isArray(sources) || !sources.length || sources.some((source) => !nonEmptyString(source)))
    throw new KiError(`${identity} rubric item ${code} must have a non-empty sources array`, 1)
  if (seenCodes.has(code)) throw new KiError(`${identity} rubric repeats code ${code}`, 1)
  seenCodes.add(code)

  const mechanical = validateMechanical(rawMechanical, identity, code)
  let judgment: { readonly prompt: string } | undefined
  if (rawJudgment !== undefined) {
    if (!isRecord(rawJudgment)) throw new KiError(`${identity} rubric item ${code} judgment must have a prompt`, 1)
    const { prompt } = rawJudgment
    if (!nonEmptyString(prompt)) throw new KiError(`${identity} rubric item ${code} judgment must have a prompt`, 1)
    judgment = { prompt }
  }
  if (!mechanical && !judgment) throw new KiError(`${identity} rubric item ${code} must be mechanical, judgment, or both`, 1)
  return {
    code,
    title,
    description,
    sources: sources as [string, ...string[]],
    ...(mechanical ? { mechanical } : {}),
    ...(judgment ? { judgment } : {})
  }
}

const validateFamily = (value: unknown, identity: string, seenFamilies: Set<string>, seenItems: Set<string>): RubricFamily<unknown> => {
  if (!isRecord(value)) throw new KiError(`${identity} rubric family must be a table`, 1)
  const { code, title, description, standard, selectContext, items } = value
  if (!nonEmptyString(code)) throw new KiError(`${identity} rubric family must have a code`, 1)
  if (seenFamilies.has(code)) throw new KiError(`${identity} rubric repeats family ${code}`, 1)
  seenFamilies.add(code)
  if (!nonEmptyString(title)) throw new KiError(`${identity} rubric family ${code} must have a title`, 1)
  if (!nonEmptyString(description)) throw new KiError(`${identity} rubric family ${code} must have a description`, 1)
  if (!nonEmptyString(standard)) throw new KiError(`${identity} rubric family ${code} must name its standard`, 1)
  if (typeof selectContext !== 'function') throw new KiError(`${identity} rubric family ${code} must have a selectContext function`, 1)
  if (!Array.isArray(items)) throw new KiError(`${identity} rubric family ${code} must have an items array`, 1)
  return {
    code,
    title,
    description,
    standard,
    selectContext: selectContext as RubricFamily<unknown>['selectContext'],
    items: items.map((item) => validateItem(item, identity, seenItems))
  }
}

export const loadRubricDefinition = async (skill: ResolvedSkill): Promise<SkillRubricDefinition<unknown>> => {
  const { rubricModule } = skill.capability
  if (!rubricModule) throw new KiError(`${skill.identity} does not provide a rubric catalogue`, 1)
  const modulePath = `${skill.harness.root}/${rubricModule}`

  let module: Record<string, unknown>
  try {
    module = await import(pathToFileURL(modulePath).href)
  } catch {
    throw new KiError(`${skill.identity} rubric catalogue could not be imported`, 1)
  }
  const candidate = module[RUBRIC_MODULE_EXPORT]
  if (!isRecord(candidate)) throw new KiError(`${skill.identity} rubric catalogue default export is not a table`, 1)
  const { contract, name, concern, scope, createSession, families } = candidate
  if (contract !== RUBRIC_CONTRACT_VERSION) throw new KiError(`${skill.identity} rubric catalogue has an unsupported contract version`, 1)
  if (name !== skill.capability.name) throw new KiError(`${skill.identity} rubric catalogue name does not match the installed capability`, 1)
  if (!nonEmptyString(concern)) throw new KiError(`${skill.identity} rubric catalogue must name its concern`, 1)
  if (typeof createSession !== 'function') throw new KiError(`${skill.identity} rubric catalogue must have a createSession function`, 1)
  if (!Array.isArray(families)) throw new KiError(`${skill.identity} rubric catalogue must have a families array`, 1)
  const seenFamilies = new Set<string>()
  const seenItems = new Set<string>()
  return {
    contract,
    name,
    concern,
    scope: validateScope(scope, skill.identity),
    createSession: createSession as SkillRubricDefinition<unknown>['createSession'],
    families: families.map((family) => validateFamily(family, skill.identity, seenFamilies, seenItems))
  }
}
