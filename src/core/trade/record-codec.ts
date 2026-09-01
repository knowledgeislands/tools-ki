import { basename, join } from 'node:path'
import { parse } from 'smol-toml'
import { isObservationPolicy, isTradeKind } from './configuration.ts'
import { parseTradeAddress as addressParts, assertTradeIdentifier as identifier } from './identifiers.ts'
import {
  commitExpression,
  type DecisionStatus,
  decisionStatuses,
  type TradeDirection,
  type TradeFields,
  type TradePhase,
  type TradeRecord,
  timestampExpression,
  tradeError,
  tradePhases
} from './model.ts'

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
export const rewritePhase = (contents: string, value: TradePhase): string => {
  const match = /^(---\n)([\s\S]*?)(\n---\n[\s\S]*)$/u.exec(contents) as RegExpExecArray
  const lines = (match[2] as string).split('\n')
  const index = lines.findIndex((line) => line.startsWith('phase:'))
  return `${match[1]}${lines.with(index, `phase: ${value}`).join('\n')}${match[3]}`
}

export const recordFromContents = (contents: string, path: string, direction: TradeDirection): TradeRecord => {
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

export const tradePath = (root: string, direction: TradeDirection, peer: string, id: string): string => {
  const [owner, repository] = addressParts(peer)
  // A preparation and its submitted successor share one path: submission rewrites the
  // phase field rather than relocating the record.
  return join(root, direction === 'inbound' ? '+' : '-', '_TRADES', owner, repository, `${identifier(id)}.md`)
}

export const senderContents = (
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

const expectedPhase = (direction: TradeDirection): TradePhase =>
  direction === 'preparation' ? 'preparing' : direction === 'outbound' ? 'submitted' : 'received'

/** Direction is read from the record's phase, so the scan walks physical areas instead. */
export const directionForPhase: Readonly<Record<TradePhase, TradeDirection>> = {
  preparing: 'preparation',
  submitted: 'outbound',
  received: 'inbound'
}

/** The declared phase, or undefined where the record is too malformed to say. */
export const readPhase = (contents: string): TradePhase | undefined => {
  const match = /^---\n([\s\S]*?)\n---\n/u.exec(contents)
  const line = (match?.[1] ?? '').split('\n').find((entry) => entry.startsWith('phase:'))
  const phase = line?.slice('phase:'.length).trim()
  return phase && tradePhases.includes(phase as TradePhase) ? (phase as TradePhase) : undefined
}

export const phaseOf = (contents: string, path: string): TradePhase => {
  const phase = readPhase(contents)
  if (!phase) throw tradeError(`${path} has invalid phase`)
  return phase
}
