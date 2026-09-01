import type { ResolvedSkill } from '../configuration/index.ts'
import { KiError } from '../errors.ts'
import { type PackageScriptClaim, RUBRIC_PHASES, type SkillRubricDefinition } from '../rubric/index.ts'
import { loadRubricDefinition } from '../rubric/loader.ts'
import type { PreparedRubricItem, PreparedSkill } from './types.ts'

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
        RUBRIC_PHASES.indexOf(left.item.item.mechanical.audit.phase) -
        RUBRIC_PHASES.indexOf(right.item.item.mechanical.audit.phase)
      if (phaseDelta !== 0) return phaseDelta
      if (left.familyIndex !== right.familyIndex) return left.familyIndex - right.familyIndex
      return left.itemIndex - right.itemIndex
    })
    .map((entry) => entry.item)
}

export const prepareSkill = async (skill: ResolvedSkill): Promise<PreparedSkill> => {
  const definition = await loadRubricDefinition(skill)
  return { skill, definition, items: orderedMechanicalItems(definition) }
}

export const aggregatePackageScriptClaims = (prepared: readonly PreparedSkill[]): readonly PackageScriptClaim[] => {
  const claims = prepared.flatMap(({ skill, definition }) =>
    (definition.packageScripts ?? []).map((script) => ({ script, skill: skill.identity }))
  )
  claims.sort((first, second) => first.script.localeCompare(second.script) || first.skill.localeCompare(second.skill))
  for (let index = 1; index < claims.length; index += 1) {
    const previous = claims[index - 1] as PackageScriptClaim
    const current = claims[index] as PackageScriptClaim
    if (previous.script === current.script)
      throw new KiError(`package script ${current.script} is claimed by both ${previous.skill} and ${current.skill}`, 1)
  }
  return claims
}
