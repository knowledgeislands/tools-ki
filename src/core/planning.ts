import { readRepositoryDeclaration } from './configuration.ts'
import { KiError } from './errors.ts'

export type WorkItemDirectory = 'docs/roadmap' | 'Streams/Roadmap'

export interface RepositoryPlanningSource {
  readonly adapter: 'roadmap' | 'kb-streams'
  readonly directory: WorkItemDirectory
}

export const readRepositoryPlanningSource = async (configuration: string): Promise<RepositoryPlanningSource> => {
  const declaration = await readRepositoryDeclaration(configuration)
  const repository = declaration.skills.find((skill) => skill.name === 'ki-repo')
  const changeManagement = declaration.skills.find((skill) => skill.name === 'ki-change-management')
  const repoType = repository?.configuration['repo_type']
  const adapter = changeManagement?.configuration['adapter']

  if (repoType !== 'kb') return { adapter: 'roadmap', directory: 'docs/roadmap' }
  if (adapter !== 'kb-streams')
    throw new KiError(
      'Knowledge Base roadmap operations require [skills.ki-change-management].adapter = "kb-streams"',
      2
    )
  return { adapter, directory: 'Streams/Roadmap' }
}
