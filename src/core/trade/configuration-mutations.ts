import { lstat, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { KiError } from '../errors.ts'
import {
  isKnowledgeSubtype,
  isTradeRepository,
  type RouteDirection,
  readTradeConfiguration,
  type TradeConfiguration,
  type TradeKind,
  tradeKinds
} from './configuration.ts'

const TRADES_TABLE = 'skills.ki-trades'
const tradeError = (message: string): KiError => new KiError(message, 2)
const repositoryIdentity = (repository: string): string => repository.slice('https://github.com/'.length)

const routeKinds = (routes: Readonly<Record<TradeKind, readonly string[]>>, partner: string): readonly TradeKind[] =>
  tradeKinds.filter((kind) => routes[kind].includes(partner))

const renderDirection = (direction: RouteDirection, kinds: readonly TradeKind[]): readonly string[] =>
  kinds.length ? [`${direction} = [${kinds.map((kind) => JSON.stringify(kind)).join(', ')}]`] : []

const renderStandingDirection = (
  partner: string,
  direction: RouteDirection,
  subtypes: readonly string[]
): readonly string[] =>
  subtypes.length
    ? [
        `[${TRADES_TABLE}.routes.${JSON.stringify(repositoryIdentity(partner))}.standing.${direction}]`,
        `knowledge = [${subtypes.map((subtype) => JSON.stringify(subtype)).join(', ')}]`
      ]
    : []

const renderTradeDeclaration = (configuration: TradeConfiguration): string => {
  const partners = [
    ...new Set([
      ...tradeKinds.flatMap((kind) => [...configuration.exportsTo[kind], ...configuration.importsFrom[kind]]),
      ...Object.keys(configuration.standingExports),
      ...Object.keys(configuration.standingImports)
    ])
  ].sort((left, right) => left.localeCompare(right))
  const blocks: string[][] = [
    [`[${TRADES_TABLE}]`, ...(configuration.mapBonus ? [`map_bonus = ${configuration.mapBonus}`] : [])]
  ]
  const subtypeEntries = Object.entries(configuration.knowledgeSubtypes)
  if (subtypeEntries.length)
    blocks.push([
      `[${TRADES_TABLE}.subtypes.knowledge]`,
      ...subtypeEntries.map(([subtype, description]) => `${subtype} = ${JSON.stringify(description)}`)
    ])
  for (const partner of partners) {
    blocks.push([
      `[${TRADES_TABLE}.routes.${JSON.stringify(repositoryIdentity(partner))}]`,
      ...renderDirection('export', routeKinds(configuration.exportsTo, partner)),
      ...renderDirection('import', routeKinds(configuration.importsFrom, partner))
    ])
    const exports = renderStandingDirection(partner, 'export', configuration.standingExports[partner] ?? [])
    const imports = renderStandingDirection(partner, 'import', configuration.standingImports[partner] ?? [])
    if (exports.length) blocks.push([...exports])
    if (imports.length) blocks.push([...imports])
  }
  return blocks.map((block) => block.join('\n')).join('\n\n')
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

const nextStandingRoutes = (
  routes: Readonly<Record<string, readonly string[]>>,
  repository: string,
  subtype: string,
  remove = false
): Readonly<Record<string, readonly string[]>> => {
  const next = remove
    ? (routes[repository] as readonly string[]).filter((candidate) => candidate !== subtype)
    : [...new Set([...(routes[repository] ?? []), subtype])].sort((left, right) => left.localeCompare(right))
  if (!next.length) return Object.fromEntries(Object.entries(routes).filter(([candidate]) => candidate !== repository))
  return { ...routes, [repository]: next }
}

export const addKnowledgeSubtype = async (
  path: string,
  subtype: string,
  description: string
): Promise<TradeConfiguration> => {
  /* v8 ignore next -- the sole CLI caller validates subtype grammar before core mutation. */
  if (!isKnowledgeSubtype(subtype)) throw tradeError('knowledge subtype must use a lower-case hyphenated identifier')
  /* v8 ignore next -- the sole CLI caller rejects empty descriptions before core mutation. */
  if (!description.trim()) throw tradeError('knowledge subtype description must be non-empty')
  const existing = await readTradeConfiguration(path)
  if (existing.knowledgeSubtypes[subtype]) throw tradeError(`knowledge subtype ${subtype} is already defined locally`)
  const configuration = {
    ...existing,
    knowledgeSubtypes: Object.fromEntries(
      [...Object.entries(existing.knowledgeSubtypes), [subtype, description] as const].sort(([left], [right]) =>
        left.localeCompare(right)
      )
    )
  }
  await writeTradeConfiguration(path, configuration)
  return configuration
}

export const removeKnowledgeSubtype = async (path: string, subtype: string): Promise<TradeConfiguration> => {
  /* v8 ignore next -- the sole CLI caller validates subtype grammar before core mutation. */
  if (!isKnowledgeSubtype(subtype)) throw tradeError('knowledge subtype must use a lower-case hyphenated identifier')
  const existing = await readTradeConfiguration(path)
  if (!existing.knowledgeSubtypes[subtype]) throw tradeError(`knowledge subtype ${subtype} is not defined locally`)
  const dependencies = Object.entries(existing.standingImports)
    .filter(([, subtypes]) => subtypes.includes(subtype))
    .map(([repository]) => repository)
  if (dependencies.length)
    throw tradeError(`knowledge subtype ${subtype} is used by standing imports from ${dependencies.sort().join(', ')}`)
  const configuration = {
    ...existing,
    knowledgeSubtypes: Object.fromEntries(
      Object.entries(existing.knowledgeSubtypes).filter(([candidate]) => candidate !== subtype)
    )
  }
  await writeTradeConfiguration(path, configuration)
  return configuration
}

export const addStandingRoute = async (
  path: string,
  repository: string,
  direction: RouteDirection,
  subtype: string
): Promise<TradeConfiguration> => {
  /* v8 ignore next 2 -- the sole CLI caller validates repository and subtype grammar before core mutation. */
  if (!isTradeRepository(repository))
    throw tradeError('standing route repository must use canonical HTTPS GitHub repository form')
  /* v8 ignore next -- the sole CLI caller validates subtype grammar before core mutation. */
  if (!isKnowledgeSubtype(subtype)) throw tradeError('standing subtype must use a lower-case hyphenated identifier')
  const existing = await readTradeConfiguration(path)
  if (repository === existing.repository)
    throw tradeError('standing route repository must differ from the local repository')
  const ordinary = direction === 'export' ? existing.exportsTo.knowledge : existing.importsFrom.knowledge
  if (!ordinary.includes(repository))
    throw tradeError(`standing ${direction} requires an ordinary knowledge ${direction} route to ${repository}`)
  if (direction === 'import' && !existing.knowledgeSubtypes[subtype])
    throw tradeError(`standing import subtype ${subtype} is not defined by the receiver`)
  const configuration =
    direction === 'export'
      ? { ...existing, standingExports: nextStandingRoutes(existing.standingExports, repository, subtype) }
      : { ...existing, standingImports: nextStandingRoutes(existing.standingImports, repository, subtype) }
  await writeTradeConfiguration(path, configuration)
  return configuration
}

export const removeStandingRoute = async (
  path: string,
  repository: string,
  direction: RouteDirection,
  subtype: string
): Promise<TradeConfiguration> => {
  /* v8 ignore next 2 -- the sole CLI caller validates repository and subtype grammar before core mutation. */
  if (!isTradeRepository(repository))
    throw tradeError('standing route repository must use canonical HTTPS GitHub repository form')
  /* v8 ignore next -- the sole CLI caller validates subtype grammar before core mutation. */
  if (!isKnowledgeSubtype(subtype)) throw tradeError('standing subtype must use a lower-case hyphenated identifier')
  const existing = await readTradeConfiguration(path)
  const routes = direction === 'export' ? existing.standingExports : existing.standingImports
  if (!(routes[repository] ?? []).includes(subtype))
    throw tradeError(`standing ${direction} knowledge subtype ${subtype} for ${repository} is not declared locally`)
  const configuration =
    direction === 'export'
      ? { ...existing, standingExports: nextStandingRoutes(existing.standingExports, repository, subtype, true) }
      : { ...existing, standingImports: nextStandingRoutes(existing.standingImports, repository, subtype, true) }
  await writeTradeConfiguration(path, configuration)
  return configuration
}

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
  const standing = direction === 'export' ? existing.standingExports[repository] : existing.standingImports[repository]
  if (kind === 'knowledge' && standing?.length)
    throw tradeError(
      `${direction} knowledge trade route ${repository} is used by standing subtypes ${standing.join(', ')}`
    )
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
