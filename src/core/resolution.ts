import type { DeclaredSkill } from './configuration.ts'
import { KiError } from './errors.ts'
import type { HarnessCapability, InstalledHarness } from './harness.ts'

export interface ResolvedSkill {
  readonly identity: string
  readonly declaration: DeclaredSkill
  readonly harness: InstalledHarness
  readonly capability: HarnessCapability
}

const skillCandidates = (harnesses: readonly InstalledHarness[], name: string): readonly ResolvedSkill[] =>
  harnesses.flatMap((harness) =>
    harness.capabilities
      .filter((capability) => capability.kind === 'skill' && capability.name === name)
      .map((capability) => ({
        identity: `${harness.id}:${capability.name}`,
        declaration: { name, configuration: {} },
        harness,
        capability
      }))
  )

const orderedSkills = (skills: readonly ResolvedSkill[]): readonly ResolvedSkill[] => {
  const byName = new Map(skills.map((skill) => [skill.declaration.name, skill]))
  const remaining = new Map(
    [...skills]
      .sort((left, right) => left.declaration.name.localeCompare(right.declaration.name))
      .map((skill) => [skill.declaration.name, { skill, dependencies: new Set(skill.capability.dependsOn) }])
  )
  const ordered: ResolvedSkill[] = []
  for (const [name, { dependencies }] of remaining) {
    for (const dependencyName of dependencies) {
      if (!byName.has(dependencyName)) {
        throw new KiError(`declared skill ${name} requires declared dependency ${dependencyName}`, 1)
      }
    }
  }
  while (remaining.size) {
    const next = [...remaining.values()]
      .filter(({ dependencies }) => dependencies.size === 0)
      .sort((left, right) => left.skill.declaration.name.localeCompare(right.skill.declaration.name))[0]
    if (!next) {
      const [name] = [...remaining.keys()].sort()
      /* v8 ignore next -- remaining is non-empty and its sorted key set therefore has a first member. */
      if (!name) throw new KiError('declared skills have a dependency cycle', 1)
      throw new KiError(`declared skill ${name} has a dependency cycle`, 1)
    }
    const name = next.skill.declaration.name
    remaining.delete(name)
    ordered.push(next.skill)
    for (const candidate of remaining.values()) candidate.dependencies.delete(name)
  }
  return ordered
}

/** Resolves one installed skill by capability name, independent of any repository declaration — the same duplicate/unknown-provider guards `ki skill user add` applies. */
export const resolveInstalledSkill = (harnesses: readonly InstalledHarness[], name: string): ResolvedSkill => {
  const candidates = skillCandidates(harnesses, name)
  if (!candidates.length) throw new KiError(`no installed harness provides skill ${name}`, 1)
  if (candidates.length > 1) throw new KiError(`skill ${name} is provided by multiple installed harnesses`, 1)
  const [candidate] = candidates
  /* v8 ignore next -- candidates.length is exactly 1 here (0 and >1 are both handled above); defends only against a future refactor. */
  if (!candidate) throw new KiError(`skill ${name} could not be resolved`, 1)
  return candidate
}

export const resolveDeclaredSkills = (
  declarations: readonly DeclaredSkill[],
  harnesses: readonly InstalledHarness[],
  selected?: string
): readonly ResolvedSkill[] => {
  const resolved = declarations.map((declaration) => {
    const candidates = skillCandidates(harnesses, declaration.name)
    if (!candidates.length) {
      throw new KiError(
        `declared skill ${declaration.name} is not available from an installed harness; install the harness that provides it before auditing`,
        1
      )
    }
    if (candidates.length > 1)
      throw new KiError(`declared skill ${declaration.name} is ambiguous; qualify its harness before activation`, 1)
    const candidate = candidates[0]
    /* v8 ignore next -- candidates.length is exactly 1 here (0 and >1 are both handled above); defends only against a future refactor. */
    if (!candidate) throw new KiError(`declared skill ${declaration.name} could not be resolved`, 1)
    return { ...candidate, declaration }
  })
  const ordered = orderedSkills(resolved)
  if (!selected) return ordered
  const selectedSkill = resolved.find((skill) => skill.identity === selected || skill.declaration.name === selected)
  if (!selectedSkill) throw new KiError(`--skill must name one declared resolved skill`, 2)
  const selectedNames = new Set<string>()
  const includeDependencies = (skill: ResolvedSkill): void => {
    if (selectedNames.has(skill.declaration.name)) return
    selectedNames.add(skill.declaration.name)
    for (const dependencyName of skill.capability.dependsOn) {
      const dependency = resolved.find((candidate) => candidate.declaration.name === dependencyName)
      // Dependency existence was already validated by orderedSkills() above, so dependency is always found here.
      /* v8 ignore next */
      if (dependency) includeDependencies(dependency)
    }
  }
  includeDependencies(selectedSkill)
  return ordered.filter((skill) => selectedNames.has(skill.declaration.name))
}
