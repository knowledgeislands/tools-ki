import { readRepositoryDeclaration } from '../configuration/index.ts'
import { KiError } from '../errors.ts'

export type WorkItemDirectory = 'docs/roadmap' | 'Streams/Roadmap'

export interface RepositoryPlanningSource {
  readonly adapter: 'roadmap' | 'kb-streams'
  readonly directory: WorkItemDirectory
}

export const readRepositoryPlanningSource = async (configuration: string): Promise<RepositoryPlanningSource> => {
  const declaration = await readRepositoryDeclaration(configuration)
  const repository = declaration.skills.find((skill) => skill.name === 'ki-repo')
  const changeManagement = declaration.skills.find((skill) => skill.name === 'ki-work')
  const repoType = repository?.configuration['repo_type']
  const adapter = changeManagement?.configuration['adapter']

  if (repoType !== 'kb') return { adapter: 'roadmap', directory: 'docs/roadmap' }
  if (adapter !== 'kb-streams')
    throw new KiError('Knowledge Base roadmap operations require [skills.ki-work].adapter = "kb-streams"', 2)
  return { adapter, directory: 'Streams/Roadmap' }
}
