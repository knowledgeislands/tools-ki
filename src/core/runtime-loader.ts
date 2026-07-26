// Loads and structurally validates one installed skill's `scripts/rubric/index.ts`
// module against the versioned contract in ./rubric.ts (CLI-004 T1.2). Validation
// happens once, at load time, so the executor can trust the shape of everything it
// walks afterward — a malformed or hostile payload fails closed here, not mid-audit.
//
// Containment and symlink safety for the module path are already enforced by
// harness.ts's payload discovery (enumeratePayloadFiles walks every file under
// `skills/`, including `scripts/rubric/index.ts`, and rejects any symlink or
// escape before `capability.rubricModule` is ever populated) — this loader trusts
// that guarantee rather than re-checking the filesystem.

import { pathToFileURL } from 'node:url'
import { KiError } from './errors.ts'
import type { ResolvedSkill } from './resolution.ts'
import {
  type MechanicalRubricItem,
  RUBRIC_CONTRACT_VERSION,
  RUBRIC_MODULE_EXPORT,
  RUBRIC_PHASES,
  type RubricFamily,
  type RubricItem,
  type SkillRubricDefinition,
  VIOLATION_LEVELS
} from './rubric.ts'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const validateMechanicalItem = (
  value: Record<string, unknown>,
  code: string,
  title: string,
  identity: string
): MechanicalRubricItem<unknown> => {
  const { level, phase, audit, repair } = value
  if (typeof level !== 'string' || !(VIOLATION_LEVELS as readonly string[]).includes(level))
    throw new KiError(`${identity} rubric item ${code} has an invalid level`, 1)
  if (typeof phase !== 'string' || !(RUBRIC_PHASES as readonly string[]).includes(phase))
    throw new KiError(`${identity} rubric item ${code} has an invalid phase`, 1)
  if (typeof audit !== 'function') throw new KiError(`${identity} rubric item ${code} must have an audit function`, 1)
  if (repair !== undefined && typeof repair !== 'function')
    throw new KiError(`${identity} rubric item ${code} repair must be a function`, 1)
  return {
    kind: 'mechanical',
    code,
    title,
    level: level as MechanicalRubricItem<unknown>['level'],
    phase: phase as MechanicalRubricItem<unknown>['phase'],
    audit: audit as MechanicalRubricItem<unknown>['audit'],
    repair: repair as MechanicalRubricItem<unknown>['repair']
  }
}

const validateItem = (value: unknown, identity: string, seenCodes: Set<string>): RubricItem<unknown> => {
  if (!isRecord(value)) throw new KiError(`${identity} rubric item must be a table`, 1)
  const { kind, code, title } = value
  if (typeof code !== 'string' || !code) throw new KiError(`${identity} rubric item must have a code`, 1)
  if (typeof title !== 'string' || !title) throw new KiError(`${identity} rubric item ${code} must have a title`, 1)
  if (seenCodes.has(code)) throw new KiError(`${identity} rubric repeats code ${code}`, 1)
  seenCodes.add(code)

  if (kind === 'judgment') {
    const { prompt } = value
    if (typeof prompt !== 'string' || !prompt) throw new KiError(`${identity} rubric item ${code} must have a prompt`, 1)
    return { kind, code, title, prompt }
  }

  if (kind !== 'mechanical') throw new KiError(`${identity} rubric item ${code} has an invalid kind`, 1)
  return validateMechanicalItem(value, code, title, identity)
}

const validateFamily = (value: unknown, identity: string, seenCodes: Set<string>): RubricFamily<unknown> => {
  if (!isRecord(value)) throw new KiError(`${identity} rubric family must be a table`, 1)
  const { code, title, items } = value
  if (typeof code !== 'string' || !code) throw new KiError(`${identity} rubric family must have a code`, 1)
  if (typeof title !== 'string' || !title) throw new KiError(`${identity} rubric family ${code} must have a title`, 1)
  if (!Array.isArray(items)) throw new KiError(`${identity} rubric family ${code} must have an items array`, 1)
  return { code, title, items: items.map((item) => validateItem(item, identity, seenCodes)) }
}

export const loadRubricDefinition = async (skill: ResolvedSkill): Promise<SkillRubricDefinition<unknown>> => {
  const { rubricModule } = skill.capability
  if (!rubricModule) throw new KiError(`${skill.identity} does not provide a native rubric definition`, 1)
  const modulePath = `${skill.harness.root}/${rubricModule}`

  let module: Record<string, unknown>
  try {
    module = await import(pathToFileURL(modulePath).href)
  } catch {
    throw new KiError(`${skill.identity} rubric definition could not be imported`, 1)
  }
  const candidate = module[RUBRIC_MODULE_EXPORT]
  if (!isRecord(candidate)) throw new KiError(`${skill.identity} rubric definition export is not a table`, 1)
  const { contract, skill: definedSkill, createContext, families } = candidate
  if (contract !== RUBRIC_CONTRACT_VERSION) throw new KiError(`${skill.identity} rubric definition has an unsupported contract version`, 1)
  if (definedSkill !== skill.capability.name)
    throw new KiError(`${skill.identity} rubric definition skill does not match the installed capability`, 1)
  if (typeof createContext !== 'function') throw new KiError(`${skill.identity} rubric definition must have a createContext function`, 1)
  if (!Array.isArray(families)) throw new KiError(`${skill.identity} rubric definition must have a families array`, 1)
  const seenCodes = new Set<string>()
  return {
    contract,
    skill: definedSkill,
    createContext: createContext as SkillRubricDefinition<unknown>['createContext'],
    families: families.map((family) => validateFamily(family, skill.identity, seenCodes))
  }
}
