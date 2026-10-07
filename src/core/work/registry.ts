import { lstat, readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { parse } from 'yaml'
import { REPOSITORY_DECLARATION_FILE, readRepositoryDeclaration } from '../configuration/index.ts'
import { inspectLocalRegistry } from '../storage/index.ts'
import { resolveTerritoryCapital } from '../territory/resolution.ts'
import { parseRegistryReference, type RegistryReference } from './items.ts'

/** A territory's Project registry: each Project's Initiative, and every declared Initiative. */
export interface ProjectRegistry {
  readonly root: string
  readonly projects: ReadonlyMap<string, string | undefined>
  /** Each registered Project's declared `lifecycle`, such as `active` or `paused`. */
  readonly lifecycles: ReadonlyMap<string, string>
  readonly initiatives: ReadonlySet<string>
  /** Set when Initiative slugs still come from the retired `Streams/Projects/Initiatives.md` index. */
  readonly legacyInitiativesIndex: boolean
}

export type ProjectRegistryLookup = { readonly registry: ProjectRegistry } | { readonly unavailable: string }

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PROJECTS_DIRECTORY = join('Streams', 'Projects')
const INITIATIVES_DIRECTORY = join('Streams', 'Initiatives')
const INDEX_NOTES = new Set(['Projects.md', 'Initiatives.md'])

const declaredIdentity = async (root: string): Promise<{ repository?: unknown; capital?: unknown } | undefined> => {
  try {
    const declaration = await readRepositoryDeclaration(join(root, REPOSITORY_DECLARATION_FILE))
    return declaration.skills.find((skill) => skill.name === 'ki-repo')?.configuration
  } catch {
    return undefined
  }
}

/** A named territory's Capital checkout: the local registry entry under that key, when it declares itself a Capital. */
const territoryRoot = async (territory: string, stateDirectory: string): Promise<string | { unavailable: string }> => {
  try {
    return (await resolveTerritoryCapital(stateDirectory, territory)).path
  } catch (error) {
    return { unavailable: (error as Error).message }
  }
}

/** Finds the Capital checkout: the repository itself when it is the Capital, else its registered local checkout. */
const capitalRoot = async (repository: string, stateDirectory: string): Promise<string | { unavailable: string }> => {
  const own = await declaredIdentity(repository)
  const capital = own?.capital
  if (typeof capital !== 'string') return { unavailable: 'the repository declares no ki-repo capital' }
  if (own?.repository === capital) return repository
  const registry = await inspectLocalRegistry(stateDirectory)
  if (registry.state !== 'valid') return { unavailable: `the local ki registry ${registry.path} is ${registry.state}` }
  for (const entry of registry.repositories)
    if (entry.repository === capital && (await declaredIdentity(entry.path))?.repository === capital) return entry.path
  return { unavailable: `no local checkout of the capital ${capital} is registered` }
}

const frontmatter = (text: string): Record<string, unknown> | undefined => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (!match) return undefined
  try {
    const value: unknown = parse(match[1] as string)
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

const isDirectory = async (path: string): Promise<boolean> =>
  (await lstat(path).catch(() => undefined))?.isDirectory() === true

const isFile = async (path: string): Promise<boolean> => (await lstat(path).catch(() => undefined))?.isFile() === true

/**
 * Regular Markdown notes directly inside one registry folder, in name order, as name and frontmatter. A note that holds
 * a design folder is the folder note `<slug>/<slug>.md`, read under the name `<slug>.md`.
 */
const registryNotes = async (
  directory: string
): Promise<readonly { readonly name: string; readonly text: string; readonly values?: Record<string, unknown> }[]> => {
  if (!(await isDirectory(directory))) return []
  const entries = await readdir(directory, { withFileTypes: true })
  const notes = [
    ...entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map(({ name }) => ({ name, path: join(directory, name) })),
    ...(
      await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map(async ({ name }) => {
            const path = join(directory, name, `${name}.md`)
            return (await isFile(path)) ? [{ name: `${name}.md`, path }] : []
          })
      )
    ).flat()
  ].sort((left, right) => left.name.localeCompare(right.name))
  return Promise.all(
    notes.map(async ({ name, path }) => {
      const text = await readFile(path, 'utf8')
      const values = frontmatter(text)
      return { name, text, ...(values ? { values } : {}) }
    })
  )
}

/**
 * Reads the Capital's `Streams/Projects/` and `Streams/Initiatives/` registry through runtime registry discovery. Any
 * missing step is returned as an unavailable reason for the caller to report as a warning; it never fails a listing.
 * The retired `Streams/Projects/Initiatives.md` index stays readable during the migration tolerance window.
 */
export const loadProjectRegistry = async (
  repository: string,
  stateDirectory: string
): Promise<ProjectRegistryLookup> => {
  const root = await capitalRoot(repository, stateDirectory)
  return typeof root === 'string' ? readRegistry(root) : root
}

/** Reads the registry of the territory whose Capital the local ki registry keys as `territory`, for qualified references. */
export const loadTerritoryRegistry = async (
  territory: string,
  stateDirectory: string
): Promise<ProjectRegistryLookup> => {
  const root = await territoryRoot(territory, stateDirectory)
  return typeof root === 'string' ? readRegistry(root) : root
}

const readRegistry = async (root: string): Promise<ProjectRegistryLookup> => {
  const projectsDirectory = join(root, PROJECTS_DIRECTORY)
  const initiativesDirectory = join(root, INITIATIVES_DIRECTORY)
  if (!(await isDirectory(projectsDirectory)) && !(await isDirectory(initiativesDirectory)))
    return { unavailable: `the capital has no ${PROJECTS_DIRECTORY}/ or ${INITIATIVES_DIRECTORY}/ registry` }
  const projects = new Map<string, string | undefined>()
  const lifecycles = new Map<string, string>()
  const initiatives = new Set<string>()
  let legacyInitiativesIndex = false
  for (const { name, text, values } of await registryNotes(projectsDirectory)) {
    if (name === 'Initiatives.md') {
      legacyInitiativesIndex = true
      const declared = Array.isArray(values?.['initiatives']) ? (values['initiatives'] as unknown[]) : []
      for (const slug of declared) if (typeof slug === 'string' && SLUG.test(slug)) initiatives.add(slug)
      for (const match of text.matchAll(/^Slug `([a-z0-9]+(?:-[a-z0-9]+)*)`\./gm)) initiatives.add(match[1] as string)
      continue
    }
    if (INDEX_NOTES.has(name) || values?.['note_type'] !== 'streams/project') continue
    const slug = values['slug']
    if (typeof slug !== 'string' || !SLUG.test(slug)) continue
    const initiative = typeof values['initiative'] === 'string' ? values['initiative'] : undefined
    projects.set(slug, initiative)
    if (typeof values['lifecycle'] === 'string') lifecycles.set(slug, values['lifecycle'])
    if (initiative) initiatives.add(initiative)
  }
  for (const { name, values } of await registryNotes(initiativesDirectory)) {
    if (INDEX_NOTES.has(name) || values?.['note_type'] !== 'streams/initiative') continue
    const slug = values['slug']
    if (typeof slug === 'string' && SLUG.test(slug)) initiatives.add(slug)
  }
  return { registry: { root, projects, lifecycles, initiatives, legacyInitiativesIndex } }
}

export type RoadmapGrouping = 'project' | 'initiative' | 'area'

/** Records with no resolvable Project or Initiative group here explicitly rather than disappearing. */
export const UNASSIGNED_GROUP = 'unassigned'

/**
 * A grouped slug's registry identity, so that listings across repositories merge one Project or Initiative however
 * each record spells it: `territory` is the territory's registry root, `?<name>` for a qualifier whose registry is
 * unreadable, or empty when the repository's own registry is unreadable.
 */
export interface GroupReference {
  readonly territory: string
  /** The qualifier that names the territory when a listing must disambiguate the slug. */
  readonly name?: string
  readonly slug: string
}

export interface WorkItemGroup {
  /** The label within the record's own repository: qualified only when the territory is not the repository's own. */
  readonly group: string
  readonly reference?: GroupReference
  /** The grouped Project's registry `lifecycle`, for Project groups. */
  readonly lifecycle?: string
  readonly warning?: string
}

/** The registry for a reference's territory, `undefined` for the own territory; absent when it cannot be read. */
export type TerritoryRegistries = (territory: string | undefined) => ProjectRegistry | undefined

/**
 * Groups one record by Project, or by Initiative derived from its Project through the registry, with a projectless
 * record under its direct `initiative`. A qualified reference resolves in its named territory and keeps its qualifier
 * unless that territory is the repository's own. Unknown slugs and registry contradictions are warnings, never failures.
 */
export const workItemGroup = (
  item: { readonly project?: string; readonly initiative?: string },
  by: RoadmapGrouping,
  registries: TerritoryRegistries
): WorkItemGroup => {
  const own = registries(undefined)
  const located = (reference: RegistryReference, registry: ProjectRegistry | undefined): WorkItemGroup => {
    const foreign = reference.territory !== undefined && !(registry && registry.root === own?.root)
    const name = reference.territory ?? (registry ? basename(registry.root) : undefined)
    return {
      group: foreign ? `${reference.territory}/${reference.slug}` : reference.slug,
      reference: {
        territory: registry?.root ?? (reference.territory === undefined ? '' : `?${reference.territory}`),
        ...(name ? { name } : {}),
        slug: reference.slug
      }
    }
  }
  const project = item.project === undefined ? undefined : (parseRegistryReference(item.project) as RegistryReference)
  const initiative =
    item.initiative === undefined ? undefined : (parseRegistryReference(item.initiative) as RegistryReference)
  const projectRegistry = project && registries(project.territory)
  const initiativeRegistry = initiative && registries(initiative.territory)
  const unknownProject =
    project && projectRegistry && !projectRegistry.projects.has(project.slug)
      ? `project ${item.project} is not in the registry`
      : undefined
  if (by === 'project') {
    if (!project) return { group: UNASSIGNED_GROUP }
    const lifecycle = projectRegistry?.lifecycles.get(project.slug)
    return {
      ...located(project, projectRegistry),
      ...(lifecycle ? { lifecycle } : {}),
      ...(unknownProject ? { warning: unknownProject } : {})
    }
  }
  if (project && projectRegistry?.projects.has(project.slug)) {
    const registered = projectRegistry.projects.get(project.slug)
    if (!registered) return { group: UNASSIGNED_GROUP, warning: `project ${item.project} names no initiative` }
    const group = located(
      { ...(project.territory ? { territory: project.territory } : {}), slug: registered },
      projectRegistry
    )
    return initiative &&
      initiativeRegistry &&
      (initiative.slug !== registered || initiativeRegistry.root !== projectRegistry.root)
      ? { ...group, warning: `initiative ${item.initiative} contradicts project ${item.project} in ${group.group}` }
      : group
  }
  const initiativeGroup = initiative ? located(initiative, initiativeRegistry) : { group: UNASSIGNED_GROUP }
  if (unknownProject) return { ...initiativeGroup, warning: unknownProject }
  if (project && !initiative) return { group: UNASSIGNED_GROUP }
  const warning =
    initiative && initiativeRegistry && !initiativeRegistry.initiatives.has(initiative.slug)
      ? `initiative ${item.initiative} is not in the registry`
      : undefined
  return { ...initiativeGroup, ...(warning ? { warning } : {}) }
}
