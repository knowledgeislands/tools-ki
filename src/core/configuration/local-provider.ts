import { lstat, realpath } from 'node:fs/promises'
import { KiError } from '../errors.ts'
import { type InstalledHarness, inspectSkillCapability } from '../harness/index.ts'
import type { RepositoryDeclaration } from './declaration.ts'
import { type ResolvedSkill, resolveDeclaredSkills } from './resolution.ts'

const repositoryLocalSkillName = 'ki-self'
const repositoryLocalSkillSource = '.agents/skills/ki-self'

const physicalRepositoryRoot = async (root: string): Promise<string> => {
  const state = await lstat(root).catch(
    /* v8 ignore next -- every caller receives an existing physical root from resolveRepositoryTargets. */
    () => undefined
  )
  /* v8 ignore next -- every caller receives an existing physical root from resolveRepositoryTargets. */
  if (!state?.isDirectory() || state.isSymbolicLink()) {
    throw new KiError('repository-local skill root must be a physical directory', 1)
  }
  return realpath(root)
}

/**
 * Resolves declarations for repository operations, admitting only the canonical
 * explicitly declared repository-local ki-self provider.
 */
export const resolveRepositoryDeclaredSkills = async (
  repositoryRoot: string,
  declaration: RepositoryDeclaration,
  harnesses: readonly InstalledHarness[],
  selected?: string
): Promise<readonly ResolvedSkill[]> => {
  const declared = declaration.skills.some((skill) => skill.name === repositoryLocalSkillName)
  if (!declared) return resolveDeclaredSkills(declaration, harnesses, selected)

  const root = await physicalRepositoryRoot(repositoryRoot)
  const capability = await inspectSkillCapability(root, repositoryLocalSkillSource)
  if (capability.name !== repositoryLocalSkillName) {
    throw new KiError(
      `repository-local skill ${repositoryLocalSkillSource}/SKILL.md must name ${repositoryLocalSkillName}`,
      1
    )
  }
  if (!capability.rubricModule) {
    throw new KiError(`repository-local skill ${repositoryLocalSkillName} does not provide rubric catalogue`, 1)
  }

  return resolveDeclaredSkills(declaration, harnesses, selected, [
    {
      provider: { kind: 'repository-local', root },
      capability
    }
  ])
}
