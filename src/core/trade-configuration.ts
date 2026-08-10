import { lstat, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parse } from 'smol-toml'
import { KiError } from './errors.ts'

const TRADES_TABLE = 'skills.ki-trades'
const REPOSITORY_TABLE = 'skills.ki-repo'
const addressExpression = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/
const repositoryExpression =
  /^https:\/\/github\.com\/([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)\/([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)$/

export const tradeKinds = ['work', 'knowledge'] as const

const observationPolicies = ['unattended', 'receipt', 'decision', 'completion'] as const

export type RouteDirection = 'export' | 'import'
export type TradeKind = (typeof tradeKinds)[number]
export type ObservationPolicy = (typeof observationPolicies)[number]

export interface TradeConfiguration {
  readonly repository: string
  readonly identity: string
  readonly exportsTo: Readonly<Record<TradeKind, readonly string[]>>
  readonly importsFrom: Readonly<Record<TradeKind, readonly string[]>>
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

export const isObservationPolicy = (value: string): value is ObservationPolicy =>
  observationPolicies.includes(value as ObservationPolicy)

const repositoryIdentity = (repository: string): string => repository.slice('https://github.com/'.length)

interface DirectionalRoutes {
  readonly exportsTo: Readonly<Record<TradeKind, readonly string[]>>
  readonly importsFrom: Readonly<Record<TradeKind, readonly string[]>>
}

const emptyRoutes = (): { work: string[]; knowledge: string[] } => ({ work: [], knowledge: [] })

/**
 * Reads the partner-keyed route map. Each partner is named once, carrying the kinds it trades in
 * each direction; a direction it does not trade is absent. TOML's own prohibition on defining a key
 * twice is what makes each partner unique, so no ordering or uniqueness rule is written here.
 */
const parseRoutes = (declaration: Record<string, unknown>, path: string, repository: string): DirectionalRoutes => {
  const exportsTo = emptyRoutes()
  const importsFrom = emptyRoutes()
  const value = declaration['routes']
  if (value === undefined) return { exportsTo, importsFrom }
  if (!isRecord(value)) throw tradeError(`${path} [${TRADES_TABLE}.routes] must be a table`)
  for (const [partner, route] of Object.entries(value)) {
    if (!addressExpression.test(partner))
      throw tradeError(`${path} [${TRADES_TABLE}.routes] partner ${partner} must use canonical owner/repository form`)
    const url = `https://github.com/${partner}`
    if (url === repository) throw tradeError(`${path} [${TRADES_TABLE}.routes] must not name the local repository`)
    if (!isRecord(route))
      throw tradeError(`${path} [${TRADES_TABLE}.routes].${partner} must be a table of export and import trade kinds`)
    const unknown = Object.keys(route).find((key) => key !== 'export' && key !== 'import')
    if (unknown) throw tradeError(`${path} [${TRADES_TABLE}.routes].${partner} has unrecognised key ${unknown}`)
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
      if (new Set(entries).size !== entries.length)
        throw tradeError(`${path} [${TRADES_TABLE}.routes].${partner}.${direction} must not repeat a trade kind`)
      for (const kind of entries) (direction === 'export' ? exportsTo : importsFrom)[kind].push(url)
    }
  }
  for (const routes of [exportsTo, importsFrom])
    for (const kind of tradeKinds) routes[kind].sort((left, right) => left.localeCompare(right))
  return { exportsTo, importsFrom }
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
  const unknown = Object.keys(declaration).find((key) => key !== 'routes')
  if (unknown) throw tradeError(`${path} [${TRADES_TABLE}] has unrecognised key ${unknown}`)
  return {
    repository,
    identity: repositoryIdentity(repository),
    ...parseRoutes(declaration, path, repository)
  }
}

export const readTradeConfiguration = async (path: string): Promise<TradeConfiguration> =>
  parseConfiguration(await readFile(path, 'utf8'), path)

const routeKinds = (routes: Readonly<Record<TradeKind, readonly string[]>>, partner: string): readonly TradeKind[] =>
  tradeKinds.filter((kind) => routes[kind].includes(partner))

const renderDirection = (direction: RouteDirection, kinds: readonly TradeKind[]): readonly string[] =>
  kinds.length ? [`${direction} = [${kinds.map((kind) => JSON.stringify(kind)).join(', ')}]`] : []

const renderTradeDeclaration = (configuration: TradeConfiguration): string => {
  const partners = [
    ...new Set(tradeKinds.flatMap((kind) => [...configuration.exportsTo[kind], ...configuration.importsFrom[kind]]))
  ].sort((left, right) => left.localeCompare(right))
  const routes = partners.map(
    (partner) =>
      `${JSON.stringify(repositoryIdentity(partner))} = { ${[
        ...renderDirection('export', routeKinds(configuration.exportsTo, partner)),
        ...renderDirection('import', routeKinds(configuration.importsFrom, partner))
      ].join(', ')} }`
  )
  return [`[${TRADES_TABLE}]`, ...(routes.length ? ['', `[${TRADES_TABLE}.routes]`, ...routes] : [])].join('\n')
}

const writeTradeConfiguration = async (path: string, configuration: TradeConfiguration): Promise<void> => {
  const contents = await readFile(path, 'utf8')
  const headers = [...contents.matchAll(/^\[([^\n]+)\]$/gmu)]
  const isOwnedHeader = (header: string | undefined): boolean =>
    header === TRADES_TABLE || Boolean(header?.startsWith(`${TRADES_TABLE}.`))
  const owned = headers.filter((header) => isOwnedHeader(header[1]))
  const start = owned[0]?.index
  if (start === undefined) throw tradeError(`${path} does not declare [${TRADES_TABLE}] route tables`)
  const end =
    headers.find((header) => (header.index as number) > start && !isOwnedHeader(header[1]))?.index ?? contents.length
  await writeFile(
    path,
    `${contents.slice(0, start)}${renderTradeDeclaration(configuration)}\n\n${contents.slice(end)}`,
    'utf8'
  )
}

const nextRoutes = (
  routes: Readonly<Record<TradeKind, readonly string[]>>,
  kind: TradeKind,
  repository: string,
  remove = false
): Readonly<Record<TradeKind, readonly string[]>> => ({
  ...routes,
  [kind]: remove
    ? routes[kind].filter((candidate) => candidate !== repository)
    : [...new Set([...routes[kind], repository])].sort((left, right) => left.localeCompare(right))
})

export const addTradeRoute = async (
  path: string,
  repository: string,
  direction: RouteDirection,
  kind: TradeKind
): Promise<TradeConfiguration> => {
  /* v8 ignore next -- public CLI grammar validates canonical repository URLs before core route mutation. */
  if (!isTradeRepository(repository))
    throw tradeError('trade route repository must use canonical HTTPS GitHub repository form')
  const existing = await readTradeConfiguration(path)
  if (repository === existing.repository)
    throw tradeError('trade route repository must differ from the local repository')
  const configuration =
    direction === 'export'
      ? { ...existing, exportsTo: nextRoutes(existing.exportsTo, kind, repository) }
      : { ...existing, importsFrom: nextRoutes(existing.importsFrom, kind, repository) }
  await writeTradeConfiguration(path, configuration)
  return configuration
}

export const removeTradeRoute = async (
  path: string,
  repository: string,
  direction: RouteDirection,
  kind: TradeKind
): Promise<TradeConfiguration> => {
  /* v8 ignore next -- public CLI grammar validates canonical repository URLs before core route mutation. */
  if (!isTradeRepository(repository))
    throw tradeError('trade route repository must use canonical HTTPS GitHub repository form')
  const existing = await readTradeConfiguration(path)
  const routes = direction === 'export' ? existing.exportsTo : existing.importsFrom
  if (!routes[kind].includes(repository))
    throw tradeError(`${direction} ${kind} trade route ${repository} is not declared locally`)
  const [owner, name] = repositoryIdentity(repository).split('/') as [string, string]
  // A preparation and its submitted successor share one path, so the outbound area is a
  // single root; the separate preparation root this once probed no longer exists.
  const root =
    direction === 'export'
      ? join(dirname(path), '-', '_TRADES', owner, name)
      : join(dirname(path), '+', '_TRADES', owner, name)
  const dependencies: string[] = []
  const state = await lstat(root).catch(() => undefined)
  if (state?.isDirectory())
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.startsWith('TRD-') || !entry.name.endsWith('.md')) continue
      const recordPath = join(root, entry.name)
      if ((await readFile(recordPath, 'utf8')).includes(`\nkind: ${kind}\n`)) dependencies.push(entry.name.slice(0, -3))
    }
  if (dependencies.length)
    throw tradeError(`${direction} ${kind} trade route ${repository} is used by ${dependencies.sort().join(', ')}`)
  const configuration =
    direction === 'export'
      ? { ...existing, exportsTo: nextRoutes(existing.exportsTo, kind, repository, true) }
      : { ...existing, importsFrom: nextRoutes(existing.importsFrom, kind, repository, true) }
  await writeTradeConfiguration(path, configuration)
  return configuration
}
