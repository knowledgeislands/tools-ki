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
  const states = new Map<string, 'visiting' | 'visited'>()
  const ordered: ResolvedSkill[] = []
  const visit = (skill: ResolvedSkill): void => {
    const state = states.get(skill.declaration.name)
    if (state === 'visiting') throw new KiError(`declared skill ${skill.declaration.name} has a dependency cycle`, 1)
    if (state === 'visited') return
    states.set(skill.declaration.name, 'visiting')
    for (const dependencyName of skill.capability.dependsOn) {
      const dependency = byName.get(dependencyName)
      if (!dependency) {
        throw new KiError(`declared skill ${skill.declaration.name} requires declared dependency ${dependencyName}`, 1)
      }
      visit(dependency)
    }
    states.set(skill.declaration.name, 'visited')
    ordered.push(skill)
  }
  for (const skill of skills) visit(skill)
  return ordered
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
    if (!candidate) throw new KiError(`declared skill ${declaration.name} could not be resolved`, 1)
    return { ...candidate, declaration }
  })
  const ordered = orderedSkills(resolved)
  if (!selected) return ordered
  const selectedSkills = resolved.filter((skill) => skill.identity === selected || skill.declaration.name === selected)
  if (!selectedSkills.length) throw new KiError(`--skill must name one declared resolved skill`, 2)
  if (selectedSkills.length > 1) throw new KiError(`--skill ${selected} is ambiguous; use its qualified identity`, 2)
  const selectedNames = new Set<string>()
  const includeDependencies = (skill: ResolvedSkill): void => {
    if (selectedNames.has(skill.declaration.name)) return
    selectedNames.add(skill.declaration.name)
    for (const dependencyName of skill.capability.dependsOn) {
      const dependency = resolved.find((candidate) => candidate.declaration.name === dependencyName)
      if (dependency) includeDependencies(dependency)
    }
  }
  for (const skill of selectedSkills) includeDependencies(skill)
  return ordered.filter((skill) => selectedNames.has(skill.declaration.name))
}
