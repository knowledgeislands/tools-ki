import { dirname } from 'node:path'
import { declaredRepositoryKind, readRepositoryDeclaration } from '../configuration/index.ts'
import { KiError } from '../errors.ts'

export type WorkItemDirectory = 'docs/roadmap' | 'Streams/Roadmap'
export type RepositoryPlanningAdapter = 'roadmap' | 'kb-streams'

export interface RepositoryPlanningSource {
  readonly adapter: RepositoryPlanningAdapter
  readonly directory: WorkItemDirectory
}

const adapterSkills = {
  roadmap: 'ki-work-roadmap',
  'kb-streams': 'ki-repo-kb-streams',
  'github-issues': 'ki-work-github-issues',
  linear: 'ki-work-linear'
} as const

type DeclaredAdapter = keyof typeof adapterSkills

const isDeclaredAdapter = (value: unknown): value is DeclaredAdapter =>
  typeof value === 'string' && Object.hasOwn(adapterSkills, value)

/**
 * Resolves the local roadmap only from the declared `[skills.ki-work]` adapter and its adapter table; it never infers
 * one from a directory. Returns undefined when no adapter is declared or the declared adapter keeps work remotely.
 */
export const readDeclaredPlanningSource = async (
  configuration: string
): Promise<RepositoryPlanningSource | undefined> => {
  const declaration = await readRepositoryDeclaration(configuration)
  const work = declaration.skills.find((skill) => skill.name === 'ki-work')
  if (!work) return undefined
  const adapter = work.configuration['adapter']
  if (!isDeclaredAdapter(adapter))
    throw new KiError(
      `[skills.ki-work].adapter must be one of ${Object.keys(adapterSkills)
        .map((name) => `"${name}"`)
        .join(', ')}`,
      2
    )
  const kind = declaredRepositoryKind(declaration)
  if ((adapter === 'roadmap' && kind !== 'project') || (adapter === 'kb-streams' && kind !== 'kb'))
    throw new KiError(`[skills.ki-work].adapter = "${adapter}" does not apply to repo_type = "${kind}"`, 2)
  const skill = adapterSkills[adapter]
  if (!declaration.skills.some(({ name }) => name === skill))
    throw new KiError(`[skills.ki-work].adapter = "${adapter}" requires [skills.${skill}]`, 2)
  if (adapter === 'roadmap') return { adapter, directory: 'docs/roadmap' }
  if (adapter === 'kb-streams') return { adapter, directory: 'Streams/Roadmap' }
  return undefined
}

/** Resolves the declared local roadmap for an operation that cannot proceed without one. */
export const readRepositoryPlanningSource = async (configuration: string): Promise<RepositoryPlanningSource> => {
  const planning = await readDeclaredPlanningSource(configuration)
  if (!planning) throw new KiError(`repository ${dirname(configuration)} declares no local roadmap adapter`, 2)
  return planning
}
