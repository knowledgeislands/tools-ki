import { inspectUserConfiguration } from '../../agents/index.ts'
import { createRepositorySkillActivation } from '../../agents/repository-skill-activation.ts'
import type { KiContext } from '../../context.ts'
import type { RepositoryOperationContext } from '../../core/repository/index.ts'

export const repositoryOperationContext = (
  context: KiContext,
  progress: RepositoryOperationContext['progress']
): RepositoryOperationContext => ({
  configurationDirectory: context.paths.config,
  dataDirectory: context.paths.data,
  stateDirectory: context.paths.state,
  workingDirectory: context.workingDirectory,
  homeDirectory: context.homeDirectory,
  lstat: context.lstat,
  inspectUserConfiguration,
  createSkillActivation: (options) =>
    createRepositorySkillActivation({
      configurationDirectory: context.paths.config,
      homeDirectory: context.homeDirectory,
      ...options
    }),
  progress
})
