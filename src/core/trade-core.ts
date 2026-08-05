import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { parse } from 'smol-toml'
import { inspectUserConfiguration } from '../agents/configuration.ts'
import type { KiContext } from '../context.ts'
import { REPOSITORY_CONFIGURATION_FILE } from './configuration.ts'
import { KiError } from './errors.ts'
import { type RepositoryLocation, resolveRepository } from './repository.ts'

const TRADES_TABLE = 'knowledgeislands/ki-agentic-harness:ki-trades'
const REPOSITORY_TABLE = 'knowledgeislands/ki-agentic-harness:ki-repo'
const addressExpression = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/
const repositoryExpression = /^https:\/\/github\.com\/([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)\/([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)$/
const identifierExpression = /^TRD-[0-9a-f]{8}$/
const timestampExpression = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
const tradeKinds = ['work', 'knowledge'] as const
const receiverStatuses = ['received', 'adopted', 'retained', 'parked', 'clarify', 'declined', 'superseded'] as const
const terminalStatuses = ['adopted', 'retained', 'declined', 'superseded'] as const

export type TradeDirection = 'inbound' | 'outbound'
export type RouteDirection = 'export' | 'import'
export type TradeKind = (typeof tradeKinds)[number]
export type ReceiverStatus = (typeof receiverStatuses)[number]

export interface TradeConfiguration {
  readonly repository: string
  readonly identity: string
  readonly exportsTo: Readonly<Record<TradeKind, readonly string[]>>
  readonly importsFrom: Readonly<Record<TradeKind, readonly string[]>>
}

export interface TradeRecord {
  readonly id: string
  readonly title: string
  readonly createdAt: string
  readonly sender: string
  readonly receiver: string
  readonly kind: TradeKind
  readonly sourceRef: string
  readonly status?: ReceiverStatus
  readonly reviewedAt?: string
  readonly rationale?: string
  readonly adoptedAs?: string
  readonly retainedAs?: string
  readonly supersededBy?: string
  readonly body: string
  readonly contents: string
}

export interface LocatedTrade {
  readonly repository: string
  readonly root: string
  readonly direction: TradeDirection
  readonly path: string
  readonly record: TradeRecord
}

interface TradeFields {
  readonly id?: string
  readonly title?: string
  readonly created_at?: string
  readonly sender?: string
  readonly receiver?: string
  readonly kind?: string
  readonly source_ref?: string
  readonly status?: string
  readonly reviewed_at?: string
  readonly rationale?: string
  readonly adopted_as?: string
  readonly retained_as?: string
  readonly superseded_by?: string
  readonly [key: string]: string | undefined
}

interface RegisteredRepository {
  readonly root: string
  readonly configuration: TradeConfiguration
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const hasRepository = (value: unknown): value is { readonly repository: unknown } => isRecord(value) && 'repository' in value

const tradeError = (message: string): KiError => new KiError(message, 2)

export const isTradeRepository = (value: string): boolean => repositoryExpression.test(value)

export const isTradeIdentifier = (value: string): boolean => identifierExpression.test(value)

export const isTradeKind = (value: string): value is TradeKind => tradeKinds.includes(value as TradeKind)

const repositoryIdentity = (repository: string): string => repository.slice('https://github.com/'.length)

const addressParts = (address: string): readonly [string, string] => {
  if (!addressExpression.test(address)) throw tradeError('trade record address must use canonical lower-case owner/repository form')
  return address.split('/') as [string, string]
}

const identifier = (value: string): string => {
  if (!isTradeIdentifier(value)) throw tradeError('trade id must use TRD- followed by eight lower-case hexadecimal characters')
  return value
}

const parseRoutes = (
  declaration: Record<string, unknown>,
  key: 'exports_to' | 'imports_from',
  path: string,
  repository: string,
  allowIncomplete: boolean
): Readonly<Record<TradeKind, readonly string[]>> => {
  const value = declaration[key]
  if (value === undefined && allowIncomplete) return { work: [], knowledge: [] }
  if (!isRecord(value)) throw tradeError(`${path} [${TRADES_TABLE}].${key} must be a table`)
  const unknown = Object.keys(value).find((candidate) => !tradeKinds.includes(candidate as TradeKind))
  if (unknown) throw tradeError(`${path} [${TRADES_TABLE}].${key} has unrecognised trade kind ${unknown}`)
  const routes: Record<TradeKind, readonly string[]> = { work: [], knowledge: [] }
  for (const kind of tradeKinds) {
    const values = value[kind]
    if (!Array.isArray(values) || values.some((route) => typeof route !== 'string' || !isTradeRepository(route)))
      throw tradeError(`${path} [${TRADES_TABLE}].${key}.${kind} must be a canonical HTTPS GitHub repository URL array`)
    const entries = values as string[]
    if (entries.includes(repository)) throw tradeError(`${path} [${TRADES_TABLE}].${key}.${kind} must not contain the local repository`)
    if (new Set(entries).size !== entries.length || entries.some((entry, index) => index > 0 && entry.localeCompare(entries[index - 1] as string) <= 0))
      throw tradeError(`${path} [${TRADES_TABLE}].${key}.${kind} must be unique and lexical`)
    routes[kind] = entries
  }
  return routes
}

const parseConfiguration = (contents: string, path: string, allowIncomplete = false): TradeConfiguration => {
  let parsed: unknown
  try {
    parsed = parse(contents)
  } catch {
    throw tradeError(`${path} must be valid TOML`)
  }
  /* v8 ignore next -- smol-toml either rejects invalid input or returns a TOML document object. */
  if (!isRecord(parsed)) throw tradeError(`${path} must be a TOML table`)
  const repositoryDeclaration = parsed[REPOSITORY_TABLE]
  if (!hasRepository(repositoryDeclaration) || typeof repositoryDeclaration.repository !== 'string' || !isTradeRepository(repositoryDeclaration.repository))
    throw tradeError(`${path} [${REPOSITORY_TABLE}].repository must use canonical HTTPS GitHub repository form`)
  const repository = repositoryDeclaration.repository
  const declaration = parsed[TRADES_TABLE]
  if (!isRecord(declaration)) throw tradeError(`${path} does not declare [${TRADES_TABLE}]`)
  const unknown = Object.keys(declaration).find((key) => key !== 'exports_to' && key !== 'imports_from')
  if (unknown) throw tradeError(`${path} [${TRADES_TABLE}] has unrecognised key ${unknown}`)
  return {
    repository,
    identity: repositoryIdentity(repository),
    exportsTo: parseRoutes(declaration, 'exports_to', path, repository, allowIncomplete),
    importsFrom: parseRoutes(declaration, 'imports_from', path, repository, allowIncomplete)
  }
}

export const readTradeConfiguration = async (path: string): Promise<TradeConfiguration> => parseConfiguration(await readFile(path, 'utf8'), path)

const readEditableConfiguration = async (path: string): Promise<TradeConfiguration> => parseConfiguration(await readFile(path, 'utf8'), path, true)

const renderRoutes = (routes: Readonly<Record<TradeKind, readonly string[]>>): readonly string[] =>
  tradeKinds.map((kind) => (routes[kind].length ? `${kind} = [${routes[kind].map((route) => JSON.stringify(route)).join(', ')}]` : `${kind} = []`))

const renderTradeDeclaration = (configuration: TradeConfiguration): string =>
  [
    `[${JSON.stringify(TRADES_TABLE)}.exports_to]`,
    ...renderRoutes(configuration.exportsTo),
    '',
    `[${JSON.stringify(TRADES_TABLE)}.imports_from]`,
    ...renderRoutes(configuration.importsFrom)
  ].join('\n')

const writeTradeConfiguration = async (path: string, configuration: TradeConfiguration): Promise<void> => {
  const contents = await readFile(path, 'utf8')
  const headers = [...contents.matchAll(/^\[([^\n]+)\]$/gmu)]
  const table = JSON.stringify(TRADES_TABLE)
  const isOwnedHeader = (header: string | undefined): boolean => header === table || Boolean(header?.startsWith(`${table}.`))
  const owned = headers.filter((header) => isOwnedHeader(header[1]))
  const start = owned[0]?.index
  if (start === undefined) throw tradeError(`${path} does not declare [${TRADES_TABLE}] route tables`)
  const end = headers.find((header) => (header.index as number) > start && !isOwnedHeader(header[1]))?.index ?? contents.length
  await writeFile(path, `${contents.slice(0, start)}${renderTradeDeclaration(configuration)}\n\n${contents.slice(end)}`, 'utf8')
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

export const addTradeRoute = async (path: string, repository: string, direction: RouteDirection, kind: TradeKind): Promise<TradeConfiguration> => {
  /* v8 ignore next -- public CLI grammar validates canonical repository URLs before core route mutation. */
  if (!isTradeRepository(repository)) throw tradeError('trade route repository must use canonical HTTPS GitHub repository form')
  const existing = await readEditableConfiguration(path)
  if (repository === existing.repository) throw tradeError('trade route repository must differ from the local repository')
  const configuration =
    direction === 'export'
      ? { ...existing, exportsTo: nextRoutes(existing.exportsTo, kind, repository) }
      : { ...existing, importsFrom: nextRoutes(existing.importsFrom, kind, repository) }
  await writeTradeConfiguration(path, configuration)
  return configuration
}

export const removeTradeRoute = async (path: string, repository: string, direction: RouteDirection, kind: TradeKind): Promise<TradeConfiguration> => {
  /* v8 ignore next -- public CLI grammar validates canonical repository URLs before core route mutation. */
  if (!isTradeRepository(repository)) throw tradeError('trade route repository must use canonical HTTPS GitHub repository form')
  const existing = await readTradeConfiguration(path)
  const routes = direction === 'export' ? existing.exportsTo : existing.importsFrom
  if (!routes[kind].includes(repository)) throw tradeError(`${direction} ${kind} trade route ${repository} is not declared locally`)
  const configuration =
    direction === 'export'
      ? { ...existing, exportsTo: nextRoutes(existing.exportsTo, kind, repository, true) }
      : { ...existing, importsFrom: nextRoutes(existing.importsFrom, kind, repository, true) }
  await writeTradeConfiguration(path, configuration)
  return configuration
}

const registeredRoots = async (context: KiContext): Promise<readonly string[]> => {
  const configuration = await inspectUserConfiguration(context.paths.config)
  if (configuration.state === 'missing') throw new KiError('ki environment is not bootstrapped; run `ki bootstrap` first', 1)
  if (configuration.state === 'invalid') throw new KiError(`ki configuration is invalid: ${configuration.errors.join('; ')}`, 1)
  return configuration.repositories
}

const registeredRepositories = async (context: KiContext): Promise<readonly RegisteredRepository[]> => {
  const repositories: RegisteredRepository[] = []
  for (const root of await registeredRoots(context)) {
    const path = join(root, REPOSITORY_CONFIGURATION_FILE)
    const state = await lstat(path).catch(() => undefined)
    if (!state?.isFile()) continue
    try {
      repositories.push({ root, configuration: await readTradeConfiguration(path) })
    } catch {
      // Invalid or nonparticipating registered repositories remain visible but never activate a trade route.
    }
  }
  return repositories
}

export const localRepository = async (context: KiContext): Promise<RepositoryLocation> =>
  resolveRepository({ workingDirectory: context.workingDirectory, homeDirectory: context.homeDirectory })

export const localRegisteredRepository = async (context: KiContext): Promise<RepositoryLocation> => {
  const repository = await localRepository(context)
  if (!(await registeredRoots(context)).includes(repository.root)) throw tradeError('current KI repository is not registered in the local KI repository estate')
  return repository
}

export const localRegisteredConfiguration = async (
  context: KiContext
): Promise<{ readonly repository: RepositoryLocation; readonly configuration: TradeConfiguration }> => {
  const repository = await localRegisteredRepository(context)
  return { repository, configuration: await readTradeConfiguration(repository.configuration) }
}

export type RouteState = 'active' | 'missing-repository' | 'ambiguous-repository' | 'nonreciprocal'

export interface RouteInspection {
  readonly repository: string
  readonly direction: RouteDirection
  readonly kind: TradeKind
  readonly state: RouteState
  readonly peer?: RegisteredRepository
}

const declaredRoutes = (configuration: TradeConfiguration): readonly Pick<RouteInspection, 'repository' | 'direction' | 'kind'>[] =>
  tradeKinds.flatMap((kind) => [
    ...configuration.exportsTo[kind].map((repository) => ({ repository, direction: 'export' as const, kind })),
    ...configuration.importsFrom[kind].map((repository) => ({ repository, direction: 'import' as const, kind }))
  ])

export const inspectRoutes = async (context: KiContext, local: TradeConfiguration): Promise<readonly RouteInspection[]> => {
  const repositories = await registeredRepositories(context)
  return declaredRoutes(local).map((route) => {
    const candidates = repositories.filter((candidate) => candidate.configuration.repository === route.repository)
    if (!candidates.length) return { ...route, state: 'missing-repository' }
    if (candidates.length > 1) return { ...route, state: 'ambiguous-repository' }
    const peer = candidates[0] as RegisteredRepository
    const reciprocal = route.direction === 'export' ? peer.configuration.importsFrom[route.kind] : peer.configuration.exportsTo[route.kind]
    if (!reciprocal.includes(local.repository)) return { ...route, state: 'nonreciprocal', peer }
    return { ...route, state: 'active', peer }
  })
}

export const requireActiveRoute = async (
  context: KiContext,
  local: TradeConfiguration,
  repository: string,
  direction: RouteDirection,
  kind: TradeKind
): Promise<RegisteredRepository> => {
  /* v8 ignore next -- public CLI grammar validates canonical repository URLs before route inspection. */
  if (!isTradeRepository(repository)) throw tradeError('trade route repository must use canonical HTTPS GitHub repository form')
  const route = (await inspectRoutes(context, local)).find(
    (candidate) => candidate.repository === repository && candidate.direction === direction && candidate.kind === kind
  )
  if (route?.state !== 'active') throw tradeError(`${direction} ${kind} trade route ${repository} is ${route?.state ?? 'not declared locally'}`)
  return route.peer as RegisteredRepository
}

const frontmatter = (contents: string, path: string): { readonly fields: TradeFields; readonly body: string } => {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/u.exec(contents)
  if (!match) throw tradeError(`${path} must use YAML frontmatter followed by a trade body`)
  const fields: Record<string, string> = {}
  for (const line of (match[1] as string).split('\n')) {
    const field = /^([a-z_]+): (.+)$/u.exec(line)
    if (!field) throw tradeError(`${path} has invalid trade frontmatter`)
    const key = field[1] as string
    const rawValue = field[2] as string
    let value: unknown = rawValue
    if (rawValue.startsWith('"') || rawValue.startsWith("'")) {
      try {
        value = (parse(`value = ${rawValue}`) as { readonly value?: unknown }).value
      } catch {
        throw tradeError(`${path} has invalid trade frontmatter`)
      }
    }
    if (fields[key] !== undefined) throw tradeError(`${path} repeats trade field ${key}`)
    fields[key] = value as string
  }
  return { fields, body: match[2] as string }
}

const requiredField = (fields: TradeFields, name: string, path: string): string => {
  const value = fields[name]
  if (!value) throw tradeError(`${path} must declare non-empty trade field ${name}`)
  return value
}

const recordFromContents = (contents: string, path: string, direction: TradeDirection): TradeRecord => {
  const { fields, body } = frontmatter(contents, path)
  const sender = ['id', 'title', 'created_at', 'sender', 'receiver', 'kind', 'source_ref']
  const allowed = direction === 'outbound' ? sender : [...sender, 'status', 'reviewed_at', 'rationale', 'adopted_as', 'retained_as', 'superseded_by']
  const unknown = Object.keys(fields).find((key) => !allowed.includes(key))
  if (unknown) throw tradeError(`${path} has unrecognised trade field ${unknown}`)
  const id = identifier(requiredField(fields, 'id', path))
  if (basename(path) !== `${id}.md`) throw tradeError(`${path} filename must match trade id ${id}`)
  const title = requiredField(fields, 'title', path)
  const createdAt = requiredField(fields, 'created_at', path)
  const recordSender = requiredField(fields, 'sender', path)
  const receiver = requiredField(fields, 'receiver', path)
  const kind = requiredField(fields, 'kind', path)
  const sourceRef = requiredField(fields, 'source_ref', path)
  if (!timestampExpression.test(createdAt)) throw tradeError(`${path} has invalid created_at timestamp`)
  addressParts(recordSender)
  addressParts(receiver)
  if (!isTradeKind(kind)) throw tradeError(`${path} has invalid trade kind`)
  if (!body.startsWith(`# ${id}: ${title}\n\n`) || !/## Context\n\n\S[\s\S]*?\n\n## Submission\n\n\S[\s\S]*?\n\n## Constraints\n\n\S/u.test(body))
    throw tradeError(`${path} must carry non-empty Context, Submission, and Constraints sections`)
  const status = fields.status as ReceiverStatus | undefined
  if (direction === 'inbound') {
    if (!status || !receiverStatuses.includes(status)) throw tradeError(`${path} has invalid receiver status`)
    if (fields.reviewed_at && !timestampExpression.test(fields.reviewed_at)) throw tradeError(`${path} has invalid reviewed_at timestamp`)
    if (['parked', 'clarify', 'declined', 'superseded'].includes(status) && !fields.rationale)
      throw tradeError(`${path} requires rationale for status ${status}`)
    if (status === 'adopted' && kind !== 'work') throw tradeError(`${path} permits adopted only for work trades`)
    if (status === 'adopted' && !fields.adopted_as) throw tradeError(`${path} requires adopted_as for status adopted`)
    if (status === 'retained' && kind !== 'knowledge') throw tradeError(`${path} permits retained only for knowledge trades`)
    if (status === 'retained' && !fields.retained_as) throw tradeError(`${path} requires retained_as for status retained`)
    if (status !== 'adopted' && fields.adopted_as) throw tradeError(`${path} permits adopted_as only for status adopted`)
    if (status !== 'retained' && fields.retained_as) throw tradeError(`${path} permits retained_as only for status retained`)
    if (status === 'superseded' && !fields.superseded_by) throw tradeError(`${path} requires superseded_by for status superseded`)
    if (status !== 'superseded' && fields.superseded_by) throw tradeError(`${path} permits superseded_by only for status superseded`)
  }
  return {
    id,
    title,
    createdAt,
    sender: recordSender,
    receiver,
    kind,
    sourceRef,
    ...(status ? { status } : {}),
    ...(fields.reviewed_at ? { reviewedAt: fields.reviewed_at } : {}),
    ...(fields.rationale ? { rationale: fields.rationale } : {}),
    ...(fields.adopted_as ? { adoptedAs: fields.adopted_as } : {}),
    ...(fields.retained_as ? { retainedAs: fields.retained_as } : {}),
    ...(fields.superseded_by ? { supersededBy: fields.superseded_by } : {}),
    body,
    contents
  }
}

const tradePath = (root: string, direction: TradeDirection, peer: string, id: string): string => {
  const [owner, repository] = addressParts(peer)
  return join(root, direction === 'inbound' ? '+' : '-', '_TRADES', owner, repository, `${identifier(id)}.md`)
}

const outboundContents = (
  record: Omit<TradeRecord, 'body' | 'contents'> & { readonly context: string; readonly submission: string; readonly constraints: string }
): string =>
  [
    '---',
    `id: ${record.id}`,
    `title: ${JSON.stringify(record.title)}`,
    `created_at: ${record.createdAt}`,
    `sender: ${record.sender}`,
    `receiver: ${record.receiver}`,
    `kind: ${record.kind}`,
    `source_ref: ${JSON.stringify(record.sourceRef)}`,
    '---',
    `# ${record.id}: ${record.title}`,
    '',
    '## Context',
    '',
    record.context,
    '',
    '## Submission',
    '',
    record.submission,
    '',
    '## Constraints',
    '',
    record.constraints,
    ''
  ].join('\n')

export const createOutboundTrade = async (
  context: KiContext,
  options: {
    readonly to: string
    readonly kind: TradeKind
    readonly title: string
    readonly sourceRef: string
    readonly context: string
    readonly submission: string
    readonly constraints: string
  }
): Promise<TradeRecord> => {
  const local = await localRegisteredConfiguration(context)
  const receiver = await requireActiveRoute(context, local.configuration, options.to, 'export', options.kind)
  /* v8 ignore next 2 -- public CLI grammar rejects every empty authored field before invoking the core operation. */
  if (![options.title, options.sourceRef, options.context, options.submission, options.constraints].every((value) => value.trim()))
    throw tradeError('trade title, source-ref, context, submission, and constraints must be non-empty')
  const id = `TRD-${randomUUID().slice(0, 8)}`
  const createdAt = new Date(context.now()).toISOString().replace(/\.\d{3}Z$/u, 'Z')
  const contents = outboundContents({ id, createdAt, sender: local.configuration.identity, receiver: receiver.configuration.identity, ...options })
  const path = tradePath(local.repository.root, 'outbound', receiver.configuration.identity, id)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, contents, 'utf8')
  return recordFromContents(contents, path, 'outbound')
}

const readDirectory = async (path: string): Promise<readonly string[]> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isDirectory()) return []
  return (await readdir(path, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith('.md')).map((entry) => join(path, entry.name))
}

const copyInboundContents = (record: TradeRecord): string => record.contents.replace('\n---\n', '\nstatus: received\n---\n')

export const receiveTrades = async (
  context: KiContext,
  repository: string,
  kind: TradeKind,
  requestedId?: string
): Promise<{ readonly received: readonly string[]; readonly existing: readonly string[] }> => {
  const local = await localRegisteredConfiguration(context)
  const sender = await requireActiveRoute(context, local.configuration, repository, 'import', kind)
  const directory = tradePath(sender.root, 'outbound', local.configuration.identity, 'TRD-00000000').replace(/TRD-[^/]+\.md$/u, '')
  const paths = await readDirectory(directory)
  const selected = requestedId ? paths.filter((path) => path.endsWith(`${identifier(requestedId)}.md`)) : paths
  if (requestedId && !selected.length) throw tradeError(`outbound trade ${requestedId} was not found for ${local.configuration.repository}`)
  const received: string[] = []
  const existing: string[] = []
  for (const path of selected) {
    const record = recordFromContents(await readFile(path, 'utf8'), path, 'outbound')
    if (record.kind !== kind || record.sender !== sender.configuration.identity || record.receiver !== local.configuration.identity)
      throw tradeError(`${path} does not match the active ${kind} trade route`)
    const destination = tradePath(local.repository.root, 'inbound', sender.configuration.identity, record.id)
    if (await lstat(destination).catch(() => undefined)) {
      existing.push(record.id)
      continue
    }
    await mkdir(join(destination, '..'), { recursive: true })
    await writeFile(destination, copyInboundContents(record), 'utf8')
    received.push(record.id)
  }
  return { received, existing }
}

const peerDirectories = async (root: string, direction: TradeDirection): Promise<readonly string[]> => {
  const base = join(root, direction === 'inbound' ? '+' : '-', '_TRADES')
  const state = await lstat(base).catch(() => undefined)
  if (!state?.isDirectory()) return []
  const paths: string[] = []
  for (const owner of await readdir(base, { withFileTypes: true })) {
    if (!owner.isDirectory()) continue
    for (const repository of await readdir(join(base, owner.name), { withFileTypes: true })) {
      if (!repository.isDirectory()) continue
      paths.push(...(await readDirectory(join(base, owner.name, repository.name))))
    }
  }
  return paths
}

const sameSenderPayload = (outbound: TradeRecord, inbound: TradeRecord): boolean =>
  outbound.id === inbound.id &&
  outbound.title === inbound.title &&
  outbound.createdAt === inbound.createdAt &&
  outbound.sender === inbound.sender &&
  outbound.receiver === inbound.receiver &&
  outbound.kind === inbound.kind &&
  outbound.sourceRef === inbound.sourceRef &&
  outbound.body === inbound.body

export const locateTrades = async (
  context: KiContext,
  options: { readonly id?: string; readonly direction?: TradeDirection; readonly repository?: string } = {}
): Promise<readonly LocatedTrade[]> => {
  if (options.id) identifier(options.id)
  /* v8 ignore next -- public CLI grammar validates canonical repository filters before estate traversal. */
  if (options.repository && !isTradeRepository(options.repository)) throw tradeError('repository must use canonical HTTPS GitHub repository form')
  const locations: LocatedTrade[] = []
  for (const repository of await registeredRepositories(context)) {
    if (options.repository && repository.configuration.repository !== options.repository) continue
    for (const direction of (options.direction ? [options.direction] : ['inbound', 'outbound']) as readonly TradeDirection[]) {
      for (const path of await peerDirectories(repository.root, direction)) {
        const record = recordFromContents(await readFile(path, 'utf8'), path, direction)
        if (options.id && record.id !== options.id) continue
        locations.push({ repository: repository.configuration.repository, root: repository.root, direction, path, record })
      }
    }
  }
  return locations.sort((left, right) =>
    `${left.repository}:${left.direction}:${left.record.id}`.localeCompare(`${right.repository}:${right.direction}:${right.record.id}`)
  )
}

const localTrade = async (
  context: KiContext,
  direction: TradeDirection,
  id: string
): Promise<{ readonly local: Awaited<ReturnType<typeof localRegisteredConfiguration>>; readonly trade: LocatedTrade }> => {
  const local = await localRegisteredConfiguration(context)
  const candidates = (await locateTrades(context, { id, direction, repository: local.configuration.repository })).filter(
    (candidate) => candidate.root === local.repository.root
  )
  if (candidates.length !== 1) throw tradeError(`${direction} trade ${id} was not found in the current repository`)
  return { local, trade: candidates[0] as LocatedTrade }
}

const peerForRecord = async (context: KiContext, identity: string): Promise<RegisteredRepository> => {
  const candidates = (await registeredRepositories(context)).filter((candidate) => candidate.configuration.identity === identity)
  if (candidates.length !== 1) throw tradeError(`trade record peer ${identity} is unavailable or ambiguous in the registered repository estate`)
  return candidates[0] as RegisteredRepository
}

export const releaseTrade = async (context: KiContext, id: string): Promise<void> => {
  const { local, trade } = await localTrade(context, 'outbound', identifier(id))
  if (trade.record.sender !== local.configuration.identity) throw tradeError(`outbound trade ${id} is not owned by the current repository`)
  const receiver = await peerForRecord(context, trade.record.receiver)
  await requireActiveRoute(context, local.configuration, receiver.configuration.repository, 'export', trade.record.kind)
  const inbound = tradePath(receiver.root, 'inbound', local.configuration.identity, id)
  const state = await lstat(inbound).catch(() => undefined)
  if (!state?.isFile()) throw tradeError(`receiver has not recorded an inbound trade ${id}`)
  const received = recordFromContents(await readFile(inbound, 'utf8'), inbound, 'inbound')
  if (!terminalStatuses.includes(received.status as (typeof terminalStatuses)[number]))
    throw tradeError(`trade ${id} cannot be released while receiver status is ${received.status}`)
  if (!sameSenderPayload(trade.record, received)) throw tradeError(`receiver inbound trade ${id} does not preserve the sender payload`)
  await rm(trade.path)
}

export const pruneTrade = async (context: KiContext, id: string): Promise<void> => {
  const { local, trade } = await localTrade(context, 'inbound', identifier(id))
  if (trade.record.receiver !== local.configuration.identity) throw tradeError(`inbound trade ${id} is not addressed to the current repository`)
  if (!terminalStatuses.includes(trade.record.status as (typeof terminalStatuses)[number]))
    throw tradeError(`trade ${id} cannot be pruned while receiver status is ${trade.record.status}`)
  const sender = await peerForRecord(context, trade.record.sender)
  await requireActiveRoute(context, local.configuration, sender.configuration.repository, 'import', trade.record.kind)
  const outbound = tradePath(sender.root, 'outbound', local.configuration.identity, id)
  if (await lstat(outbound).catch(() => undefined)) throw tradeError(`trade ${id} cannot be pruned before sender release is observable`)
  await rm(trade.path)
}
