import { isRecord } from '../configuration/index.ts'
import { KiError } from '../errors.ts'

const REPOSITORY_TABLE = 'skills.ki-repo'
const RETIRED_TERRITORY_TABLE = `${REPOSITORY_TABLE}.territory`
const TERRITORY_NAME = `[${REPOSITORY_TABLE}].territory_name`
const TERRITORY_MEMBERS = `[${REPOSITORY_TABLE}].territory_members`
const TERRITORY_PREFIX = `[${REPOSITORY_TABLE}].territory_prefix`
const repositoryExpression =
  /^https:\/\/github\.com\/([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)\/([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)$/
const identifierExpression = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

export interface TerritoryDeclaration {
  readonly repository: string
  readonly capital: string
  /** Present only on a Capital; `prefix` is its optional territory handle. */
  readonly territory?: { readonly name: string; readonly members: readonly string[]; readonly prefix?: string }
}

const declarationError = (message: string): KiError => new KiError(message, 2)

export const isCanonicalRepository = (value: string): boolean => repositoryExpression.test(value)

export const isLowerHyphenIdentifier = (value: string): boolean => identifierExpression.test(value)

/** One skill's table under the `[skills]` namespace, or undefined where the file declares neither. */
export const skillTable = (parsed: Record<string, unknown>, name: string): unknown => {
  const skills = parsed['skills']
  return isRecord(skills) ? skills[name] : undefined
}

/** A non-empty, duplicate-free list of canonical HTTPS GitHub repositories. */
export const repositoryList = (value: unknown, label: string): readonly string[] => {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.some((entry) => typeof entry !== 'string' || !isCanonicalRepository(entry))
  )
    throw declarationError(`${label} must be a non-empty array of canonical HTTPS GitHub repositories`)
  const entries = value as string[]
  if (new Set(entries).size !== entries.length) throw declarationError(`${label} must not repeat a repository`)
  return entries
}

/** The canonical `[skills.ki-repo].repository` a parsed declaration claims, even where the rest is invalid. */
export const claimedRepository = (document: Record<string, unknown>): string | undefined => {
  const declaration = skillTable(document, 'ki-repo')
  const repository = isRecord(declaration) ? declaration['repository'] : undefined
  return typeof repository === 'string' && isCanonicalRepository(repository) ? repository : undefined
}

const parseTerritory = (
  declaration: Record<string, unknown>,
  path: string,
  repository: string
): NonNullable<TerritoryDeclaration['territory']> => {
  const name = declaration['territory_name']
  if (typeof name !== 'string' || !name.trim())
    throw declarationError(`${path} ${TERRITORY_NAME} must be a non-empty string`)
  const members = repositoryList(declaration['territory_members'], `${path} ${TERRITORY_MEMBERS}`)
  // Code-point order, not locale collation, so every reader agrees on one canonical listing.
  if (!members.every((member, index) => index === 0 || (members[index - 1] as string) < member))
    throw declarationError(`${path} ${TERRITORY_MEMBERS} must be sorted ascending`)
  if (!members.includes(repository))
    throw declarationError(`${path} ${TERRITORY_MEMBERS} must include the Capital itself`)
  const prefix = declaration['territory_prefix']
  if (prefix !== undefined && (typeof prefix !== 'string' || !isLowerHyphenIdentifier(prefix)))
    throw declarationError(`${path} ${TERRITORY_PREFIX} must use a lower-case hyphenated identifier`)
  return { name, members, ...(prefix !== undefined ? { prefix: prefix as string } : {}) }
}

/** Validates the repository identity and, for a Capital, its territory membership and optional handle. */
export const territoryDeclarationFrom = (document: Record<string, unknown>, path: string): TerritoryDeclaration => {
  const repository = claimedRepository(document)
  if (!repository)
    throw declarationError(`${path} [${REPOSITORY_TABLE}].repository must use canonical HTTPS GitHub repository form`)
  const declaration = skillTable(document, 'ki-repo') as Record<string, unknown>
  const capital = declaration['capital']
  if (typeof capital !== 'string' || !isCanonicalRepository(capital))
    throw declarationError(
      `${path} [${REPOSITORY_TABLE}].capital must name the territory Capital in canonical HTTPS form`
    )
  const isCapital = capital === repository
  if (declaration['territory'] !== undefined)
    throw declarationError(
      `${path} [${RETIRED_TERRITORY_TABLE}] is retired; move its name and members to ${TERRITORY_NAME} and ${TERRITORY_MEMBERS}, then remove the table`
    )
  const declared = ['territory_name', 'territory_members', 'territory_prefix'].some(
    (key) => declaration[key] !== undefined
  )
  if (!isCapital && declared)
    throw declarationError(
      `${path} ${TERRITORY_NAME}, ${TERRITORY_MEMBERS} and ${TERRITORY_PREFIX} are permitted only in a territory Capital`
    )
  if (isCapital && !declared)
    throw declarationError(`${path} is a territory Capital and must declare ${TERRITORY_NAME} and ${TERRITORY_MEMBERS}`)
  const territory = isCapital ? parseTerritory(declaration, path, repository) : undefined
  return { repository, capital, ...(territory ? { territory } : {}) }
}
