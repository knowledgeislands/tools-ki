import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'
import { parse } from 'smol-toml'
import type { KiContext } from '../context.ts'
import { REPOSITORY_CONFIGURATION_FILE } from './configuration.ts'
import { KiError } from './errors.ts'
import {
  parseTradeAddress as addressParts,
  assertTradeIdentifier as identifier,
  isTradeIdentifier
} from './trade-identifiers.ts'
import { sameSenderPayload } from './trade-payload.ts'

export { isTradeIdentifier } from './trade-identifiers.ts'

import { requiredLocalRegistry } from './local-registry.ts'
import { type RepositoryLocation, resolveRepository } from './repository.ts'
import {
  isObservationPolicy,
  isTradeKind,
  isTradeRepository,
  type ObservationPolicy,
  type RouteDirection,
  readTradeConfiguration,
  type TradeConfiguration,
  type TradeKind,
  tradeKinds
} from './trade-configuration.ts'

const timestampExpression = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
const commitExpression = /^[0-9a-f]{40}$/
const tradePhases = ['preparing', 'submitted', 'received'] as const
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
export type TradePhase = (typeof tradePhases)[number]
export type DecisionStatus = (typeof decisionStatuses)[number]

export interface TradeRecord {
  readonly id: string
  readonly title: string
  readonly createdAt: string
  readonly sender: string
  readonly receiver: string
  readonly kind: TradeKind
  readonly sourceRef: string
  readonly observation: ObservationPolicy
  /** The copy's own lifecycle state, distinct from the receiver's `decisionStatus`. */
  readonly phase: TradePhase
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

/** One skill's table under the `[skills]` namespace, or undefined where the file declares neither. */
const skillTable = (parsed: Record<string, unknown>, name: string): unknown => {
  const skills = parsed['skills']
  return isRecord(skills) ? skills[name] : undefined
}

const hasRepository = (value: unknown): value is { readonly repository: unknown } =>
  isRecord(value) && 'repository' in value

const tradeError = (message: string): KiError => new KiError(message, 2)

const repositoryIdentity = (repository: string): string => repository.slice('https://github.com/'.length)

const registeredRoots = async (context: KiContext): Promise<readonly string[]> => {
  return (await requiredLocalRegistry(context.paths.state)).map((repository) => repository.path)
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
      const repositoryDeclaration = isRecord(parsed) ? skillTable(parsed, 'ki-repo') : undefined
      if (
        !hasRepository(repositoryDeclaration) ||
        typeof repositoryDeclaration.repository !== 'string' ||
        !isTradeRepository(repositoryDeclaration.repository)
      )
        continue
      const repository = repositoryDeclaration.repository
      try {
        repositories.push({ root, repository, configuration: await readTradeConfiguration(path) })
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
  readonly source: Pick<TradeConfiguration, 'identity' | 'repository' | 'mapBonus'>
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
          source: {
            identity: configuration.identity,
            repository: configuration.repository,
            mapBonus: configuration.mapBonus
          }
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

/**
 * Excluded from the projection comparison on both sides: a sender copy reads
 * `submitted` while its receiver copy reads `received`, so the two are correctly
 * divergent on this field alone and comparing it would report every honest pair as
 * tampered (KI-HARNESS-GOV-022).
 */
const phaseFieldNames = ['phase'] as const

/**
 * Set the frontmatter phase to `value`, replacing the existing line wherever it sits in the
 * block. An ordinary field update, so it does not depend on `phase` being the last key the
 * way the previous text substitution did. Every record carries a phase, so there is no
 * absent case to accommodate.
 */
const rewritePhase = (contents: string, value: TradePhase): string => {
  const match = /^(---\n)([\s\S]*?)(\n---\n[\s\S]*)$/u.exec(contents) as RegExpExecArray
  const lines = (match[2] as string).split('\n')
  const index = lines.findIndex((line) => line.startsWith('phase:'))
  return `${match[1]}${lines.with(index, `phase: ${value}`).join('\n')}${match[3]}`
}

const recordFromContents = (contents: string, path: string, direction: TradeDirection): TradeRecord => {
  const { fields, body } = frontmatter(contents, path)
  const sender = [
    'id',
    'title',
    'created_at',
    'sender',
    'receiver',
    'kind',
    'source_ref',
    'observation',
    ...phaseFieldNames
  ]
  const allowed = direction === 'inbound' ? [...sender, ...receiverFieldNames] : sender
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
  const phase = requiredField(fields, 'phase', path)
  // Tautological only for the callers that derive direction from the record itself, by way of
  // phaseOf. The callers that pass a literal direction decided from the path they read — the
  // receiver's inbound record during release above all — have consulted no phase field at all,
  // and the file may have been hand-edited in a repository this one does not own.
  if (!tradePhases.includes(phase as TradePhase)) throw tradeError(`${path} has invalid phase`)
  if (phase !== expectedPhase(direction))
    throw tradeError(`${path} ${direction} must declare phase: ${expectedPhase(direction)}`)

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
    phase: phase as TradePhase,
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
  // A preparation and its submitted successor share one path: submission rewrites the
  // phase field rather than relocating the record.
  return join(root, direction === 'inbound' ? '+' : '-', '_TRADES', owner, repository, `${identifier(id)}.md`)
}

const senderContents = (
  // Phase is not an input: sender contents are only ever rendered for a new preparation.
  record: Omit<TradeRecord, 'body' | 'contents' | 'phase'> & {
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
    // Markdown formatters put a blank line between frontmatter and the first block. Emitting it
    // makes the payload a fixed point of the formatter a receiver will run over its repository,
    // so an ordinary hygiene pass cannot make an untouched record read as tampered with.
    '',
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
  // Preparation and submission share one path, so submission rewrites the phase field in
  // place rather than relocating the record.
  const destination = trade.path
  const contents = rewritePhase(trade.record.contents, 'submitted')
  const submitted = recordFromContents(contents, destination, 'outbound')
  await writeFile(destination, contents, 'utf8')
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
  rewritePhase(record.contents, 'received').replace(
    '\n---\n',
    `\ndecision_status: unconsidered\nreceived_from_ref: ${receivedFromRef}\n---\n`
  )

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
      // A preparation shares the submitted record's path, so it is visible here but not yet
      // receivable: the sender has not frozen it. Skip only on a phase that reads cleanly —
      // a record too malformed to declare one must still reach the reader that can say why.
      const candidatePhase = readPhase(committed.contents)
      if (candidatePhase !== undefined && candidatePhase !== 'submitted') continue
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
  for (const id of [...ids].sort()) {
    // The directory now holds the sender's preparations alongside its submitted records, so
    // an id here is a candidate rather than a guarantee. Preview lists what is receivable and
    // stays silent about the rest; asking for one by id still reports why it is not.
    const candidate = await receivableTrade(context, local, id).catch(() => undefined)
    if (candidate) records.push(candidate.record)
  }
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

const expectedPhase = (direction: TradeDirection): TradePhase =>
  direction === 'preparation' ? 'preparing' : direction === 'outbound' ? 'submitted' : 'received'

/** Direction is read from the record's phase, so the scan walks physical areas instead. */
const directionForPhase: Readonly<Record<TradePhase, TradeDirection>> = {
  preparing: 'preparation',
  submitted: 'outbound',
  received: 'inbound'
}

/** The declared phase, or undefined where the record is too malformed to say. */
const readPhase = (contents: string): TradePhase | undefined => {
  const match = /^---\n([\s\S]*?)\n---\n/u.exec(contents)
  const line = (match?.[1] ?? '').split('\n').find((entry) => entry.startsWith('phase:'))
  const phase = line?.slice('phase:'.length).trim()
  return phase && tradePhases.includes(phase as TradePhase) ? (phase as TradePhase) : undefined
}

const phaseOf = (contents: string, path: string): TradePhase => {
  const phase = readPhase(contents)
  if (!phase) throw tradeError(`${path} has invalid phase`)
  return phase
}

const peerDirectories = async (root: string, area: '+' | '-'): Promise<readonly string[]> => {
  const base = join(root, area, '_TRADES')
  const state = await lstat(base).catch(() => undefined)
  if (!state?.isDirectory()) return []
  const paths: string[] = []
  for (const owner of await readdir(base, { withFileTypes: true })) {
    // No reserved directory name shares the owner namespace now that phase carries lifecycle.
    if (!owner.isDirectory()) continue
    for (const repository of await readdir(join(base, owner.name), { withFileTypes: true })) {
      if (!repository.isDirectory()) continue
      paths.push(...(await readDirectory(join(base, owner.name, repository.name))))
    }
  }
  return paths
}

/**
 * Projects what the sender authored, so pairing compares the payload rather than the receiver's
 * storage of it. A receiver that formats its repository renormalises frontmatter quoting and the
 * blank line after the frontmatter; neither is payload, and neither may read as tampering, or no
 * trade could complete its lifecycle in a repository with ordinary Markdown hygiene. A receiver
 * that alters a field value or the prose still fails, which is the guard's reason to exist.
 */
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
    for (const area of ['+', '-'] as const) {
      for (const path of await peerDirectories(repository.root, area)) {
        const contents = await readFile(path, 'utf8')
        const direction = directionForPhase[phaseOf(contents, path)]
        if (options.direction && direction !== options.direction) continue
        const record = recordFromContents(contents, path, direction)
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
