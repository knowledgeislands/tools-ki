import type { RubricScope } from '../rubric/index.ts'
import type { PreparedSkill, SkillEducationResult } from './types.ts'

/** Loads a declared skill's validated rubric catalogue without constructing evidence or executing an item. */
export const educateSkill = async (prepared: PreparedSkill): Promise<SkillEducationResult> => {
  return {
    identity: prepared.skill.identity,
    concern: prepared.definition.concern,
    scope: prepared.definition.scope as RubricScope,
    families: prepared.definition.families
  }
}
