import { KiError } from '../errors.ts'
import type { HarnessCapability, InstalledHarness } from '../harness/index.ts'
import type { DeclaredSkill, RepositoryDeclaration } from './declaration.ts'

export interface InstalledHarnessSkillProvider {
  readonly kind: 'installed-harness'
  readonly root: string
  readonly harness: InstalledHarness
}

export interface RepositoryLocalSkillProvider {
  readonly kind: 'repository-local'
  readonly root: string
}

export type ResolvedSkillProvider = InstalledHarnessSkillProvider | RepositoryLocalSkillProvider

export interface RepositoryLocalSkillCandidate {
  readonly provider: RepositoryLocalSkillProvider
  readonly capability: HarnessCapability
}

export interface ResolvedSkill {
  readonly identity: string
  readonly declaration: DeclaredSkill
  readonly provider: ResolvedSkillProvider
  readonly capability: HarnessCapability
}

const installedProvider = (harness: InstalledHarness): InstalledHarnessSkillProvider => ({
  kind: 'installed-harness',
  root: harness.root,
  harness
})

const skillCandidates = (harnesses: readonly InstalledHarness[], name: string): readonly ResolvedSkill[] =>
  harnesses.flatMap((harness) =>
    harness.capabilities
      .filter((capability) => capability.kind === 'skill' && capability.name === name)
      .map((capability) => ({
        identity: `${harness.id}:${capability.name}`,
        declaration: { key: name, name, configuration: {} },
        provider: installedProvider(harness),
        capability
      }))
  )

const orderedSkills = (skills: readonly ResolvedSkill[]): readonly ResolvedSkill[] => {
  const byName = new Map(skills.map((skill) => [skill.declaration.name, skill]))
  const remaining = new Map(
    [...skills]
      .sort((left, right) => left.declaration.name.localeCompare(right.declaration.name))
      .map((skill) => [
        skill.declaration.name,
        {
          skill,
          dependencies: new Set([
            ...skill.capability.dependsOn,
            ...skill.capability.optionalDependsOn.filter((name) => byName.has(name))
          ])
        }
      ])
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

/** Resolves one installed skill by capability name, independent of any repository declaration. */
export const resolveInstalledSkill = (harnesses: readonly InstalledHarness[], name: string): ResolvedSkill => {
  const [candidate] = skillCandidates(harnesses, name)
  if (!candidate) throw new KiError(`no installed harness provides skill ${name}`, 1)
  return candidate
}

const providedSkill = (harness: InstalledHarness, name: string): HarnessCapability | undefined =>
  harness.capabilities.find((candidate) => candidate.kind === 'skill' && candidate.name === name)

/**
 * Binds each declaration to its explicit provider. Portable names resolve only
 * against declared installed Harnesses; the caller may additionally supply the
 * one physically inspected repository-local provider.
 */
export const resolveDeclaredSkills = (
  declaration: RepositoryDeclaration,
  harnesses: readonly InstalledHarness[],
  selected?: string,
  localCandidates: readonly RepositoryLocalSkillCandidate[] = []
): readonly ResolvedSkill[] => {
  const declared = declaration.harnesses.flatMap((id) => harnesses.filter((candidate) => candidate.id === id))
  const absent = declaration.harnesses.filter((id) => !harnesses.some((candidate) => candidate.id === id))
  const resolved = declaration.skills.map((skill) => {
    const local = localCandidates.find((candidate) => candidate.capability.name === skill.name)
    if (local) {
      return {
        identity: `repository-local:${local.capability.name}`,
        declaration: skill,
        provider: local.provider,
        capability: local.capability
      }
    }

    const providers = declared.flatMap((harness) => {
      const capability = providedSkill(harness, skill.name)
      return capability ? [{ harness, capability }] : []
    })
    const [provider] = providers
    if (!provider) {
      throw new KiError(
        `declared skill ${skill.name} is provided by no declared harness (${declaration.harnesses.join(', ')})${
          absent.length ? `; ${absent.join(', ')} is not installed` : ''
        }`,
        1
      )
    }
    return {
      identity: `${provider.harness.id}:${skill.name}`,
      declaration: skill,
      provider: installedProvider(provider.harness),
      capability: provider.capability
    }
  })
  const ordered = orderedSkills(resolved)
  if (!selected) return ordered

  const selectedSkill = resolved.find((skill) => skill.declaration.name === selected)
  if (!selectedSkill) throw new KiError('--skill must name one declared resolved skill', 2)
  const selectedNames = new Set<string>()
  const includeDependencies = (skill: ResolvedSkill): void => {
    if (selectedNames.has(skill.declaration.name)) return
    selectedNames.add(skill.declaration.name)
    for (const dependencyName of skill.capability.dependsOn) {
      const dependency = resolved.find((candidate) => candidate.declaration.name === dependencyName)
      // Dependency existence is already validated by orderedSkills() above, so dependency is always found here.
      /* v8 ignore next */
      if (dependency) includeDependencies(dependency)
    }
    for (const dependencyName of skill.capability.optionalDependsOn) {
      const dependency = resolved.find((candidate) => candidate.declaration.name === dependencyName)
      if (dependency) includeDependencies(dependency)
    }
  }
  includeDependencies(selectedSkill)
  return ordered.filter((skill) => selectedNames.has(skill.declaration.name))
}
