import { lstat, realpath, stat } from 'node:fs/promises'
import { type InstalledBackpack, inspectSkillCapability } from '../backpack/inspection.ts'
import { KiError } from '../errors.ts'
import type { RepositoryDeclaration } from './declaration.ts'
import { type DataRootEvidence, type ResolvedSkill, resolveDeclaredSkills } from './resolution.ts'

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

const dataRootEvidence = async (dataDirectory: string): Promise<DataRootEvidence> => ({
  path: dataDirectory,
  exists: await stat(dataDirectory).then(
    (state) => state.isDirectory(),
    () => false
  )
})

/**
 * Resolves declarations for repository operations, admitting only the canonical
 * explicitly declared repository-local ki-self provider. The data directory is
 * named in the error for a declared backpack that is not installed.
 */
export const resolveRepositoryDeclaredSkills = async (
  repositoryRoot: string,
  declaration: RepositoryDeclaration,
  backpacks: readonly InstalledBackpack[],
  dataDirectory: string,
  selected?: string
): Promise<readonly ResolvedSkill[]> => {
  const dataRoot = await dataRootEvidence(dataDirectory)
  const declared = declaration.skills.some((skill) => skill.name === repositoryLocalSkillName)
  if (!declared) return resolveDeclaredSkills(declaration, backpacks, dataRoot, selected)

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

  return resolveDeclaredSkills(declaration, backpacks, dataRoot, selected, [
    {
      provider: { kind: 'repository-local', root },
      capability
    }
  ])
}
