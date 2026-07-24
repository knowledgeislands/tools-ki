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
    harness.manifest.capabilities
      .filter((capability) => capability.kind === 'skill' && capability.name === name)
      .map((capability) => ({
        identity: `${harness.manifest.id}:${capability.name}`,
        declaration: { name, configuration: {} },
        harness,
        capability
      }))
  )

export const resolveDeclaredSkills = (
  declarations: readonly DeclaredSkill[],
  harnesses: readonly InstalledHarness[],
  selected?: string
): readonly ResolvedSkill[] => {
  const resolved = declarations.map((declaration) => {
    const candidates = skillCandidates(harnesses, declaration.name)
    if (!candidates.length) {
      throw new KiError(
        `declared skill ${declaration.name} is not available from a verified installed harness; install the harness that provides it before auditing`,
        1
      )
    }
    if (candidates.length > 1)
      throw new KiError(`declared skill ${declaration.name} is ambiguous; qualify its harness before activation`, 1)
    const candidate = candidates[0]
    if (!candidate) throw new KiError(`declared skill ${declaration.name} could not be resolved`, 1)
    return { ...candidate, declaration }
  })
  if (!selected) return resolved
  const selectedSkills = resolved.filter((skill) => skill.identity === selected || skill.declaration.name === selected)
  if (!selectedSkills.length) throw new KiError(`--skill must name one declared resolved skill`, 2)
  if (selectedSkills.length > 1) throw new KiError(`--skill ${selected} is ambiguous; use its qualified identity`, 2)
  return selectedSkills
}
