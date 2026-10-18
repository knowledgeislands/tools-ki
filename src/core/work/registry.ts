import { lstat, readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { parse } from 'yaml'
import { REPOSITORY_DECLARATION_FILE, readRepositoryDeclaration } from '../configuration/index.ts'
import { inspectLocalRegistry } from '../storage/index.ts'
import { resolveTerritoryCapital } from '../territory/resolution.ts'
import { parseRegistryReference, type RegistryReference } from './items.ts'

/** A territory's Project registry: each Project's theme, and every declared theme. */
export interface ProjectRegistry {
  readonly root: string
  readonly projects: ReadonlyMap<string, string | undefined>
  /** Each registered Project's declared `lifecycle`, such as `active` or `paused`. */
  readonly lifecycles: ReadonlyMap<string, string>
  readonly themes: ReadonlySet<string>
  /** One line per thread-model shape still read during the tolerance window, naming its new home. */
  readonly legacy: readonly string[]
}

export type ProjectRegistryLookup = { readonly registry: ProjectRegistry } | { readonly unavailable: string }

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const PROJECTS_DIRECTORY = join('Streams', 'Projects')
const THEMES_DIRECTORY = join('Streams', 'Themes')
const INITIATIVES_DIRECTORY = join('Streams', 'Initiatives')
const INDEX_NOTES = new Set(['Projects.md', 'Themes.md', 'Initiatives.md'])

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

interface RegistryNote {
  readonly name: string
  readonly text: string
  readonly values?: Record<string, unknown>
  /** Set for a thread-model folder note, `<slug>/<slug>.md`, read under the name `<slug>.md`. */
  readonly folder?: true
}

/**
 * Regular Markdown notes directly inside one registry folder, in name order, as name and frontmatter. A thread-model
 * folder note `<slug>/<slug>.md` stays readable during the tolerance window, under the name `<slug>.md`.
 */
const registryNotes = async (directory: string): Promise<readonly RegistryNote[]> => {
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
            return (await isFile(path)) ? [{ name: `${name}.md`, path, folder: true as const }] : []
          })
      )
    ).flat()
  ].sort((left, right) => left.name.localeCompare(right.name))
  return Promise.all(
    notes.map(async ({ name, path, ...rest }) => {
      const text = await readFile(path, 'utf8')
      const values = frontmatter(text)
      return { name, text, ...(values ? { values } : {}), ...('folder' in rest ? { folder: true as const } : {}) }
    })
  )
}

/**
 * Reads the Capital's `Streams/Projects/` and `Streams/Themes/` registry through runtime registry discovery. Any
 * missing step is returned as an unavailable reason for the caller to report as a warning; it never fails a listing.
 * The thread-model shapes, `Streams/Initiatives/`, Project folder notes, `initiative:` and the retired
 * `Streams/Projects/Initiatives.md` index, stay readable with a warning during the work model's tolerance window.
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
  const themesDirectory = join(root, THEMES_DIRECTORY)
  const initiativesDirectory = join(root, INITIATIVES_DIRECTORY)
  const directories = [projectsDirectory, themesDirectory, initiativesDirectory]
  if (!(await Promise.all(directories.map(isDirectory))).some(Boolean))
    return { unavailable: `the capital has no ${PROJECTS_DIRECTORY}/ or ${THEMES_DIRECTORY}/ registry` }
  const projects = new Map<string, string | undefined>()
  const lifecycles = new Map<string, string>()
  const themes = new Set<string>()
  const legacy: string[] = []
  const folderNotes: string[] = []
  const initiativeKeys: string[] = []
  for (const { name, text, values, folder } of await registryNotes(projectsDirectory)) {
    if (name === 'Initiatives.md') {
      legacy.push('Streams/Projects/Initiatives.md is retired; keep one theme page per theme in Streams/Themes/')
      const declared = Array.isArray(values?.['initiatives']) ? (values['initiatives'] as unknown[]) : []
      for (const slug of declared) if (typeof slug === 'string' && SLUG.test(slug)) themes.add(slug)
      for (const match of text.matchAll(/^Slug `([a-z0-9]+(?:-[a-z0-9]+)*)`\./gm)) themes.add(match[1] as string)
      continue
    }
    if (INDEX_NOTES.has(name) || values?.['note_type'] !== 'streams/project') continue
    const slug = values['slug']
    if (typeof slug !== 'string' || !SLUG.test(slug)) continue
    const declared = typeof values['theme'] === 'string' ? values['theme'] : undefined
    const initiative = typeof values['initiative'] === 'string' ? values['initiative'] : undefined
    if (initiative !== undefined) initiativeKeys.push(slug)
    if (folder) folderNotes.push(slug)
    const theme = declared ?? initiative
    projects.set(slug, theme)
    if (typeof values['lifecycle'] === 'string') lifecycles.set(slug, values['lifecycle'])
    if (theme) themes.add(theme)
  }
  for (const { name, values } of await registryNotes(themesDirectory)) {
    if (INDEX_NOTES.has(name) || values?.['note_type'] !== 'streams/theme') continue
    const slug = values['slug']
    if (typeof slug === 'string' && SLUG.test(slug)) themes.add(slug)
  }
  const initiatives: string[] = []
  for (const { name, values } of await registryNotes(initiativesDirectory)) {
    if (INDEX_NOTES.has(name) || values?.['note_type'] !== 'streams/initiative') continue
    const slug = values['slug']
    if (typeof slug !== 'string' || !SLUG.test(slug)) continue
    themes.add(slug)
    initiatives.push(slug)
  }
  if (initiatives.length)
    legacy.push(
      `Streams/Initiatives/ is the thread-model registry; move ${initiatives.join(', ')} to theme pages in Streams/Themes/`
    )
  if (folderNotes.length)
    legacy.push(`Project folder notes ${folderNotes.join(', ')}; make each a flat Streams/Projects/<slug>.md`)
  if (initiativeKeys.length) legacy.push(`Project notes ${initiativeKeys.join(', ')} name initiative; rename it theme`)
  return { registry: { root, projects, lifecycles, themes, legacy } }
}

export type RoadmapGrouping = 'project' | 'theme' | 'area'

/** Records with no resolvable Project or theme group here explicitly rather than disappearing. */
export const UNASSIGNED_GROUP = 'unassigned'

/**
 * A grouped slug's registry identity, so that listings across repositories merge one Project or theme however
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
 * Groups one record by Project, or by theme derived from its Project through the registry, with a projectless
 * record under its direct `theme`. A qualified reference resolves in its named territory and keeps its qualifier
 * unless that territory is the repository's own. Unknown slugs and registry contradictions are warnings, never failures.
 */
export const workItemGroup = (
  item: { readonly project?: string; readonly theme?: string },
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
  const theme = item.theme === undefined ? undefined : (parseRegistryReference(item.theme) as RegistryReference)
  const projectRegistry = project && registries(project.territory)
  const themeRegistry = theme && registries(theme.territory)
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
    if (!registered) return { group: UNASSIGNED_GROUP, warning: `project ${item.project} names no theme` }
    const group = located(
      { ...(project.territory ? { territory: project.territory } : {}), slug: registered },
      projectRegistry
    )
    return theme && themeRegistry && (theme.slug !== registered || themeRegistry.root !== projectRegistry.root)
      ? { ...group, warning: `theme ${item.theme} contradicts project ${item.project} in ${group.group}` }
      : group
  }
  const themeGroup = theme ? located(theme, themeRegistry) : { group: UNASSIGNED_GROUP }
  if (unknownProject) return { ...themeGroup, warning: unknownProject }
  if (project && !theme) return { group: UNASSIGNED_GROUP }
  const warning =
    theme && themeRegistry && !themeRegistry.themes.has(theme.slug)
      ? `theme ${item.theme} is not in the registry`
      : undefined
  return { ...themeGroup, ...(warning ? { warning } : {}) }
}
