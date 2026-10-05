import { readRepositoryDeclaration } from '../../configuration/declaration.ts'
import { resolveRepositoryDeclaredSkills } from '../../configuration/local-provider.ts'
import { discoverInstalledHarnesses, type InstalledHarness } from '../../harness/inspection.ts'
import type { RepositoryLocation } from '../location.ts'
import { resolveRepositoryTargets } from '../selection.ts'
import type { RepositoryOperationContext, RepositorySelection, SelectedRepositorySkills } from './types.ts'

export const resolveSkillsForRepositories = async (
  repositories: readonly RepositoryLocation[],
  harnesses: readonly InstalledHarness[],
  skill?: string
): Promise<readonly SelectedRepositorySkills[]> =>
  Promise.all(
    repositories.map(async (repository) => {
      const declaration = await readRepositoryDeclaration(repository.declaration)
      const resolvedSkills = await resolveRepositoryDeclaredSkills(repository.root, declaration, harnesses)
      return {
        repository,
        resolvedSkills,
        skills: skill
          ? await resolveRepositoryDeclaredSkills(repository.root, declaration, harnesses, skill)
          : resolvedSkills
      }
    })
  )

export const selectRepositorySkills = async (
  context: RepositoryOperationContext,
  options: RepositorySelection
): Promise<readonly SelectedRepositorySkills[]> => {
  const repositories = await resolveRepositoryTargets({
    repositories: options.repositories,
    agora: options.agora,
    estate: options.estate,
    configurationDirectory: context.configurationDirectory,
    stateDirectory: context.stateDirectory,
    workingDirectory: context.workingDirectory,
    homeDirectory: context.homeDirectory,
    onSkippedMgitMembers: options.onSkippedMgitMembers
  })
  const harnesses = await discoverInstalledHarnesses(context.dataDirectory)
  return resolveSkillsForRepositories(repositories, harnesses, options.skill)
}
