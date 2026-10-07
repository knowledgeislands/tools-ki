import { readFile } from 'node:fs/promises'
import { parse } from 'smol-toml'
import { isRecord } from '../configuration/index.ts'
import { KiError } from '../errors.ts'

const TRADES_TABLE = 'skills.ki-trades'
const REPOSITORY_TABLE = 'skills.ki-repo'
const POLICY_TABLE = `${TRADES_TABLE}.territory`
const RETIRED_TERRITORY_TABLE = `${REPOSITORY_TABLE}.territory`
const TERRITORY_NAME = `[${REPOSITORY_TABLE}].territory_name`
const TERRITORY_MEMBERS = `[${REPOSITORY_TABLE}].territory_members`
const repositoryExpression =
  /^https:\/\/github\.com\/([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)\/([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)$/
const identifierExpression = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

export const tradeKinds = ['work', 'knowledge'] as const

const observationPolicies = ['unattended', 'receipt', 'decision', 'completion'] as const

export type RouteDirection = 'export' | 'import'
export type TradeKind = (typeof tradeKinds)[number]
export type ObservationPolicy = (typeof observationPolicies)[number]

/**
 * One repository's effective trade view, derived from its territory Capital's policy. Member
 * `.ki.toml` files carry no route authority; every edge and standing grant below comes from the
 * Capital's `[skills.ki-trades.territory]` table.
 */
export interface TradeConfiguration {
  readonly repository: string
  readonly identity: string
  readonly capital: string
  /** Presentation-only uplift for the generated estate map; it grants no trade capability. */
  readonly mapBonus: number
  readonly exportsTo: Readonly<Record<TradeKind, readonly string[]>>
  readonly importsFrom: Readonly<Record<TradeKind, readonly string[]>>
  readonly knowledgeSubtypes: Readonly<Record<string, string>>
  readonly standingExports: Readonly<Record<string, readonly string[]>>
  readonly standingImports: Readonly<Record<string, readonly string[]>>
}

export interface TradeChannel {
  readonly id: string
  readonly purpose: string
  readonly from: readonly string[]
  readonly to: readonly string[]
  readonly kinds: readonly TradeKind[]
}

export interface StandingGrant {
  readonly subtype: string
  readonly from: readonly string[]
  readonly to: readonly string[]
}

/** The validated trade policy a territory Capital publishes for its members. */
export interface TerritoryPolicy {
  readonly capital: string
  readonly name: string
  readonly members: readonly string[]
  readonly subtypes: Readonly<Record<string, string>>
  readonly channels: readonly TradeChannel[]
  readonly standing: readonly StandingGrant[]
}

/** The trade-relevant facts one `.ki.toml` declares about itself. */
export interface RepositoryDeclaration {
  readonly repository: string
  readonly identity: string
  readonly capital: string
  /** Present only on a Capital, which must list its territory's members. */
  readonly territory?: { readonly name: string; readonly members: readonly string[] }
  /** Present only where the repository declares `[skills.ki-trades]`. */
  readonly trades?: { readonly mapBonus: number }
  /** A Capital's validated trade policy; an empty policy where the Capital declares none. */
  readonly policy?: TerritoryPolicy
}

/** One skill's table under the `[skills]` namespace, or undefined where the file declares neither. */
const skillTable = (parsed: Record<string, unknown>, name: string): unknown => {
  const skills = parsed['skills']
  return isRecord(skills) ? skills[name] : undefined
}

const tradeError = (message: string): KiError => new KiError(message, 2)

export const isTradeRepository = (value: string): boolean => repositoryExpression.test(value)

export const isTradeKind = (value: string): value is TradeKind => tradeKinds.includes(value as TradeKind)

export const isKnowledgeSubtype = (value: string): boolean => identifierExpression.test(value)

export const isObservationPolicy = (value: string): value is ObservationPolicy =>
  observationPolicies.includes(value as ObservationPolicy)

export const repositoryIdentity = (repository: string): string => repository.slice('https://github.com/'.length)

const mapBonus = (value: unknown, path: string): number => {
  if (value === undefined) return 0
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 3)
    throw tradeError(`${path} [${TRADES_TABLE}].map_bonus must be an integer from 0 through 3`)
  return value as number
}

const repositoryList = (value: unknown, label: string): readonly string[] => {
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.some((entry) => typeof entry !== 'string' || !isTradeRepository(entry))
  )
    throw tradeError(`${label} must be a non-empty array of canonical HTTPS GitHub repositories`)
  const entries = value as string[]
  if (new Set(entries).size !== entries.length) throw tradeError(`${label} must not repeat a repository`)
  return entries
}

const exactKeys = (value: Record<string, unknown>, keys: readonly string[], label: string): void => {
  const unknown = Object.keys(value).find((key) => !keys.includes(key))
  if (unknown) throw tradeError(`${label} has unrecognised key ${unknown}`)
  const missing = keys.find((key) => !(key in value))
  if (missing) throw tradeError(`${label} must declare ${missing}`)
}

const parseTerritory = (
  declaration: Record<string, unknown>,
  path: string,
  repository: string
): { readonly name: string; readonly members: readonly string[] } => {
  const name = declaration['territory_name']
  if (typeof name !== 'string' || !name.trim()) throw tradeError(`${path} ${TERRITORY_NAME} must be a non-empty string`)
  const members = repositoryList(declaration['territory_members'], `${path} ${TERRITORY_MEMBERS}`)
  // Code-point order, not locale collation, so every reader agrees on one canonical listing.
  if (!members.every((member, index) => index === 0 || (members[index - 1] as string) < member))
    throw tradeError(`${path} ${TERRITORY_MEMBERS} must be sorted ascending`)
  if (!members.includes(repository)) throw tradeError(`${path} ${TERRITORY_MEMBERS} must include the Capital itself`)
  return { name, members }
}

const parseSubtypes = (value: unknown, path: string): Readonly<Record<string, string>> => {
  if (value === undefined) return {}
  if (!isRecord(value)) throw tradeError(`${path} [${POLICY_TABLE}.subtypes] must be a subtype-to-description table`)
  const subtypes: Record<string, string> = {}
  for (const [subtype, description] of Object.entries(value)) {
    if (!isKnowledgeSubtype(subtype))
      throw tradeError(`${path} knowledge subtype ${subtype} must use a lower-case hyphenated identifier`)
    if (typeof description !== 'string' || !description.trim())
      throw tradeError(`${path} knowledge subtype ${subtype} must have a non-empty description`)
    subtypes[subtype] = description
  }
  return Object.fromEntries(Object.entries(subtypes).sort(([left], [right]) => left.localeCompare(right)))
}

const tableArray = (value: unknown, label: string): readonly Record<string, unknown>[] => {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((entry) => !isRecord(entry)))
    throw tradeError(`${label} must be an array of tables`)
  return value as Record<string, unknown>[]
}

const endpoints = (
  entry: Record<string, unknown>,
  members: readonly string[],
  label: string
): { readonly from: readonly string[]; readonly to: readonly string[] } => {
  const from = repositoryList(entry['from'], `${label}.from`)
  const to = repositoryList(entry['to'], `${label}.to`)
  const overlap = from.find((repository) => to.includes(repository))
  if (overlap) throw tradeError(`${label} names ${overlap} as both source and receiver`)
  const outsider = [...from, ...to].find((repository) => !members.includes(repository))
  if (outsider) throw tradeError(`${label} names ${outsider}, which is not a territory member`)
  return { from, to }
}

const parseChannels = (value: unknown, path: string, members: readonly string[]): readonly TradeChannel[] => {
  const channels: TradeChannel[] = []
  const triples = new Map<string, string>()
  for (const entry of tableArray(value, `${path} [[${POLICY_TABLE}.channels]]`)) {
    const label = `${path} channel ${typeof entry['id'] === 'string' ? entry['id'] : `#${channels.length + 1}`}`
    exactKeys(entry, ['id', 'purpose', 'from', 'to', 'kinds'], label)
    const id = entry['id']
    if (typeof id !== 'string' || !identifierExpression.test(id))
      throw tradeError(`${label} id must use a lower-case hyphenated identifier`)
    if (channels.some((channel) => channel.id === id)) throw tradeError(`${label} id is declared twice`)
    const purpose = entry['purpose']
    if (typeof purpose !== 'string' || !purpose.trim()) throw tradeError(`${label} purpose must be a non-empty string`)
    const { from, to } = endpoints(entry, members, label)
    const kinds = entry['kinds']
    if (!Array.isArray(kinds) || !kinds.length || kinds.some((kind) => typeof kind !== 'string' || !isTradeKind(kind)))
      throw tradeError(`${label}.kinds must be a non-empty array of work or knowledge`)
    if (new Set(kinds).size !== kinds.length) throw tradeError(`${label}.kinds must not repeat a trade kind`)
    for (const source of from)
      for (const receiver of to)
        for (const kind of kinds as TradeKind[]) {
          const key = `${source} ${receiver} ${kind}`
          const owner = triples.get(key)
          if (owner)
            throw tradeError(`${label} repeats the ${kind} route ${source} -> ${receiver} from channel ${owner}`)
          triples.set(key, id)
        }
    channels.push({ id, purpose, from, to, kinds: kinds as TradeKind[] })
  }
  return channels
}

const parseStanding = (
  value: unknown,
  path: string,
  members: readonly string[],
  subtypes: Readonly<Record<string, string>>,
  channels: readonly TradeChannel[]
): readonly StandingGrant[] => {
  const grants: StandingGrant[] = []
  const seen = new Set<string>()
  for (const entry of tableArray(value, `${path} [[${POLICY_TABLE}.standing]]`)) {
    const label = `${path} standing grant #${grants.length + 1}`
    exactKeys(entry, ['subtype', 'from', 'to'], label)
    const subtype = entry['subtype']
    if (typeof subtype !== 'string' || !(subtype in subtypes))
      throw tradeError(`${label} subtype must name a subtype the policy defines`)
    const { from, to } = endpoints(entry, members, label)
    for (const source of from)
      for (const receiver of to) {
        const covered = channels.some(
          (channel) =>
            channel.kinds.includes('knowledge') && channel.from.includes(source) && channel.to.includes(receiver)
        )
        if (!covered) throw tradeError(`${label} needs a knowledge channel from ${source} to ${receiver}`)
        const key = `${source} ${receiver} ${subtype}`
        if (seen.has(key)) throw tradeError(`${label} repeats ${subtype} from ${source} to ${receiver}`)
        seen.add(key)
      }
    grants.push({ subtype, from, to })
  }
  return grants
}

const parsePolicy = (
  value: unknown,
  path: string,
  capital: string,
  territory: { readonly name: string; readonly members: readonly string[] }
): TerritoryPolicy => {
  const declaration = value === undefined ? {} : value
  if (!isRecord(declaration)) throw tradeError(`${path} [${POLICY_TABLE}] must be a table`)
  const unknown = Object.keys(declaration).find((key) => !['subtypes', 'channels', 'standing'].includes(key))
  if (unknown) throw tradeError(`${path} [${POLICY_TABLE}] has unrecognised key ${unknown}`)
  const subtypes = parseSubtypes(declaration['subtypes'], path)
  const channels = parseChannels(declaration['channels'], path, territory.members)
  return {
    capital,
    name: territory.name,
    members: territory.members,
    subtypes,
    channels,
    standing: parseStanding(declaration['standing'], path, territory.members, subtypes, channels)
  }
}

const parseTrades = (
  value: unknown,
  path: string,
  isCapital: boolean
): { readonly mapBonus: number; readonly policy?: unknown } | undefined => {
  if (value === undefined) return undefined
  if (!isRecord(value)) throw tradeError(`${path} [${TRADES_TABLE}] must be a table`)
  for (const key of Object.keys(value)) {
    if (key === 'map_bonus') continue
    if (key === 'routes' || key === 'subtypes')
      throw tradeError(
        `${path} [${TRADES_TABLE}].${key} is retired; routes, standing grants and subtypes come from the territory Capital's [${POLICY_TABLE}] policy`
      )
    if (key === 'territory' && isCapital) continue
    if (key === 'territory') throw tradeError(`${path} [${POLICY_TABLE}] is permitted only in a territory Capital`)
    throw tradeError(`${path} [${TRADES_TABLE}] has unrecognised key ${key}`)
  }
  return { mapBonus: mapBonus(value['map_bonus'], path), policy: value['territory'] }
}

/** The canonical `[skills.ki-repo].repository` a parsed declaration claims, even where the rest is invalid. */
export const claimedRepository = (document: Record<string, unknown>): string | undefined => {
  const declaration = skillTable(document, 'ki-repo')
  const repository = isRecord(declaration) ? declaration['repository'] : undefined
  return typeof repository === 'string' && isTradeRepository(repository) ? repository : undefined
}

/** Validates the trade-relevant facts of an already parsed `.ki.toml` document. */
export const repositoryDeclarationFrom = (document: Record<string, unknown>, path: string): RepositoryDeclaration => {
  const repository = claimedRepository(document)
  if (!repository)
    throw tradeError(`${path} [${REPOSITORY_TABLE}].repository must use canonical HTTPS GitHub repository form`)
  const declaration = skillTable(document, 'ki-repo') as Record<string, unknown>
  const capital = declaration['capital']
  if (typeof capital !== 'string' || !isTradeRepository(capital))
    throw tradeError(`${path} [${REPOSITORY_TABLE}].capital must name the territory Capital in canonical HTTPS form`)
  const isCapital = capital === repository
  if (declaration['territory'] !== undefined)
    throw tradeError(
      `${path} [${RETIRED_TERRITORY_TABLE}] is retired; move its name and members to ${TERRITORY_NAME} and ${TERRITORY_MEMBERS}, then remove the table`
    )
  const declared = declaration['territory_name'] !== undefined || declaration['territory_members'] !== undefined
  if (!isCapital && declared)
    throw tradeError(`${path} ${TERRITORY_NAME} and ${TERRITORY_MEMBERS} are permitted only in a territory Capital`)
  if (isCapital && !declared)
    throw tradeError(`${path} is a territory Capital and must declare ${TERRITORY_NAME} and ${TERRITORY_MEMBERS}`)
  const territory = isCapital ? parseTerritory(declaration, path, repository) : undefined
  const trades = parseTrades(skillTable(document, 'ki-trades'), path, isCapital)
  return {
    repository,
    identity: repositoryIdentity(repository),
    capital,
    ...(territory ? { territory, policy: parsePolicy(trades?.policy, path, repository, territory) } : {}),
    ...(trades ? { trades: { mapBonus: trades.mapBonus } } : {})
  }
}

const parseRepositoryDeclaration = (contents: string, path: string): RepositoryDeclaration => {
  let document: Record<string, unknown>
  try {
    document = parse(contents)
  } catch {
    throw tradeError(`${path} must be valid TOML`)
  }
  return repositoryDeclarationFrom(document, path)
}

export const readRepositoryDeclaration = async (path: string): Promise<RepositoryDeclaration> =>
  parseRepositoryDeclaration(await readFile(path, 'utf8'), path)

const sortedUnique = (values: Iterable<string>): readonly string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right))

/** Projects the Capital's policy onto one member's directional view. */
export const effectiveConfiguration = (
  declaration: RepositoryDeclaration & { readonly trades: { readonly mapBonus: number } },
  policy: TerritoryPolicy
): TradeConfiguration => {
  const self = declaration.repository
  const exportsTo = { work: new Set<string>(), knowledge: new Set<string>() }
  const importsFrom = { work: new Set<string>(), knowledge: new Set<string>() }
  for (const channel of policy.channels)
    for (const kind of channel.kinds) {
      if (channel.from.includes(self)) for (const receiver of channel.to) exportsTo[kind].add(receiver)
      if (channel.to.includes(self)) for (const source of channel.from) importsFrom[kind].add(source)
    }
  const standingExports = new Map<string, Set<string>>()
  const standingImports = new Map<string, Set<string>>()
  const grant = (target: Map<string, Set<string>>, peer: string, subtype: string): void => {
    target.set(peer, (target.get(peer) ?? new Set<string>()).add(subtype))
  }
  for (const standing of policy.standing) {
    if (standing.from.includes(self))
      for (const receiver of standing.to) grant(standingExports, receiver, standing.subtype)
    if (standing.to.includes(self)) for (const source of standing.from) grant(standingImports, source, standing.subtype)
  }
  const grants = (target: Map<string, Set<string>>): Readonly<Record<string, readonly string[]>> =>
    Object.fromEntries(
      [...target.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([peer, subtypes]) => [peer, sortedUnique(subtypes)])
    )
  return {
    repository: self,
    identity: declaration.identity,
    capital: policy.capital,
    mapBonus: declaration.trades.mapBonus,
    exportsTo: { work: sortedUnique(exportsTo.work), knowledge: sortedUnique(exportsTo.knowledge) },
    importsFrom: { work: sortedUnique(importsFrom.work), knowledge: sortedUnique(importsFrom.knowledge) },
    knowledgeSubtypes: policy.subtypes,
    standingExports: grants(standingExports),
    standingImports: grants(standingImports)
  }
}

/** Every repository a Capital's policy names in at least one channel. */
export const policyParticipants = (policy: TerritoryPolicy): ReadonlySet<string> =>
  new Set(policy.channels.flatMap((channel) => [...channel.from, ...channel.to]))
