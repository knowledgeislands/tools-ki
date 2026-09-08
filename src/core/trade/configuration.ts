import { readFile } from 'node:fs/promises'
import { parse } from 'smol-toml'
import { KiError } from '../errors.ts'

const TRADES_TABLE = 'skills.ki-trades'
const REPOSITORY_TABLE = 'skills.ki-repo'
const addressExpression = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/
const repositoryExpression =
  /^https:\/\/github\.com\/([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)\/([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)$/
const knowledgeSubtypeExpression = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

export const tradeKinds = ['work', 'knowledge'] as const

const observationPolicies = ['unattended', 'receipt', 'decision', 'completion'] as const

export type RouteDirection = 'export' | 'import'
export type TradeKind = (typeof tradeKinds)[number]
export type ObservationPolicy = (typeof observationPolicies)[number]

export interface TradeConfiguration {
  readonly repository: string
  readonly identity: string
  /** Presentation-only uplift for the generated estate map; it grants no trade capability. */
  readonly mapBonus: number
  readonly exportsTo: Readonly<Record<TradeKind, readonly string[]>>
  readonly importsFrom: Readonly<Record<TradeKind, readonly string[]>>
  readonly knowledgeSubtypes: Readonly<Record<string, string>>
  readonly standingExports: Readonly<Record<string, readonly string[]>>
  readonly standingImports: Readonly<Record<string, readonly string[]>>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** One skill's table under the `[skills]` namespace, or undefined where the file declares neither. */
const skillTable = (parsed: Record<string, unknown>, name: string): unknown => {
  const skills = parsed['skills']
  return isRecord(skills) ? skills[name] : undefined
}

const hasRepository = (value: unknown): value is { readonly repository: unknown } =>
  isRecord(value) && 'repository' in value

const tradeError = (message: string): KiError => new KiError(message, 2)

export const isTradeRepository = (value: string): boolean => repositoryExpression.test(value)

export const isTradeKind = (value: string): value is TradeKind => tradeKinds.includes(value as TradeKind)

export const isKnowledgeSubtype = (value: string): boolean => knowledgeSubtypeExpression.test(value)

export const isObservationPolicy = (value: string): value is ObservationPolicy =>
  observationPolicies.includes(value as ObservationPolicy)

const repositoryIdentity = (repository: string): string => repository.slice('https://github.com/'.length)

interface DirectionalRoutes {
  readonly exportsTo: Readonly<Record<TradeKind, readonly string[]>>
  readonly importsFrom: Readonly<Record<TradeKind, readonly string[]>>
  readonly standingExports: Readonly<Record<string, readonly string[]>>
  readonly standingImports: Readonly<Record<string, readonly string[]>>
}

const emptyRoutes = (): { work: string[]; knowledge: string[] } => ({ work: [], knowledge: [] })

const mapBonus = (value: unknown, path: string): number => {
  if (value === undefined) return 0
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 3)
    throw tradeError(`${path} [${TRADES_TABLE}].map_bonus must be an integer from 0 through 3`)
  return value as number
}

const parseKnowledgeSubtypes = (
  declaration: Record<string, unknown>,
  path: string
): Readonly<Record<string, string>> => {
  const value = declaration['subtypes']
  if (value === undefined) return {}
  if (!isRecord(value))
    throw tradeError(`${path} [${TRADES_TABLE}.subtypes] must be a table of trade-kind vocabularies`)
  const unknown = Object.keys(value).find((key) => key !== 'knowledge')
  if (unknown)
    throw tradeError(`${path} [${TRADES_TABLE}.subtypes].${unknown} is unsupported; standing intake is knowledge-only`)
  const knowledge = value['knowledge']
  if (knowledge === undefined) return {}
  if (!isRecord(knowledge))
    throw tradeError(`${path} [${TRADES_TABLE}.subtypes.knowledge] must be a subtype-to-description table`)
  const subtypes: Record<string, string> = {}
  for (const [subtype, description] of Object.entries(knowledge)) {
    if (!isKnowledgeSubtype(subtype))
      throw tradeError(`${path} knowledge subtype ${subtype} must use a lower-case hyphenated identifier`)
    if (typeof description !== 'string' || !description.trim())
      throw tradeError(`${path} knowledge subtype ${subtype} must have a non-empty receiver-owned description`)
    subtypes[subtype] = description
  }
  return Object.fromEntries(Object.entries(subtypes).sort(([left], [right]) => left.localeCompare(right)))
}

const parseStandingDirection = (
  route: Record<string, unknown>,
  partner: string,
  direction: RouteDirection,
  ordinaryKinds: readonly TradeKind[],
  knowledgeSubtypes: Readonly<Record<string, string>>,
  path: string
): readonly string[] => {
  const standing = route['standing']
  if (standing === undefined) return []
  if (!isRecord(standing))
    throw tradeError(`${path} route ${partner} standing must be a table declaring export or import knowledge subtypes`)
  const unknownDirection = Object.keys(standing).find((key) => key !== 'export' && key !== 'import')
  if (unknownDirection)
    throw tradeError(`${path} route ${partner} standing direction ${unknownDirection} is unsupported`)
  const declaration = standing[direction]
  if (declaration === undefined) return []
  if (!isRecord(declaration))
    throw tradeError(`${path} route ${partner} standing ${direction} must be a table containing knowledge`)
  const unknownKind = Object.keys(declaration).find((key) => key !== 'knowledge')
  if (unknownKind) throw tradeError(`${path} route ${partner} standing ${direction} kind ${unknownKind} is unsupported`)
  const value = declaration['knowledge']
  if (!Array.isArray(value) || !value.length || value.some((subtype) => typeof subtype !== 'string'))
    throw tradeError(`${path} route ${partner} standing ${direction} knowledge must be a non-empty subtype array`)
  const subtypes = value as string[]
  if (new Set(subtypes).size !== subtypes.length)
    throw tradeError(`${path} route ${partner} standing ${direction} knowledge must not repeat a subtype`)
  for (const subtype of subtypes) {
    if (!isKnowledgeSubtype(subtype))
      throw tradeError(
        `${path} route ${partner} standing ${direction} subtype ${subtype} must be lower-case hyphenated`
      )
    if (direction === 'import' && !(subtype in knowledgeSubtypes))
      throw tradeError(`${path} route ${partner} standing import subtype ${subtype} is not defined by the receiver`)
  }
  if (!ordinaryKinds.includes('knowledge'))
    throw tradeError(`${path} route ${partner} standing ${direction} requires an ordinary knowledge ${direction} route`)
  return [...subtypes].sort((left, right) => left.localeCompare(right))
}

/**
 * Reads the partner-keyed route map. Each partner is named once, carrying the kinds it trades in
 * each direction; a direction it does not trade is absent. TOML's own prohibition on defining a key
 * twice is what makes each partner unique, so no ordering or uniqueness rule is written here.
 */
const parseRoutes = (
  declaration: Record<string, unknown>,
  path: string,
  repository: string,
  knowledgeSubtypes: Readonly<Record<string, string>>
): DirectionalRoutes => {
  const exportsTo = emptyRoutes()
  const importsFrom = emptyRoutes()
  const standingExports: Record<string, readonly string[]> = {}
  const standingImports: Record<string, readonly string[]> = {}
  const value = declaration['routes']
  if (value === undefined) return { exportsTo, importsFrom, standingExports, standingImports }
  if (!isRecord(value)) throw tradeError(`${path} [${TRADES_TABLE}.routes] must be a table`)
  for (const [partner, route] of Object.entries(value)) {
    if (!addressExpression.test(partner))
      throw tradeError(`${path} [${TRADES_TABLE}.routes] partner ${partner} must use canonical owner/repository form`)
    const url = `https://github.com/${partner}`
    if (url === repository) throw tradeError(`${path} [${TRADES_TABLE}.routes] must not name the local repository`)
    if (!isRecord(route))
      throw tradeError(`${path} [${TRADES_TABLE}.routes].${partner} must be a table of export and import trade kinds`)
    const unknown = Object.keys(route).find((key) => key !== 'export' && key !== 'import' && key !== 'standing')
    if (unknown) throw tradeError(`${path} [${TRADES_TABLE}.routes].${partner} has unrecognised key ${unknown}`)
    const ordinaryKinds: Record<RouteDirection, readonly TradeKind[]> = { export: [], import: [] }
    for (const direction of ['export', 'import'] as const) {
      const kinds = route[direction]
      if (kinds === undefined) continue
      if (
        !Array.isArray(kinds) ||
        !kinds.length ||
        kinds.some((kind) => typeof kind !== 'string' || !isTradeKind(kind))
      )
        throw tradeError(
          `${path} [${TRADES_TABLE}.routes].${partner}.${direction} must be a non-empty array of work or knowledge`
        )
      const entries = kinds as TradeKind[]
      ordinaryKinds[direction] = entries
      if (new Set(entries).size !== entries.length)
        throw tradeError(`${path} [${TRADES_TABLE}.routes].${partner}.${direction} must not repeat a trade kind`)
      for (const kind of entries) (direction === 'export' ? exportsTo : importsFrom)[kind].push(url)
    }
    const exports = parseStandingDirection(route, partner, 'export', ordinaryKinds.export, knowledgeSubtypes, path)
    const imports = parseStandingDirection(route, partner, 'import', ordinaryKinds.import, knowledgeSubtypes, path)
    if (exports.length) standingExports[url] = exports
    if (imports.length) standingImports[url] = imports
  }
  for (const routes of [exportsTo, importsFrom])
    for (const kind of tradeKinds) routes[kind].sort((left, right) => left.localeCompare(right))
  return { exportsTo, importsFrom, standingExports, standingImports }
}

const parseConfiguration = (contents: string, path: string): TradeConfiguration => {
  let parsed: unknown
  try {
    parsed = parse(contents)
  } catch {
    throw tradeError(`${path} must be valid TOML`)
  }
  /* v8 ignore next -- smol-toml either rejects invalid input or returns a TOML document object. */
  if (!isRecord(parsed)) throw tradeError(`${path} must be a TOML table`)
  const repositoryDeclaration = skillTable(parsed, 'ki-repo')
  if (
    !hasRepository(repositoryDeclaration) ||
    typeof repositoryDeclaration.repository !== 'string' ||
    !isTradeRepository(repositoryDeclaration.repository)
  )
    throw tradeError(`${path} [${REPOSITORY_TABLE}].repository must use canonical HTTPS GitHub repository form`)
  const repository = repositoryDeclaration.repository
  const declaration = skillTable(parsed, 'ki-trades')
  if (!isRecord(declaration)) throw tradeError(`${path} does not declare [${TRADES_TABLE}]`)
  const unknown = Object.keys(declaration).find((key) => key !== 'map_bonus' && key !== 'routes' && key !== 'subtypes')
  if (unknown) throw tradeError(`${path} [${TRADES_TABLE}] has unrecognised key ${unknown}`)
  const knowledgeSubtypes = parseKnowledgeSubtypes(declaration, path)
  return {
    repository,
    identity: repositoryIdentity(repository),
    mapBonus: mapBonus(declaration['map_bonus'], path),
    knowledgeSubtypes,
    ...parseRoutes(declaration, path, repository, knowledgeSubtypes)
  }
}

export const readTradeConfiguration = async (path: string): Promise<TradeConfiguration> =>
  parseConfiguration(await readFile(path, 'utf8'), path)
