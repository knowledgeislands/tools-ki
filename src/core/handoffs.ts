import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import { inspectUserConfiguration } from '../agents/configuration.ts'
import type { KiContext } from '../context.ts'
import { REPOSITORY_CONFIGURATION_FILE } from './configuration.ts'
import { KiError } from './errors.ts'
import { type RepositoryLocation, resolveRepository } from './repository.ts'

const HANDOFFS_IDENTITY = 'knowledgeislands/ki-agentic-harness:ki-handoffs'
const addressExpression = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/
const identifierExpression = /^HND-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const timestampExpression = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
const receiverStatuses = ['received', 'adopted', 'parked', 'clarify', 'declined', 'superseded'] as const
const terminalStatuses = ['adopted', 'declined', 'superseded'] as const

export type HandoffDirection = 'inbound' | 'outbound'
export type ReceiverStatus = (typeof receiverStatuses)[number]

export interface HandoffConfiguration {
  readonly identity: string
  readonly peers: readonly string[]
}

export interface HandoffRecord {
  readonly id: string
  readonly title: string
  readonly createdAt: string
  readonly sender: string
  readonly receiver: string
  readonly sourceRef: string
  readonly status?: ReceiverStatus
  readonly reviewedAt?: string
  readonly rationale?: string
  readonly adoptedAs?: string
  readonly supersededBy?: string
  readonly body: string
  readonly contents: string
}

export interface LocatedHandoff {
  readonly repository: string
  readonly root: string
  readonly direction: HandoffDirection
  readonly path: string
  readonly record: HandoffRecord
}

interface ParsedDocument {
  readonly [key: string]: unknown
}

interface HandoffDeclaration {
  readonly identity?: unknown
  readonly peers?: unknown
  readonly [key: string]: unknown
}

interface HandoffFields {
  readonly id?: string
  readonly title?: string
  readonly created_at?: string
  readonly sender?: string
  readonly receiver?: string
  readonly source_ref?: string
  readonly status?: string
  readonly reviewed_at?: string
  readonly rationale?: string
  readonly adopted_as?: string
  readonly superseded_by?: string
  readonly [key: string]: string | undefined
}

interface RegisteredRepository {
  readonly root: string
  readonly configuration: HandoffConfiguration
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const handoffError = (message: string): KiError => new KiError(message, 2)

export const isHandoffAddress = (value: string): boolean => addressExpression.test(value)

export const isHandoffIdentifier = (value: string): boolean => identifierExpression.test(value)

const addressParts = (address: string): readonly [string, string] => {
  if (!isHandoffAddress(address)) throw handoffError('handoff address must use canonical lower-case owner/repository form')
  return address.split('/') as [string, string]
}

const identifier = (value: string): string => {
  if (!isHandoffIdentifier(value)) throw handoffError('handoff id must use HND- followed by a lower-case UUID')
  return value
}

const declaredHandoffs = (parsed: ParsedDocument, path: string): HandoffDeclaration => {
  const declaration = parsed[HANDOFFS_IDENTITY]
  if (!isRecord(declaration)) throw handoffError(`${path} does not declare [${HANDOFFS_IDENTITY}]`)
  return declaration as HandoffDeclaration
}

const parseConfiguration = (contents: string, path: string, allowIncomplete = false): HandoffConfiguration => {
  let parsed: unknown
  try {
    parsed = parse(contents)
  } catch {
    throw handoffError(`${path} must be valid TOML`)
  }
  if (!isRecord(parsed)) throw handoffError(`${path} must be a TOML table`)
  const declaration = declaredHandoffs(parsed, path)
  const unknown = Object.keys(declaration).filter((key) => key !== 'identity' && key !== 'peers')
  if (unknown.length) throw handoffError(`${path} [${HANDOFFS_IDENTITY}] has unrecognised key ${unknown[0]}`)
  const rawIdentity = declaration.identity
  const rawPeers = declaration.peers
  if (allowIncomplete && rawIdentity === undefined && rawPeers === undefined) return { identity: '', peers: [] }
  if (typeof rawIdentity !== 'string' || !isHandoffAddress(rawIdentity))
    throw handoffError(`${path} [${HANDOFFS_IDENTITY}].identity must use canonical lower-case owner/repository form`)
  if (!Array.isArray(rawPeers) || rawPeers.some((peer) => typeof peer !== 'string' || !isHandoffAddress(peer)))
    throw handoffError(`${path} [${HANDOFFS_IDENTITY}].peers must be a canonical address array`)
  const peers = rawPeers as string[]
  if (peers.includes(rawIdentity)) throw handoffError(`${path} [${HANDOFFS_IDENTITY}].peers must not include its identity`)
  if (new Set(peers).size !== peers.length || peers.some((peer, index) => index > 0 && peer.localeCompare(peers[index - 1] as string) <= 0))
    throw handoffError(`${path} [${HANDOFFS_IDENTITY}].peers must be unique and lexical`)
  return { identity: rawIdentity, peers }
}

export const readHandoffConfiguration = async (path: string): Promise<HandoffConfiguration> => parseConfiguration(await readFile(path, 'utf8'), path)

const readEditableConfiguration = async (path: string): Promise<HandoffConfiguration> => parseConfiguration(await readFile(path, 'utf8'), path, true)

const renderHandoffDeclaration = (configuration: HandoffConfiguration): string =>
  [
    `[${JSON.stringify(HANDOFFS_IDENTITY)}]`,
    `identity = ${JSON.stringify(configuration.identity)}`,
    ...(configuration.peers.length ? ['peers = [', ...configuration.peers.map((peer) => `  ${JSON.stringify(peer)},`), ']'] : ['peers = []'])
  ].join('\n')

const writeHandoffConfiguration = async (path: string, configuration: HandoffConfiguration): Promise<void> => {
  const contents = await readFile(path, 'utf8')
  const escaped = HANDOFFS_IDENTITY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const expression = new RegExp(`(?:^|\\n)\\["${escaped}"\\]\\n[\\s\\S]*?(?=\\n\\[[^\\n]+\\]|$)`)
  if (!expression.test(contents)) throw handoffError(`${path} does not declare [${HANDOFFS_IDENTITY}]`)
  await writeFile(path, contents.replace(expression, `\n${renderHandoffDeclaration(configuration)}`), 'utf8')
}

export const addHandoffRoute = async (path: string, peer: string, identityOption?: string): Promise<HandoffConfiguration> => {
  addressParts(peer)
  const existing = await readEditableConfiguration(path)
  const identity = identityOption ?? existing.identity
  if (!identity) throw handoffError('ki handoffs routes add requires --identity when the local handoff identity is not configured')
  addressParts(identity)
  if (existing.identity && identity !== existing.identity) throw handoffError('--identity must match the configured local handoff identity')
  if (peer === identity) throw handoffError('handoff route peer must differ from the local identity')
  const configuration = { identity, peers: [...new Set([...existing.peers, peer])].sort((left, right) => left.localeCompare(right)) }
  await writeHandoffConfiguration(path, configuration)
  return configuration
}

export const removeHandoffRoute = async (path: string, peer: string): Promise<HandoffConfiguration> => {
  addressParts(peer)
  const configuration = await readHandoffConfiguration(path)
  if (!configuration.peers.includes(peer)) throw handoffError(`handoff route ${peer} is not declared locally`)
  const next = { ...configuration, peers: configuration.peers.filter((candidate) => candidate !== peer) }
  await writeHandoffConfiguration(path, next)
  return next
}

const registeredRoots = async (context: KiContext): Promise<readonly string[]> => {
  const configuration = await inspectUserConfiguration(context.paths.config)
  if (configuration.state === 'missing') throw new KiError('ki environment is not bootstrapped; run `ki bootstrap` first', 1)
  if (configuration.state === 'invalid') throw new KiError(`ki configuration is invalid: ${configuration.errors.join('; ')}`, 1)
  return configuration.repositories
}

const registeredRepositories = async (context: KiContext): Promise<readonly RegisteredRepository[]> => {
  const roots = await registeredRoots(context)
  const registered: RegisteredRepository[] = []
  for (const root of roots) {
    const configuration = join(root, REPOSITORY_CONFIGURATION_FILE)
    const state = await lstat(configuration).catch(() => undefined)
    if (!state?.isFile() || state.isSymbolicLink()) continue
    try {
      registered.push({ root, configuration: await readHandoffConfiguration(configuration) })
    } catch {
      // A peer with no valid handoff declaration is visible but never an active route.
    }
  }
  return registered
}

export const localRepository = async (context: KiContext): Promise<RepositoryLocation> =>
  resolveRepository({ workingDirectory: context.workingDirectory, homeDirectory: context.homeDirectory })

export const localRegisteredRepository = async (context: KiContext): Promise<RepositoryLocation> => {
  const repository = await localRepository(context)
  const roots = await registeredRoots(context)
  if (!roots.includes(repository.root)) throw handoffError('current KI repository is not registered in the local KI repository estate')
  return repository
}

export const localRegisteredConfiguration = async (
  context: KiContext
): Promise<{ readonly repository: RepositoryLocation; readonly configuration: HandoffConfiguration }> => {
  const repository = await localRegisteredRepository(context)
  return { repository, configuration: await readHandoffConfiguration(repository.configuration) }
}

export type RouteState = 'active' | 'missing-peer' | 'ambiguous-peer' | 'nonreciprocal'

export interface RouteInspection {
  readonly peer: string
  readonly state: RouteState
  readonly repository?: RegisteredRepository
}

export const inspectRoutes = async (context: KiContext, local: HandoffConfiguration): Promise<readonly RouteInspection[]> => {
  const repositories = await registeredRepositories(context)
  return local.peers.map((peer) => {
    const candidates = repositories.filter((repository) => repository.configuration.identity === peer)
    if (!candidates.length) return { peer, state: 'missing-peer' }
    if (candidates.length > 1) return { peer, state: 'ambiguous-peer' }
    const repository = candidates[0] as RegisteredRepository
    if (!repository.configuration.peers.includes(local.identity)) return { peer, state: 'nonreciprocal', repository }
    return { peer, state: 'active', repository }
  })
}

export const requireActiveRoute = async (context: KiContext, local: HandoffConfiguration, peer: string): Promise<RegisteredRepository> => {
  addressParts(peer)
  if (!local.peers.includes(peer)) throw handoffError(`handoff route ${peer} is not declared locally`)
  const route = (await inspectRoutes(context, local)).find((candidate) => candidate.peer === peer)
  if (route?.state !== 'active' || !route.repository) throw handoffError(`handoff route ${peer} is ${route?.state ?? 'missing-peer'}`)
  return route.repository
}

const frontmatter = (contents: string, path: string): { readonly fields: HandoffFields; readonly body: string } => {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/u.exec(contents)
  if (!match) throw handoffError(`${path} must use YAML frontmatter followed by a handoff body`)
  const fields: Record<string, string> = {}
  for (const line of (match[1] as string).split('\n')) {
    const field = /^([a-z_]+): (.+)$/u.exec(line)
    if (!field) throw handoffError(`${path} has invalid handoff frontmatter`)
    const [, key, rawValue] = field
    if (!key || !rawValue) throw handoffError(`${path} has invalid handoff frontmatter`)
    let value: unknown = rawValue
    if (rawValue.startsWith('"') || rawValue.startsWith("'")) {
      try {
        value = (parse(`value = ${rawValue}`) as { readonly value?: unknown }).value
      } catch {
        throw handoffError(`${path} has invalid handoff frontmatter`)
      }
    }
    if (typeof value !== 'string') throw handoffError(`${path} handoff field ${key} must be a string`)
    if (fields[key] !== undefined) throw handoffError(`${path} repeats handoff field ${key}`)
    fields[key] = value
  }
  return { fields, body: match[2] as string }
}

const requiredField = (fields: HandoffFields, name: string, path: string): string => {
  const value = fields[name]
  if (!value) throw handoffError(`${path} must declare non-empty handoff field ${name}`)
  return value
}

const recordFromContents = (contents: string, path: string, direction: HandoffDirection): HandoffRecord => {
  const { fields, body } = frontmatter(contents, path)
  const allowed =
    direction === 'outbound'
      ? ['id', 'title', 'created_at', 'sender', 'receiver', 'source_ref']
      : ['id', 'title', 'created_at', 'sender', 'receiver', 'source_ref', 'status', 'reviewed_at', 'rationale', 'adopted_as', 'superseded_by']
  const unknown = Object.keys(fields).find((key) => !allowed.includes(key))
  if (unknown) throw handoffError(`${path} has unrecognised handoff field ${unknown}`)
  const id = identifier(requiredField(fields, 'id', path))
  const title = requiredField(fields, 'title', path)
  const createdAt = requiredField(fields, 'created_at', path)
  const sender = requiredField(fields, 'sender', path)
  const receiver = requiredField(fields, 'receiver', path)
  const sourceRef = requiredField(fields, 'source_ref', path)
  if (!timestampExpression.test(createdAt)) throw handoffError(`${path} has invalid created_at timestamp`)
  addressParts(sender)
  addressParts(receiver)
  if (!body.startsWith(`# ${id}: ${title}\n\n`) || !/## Context\n\n\S[\s\S]*?\n\n## Submission\n\n\S[\s\S]*?\n\n## Constraints\n\n\S/u.test(body))
    throw handoffError(`${path} must carry non-empty Context, Submission, and Constraints sections`)
  const status = fields.status as ReceiverStatus | undefined
  if (direction === 'inbound') {
    if (!status || !receiverStatuses.includes(status)) throw handoffError(`${path} has invalid receiver status`)
    if (fields.reviewed_at && !timestampExpression.test(fields.reviewed_at)) throw handoffError(`${path} has invalid reviewed_at timestamp`)
    if ((status === 'parked' || status === 'clarify' || status === 'declined' || status === 'superseded') && !fields.rationale)
      throw handoffError(`${path} requires rationale for status ${status}`)
    if (status === 'adopted' && !fields.adopted_as) throw handoffError(`${path} requires adopted_as for status adopted`)
    if (status === 'superseded' && !fields.superseded_by) throw handoffError(`${path} requires superseded_by for status superseded`)
  }
  return {
    id,
    title,
    createdAt,
    sender,
    receiver,
    sourceRef,
    ...(status ? { status } : {}),
    ...(fields.reviewed_at ? { reviewedAt: fields.reviewed_at } : {}),
    ...(fields.rationale ? { rationale: fields.rationale } : {}),
    ...(fields.adopted_as ? { adoptedAs: fields.adopted_as } : {}),
    ...(fields.superseded_by ? { supersededBy: fields.superseded_by } : {}),
    body,
    contents
  }
}

const handoffPath = (root: string, direction: HandoffDirection, peer: string, id: string): string => {
  const [owner, repository] = addressParts(peer)
  return join(root, direction === 'inbound' ? '+' : '-', '_HANDOFFS', owner, repository, `${identifier(id)}.md`)
}

const outboundContents = (
  record: Omit<HandoffRecord, 'body' | 'contents'> & { readonly context: string; readonly submission: string; readonly constraints: string }
): string =>
  [
    '---',
    `id: ${record.id}`,
    `title: ${JSON.stringify(record.title)}`,
    `created_at: ${record.createdAt}`,
    `sender: ${record.sender}`,
    `receiver: ${record.receiver}`,
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

export const createOutboundHandoff = async (
  context: KiContext,
  options: {
    readonly to: string
    readonly title: string
    readonly sourceRef: string
    readonly context: string
    readonly submission: string
    readonly constraints: string
  }
): Promise<HandoffRecord> => {
  const local = await localRegisteredConfiguration(context)
  await requireActiveRoute(context, local.configuration, options.to)
  if (![options.title, options.sourceRef, options.context, options.submission, options.constraints].every((value) => value.trim()))
    throw handoffError('handoff title, source-ref, context, submission, and constraints must be non-empty')
  const id = `HND-${randomUUID()}`
  const createdAt = new Date(context.now()).toISOString().replace(/\.\d{3}Z$/u, 'Z')
  const contents = outboundContents({ id, createdAt, sender: local.configuration.identity, receiver: options.to, ...options })
  const path = handoffPath(local.repository.root, 'outbound', options.to, id)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, contents, 'utf8')
  return recordFromContents(contents, path, 'outbound')
}

const readDirectory = async (path: string): Promise<readonly string[]> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isDirectory() || state.isSymbolicLink()) return []
  return (await readdir(path, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith('.md'))
    .map((entry) => join(path, entry.name))
}

const copyInboundContents = (record: HandoffRecord): string => record.contents.replace('\n---\n', '\nstatus: received\n---\n')

export const receiveHandoffs = async (
  context: KiContext,
  peer: string,
  requestedId?: string
): Promise<{ readonly received: readonly string[]; readonly existing: readonly string[] }> => {
  const local = await localRegisteredConfiguration(context)
  const sender = await requireActiveRoute(context, local.configuration, peer)
  const expectedDirectory = handoffPath(sender.root, 'outbound', local.configuration.identity, `HND-00000000-0000-0000-0000-000000000000`).replace(
    /HND-[^/]+\.md$/u,
    ''
  )
  const paths = await readDirectory(expectedDirectory)
  const selected = requestedId ? paths.filter((path) => path.endsWith(`${identifier(requestedId)}.md`)) : paths
  if (requestedId && !selected.length) throw handoffError(`outbound handoff ${requestedId} was not found for ${local.configuration.identity}`)
  const received: string[] = []
  const existing: string[] = []
  for (const path of selected) {
    const record = recordFromContents(await readFile(path, 'utf8'), path, 'outbound')
    if (record.sender !== peer || record.receiver !== local.configuration.identity) throw handoffError(`${path} does not match the active handoff route`)
    const destination = handoffPath(local.repository.root, 'inbound', peer, record.id)
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

const peerDirectories = async (root: string, direction: HandoffDirection): Promise<readonly string[]> => {
  const base = join(root, direction === 'inbound' ? '+' : '-', '_HANDOFFS')
  const state = await lstat(base).catch(() => undefined)
  if (!state?.isDirectory() || state.isSymbolicLink()) return []
  const paths: string[] = []
  for (const owner of await readdir(base, { withFileTypes: true })) {
    if (!owner.isDirectory() || owner.isSymbolicLink()) continue
    paths.push(...(await readDirectory(join(base, owner.name))))
    for (const repository of await readdir(join(base, owner.name), { withFileTypes: true })) {
      if (!repository.isDirectory() || repository.isSymbolicLink()) continue
      paths.push(...(await readDirectory(join(base, owner.name, repository.name))))
    }
  }
  return paths
}

const sameSenderPayload = (outbound: HandoffRecord, inbound: HandoffRecord): boolean =>
  outbound.id === inbound.id &&
  outbound.title === inbound.title &&
  outbound.createdAt === inbound.createdAt &&
  outbound.sender === inbound.sender &&
  outbound.receiver === inbound.receiver &&
  outbound.sourceRef === inbound.sourceRef &&
  outbound.body === inbound.body

export const locateHandoffs = async (
  context: KiContext,
  options: { readonly id?: string; readonly direction?: HandoffDirection; readonly repository?: string } = {}
): Promise<readonly LocatedHandoff[]> => {
  if (options.id) identifier(options.id)
  if (options.repository) addressParts(options.repository)
  const repositories = await registeredRepositories(context)
  const locations: LocatedHandoff[] = []
  for (const repository of repositories) {
    if (options.repository && repository.configuration.identity !== options.repository) continue
    for (const direction of (options.direction ? [options.direction] : ['inbound', 'outbound']) as readonly HandoffDirection[]) {
      for (const path of await peerDirectories(repository.root, direction)) {
        const record = recordFromContents(await readFile(path, 'utf8'), path, direction)
        if (options.id && record.id !== options.id) continue
        locations.push({ repository: repository.configuration.identity, root: repository.root, direction, path, record })
      }
    }
  }
  return locations.sort((left, right) =>
    `${left.repository}:${left.direction}:${left.record.id}`.localeCompare(`${right.repository}:${right.direction}:${right.record.id}`)
  )
}

const localHandoff = async (
  context: KiContext,
  direction: HandoffDirection,
  id: string
): Promise<{ readonly local: Awaited<ReturnType<typeof localRegisteredConfiguration>>; readonly handoff: LocatedHandoff }> => {
  const local = await localRegisteredConfiguration(context)
  const candidates = (await locateHandoffs(context, { id, direction, repository: local.configuration.identity })).filter(
    (candidate) => candidate.root === local.repository.root
  )
  if (candidates.length !== 1) throw handoffError(`${direction} handoff ${id} was not found in the current repository`)
  return { local, handoff: candidates[0] as LocatedHandoff }
}

export const releaseHandoff = async (context: KiContext, id: string): Promise<void> => {
  const { local, handoff } = await localHandoff(context, 'outbound', identifier(id))
  if (handoff.record.sender !== local.configuration.identity) throw handoffError(`outbound handoff ${id} is not owned by the current repository`)
  const receiver = await requireActiveRoute(context, local.configuration, handoff.record.receiver)
  const inbound = handoffPath(receiver.root, 'inbound', local.configuration.identity, id)
  const state = await lstat(inbound).catch(() => undefined)
  if (!state?.isFile() || state.isSymbolicLink()) throw handoffError(`receiver has not recorded an inbound handoff ${id}`)
  const received = recordFromContents(await readFile(inbound, 'utf8'), inbound, 'inbound')
  if (!received.status || !terminalStatuses.includes(received.status as (typeof terminalStatuses)[number]))
    throw handoffError(`handoff ${id} cannot be released while receiver status is ${received.status ?? 'absent'}`)
  if (!sameSenderPayload(handoff.record, received)) throw handoffError(`receiver inbound handoff ${id} does not preserve the sender payload`)
  await rm(handoff.path)
}

export const pruneHandoff = async (context: KiContext, id: string): Promise<void> => {
  const { local, handoff } = await localHandoff(context, 'inbound', identifier(id))
  if (handoff.record.receiver !== local.configuration.identity) throw handoffError(`inbound handoff ${id} is not addressed to the current repository`)
  if (!handoff.record.status || !terminalStatuses.includes(handoff.record.status as (typeof terminalStatuses)[number]))
    throw handoffError(`handoff ${id} cannot be pruned while receiver status is ${handoff.record.status ?? 'absent'}`)
  const sender = await requireActiveRoute(context, local.configuration, handoff.record.sender)
  const outbound = handoffPath(sender.root, 'outbound', local.configuration.identity, id)
  if (await lstat(outbound).catch(() => undefined)) throw handoffError(`handoff ${id} cannot be pruned before sender release is observable`)
  await rm(handoff.path)
}
