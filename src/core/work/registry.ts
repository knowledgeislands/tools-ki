import { lstat, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import { REPOSITORY_DECLARATION_FILE, readRepositoryDeclaration } from '../configuration/index.ts'
import { inspectLocalRegistry } from '../storage/index.ts'
import { parseRegistryReference, type RegistryReference } from './items.ts'

/** A territory's Project registry: each Project's Initiative, and every declared Initiative. */
export interface ProjectRegistry {
  readonly root: string
  readonly projects: ReadonlyMap<string, string | undefined>
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
  const registry = await inspectLocalRegistry(stateDirectory)
  if (registry.state !== 'valid') return { unavailable: `the local ki registry ${registry.path} is ${registry.state}` }
  const entry = registry.repositories.find((candidate) => candidate.key === territory)
  if (!entry) return { unavailable: `territory ${territory} is not in the local ki registry` }
  const declared = await declaredIdentity(entry.path)
  return typeof declared?.capital === 'string' && declared.repository === declared.capital
    ? entry.path
    : { unavailable: `territory ${territory} is not a registered Capital checkout` }
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

/** Regular Markdown notes directly inside one registry folder, in name order, as name and frontmatter. */
const registryNotes = async (
  directory: string
): Promise<readonly { readonly name: string; readonly text: string; readonly values?: Record<string, unknown> }[]> => {
  if (!(await isDirectory(directory))) return []
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .sort((left, right) => left.name.localeCompare(right.name))
  return Promise.all(
    entries.map(async ({ name }) => {
      const text = await readFile(join(directory, name), 'utf8')
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
    if (initiative) initiatives.add(initiative)
  }
  for (const { name, values } of await registryNotes(initiativesDirectory)) {
    if (INDEX_NOTES.has(name) || values?.['note_type'] !== 'streams/initiative') continue
    const slug = values['slug']
    if (typeof slug === 'string' && SLUG.test(slug)) initiatives.add(slug)
  }
  return { registry: { root, projects, initiatives, legacyInitiativesIndex } }
}

export type RoadmapGrouping = 'project' | 'initiative' | 'area'

/** Records with no resolvable Project or Initiative group here explicitly rather than disappearing. */
export const UNASSIGNED_GROUP = 'unassigned'

export interface WorkItemGroup {
  readonly group: string
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
  const label = (reference: RegistryReference, registry: ProjectRegistry | undefined): string =>
    reference.territory && !(registry && registry.root === own?.root)
      ? `${reference.territory}/${reference.slug}`
      : reference.slug
  const project = item.project === undefined ? undefined : (parseRegistryReference(item.project) as RegistryReference)
  const initiative =
    item.initiative === undefined ? undefined : (parseRegistryReference(item.initiative) as RegistryReference)
  const projectRegistry = project && registries(project.territory)
  const initiativeRegistry = initiative && registries(initiative.territory)
  const unknownProject =
    project && projectRegistry && !projectRegistry.projects.has(project.slug)
      ? `project ${item.project} is not in the registry`
      : undefined
  if (by === 'project')
    return {
      group: project ? label(project, projectRegistry) : UNASSIGNED_GROUP,
      ...(unknownProject ? { warning: unknownProject } : {})
    }
  if (project && projectRegistry?.projects.has(project.slug)) {
    const registered = projectRegistry.projects.get(project.slug)
    if (!registered) return { group: UNASSIGNED_GROUP, warning: `project ${item.project} names no initiative` }
    const group = label(
      { ...(project.territory ? { territory: project.territory } : {}), slug: registered },
      projectRegistry
    )
    return initiative &&
      initiativeRegistry &&
      (initiative.slug !== registered || initiativeRegistry.root !== projectRegistry.root)
      ? { group, warning: `initiative ${item.initiative} contradicts project ${item.project} in ${group}` }
      : { group }
  }
  const initiativeGroup = initiative ? label(initiative, initiativeRegistry) : UNASSIGNED_GROUP
  if (unknownProject) return { group: initiativeGroup, warning: unknownProject }
  if (project && !initiative) return { group: UNASSIGNED_GROUP }
  const warning =
    initiative && initiativeRegistry && !initiativeRegistry.initiatives.has(initiative.slug)
      ? `initiative ${item.initiative} is not in the registry`
      : undefined
  return { group: initiativeGroup, ...(warning ? { warning } : {}) }
}
