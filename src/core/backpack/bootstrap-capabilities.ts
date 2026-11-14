/**
 * Required user skills for every canonical bootstrap backpack: Keystone's lead, which carries
 * `ki-keystone bootstrap`, and Work's lead, which carries the work subcommands that were once
 * skills of their own.
 */
export const minimumBootstrapUserSkills = ['ki-keystone', 'ki-work'] as const

/**
 * The skills a canonical backpack provided before the guild renames of 14 November 2026, still
 * accepted for this one release from a backpack that does not yet provide the current set.
 */
export const retiredBootstrapUserSkills = [
  'ki-bootstrap',
  'ki-next',
  'ki-plan',
  'ki-implement',
  'ki-accept',
  'ki-batch',
  'ki-recap',
  'ki-work-design'
] as const

/**
 * The bootstrap skills to require of a backpack offering `provided`: the current set, unless only
 * the retired set is wholly provided, in which case that set; a backpack with neither is held to
 * the current set, so its diagnostic names a current skill.
 */
export const bootstrapUserSkills = (provided: readonly string[]): readonly string[] => {
  const offers = (skills: readonly string[]): boolean => skills.every((skill) => provided.includes(skill))
  if (offers(minimumBootstrapUserSkills) || !offers(retiredBootstrapUserSkills)) return minimumBootstrapUserSkills
  return retiredBootstrapUserSkills
}
