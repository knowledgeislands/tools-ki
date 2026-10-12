import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import { DEFAULT_HARNESS, REPOSITORY_DECLARATION_FILE } from '../configuration/index.ts'
import { KiError } from '../errors.ts'
import { targetFromDirectory } from '../repository/location.ts'
import { type LocalRegistryEntry, requiredLocalRegistry } from '../storage/index.ts'
import { type TerritoryDeclaration, territoryDeclarationFrom } from './declaration.ts'
import { matchesDirectoryName, validateFilters } from './filters.ts'
import type { TerritoryMember, TerritoryProfile } from './types.ts'

export interface TerritorySelection {
  readonly territory?: string
  readonly estate?: boolean
  readonly principals?: boolean
  readonly filters: readonly string[]
}
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
  return found.sort((left, right) => left.handle.localeCompare(right.handle, 'en'))
}
export const resolveTerritoryCapital = async (stateDirectory: string, handle: string): Promise<LocalRegistryEntry> => {
  const entries = await requiredLocalRegistry(stateDirectory)
  const found = await capitals(entries)
  const capital = found.find((candidate) => candidate.handle === handle)
  if (!capital) throw new KiError(`territory ${handle} is not declared by a registered Capital`, 2)
  return capital.entry
}
/** The Capital whose territory holds the canonical KI Harness leads; the rest follow by territory name. */
const SYSTEM_HARNESS = `https://github.com/${DEFAULT_HARNESS}`
const principalOrder = (found: readonly Capital[]): readonly Capital[] =>
  [...found].sort(
    (left, right) =>
      Number(!left.declaration.territory.members.includes(SYSTEM_HARNESS)) -
        Number(!right.declaration.territory.members.includes(SYSTEM_HARNESS)) ||
      left.declaration.territory.name.localeCompare(right.declaration.territory.name, 'en') ||
      left.handle.localeCompare(right.handle, 'en')
  )
const memberAt = async (entry: LocalRegistryEntry, kind: TerritoryMember['kind']): Promise<TerritoryMember> => {
  const target = await targetFromDirectory(
    entry.path,
    `${entry.key}: selected root must be an existing physical directory`
  )
  return { key: entry.key, repository: entry.repository, root: target.root, kind }
}
const resolvePrincipals = async (
  entries: readonly LocalRegistryEntry[],
  filters: readonly string[]
): Promise<TerritoryProfile> => {
  const selected = principalOrder(await capitals(entries)).filter((capital) =>
    matchesDirectoryName(capital.entry.path, filters)
  )
  if (!selected.length) throw new KiError('repository selection matched no repositories', 2)
  const members: TerritoryMember[] = []
  for (const capital of selected) members.push(await memberAt(capital.entry, 'owner'))
  return { id: 'principals', title: 'Territory Capitals', members, roots: members, system: true }
}
export const resolveTerritory = async (
  stateDirectory: string,
  selection: TerritorySelection
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
  const entries = await requiredLocalRegistry(stateDirectory)
  if (selection.principals) return resolvePrincipals(entries, filters)
  const found = await capitals(entries)
  const capital =
    selection.territory === undefined ? undefined : found.find((entry) => entry.handle === selection.territory)
  if (selection.territory !== undefined && !capital)
    throw new KiError(`territory ${selection.territory} is not declared by a registered Capital`, 2)
  const identities = capital?.declaration.territory.members ?? entries.map((entry) => entry.repository)
  // Registration completeness is authoritative before a basename filter can exclude anything.
  const scoped = identities.map((identity) => {
    const entry = entries.find((candidate) => candidate.repository === identity)
    if (!entry) throw new KiError(`territory ${capital?.handle} member ${identity} is not registered`, 2)
    return entry
  })
  const selected = scoped.filter((entry) => matchesDirectoryName(entry.path, filters))
  if (!selected.length) throw new KiError('repository selection matched no repositories', 2)
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
  // Code-point order; each root's checkout identity was verified, so no two roots are equal.
  members.sort((left, right) => (left.root < right.root ? -1 : 1))
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
    system: !capital
  }
}
export const listTerritories = async (
  stateDirectory: string
): Promise<
  readonly {
    readonly handle: string
    readonly name: string
    readonly capital: LocalRegistryEntry
    readonly members: number
  }[]
> =>
  (await capitals(await requiredLocalRegistry(stateDirectory))).map((entry) => ({
    handle: entry.handle,
    name: entry.declaration.territory.name,
    capital: entry.entry,
    members: entry.declaration.territory.members.length
  }))
