import { readRepositoryDeclaration, resolveDeclaredSkills } from '../../configuration/index.ts'
import { discoverInstalledHarnesses, type InstalledHarness } from '../../harness/index.ts'
import { type RepositoryLocation, resolveRepositoryTargets } from '../index.ts'
import type { RepositoryOperationContext, RepositorySelection, SelectedRepositorySkills } from './types.ts'

export const resolveSkillsForRepositories = async (
  repositories: readonly RepositoryLocation[],
  harnesses: readonly InstalledHarness[],
  skill?: string
): Promise<readonly SelectedRepositorySkills[]> =>
  Promise.all(
    repositories.map(async (repository) => ({
      repository,
      skills: resolveDeclaredSkills(await readRepositoryDeclaration(repository.configuration), harnesses, skill)
    }))
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
    homeDirectory: context.homeDirectory
  })
  const harnesses = await discoverInstalledHarnesses(context.dataDirectory)
  return resolveSkillsForRepositories(repositories, harnesses, options.skill)
}
