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
  const selectedSkills = resolved.filter((skill) => skill.identity === selected || skill.declaration.name === selected)
  if (!selectedSkills.length) throw new KiError(`--skill must name one declared resolved skill`, 2)
  /* v8 ignore next -- each declared skill's name/identity is unique per repository configuration, so selectedSkills can never exceed 1. */
  if (selectedSkills.length > 1) throw new KiError(`--skill ${selected} is ambiguous; use its qualified identity`, 2)
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
  for (const skill of selectedSkills) includeDependencies(skill)
  return ordered.filter((skill) => selectedNames.has(skill.declaration.name))
}

/** Resolve user configuration's explicit `owner/repo:skill` selections without consulting a repository declaration. */
export const resolveConfiguredUserSkills = (
  identities: readonly string[],
  harnesses: readonly InstalledHarness[],
  selected?: string
): readonly ResolvedSkill[] => {
  const resolved = identities.map((identity) => {
    const separator = identity.lastIndexOf(':')
    const harnessId = identity.slice(0, separator)
    const name = identity.slice(separator + 1)
    if (separator <= 0 || !name) throw new KiError(`configured user skill ${identity} must use owner/repo:skill`, 1)
    const harness = harnesses.find((candidate) => candidate.id === harnessId)
    if (!harness) throw new KiError(`configured user skill ${identity} requires installed harness ${harnessId}`, 1)
    const capability = harness.capabilities.find((candidate) => candidate.kind === 'skill' && candidate.name === name)
    if (!capability) throw new KiError(`configured user skill ${identity} is not provided by harness ${harnessId}`, 1)
    return { identity, declaration: { name, configuration: {} }, harness, capability }
  })
  return resolveSelectedSkills(orderedSkills(resolved), selected)
}

const resolveSelectedSkills = (ordered: readonly ResolvedSkill[], selected?: string): readonly ResolvedSkill[] => {
  if (!selected) return ordered
  const selectedSkills = ordered.filter((skill) => skill.identity === selected || skill.declaration.name === selected)
  if (!selectedSkills.length) throw new KiError(`--skill must name one configured resolved skill`, 2)
  /* v8 ignore next -- configured skill names are TOML table keys and are unique; full identities are unique by construction. */
  if (selectedSkills.length > 1) throw new KiError(`--skill ${selected} is ambiguous; use its qualified identity`, 2)
  const selectedNames = new Set<string>()
  const includeDependencies = (skill: ResolvedSkill): void => {
    if (selectedNames.has(skill.declaration.name)) return
    selectedNames.add(skill.declaration.name)
    for (const dependencyName of skill.capability.dependsOn) {
      const dependency = ordered.find((candidate) => candidate.declaration.name === dependencyName)
      // orderedSkills() already checked every declared dependency before this selection pass.
      /* v8 ignore next */
      if (dependency) includeDependencies(dependency)
    }
  }
  for (const skill of selectedSkills) includeDependencies(skill)
  return ordered.filter((skill) => selectedNames.has(skill.declaration.name))
}
