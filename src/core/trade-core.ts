import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'
import { parse } from 'smol-toml'
import { inspectUserConfiguration } from '../agents/configuration.ts'
import type { KiContext } from '../context.ts'
import { REPOSITORY_CONFIGURATION_FILE } from './configuration.ts'
import { KiError } from './errors.ts'
import { type RepositoryLocation, resolveRepository } from './repository.ts'

const TRADES_TABLE = 'knowledgeislands/ki-agentic-harness:ki-trades'
const REPOSITORY_TABLE = 'knowledgeislands/ki-agentic-harness:ki-repo'
const addressExpression = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/
const repositoryExpression =
  /^https:\/\/github\.com\/([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)\/([a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)$/
const identifierExpression = /^TRD-[0-9a-f]{8}$/
const timestampExpression = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
const commitExpression = /^[0-9a-f]{40}$/
const tradeKinds = ['work', 'knowledge'] as const
const observationPolicies = ['unattended', 'receipt', 'decision', 'completion'] as const
const decisionStatuses = [
  'unconsidered',
  'in_progress',
  'parked',
  'clarify',
  'applied',
  'adopted',
  'retained',
  'declined',
  'superseded'
] as const
const terminalDecisionStatuses = ['applied', 'adopted', 'retained', 'declined', 'superseded'] as const

export type TradeDirection = 'preparation' | 'inbound' | 'outbound'
export type RouteDirection = 'export' | 'import'
export type TradeKind = (typeof tradeKinds)[number]
export type ObservationPolicy = (typeof observationPolicies)[number]
export type DecisionStatus = (typeof decisionStatuses)[number]

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
  readonly observation: ObservationPolicy
  readonly phase?: 'preparing'
  readonly decisionStatus?: DecisionStatus
  readonly receivedFromRef?: string
  readonly reviewedAt?: string
  readonly rationale?: string
  readonly appliedCommit?: string
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

export interface TradeLifecycle {
  readonly publicationStatus: 'preparing' | 'submitted'
  readonly deliveryStatus: 'not-deliverable' | 'awaiting-receipt' | 'received'
  readonly decisionStatus?: DecisionStatus
  readonly releaseEligible: boolean
  readonly pruneEligible: boolean
}

interface TradeFields {
  readonly id?: string
  readonly title?: string
  readonly created_at?: string
  readonly sender?: string
  readonly receiver?: string
  readonly kind?: string
  readonly source_ref?: string
  readonly observation?: string
  readonly phase?: string
  readonly decision_status?: string
  readonly received_from_ref?: string
  readonly reviewed_at?: string
  readonly rationale?: string
  readonly applied_commit?: string
  readonly adopted_as?: string
  readonly retained_as?: string
  readonly superseded_by?: string
  readonly [key: string]: string | undefined
}

interface RegisteredRepository {
  readonly root: string
  readonly repository: string
  readonly configuration?: TradeConfiguration
}

interface ActiveRegisteredRepository extends RegisteredRepository {
  readonly configuration: TradeConfiguration
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasRepository = (value: unknown): value is { readonly repository: unknown } =>
  isRecord(value) && 'repository' in value

const tradeError = (message: string): KiError => new KiError(message, 2)

export const isTradeRepository = (value: string): boolean => repositoryExpression.test(value)

export const isTradeIdentifier = (value: string): boolean => identifierExpression.test(value)

export const isTradeKind = (value: string): value is TradeKind => tradeKinds.includes(value as TradeKind)

export const isObservationPolicy = (value: string): value is ObservationPolicy =>
  observationPolicies.includes(value as ObservationPolicy)

const repositoryIdentity = (repository: string): string => repository.slice('https://github.com/'.length)

const addressParts = (address: string): readonly [string, string] => {
  if (!addressExpression.test(address))
    throw tradeError('trade record address must use canonical lower-case owner/repository form')
  return address.split('/') as [string, string]
}

const identifier = (value: string): string => {
  if (!isTradeIdentifier(value))
    throw tradeError('trade id must use TRD- followed by eight lower-case hexadecimal characters')
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
    if (entries.includes(repository))
      throw tradeError(`${path} [${TRADES_TABLE}].${key}.${kind} must not contain the local repository`)
    if (
      new Set(entries).size !== entries.length ||
      entries.some((entry, index) => index > 0 && entry.localeCompare(entries[index - 1] as string) <= 0)
    )
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
  if (
    !hasRepository(repositoryDeclaration) ||
    typeof repositoryDeclaration.repository !== 'string' ||
    !isTradeRepository(repositoryDeclaration.repository)
  )
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

export const readTradeConfiguration = async (path: string): Promise<TradeConfiguration> =>
  parseConfiguration(await readFile(path, 'utf8'), path)

const readEditableConfiguration = async (path: string): Promise<TradeConfiguration> =>
  parseConfiguration(await readFile(path, 'utf8'), path, true)

const renderRoutes = (routes: Readonly<Record<TradeKind, readonly string[]>>): readonly string[] =>
  tradeKinds.map((kind) =>
    routes[kind].length
      ? `${kind} = [${routes[kind].map((route) => JSON.stringify(route)).join(', ')}]`
      : `${kind} = []`
  )

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
  const isOwnedHeader = (header: string | undefined): boolean =>
    header === table || Boolean(header?.startsWith(`${table}.`))
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
  const existing = await readEditableConfiguration(path)
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
  const peer = repositoryIdentity(repository)
  const [owner, name] = addressParts(peer)
  const roots =
    direction === 'export'
      ? [
          join(dirname(path), '-', '_TRADES', '_PREPARATIONS', owner, name),
          join(dirname(path), '-', '_TRADES', owner, name)
        ]
      : [join(dirname(path), '+', '_TRADES', owner, name)]
  const dependencies: string[] = []
  for (const root of roots) {
    const state = await lstat(root).catch(() => undefined)
    if (!state?.isDirectory()) continue
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.startsWith('TRD-') || !entry.name.endsWith('.md')) continue
      const recordPath = join(root, entry.name)
      if ((await readFile(recordPath, 'utf8')).includes(`\nkind: ${kind}\n`)) dependencies.push(entry.name.slice(0, -3))
    }
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

const registeredRoots = async (context: KiContext): Promise<readonly string[]> => {
  const configuration = await inspectUserConfiguration(context.paths.config)
  if (configuration.state === 'missing')
    throw new KiError('ki environment is not bootstrapped; run `ki bootstrap` first', 1)
  if (configuration.state === 'invalid')
    throw new KiError(`ki configuration is invalid: ${configuration.errors.join('; ')}`, 1)
  return configuration.repositories
}

const registeredRepositories = async (context: KiContext): Promise<readonly RegisteredRepository[]> => {
  const repositories: RegisteredRepository[] = []
  for (const root of await registeredRoots(context)) {
    const path = join(root, REPOSITORY_CONFIGURATION_FILE)
    const state = await lstat(path).catch(() => undefined)
    if (!state?.isFile()) continue
    try {
      const contents = await readFile(path, 'utf8')
      const parsed = parse(contents)
      /* v8 ignore next -- smol-toml parses valid configuration input as a document object. */
      const repositoryDeclaration = isRecord(parsed) ? parsed[REPOSITORY_TABLE] : undefined
      if (
        !hasRepository(repositoryDeclaration) ||
        typeof repositoryDeclaration.repository !== 'string' ||
        !isTradeRepository(repositoryDeclaration.repository)
      )
        continue
      const repository = repositoryDeclaration.repository
      try {
        repositories.push({ root, repository, configuration: parseConfiguration(contents, path) })
      } catch {
        repositories.push({ root, repository })
      }
    } catch {
      // Invalid registered entries cannot identify a trade endpoint.
    }
  }
  return repositories
}

export const localRepository = async (context: KiContext): Promise<RepositoryLocation> =>
  resolveRepository({ workingDirectory: context.workingDirectory, homeDirectory: context.homeDirectory })

export const localRegisteredRepository = async (context: KiContext): Promise<RepositoryLocation> => {
  const repository = await localRepository(context)
  if (!(await registeredRoots(context)).includes(repository.root))
    throw tradeError('current KI repository is not registered in the local KI repository estate')
  return repository
}

export const localRegisteredConfiguration = async (
  context: KiContext
): Promise<{ readonly repository: RepositoryLocation; readonly configuration: TradeConfiguration }> => {
  const repository = await localRegisteredRepository(context)
  return { repository, configuration: await readTradeConfiguration(repository.configuration) }
}

export type RouteState = 'active' | 'awaiting-receiver' | 'awaiting-sender' | 'ambiguous-repository'

export interface RouteInspection {
  readonly repository: string
  readonly direction: RouteDirection
  readonly kind: TradeKind
  readonly state: RouteState
  readonly peer?: RegisteredRepository
}

export interface EstateRouteInspection extends RouteInspection {
  readonly source: Pick<TradeConfiguration, 'identity' | 'repository'>
}

const declaredRoutes = (
  configuration: TradeConfiguration
): readonly Pick<RouteInspection, 'repository' | 'direction' | 'kind'>[] =>
  tradeKinds.flatMap((kind) => [
    ...configuration.exportsTo[kind].map((repository) => ({ repository, direction: 'export' as const, kind })),
    ...configuration.importsFrom[kind].map((repository) => ({ repository, direction: 'import' as const, kind }))
  ])

const inspectRoutesInEstate = (
  repositories: readonly RegisteredRepository[],
  local: TradeConfiguration
): readonly RouteInspection[] =>
  declaredRoutes(local).map((route) => {
    const candidates = repositories.filter((candidate) => candidate.repository === route.repository)
    const pending = route.direction === 'export' ? 'awaiting-receiver' : 'awaiting-sender'
    if (!candidates.length) return { ...route, state: pending }
    if (candidates.length > 1) return { ...route, state: 'ambiguous-repository' }
    const peer = candidates[0] as RegisteredRepository
    if (!peer.configuration) return { ...route, state: pending, peer }
    const reciprocal =
      route.direction === 'export'
        ? peer.configuration.importsFrom[route.kind]
        : peer.configuration.exportsTo[route.kind]
    if (!reciprocal.includes(local.repository)) return { ...route, state: pending, peer }
    return { ...route, state: 'active', peer }
  })

export const inspectRoutes = async (
  context: KiContext,
  local: TradeConfiguration
): Promise<readonly RouteInspection[]> => inspectRoutesInEstate(await registeredRepositories(context), local)

export const inspectEstateRoutes = async (context: KiContext): Promise<readonly EstateRouteInspection[]> => {
  const repositories = await registeredRepositories(context)
  return repositories.flatMap((source) => {
    const configuration = source.configuration
    return configuration
      ? inspectRoutesInEstate(repositories, configuration).map((route) => ({
          ...route,
          source: { identity: configuration.identity, repository: configuration.repository }
        }))
      : []
  })
}

export const requireActiveRoute = async (
  context: KiContext,
  local: TradeConfiguration,
  repository: string,
  direction: RouteDirection,
  kind: TradeKind
): Promise<ActiveRegisteredRepository> => {
  /* v8 ignore next -- public CLI grammar validates canonical repository URLs before route inspection. */
  if (!isTradeRepository(repository))
    throw tradeError('trade route repository must use canonical HTTPS GitHub repository form')
  const route = (await inspectRoutes(context, local)).find(
    (candidate) => candidate.repository === repository && candidate.direction === direction && candidate.kind === kind
  )
  if (route?.state !== 'active')
    throw tradeError(
      `${direction} ${kind} trade route ${repository} is ${route?.state?.replace('-', ' ') ?? 'not declared locally'}`
    )
  return route.peer as ActiveRegisteredRepository
}

const requireDeclaredExportRoute = (local: TradeConfiguration, repository: string, kind: TradeKind): string => {
  /* v8 ignore next -- public CLI grammar validates canonical repository URLs before core trade creation. */
  if (!isTradeRepository(repository))
    throw tradeError('trade route repository must use canonical HTTPS GitHub repository form')
  if (!local.exportsTo[kind].includes(repository))
    throw tradeError(`export ${kind} trade route ${repository} is not declared locally`)
  return repositoryIdentity(repository)
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

const receiverFieldNames = [
  'decision_status',
  'received_from_ref',
  'reviewed_at',
  'rationale',
  'applied_commit',
  'adopted_as',
  'retained_as',
  'superseded_by'
] as const

const rawSenderProjection = (contents: string, direction: TradeDirection): string => {
  if (direction !== 'inbound') return contents
  // Only an inbound record reaches the exec, and its contents were already accepted by the
  // frontmatter parse against an equivalent expression, so the match cannot fail.
  const match = /^(---\n)([\s\S]*?)(\n---\n[\s\S]*)$/u.exec(contents) as RegExpExecArray
  const frontmatter = (match[2] as string)
    .split('\n')
    .filter((line) => {
      const key = /^([a-z_]+):/u.exec(line)?.[1]
      return !key || !receiverFieldNames.includes(key as (typeof receiverFieldNames)[number])
    })
    .join('\n')
  return `${match[1]}${frontmatter}${match[3]}`
}

const recordFromContents = (contents: string, path: string, direction: TradeDirection): TradeRecord => {
  const { fields, body } = frontmatter(contents, path)
  const sender = ['id', 'title', 'created_at', 'sender', 'receiver', 'kind', 'source_ref', 'observation']
  const allowed =
    direction === 'preparation'
      ? [...sender, 'phase']
      : direction === 'outbound'
        ? sender
        : [...sender, ...receiverFieldNames]
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
  const observation = requiredField(fields, 'observation', path)
  if (!timestampExpression.test(createdAt)) throw tradeError(`${path} has invalid created_at timestamp`)
  addressParts(recordSender)
  addressParts(receiver)
  if (!isTradeKind(kind)) throw tradeError(`${path} has invalid trade kind`)
  if (!isObservationPolicy(observation)) throw tradeError(`${path} has invalid observation policy`)
  if (direction === 'preparation' && fields.phase !== 'preparing')
    throw tradeError(`${path} preparation must declare phase: preparing`)

  const content = body.replace(/^(?:\r?\n)+/u, '')
  if (content.split('\n')[0] !== `# ${id}: ${title}`)
    throw tradeError(`${path} H1 must exactly repeat trade id and title`)
  for (const heading of ['Context', 'Submission', 'Constraints']) {
    const section = new RegExp(`(?:^|\\n)## ${heading}\\n\\n([\\s\\S]*?)(?=\\n## |$)`, 'u').exec(body)
    if (!section?.[1]?.trim()) throw tradeError(`${path} requires non-empty ${heading} section`)
  }

  const decisionStatus = fields.decision_status as DecisionStatus | undefined
  if (direction === 'inbound') {
    if (!decisionStatus || !decisionStatuses.includes(decisionStatus))
      throw tradeError(`${path} has invalid decision status`)
    if (fields.received_from_ref && !commitExpression.test(fields.received_from_ref))
      throw tradeError(`${path} has invalid received_from_ref commit`)
    if (fields.reviewed_at && !timestampExpression.test(fields.reviewed_at))
      throw tradeError(`${path} has invalid reviewed_at timestamp`)
    if (['parked', 'clarify', 'declined', 'superseded'].includes(decisionStatus) && !fields.rationale)
      throw tradeError(`${path} requires rationale for decision status ${decisionStatus}`)
    if (decisionStatus === 'adopted' && kind !== 'work')
      throw tradeError(`${path} permits adopted only for work trades`)
    if (decisionStatus === 'adopted' && !fields.adopted_as)
      throw tradeError(`${path} requires adopted_as for decision status adopted`)
    if (decisionStatus === 'applied' && kind !== 'work')
      throw tradeError(`${path} permits applied only for work trades`)
    if (decisionStatus === 'applied' && (!fields.applied_commit || !commitExpression.test(fields.applied_commit)))
      throw tradeError(`${path} requires full applied_commit for decision status applied`)
    if (decisionStatus === 'retained' && kind !== 'knowledge')
      throw tradeError(`${path} permits retained only for knowledge trades`)
    if (decisionStatus === 'retained' && !fields.retained_as)
      throw tradeError(`${path} requires retained_as for decision status retained`)
    if (decisionStatus !== 'adopted' && fields.adopted_as)
      throw tradeError(`${path} permits adopted_as only for decision status adopted`)
    if (decisionStatus !== 'applied' && fields.applied_commit)
      throw tradeError(`${path} permits applied_commit only for decision status applied`)
    if (decisionStatus !== 'retained' && fields.retained_as)
      throw tradeError(`${path} permits retained_as only for decision status retained`)
    if (decisionStatus === 'superseded' && !fields.superseded_by)
      throw tradeError(`${path} requires superseded_by for decision status superseded`)
    if (decisionStatus !== 'superseded' && fields.superseded_by)
      throw tradeError(`${path} permits superseded_by only for decision status superseded`)
  }
  return {
    id,
    title,
    createdAt,
    sender: recordSender,
    receiver,
    kind,
    sourceRef,
    observation,
    ...(direction === 'preparation' ? { phase: 'preparing' as const } : {}),
    ...(decisionStatus ? { decisionStatus } : {}),
    ...(fields.received_from_ref ? { receivedFromRef: fields.received_from_ref } : {}),
    ...(fields.reviewed_at ? { reviewedAt: fields.reviewed_at } : {}),
    ...(fields.rationale ? { rationale: fields.rationale } : {}),
    ...(fields.applied_commit ? { appliedCommit: fields.applied_commit } : {}),
    ...(fields.adopted_as ? { adoptedAs: fields.adopted_as } : {}),
    ...(fields.retained_as ? { retainedAs: fields.retained_as } : {}),
    ...(fields.superseded_by ? { supersededBy: fields.superseded_by } : {}),
    body,
    contents
  }
}

const tradePath = (root: string, direction: TradeDirection, peer: string, id: string): string => {
  const [owner, repository] = addressParts(peer)
  if (direction === 'preparation')
    return join(root, '-', '_TRADES', '_PREPARATIONS', owner, repository, `${identifier(id)}.md`)
  return join(root, direction === 'inbound' ? '+' : '-', '_TRADES', owner, repository, `${identifier(id)}.md`)
}

const senderContents = (
  record: Omit<TradeRecord, 'body' | 'contents'> & {
    readonly context: string
    readonly submission: string
    readonly constraints: string
  }
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
    `observation: ${record.observation}`,
    // Sender contents are only ever rendered for a new preparation, so the phase is fixed here;
    // submitTrade strips the line again when it freezes the record for outbound submission.
    'phase: preparing',
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

export const createTradePreparation = async (
  context: KiContext,
  options: {
    readonly to: string
    readonly kind: TradeKind
    readonly observation: ObservationPolicy
    readonly title: string
    readonly sourceRef: string
    readonly context: string
    readonly submission: string
    readonly constraints: string
  }
): Promise<TradeRecord> => {
  const local = await localRegisteredConfiguration(context)
  const receiver = requireDeclaredExportRoute(local.configuration, options.to, options.kind)
  /* v8 ignore next 2 -- public CLI grammar rejects every empty authored field before invoking the core operation. */
  if (
    ![options.title, options.sourceRef, options.context, options.submission, options.constraints].every((value) =>
      value.trim()
    )
  )
    throw tradeError('trade title, source-ref, context, submission, and constraints must be non-empty')
  const id = `TRD-${randomUUID().slice(0, 8)}`
  const createdAt = new Date(context.now()).toISOString().replace(/\.\d{3}Z$/u, 'Z')
  const contents = senderContents({
    id,
    createdAt,
    sender: local.configuration.identity,
    receiver,
    ...options
  })
  const path = tradePath(local.repository.root, 'preparation', receiver, id)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, contents, 'utf8')
  return recordFromContents(contents, path, 'preparation')
}

export const submitTrade = async (context: KiContext, id: string): Promise<TradeRecord> => {
  const { trade } = await localTrade(context, 'preparation', identifier(id))
  const destination = tradePath(trade.root, 'outbound', trade.record.receiver, trade.record.id)
  if (await lstat(destination).catch(() => undefined)) throw tradeError(`outbound trade ${id} already exists`)
  const contents = trade.record.contents.replace('\nphase: preparing\n---\n', '\n---\n')
  const submitted = recordFromContents(contents, destination, 'outbound')
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(trade.path, contents, 'utf8')
  await rename(trade.path, destination)
  return submitted
}

export const abandonTrade = async (context: KiContext, id: string): Promise<void> => {
  const { trade } = await localTrade(context, 'preparation', identifier(id))
  await rm(trade.path)
}

const readDirectory = async (path: string): Promise<readonly string[]> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isDirectory()) return []
  return (await readdir(path, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(path, entry.name))
}

const committedFile = async (
  context: KiContext,
  root: string,
  path: string
): Promise<{ readonly contents: string; readonly ref: string }> => {
  const revision = await context.runner('git', ['-C', root, 'rev-parse', 'HEAD'], context.environment)
  const ref = revision.output.trim()
  if (revision.exitCode !== 0 || !commitExpression.test(ref))
    throw tradeError(`trade peer ${root} has no usable committed HEAD`)
  const source = await context.runner(
    'git',
    ['-C', root, 'show', `${ref}:${relative(root, path)}`],
    context.environment
  )
  if (source.exitCode !== 0) throw tradeError(`trade record ${relative(root, path)} is not committed at ${ref}`)
  return { contents: source.output, ref }
}

const copyInboundContents = (record: TradeRecord, receivedFromRef: string): string =>
  record.contents.replace('\n---\n', `\ndecision_status: unconsidered\nreceived_from_ref: ${receivedFromRef}\n---\n`)

const receivableTrade = async (
  context: KiContext,
  local: Awaited<ReturnType<typeof localRegisteredConfiguration>>,
  id: string
): Promise<{
  readonly sender: ActiveRegisteredRepository
  readonly path: string
  readonly record: TradeRecord
  readonly ref: string
}> => {
  const candidates: { sender: ActiveRegisteredRepository; path: string; record: TradeRecord; ref: string }[] = []
  for (const repository of await registeredRepositories(context)) {
    if (!repository.configuration) continue
    for (const kind of tradeKinds) {
      if (!local.configuration.importsFrom[kind].includes(repository.repository)) continue
      const peer = local.configuration.identity
      const path = tradePath(repository.root, 'outbound', peer, id)
      if (!(await lstat(path).catch(() => undefined))?.isFile()) continue
      const committed = await committedFile(context, repository.root, path)
      const record = recordFromContents(committed.contents, path, 'outbound')
      if (record.kind !== kind || record.sender !== repository.configuration.identity || record.receiver !== peer)
        continue
      const sender = await requireActiveRoute(context, local.configuration, repository.repository, 'import', kind)
      candidates.push({ sender, path, record, ref: committed.ref })
    }
  }
  if (candidates.length !== 1)
    throw tradeError(`outbound trade ${id} is unavailable or ambiguous for ${local.configuration.repository}`)
  return candidates[0] as (typeof candidates)[number]
}

export const receiveTrade = async (
  context: KiContext,
  requestedId: string
): Promise<{ readonly id: string; readonly existing: boolean }> => {
  const local = await localRegisteredConfiguration(context)
  const candidate = await receivableTrade(context, local, identifier(requestedId))
  const destination = tradePath(
    local.repository.root,
    'inbound',
    candidate.sender.configuration.identity,
    candidate.record.id
  )
  if (await lstat(destination).catch(() => undefined)) return { id: candidate.record.id, existing: true }
  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, copyInboundContents(candidate.record, candidate.ref), 'utf8')
  return { id: candidate.record.id, existing: false }
}

export const previewReceivableTrades = async (context: KiContext): Promise<readonly TradeRecord[]> => {
  const local = await localRegisteredConfiguration(context)
  const ids = new Set<string>()
  for (const sender of await registeredRepositories(context)) {
    if (!sender.configuration) continue
    for (const kind of tradeKinds) {
      if (!local.configuration.importsFrom[kind].includes(sender.repository)) continue
      const directory = dirname(tradePath(sender.root, 'outbound', local.configuration.identity, 'TRD-00000000'))
      for (const path of await readDirectory(directory))
        if (isTradeIdentifier(basename(path, '.md'))) ids.add(basename(path, '.md'))
    }
  }
  const records: TradeRecord[] = []
  for (const id of [...ids].sort()) records.push((await receivableTrade(context, local, id)).record)
  return records
}

export interface ObservedPreparation {
  readonly record: TradeRecord
  readonly ref: string
  readonly mode: 'diff' | 'verbatim'
  readonly output: string
  readonly reason?: string
}

export const observeTradePreparation = async (
  context: KiContext,
  requestedId: string
): Promise<ObservedPreparation> => {
  const id = identifier(requestedId)
  const local = await localRegisteredConfiguration(context)
  const candidates: { root: string; path: string; contents: string; ref: string; record: TradeRecord }[] = []
  for (const sender of await registeredRepositories(context)) {
    if (!sender.configuration) continue
    for (const kind of tradeKinds) {
      if (!sender.configuration.exportsTo[kind].includes(local.configuration.repository)) continue
      const path = tradePath(sender.root, 'preparation', local.configuration.identity, id)
      try {
        const committed = await committedFile(context, sender.root, path)
        const record = recordFromContents(committed.contents, path, 'preparation')
        if (record.kind === kind) candidates.push({ root: sender.root, path, ...committed, record })
      } catch {}
    }
  }
  if (candidates.length !== 1)
    throw tradeError(`preparation ${id} is unavailable or ambiguous for ${local.configuration.repository}`)
  const candidate = candidates[0] as (typeof candidates)[number]
  const record = candidate.record
  const cursor = join(context.paths.state, 'trades', 'observations', record.sender, `${record.id}.ref`)
  const previous = await readFile(cursor, 'utf8').catch(() => '')
  let mode: ObservedPreparation['mode'] = 'verbatim'
  let output = candidate.contents
  let reason = 'first observation has no prior committed reference'
  if (commitExpression.test(previous.trim())) {
    const before = previous.trim()
    const comparable = await context.runner(
      'git',
      ['-C', candidate.root, 'merge-base', '--is-ancestor', before, candidate.ref],
      context.environment
    )
    if (comparable.exitCode === 0) {
      const diff = await context.runner(
        'git',
        ['-C', candidate.root, 'diff', before, candidate.ref, '--', relative(candidate.root, candidate.path)],
        context.environment
      )
      if (diff.exitCode === 0) {
        mode = 'diff'
        output = diff.output
        reason = ''
      }
    } else reason = 'the prior reference is not comparable with the current committed history'
  }
  await mkdir(dirname(cursor), { recursive: true })
  await writeFile(cursor, `${candidate.ref}\n`, 'utf8')
  return { record, ref: candidate.ref, mode, output, ...(reason ? { reason } : {}) }
}

const peerDirectories = async (root: string, direction: TradeDirection): Promise<readonly string[]> => {
  const base =
    direction === 'preparation'
      ? join(root, '-', '_TRADES', '_PREPARATIONS')
      : join(root, direction === 'inbound' ? '+' : '-', '_TRADES')
  const state = await lstat(base).catch(() => undefined)
  if (!state?.isDirectory()) return []
  const paths: string[] = []
  for (const owner of await readdir(base, { withFileTypes: true })) {
    if (!owner.isDirectory() || (direction === 'outbound' && owner.name === '_PREPARATIONS')) continue
    for (const repository of await readdir(join(base, owner.name), { withFileTypes: true })) {
      if (!repository.isDirectory()) continue
      paths.push(...(await readDirectory(join(base, owner.name, repository.name))))
    }
  }
  return paths
}

const sameSenderPayload = (outbound: TradeRecord, inbound: TradeRecord): boolean =>
  rawSenderProjection(outbound.contents, 'outbound') === rawSenderProjection(inbound.contents, 'inbound')

export const locateTrades = async (
  context: KiContext,
  options: { readonly id?: string; readonly direction?: TradeDirection; readonly repository?: string } = {}
): Promise<readonly LocatedTrade[]> => {
  if (options.id) identifier(options.id)
  /* v8 ignore next -- public CLI grammar validates canonical repository filters before estate traversal. */
  if (options.repository && !isTradeRepository(options.repository))
    throw tradeError('repository must use canonical HTTPS GitHub repository form')
  const locations: LocatedTrade[] = []
  for (const repository of await registeredRepositories(context)) {
    if (!repository.configuration || (options.repository && repository.repository !== options.repository)) continue
    for (const direction of (options.direction
      ? [options.direction]
      : ['preparation', 'inbound', 'outbound']) as readonly TradeDirection[]) {
      for (const path of await peerDirectories(repository.root, direction)) {
        const record = recordFromContents(await readFile(path, 'utf8'), path, direction)
        if (options.id && record.id !== options.id) continue
        locations.push({ repository: repository.repository, root: repository.root, direction, path, record })
      }
    }
  }
  return locations.sort((left, right) =>
    `${left.repository}:${left.direction}:${left.record.id}`.localeCompare(
      `${right.repository}:${right.direction}:${right.record.id}`
    )
  )
}

const linkedWorkIsDone = (root: string, identity: string): boolean => {
  const directory = join(root, 'docs', 'roadmap')
  if (!existsSync(directory)) return false
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const contents = readFileSync(join(directory, entry.name), 'utf8')
    if (contents.includes(`\nid: ${identity}\n`) && contents.includes('\nstatus: done\n')) return true
  }
  return false
}

const releaseEligible = (record: TradeRecord, receiverRoot: string): boolean => {
  if (record.observation === 'unattended' || record.observation === 'receipt') return true
  if (
    !record.decisionStatus ||
    !terminalDecisionStatuses.includes(record.decisionStatus as (typeof terminalDecisionStatuses)[number])
  )
    return false
  if (
    record.observation === 'decision' ||
    ['applied', 'retained', 'declined', 'superseded'].includes(record.decisionStatus)
  )
    return true
  // Inbound validation already rejects an adopted record with no adopted_as, so the identity
  // is present whenever this short-circuit reaches the lookup.
  return record.decisionStatus === 'adopted' && linkedWorkIsDone(receiverRoot, record.adoptedAs as string)
}

export const tradeLifecycle = (trade: LocatedTrade, estate: readonly LocatedTrade[]): TradeLifecycle => {
  if (trade.direction === 'preparation')
    return {
      publicationStatus: 'preparing',
      deliveryStatus: 'not-deliverable',
      releaseEligible: false,
      pruneEligible: false
    }
  if (trade.direction === 'inbound') {
    const outbound = estate.find(
      (candidate) =>
        candidate.direction === 'outbound' &&
        candidate.record.id === trade.record.id &&
        candidate.record.sender === trade.record.sender &&
        candidate.record.receiver === trade.record.receiver
    )
    const eligible = releaseEligible(trade.record, trade.root)
    return {
      publicationStatus: 'submitted',
      deliveryStatus: 'received',
      decisionStatus: trade.record.decisionStatus as DecisionStatus,
      releaseEligible: Boolean(outbound && eligible),
      pruneEligible: Boolean(!outbound && eligible)
    }
  }
  const inbound = estate.find(
    (candidate) =>
      candidate.direction === 'inbound' &&
      candidate.record.id === trade.record.id &&
      candidate.record.sender === trade.record.sender &&
      candidate.record.receiver === trade.record.receiver
  )
  return inbound
    ? {
        publicationStatus: 'submitted',
        deliveryStatus: 'received',
        decisionStatus: inbound.record.decisionStatus as DecisionStatus,
        releaseEligible: releaseEligible(inbound.record, inbound.root),
        pruneEligible: false
      }
    : {
        publicationStatus: 'submitted',
        deliveryStatus: 'awaiting-receipt',
        releaseEligible: false,
        pruneEligible: false
      }
}

const localTrade = async (
  context: KiContext,
  direction: TradeDirection,
  id: string
): Promise<{
  readonly local: Awaited<ReturnType<typeof localRegisteredConfiguration>>
  readonly trade: LocatedTrade
}> => {
  const local = await localRegisteredConfiguration(context)
  const candidates = (
    await locateTrades(context, { id, direction, repository: local.configuration.repository })
  ).filter((candidate) => candidate.root === local.repository.root)
  if (candidates.length !== 1) throw tradeError(`${direction} trade ${id} was not found in the current repository`)
  return { local, trade: candidates[0] as LocatedTrade }
}

const peerForRecord = async (context: KiContext, identity: string): Promise<ActiveRegisteredRepository> => {
  const candidates = (await registeredRepositories(context)).filter(
    (candidate): candidate is ActiveRegisteredRepository =>
      Boolean(candidate.configuration && candidate.configuration.identity === identity)
  )
  if (candidates.length !== 1)
    throw tradeError(`trade record peer ${identity} is unavailable or ambiguous in the registered repository estate`)
  return candidates[0] as ActiveRegisteredRepository
}

export const eligibleTradeCleanup = async (
  context: KiContext,
  operation: 'release' | 'prune'
): Promise<readonly LocatedTrade[]> => {
  const local = await localRegisteredConfiguration(context)
  const estate = await locateTrades(context)
  const direction = operation === 'release' ? 'outbound' : 'inbound'
  const selected = estate.filter((trade) => trade.root === local.repository.root && trade.direction === direction)
  const eligible: LocatedTrade[] = []
  for (const trade of selected) {
    const lifecycle = tradeLifecycle(trade, estate)
    if (operation === 'release' ? lifecycle.releaseEligible : lifecycle.pruneEligible) eligible.push(trade)
  }
  return eligible
}

export const releaseTrade = async (context: KiContext, id: string): Promise<void> => {
  const { local, trade } = await localTrade(context, 'outbound', identifier(id))
  if (trade.record.sender !== local.configuration.identity)
    throw tradeError(`outbound trade ${id} is not owned by the current repository`)
  const receiver = await peerForRecord(context, trade.record.receiver)
  await requireActiveRoute(context, local.configuration, receiver.configuration.repository, 'export', trade.record.kind)
  const inbound = tradePath(receiver.root, 'inbound', local.configuration.identity, id)
  const state = await lstat(inbound).catch(() => undefined)
  if (!state?.isFile()) throw tradeError(`receiver has not recorded an inbound trade ${id}`)
  const received = recordFromContents(await readFile(inbound, 'utf8'), inbound, 'inbound')
  if (!sameSenderPayload(trade.record, received))
    throw tradeError(`receiver inbound trade ${id} does not preserve the sender payload`)
  if (!releaseEligible(received, receiver.root))
    throw tradeError(
      `trade ${id} cannot be released before its ${trade.record.observation} observation policy is satisfied`
    )
  await rm(trade.path)
}

export const pruneTrade = async (context: KiContext, id: string): Promise<void> => {
  const { local, trade } = await localTrade(context, 'inbound', identifier(id))
  if (trade.record.receiver !== local.configuration.identity)
    throw tradeError(`inbound trade ${id} is not addressed to the current repository`)
  const sender = await peerForRecord(context, trade.record.sender)
  await requireActiveRoute(context, local.configuration, sender.configuration.repository, 'import', trade.record.kind)
  const outbound = tradePath(sender.root, 'outbound', local.configuration.identity, id)
  if (await lstat(outbound).catch(() => undefined))
    throw tradeError(`trade ${id} cannot be pruned before sender release is observable`)
  if (!releaseEligible(trade.record, trade.root))
    throw tradeError(`trade ${id} cannot be pruned after a premature ${trade.record.observation} sender release`)
  await rm(trade.path)
}
