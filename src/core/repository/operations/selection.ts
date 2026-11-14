import { discoverInstalledBackpacks, type InstalledBackpack } from '../../backpack/inspection.ts'
import { readRepositoryDeclaration } from '../../configuration/declaration.ts'
import { resolveRepositoryDeclaredSkills } from '../../configuration/local-provider.ts'
import type { RepositoryLocation } from '../location.ts'
import { resolveRepositoryTargets } from '../selection.ts'
import type { RepositoryOperationContext, RepositorySelection, SelectedRepositorySkills } from './types.ts'

export const resolveSkillsForRepositories = async (
  repositories: readonly RepositoryLocation[],
  backpacks: readonly InstalledBackpack[],
  dataDirectory: string,
  skill?: string
): Promise<readonly SelectedRepositorySkills[]> =>
  Promise.all(
    repositories.map(async (repository) => {
      const declaration = await readRepositoryDeclaration(repository.declaration)
      const resolvedSkills = await resolveRepositoryDeclaredSkills(
        repository.root,
        declaration,
        backpacks,
        dataDirectory
      )
      return {
        repository,
        resolvedSkills,
        skills: skill
          ? await resolveRepositoryDeclaredSkills(repository.root, declaration, backpacks, dataDirectory, skill)
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
    territory: options.territory,
    filters: options.filters,
    estate: options.estate,
    principals: options.principals,
    configurationDirectory: context.configurationDirectory,
    stateDirectory: context.stateDirectory,
    workingDirectory: context.workingDirectory,
    homeDirectory: context.homeDirectory,
    onSkippedMgitMembers: options.onSkippedMgitMembers
  })
  const backpacks = await discoverInstalledBackpacks(context.dataDirectory)
  return resolveSkillsForRepositories(repositories, backpacks, context.dataDirectory, options.skill)
}
