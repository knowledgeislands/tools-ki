import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import { DEFAULT_HARNESS, REPOSITORY_DECLARATION_FILE } from '../configuration/index.ts'
import { KiError } from '../errors.ts'
import { targetFromDirectory } from '../repository/location.ts'
import { type LocalRegistryEntry, requiredLocalRegistry } from '../storage/index.ts'
import { type TerritoryDeclaration, territoryDeclarationFrom } from './declaration.ts'
import { matchesDirectoryName, validateFilters } from './filters.ts'
import { readTerritoryRanking } from './ranking.ts'
import type { TerritoryMember, TerritoryProfile } from './types.ts'

export interface TerritorySelection {
  readonly territory?: string
  readonly estate?: boolean
  readonly principals?: boolean
  readonly filters: readonly string[]
  /** Report unregistered declared members on the profile instead of failing; for show and audit only. */
  readonly unregistered?: 'report'
}
/** Where selection reads the local registry and the user's territory ranking. */
export interface TerritoryDirectories {
  readonly state: string
  readonly configuration: string
}
/** Receives a diagnostic that does not stop the selection. */
export type TerritoryWarning = (message: string) => void
interface Capital {
  readonly entry: LocalRegistryEntry
  readonly declaration: TerritoryDeclaration & { readonly territory: NonNullable<TerritoryDeclaration['territory']> }
  readonly handle: string
}
const declarationAt = async (entry: LocalRegistryEntry): Promise<TerritoryDeclaration> => {
  const path = join(entry.path, REPOSITORY_DECLARATION_FILE)
  let document: Record<string, unknown>
  try {
    document = parse(await readFile(path, 'utf8'))
  } catch {
    throw new KiError(`${entry.key}: ${path} must be available and valid TOML`, 2)
  }
  const declaration = territoryDeclarationFrom(document, path)
  if (declaration.repository !== entry.repository)
    throw new KiError(
      `${entry.key}: checkout identity ${declaration.repository} differs from registered ${entry.repository}`,
      2
    )
  return declaration
}
/** Discover Capital declarations without requiring unrelated registered checkouts to be available. */
const capitals = async (entries: readonly LocalRegistryEntry[]): Promise<readonly Capital[]> => {
  const found: Capital[] = []
  for (const entry of entries) {
    let document: Record<string, unknown>
    try {
      document = parse(await readFile(join(entry.path, REPOSITORY_DECLARATION_FILE), 'utf8'))
    } catch {
      continue
    }
    const skills = document['skills'] as Record<string, unknown> | undefined
    const repo = skills?.['ki-repo'] as Record<string, unknown> | undefined
    if (!repo || (repo['capital'] !== entry.repository && repo['repository'] !== repo['capital'])) continue
    const declaration = await declarationAt(entry)
    const territory = declaration.territory as NonNullable<TerritoryDeclaration['territory']>
    found.push({ entry, declaration: { ...declaration, territory }, handle: territory.prefix ?? entry.key })
  }
  const handles = new Set<string>()
  for (const capital of found) {
    if (handles.has(capital.handle))
      throw new KiError(`territory handle ${capital.handle} is declared more than once`, 2)
    handles.add(capital.handle)
  }
  // Handles and declared aliases share one selector namespace; any collision fails before selection.
  const selectors = new Map(found.map((capital) => [capital.handle, capital]))
  for (const capital of found)
    for (const alias of capital.declaration.territory.aliases) {
      const owner = selectors.get(alias)
      if (owner)
        throw new KiError(
          `territory alias ${alias} of ${capital.handle} collides with ${owner.handle === alias ? 'the handle' : 'an alias'} of ${owner.handle}`,
          2
        )
      selectors.set(alias, capital)
    }
  return found.sort((left, right) => left.handle.localeCompare(right.handle, 'en'))
}
/** The Capital a handle or declared alias selects. */
const selectedCapital = (found: readonly Capital[], selector: string): Capital => {
  const capital = found.find(
    (candidate) => candidate.handle === selector || candidate.declaration.territory.aliases.includes(selector)
  )
  if (!capital) throw new KiError(`territory ${selector} is not declared by a registered Capital`, 2)
  return capital
}
export const resolveTerritoryCapital = async (stateDirectory: string, handle: string): Promise<LocalRegistryEntry> =>
  selectedCapital(await capitals(await requiredLocalRegistry(stateDirectory)), handle).entry
/**
 * Ranked handles lead in ranking order. The rest follow the derived order: the Capital whose
 * territory holds the canonical KI Harness, then territory name, then handle.
 */
const SYSTEM_HARNESS = `https://github.com/${DEFAULT_HARNESS}`
const territoryOrder = (found: readonly Capital[], ranking: readonly string[]): readonly Capital[] => {
  const position = (capital: Capital): number => {
    const index = ranking.indexOf(capital.handle)
    return index < 0 ? ranking.length : index
  }
  return [...found].sort(
    (left, right) =>
      position(left) - position(right) ||
      Number(!left.declaration.territory.members.includes(SYSTEM_HARNESS)) -
        Number(!right.declaration.territory.members.includes(SYSTEM_HARNESS)) ||
      left.declaration.territory.name.localeCompare(right.declaration.territory.name, 'en') ||
      left.handle.localeCompare(right.handle, 'en')
  )
}
/** Capitals in ranked order; a ranked handle no registered Capital declares is a warning, never a failure. */
const rankedCapitals = async (
  entries: readonly LocalRegistryEntry[],
  configurationDirectory: string,
  warn?: TerritoryWarning
): Promise<{ readonly ordered: readonly Capital[]; readonly ranking: readonly string[] }> => {
  const ranking = await readTerritoryRanking(configurationDirectory)
  const found = await capitals(entries)
  for (const handle of ranking)
    if (!found.some((capital) => capital.handle === handle))
      warn?.(`territory ranking names ${handle}, which no registered Capital declares`)
  return { ordered: territoryOrder(found, ranking), ranking }
}
const memberAt = async (entry: LocalRegistryEntry, kind: TerritoryMember['kind']): Promise<TerritoryMember> => {
  const target = await targetFromDirectory(
    entry.path,
    `${entry.key}: selected root must be an existing physical directory`
  )
  return { key: entry.key, repository: entry.repository, root: target.root, kind }
}
/** An empty selection, with where to compare the selectors. */
export const noRepositoriesMatched = (): KiError =>
  new KiError(
    'repository selection matched no repositories',
    2,
    'compare --repo, --territory and --filter with the repositories ki registry list shows'
  )

const resolvePrincipals = async (
  ordered: readonly Capital[],
  filters: readonly string[]
): Promise<TerritoryProfile> => {
  const selected = ordered.filter((capital) => matchesDirectoryName(capital.entry.path, filters))
  if (!selected.length) throw noRepositoriesMatched()
  const members: TerritoryMember[] = []
  for (const capital of selected) members.push(await memberAt(capital.entry, 'owner'))
  return { id: 'principals', title: 'Territory Capitals', members, roots: members, system: true }
}
export const resolveTerritory = async (
  directories: TerritoryDirectories,
  selection: TerritorySelection,
  warn?: TerritoryWarning
): Promise<TerritoryProfile> => {
  if (
    Number(selection.territory !== undefined) +
      Number(Boolean(selection.estate)) +
      Number(Boolean(selection.principals)) !==
    1
  )
    throw new KiError('select exactly one of --territory, --estate, or --principals', 2)
  const { filters } = selection
  validateFilters(filters)
  const entries = await requiredLocalRegistry(directories.state)
  // The ranking orders territories, so a single territory neither reads nor reports it.
  const { ordered, ranking } =
    selection.territory === undefined
      ? await rankedCapitals(entries, directories.configuration, warn)
      : { ordered: await capitals(entries), ranking: [] }
  if (selection.principals) return resolvePrincipals(ordered, filters)
  const capital = selection.territory === undefined ? undefined : selectedCapital(ordered, selection.territory)
  const identities = capital?.declaration.territory.members ?? entries.map((entry) => entry.repository)
  // Registration completeness is authoritative before a basename filter can exclude anything,
  // unless the caller reports the unregistered members itself.
  const scoped: LocalRegistryEntry[] = []
  const unregistered: string[] = []
  for (const identity of identities) {
    const entry = entries.find((candidate) => candidate.repository === identity)
    if (entry) scoped.push(entry)
    else if (selection.unregistered === 'report') unregistered.push(identity)
    else throw new KiError(`territory ${capital?.handle} member ${identity} is not registered`, 2)
  }
  const selected = scoped.filter((entry) => matchesDirectoryName(entry.path, filters))
  const missing = unregistered.filter((identity) => matchesDirectoryName(identity, filters))
  if (!selected.length && !missing.length) throw noRepositoriesMatched()
  const members: TerritoryMember[] = []
  for (const entry of selected) {
    const member = await memberAt(entry, entry === capital?.entry ? 'owner' : 'member')
    const declaration = await declarationAt(entry)
    if (capital && declaration.capital !== capital.entry.repository)
      throw new KiError(
        `${entry.key}: declared Capital ${declaration.capital} differs from territory ${capital.handle}`,
        2
      )
    members.push(member)
  }
  // Estate roots follow the ranked territory declaring them, earliest rank first; unranked roots keep
  // code-point order after them. Each root's checkout identity was verified, so no two roots are equal.
  const rank = new Map<string, number>()
  for (const owner of [...ordered].reverse()) {
    const index = ranking.indexOf(owner.handle)
    if (index >= 0) for (const identity of owner.declaration.territory.members) rank.set(identity, index)
  }
  const position = (member: TerritoryMember): number => rank.get(member.repository) ?? ranking.length
  members.sort((left, right) => position(left) - position(right) || (left.root < right.root ? -1 : 1))
  return {
    id: capital?.handle ?? 'estate',
    title: capital?.declaration.territory.name ?? 'Registered estate',
    ...(capital
      ? {
          home: {
            key: capital.entry.key,
            repository: capital.entry.repository,
            root: capital.entry.path,
            kind: 'owner' as const
          }
        }
      : {}),
    members,
    roots: members,
    system: !capital,
    ...(missing.length ? { unregistered: missing } : {})
  }
}
export const listTerritories = async (
  directories: TerritoryDirectories,
  warn?: TerritoryWarning
): Promise<
  readonly {
    readonly handle: string
    readonly name: string
    readonly capital: LocalRegistryEntry
    readonly members: number
  }[]
> =>
  (await rankedCapitals(await requiredLocalRegistry(directories.state), directories.configuration, warn)).ordered.map(
    (entry) => ({
      handle: entry.handle,
      name: entry.declaration.territory.name,
      capital: entry.entry,
      members: entry.declaration.territory.members.length
    })
  )
