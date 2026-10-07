import { dirname } from 'node:path'
import { declaredRepositoryKind, readRepositoryDeclaration } from '../configuration/index.ts'
import { KiError } from '../errors.ts'

export type WorkItemDirectory = 'docs/roadmap' | 'Streams/Roadmap'
export type RepositoryPlanningAdapter = 'roadmap' | 'kb-streams'

export interface RepositoryPlanningSource {
  readonly adapter: RepositoryPlanningAdapter
  readonly directory: WorkItemDirectory
  /** The `[skills.ki-work-roadmap].components` vocabulary; empty when undeclared, so no `component` is valid. */
  readonly components: ReadonlySet<string>
}

const adapterSkills = {
  roadmap: 'ki-work-roadmap',
  'kb-streams': 'ki-repo-kb-streams',
  'github-issues': 'ki-work-github-issues',
  linear: 'ki-work-linear'
} as const

type DeclaredAdapter = keyof typeof adapterSkills

const COMPONENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Reads the repository-owned component vocabulary the shared record model checks `component` against. */
const declaredComponents = (configuration: Readonly<Record<string, unknown>> | undefined): ReadonlySet<string> => {
  const components = configuration?.['components']
  if (components === undefined) return new Set()
  if (
    !Array.isArray(components) ||
    components.some((component) => typeof component !== 'string' || !COMPONENT.test(component)) ||
    new Set(components).size !== components.length
  )
    throw new KiError('[skills.ki-work-roadmap].components must list unique lowercase kebab-case names', 2)
  return new Set(components as string[])
}

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
  if (adapter !== 'roadmap' && adapter !== 'kb-streams') return undefined
  const components = declaredComponents(
    declaration.skills.find(({ name }) => name === 'ki-work-roadmap')?.configuration
  )
  return { adapter, directory: adapter === 'roadmap' ? 'docs/roadmap' : 'Streams/Roadmap', components }
}

/** Resolves the declared local roadmap for an operation that cannot proceed without one. */
export const readRepositoryPlanningSource = async (configuration: string): Promise<RepositoryPlanningSource> => {
  const planning = await readDeclaredPlanningSource(configuration)
  if (!planning) throw new KiError(`repository ${dirname(configuration)} declares no local roadmap adapter`, 2)
  return planning
}
