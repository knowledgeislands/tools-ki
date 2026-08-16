import { grammarError } from '../../core/errors.ts'
import { presentation, presentationText } from '../../core/presentation/index.ts'
import { isTradeIdentifier, type RouteState, type TradeLifecycle, type TradeRecord } from '../../core/trade/index.ts'
import {
  isObservationPolicy,
  isTradeKind,
  isTradeRepository,
  type ObservationPolicy,
  type RouteDirection,
  type TradeKind
} from '../../core/trade-configuration.ts'

export const repository = (value: string | undefined, option: string): string => {
  if (!value || !isTradeRepository(value))
    throw grammarError(`${option} must use canonical HTTPS GitHub repository form`)
  return value
}

export const kind = (value: string | undefined, option = '--kind'): TradeKind => {
  if (!value || !isTradeKind(value)) throw grammarError(`${option} accepts work or knowledge`)
  return value
}

export const observation = (value: string | undefined): ObservationPolicy => {
  if (!value || !isObservationPolicy(value))
    throw grammarError('--observation accepts unattended, receipt, decision, or completion')
  return value
}

export const routeDirection = (value: string | undefined): RouteDirection => {
  if (value !== 'export' && value !== 'import') throw grammarError('--direction accepts export or import')
  return value
}

export const tradeId = (value: string | undefined, option = 'trade id'): string => {
  if (!value || !isTradeIdentifier(value))
    throw grammarError(`${option} must use TRD- followed by eight lower-case hexadecimal characters`)
  return value
}

export const requireText = (value: string | undefined, option: string): string => {
  if (!value?.trim()) throw grammarError(`${option} is required and must be non-empty`)
  return value
}

export const routeState = (state: RouteState): string =>
  ({
    active: 'active',
    'awaiting-receiver': 'awaiting receiver activation',
    'awaiting-sender': 'awaiting sender activation',
    'ambiguous-repository': 'ambiguous repository'
  })[state]

export const count = (value: number, noun: string): string => `${value} ${noun}${value === 1 ? '' : 's'}`

const owner = (repository: string): string => repository.slice(0, repository.indexOf('/'))

const name = (repository: string): string => repository.slice(repository.indexOf('/') + 1)

export const displayTradePeer = (
  record: Pick<TradeRecord, 'sender' | 'receiver'>,
  direction: 'preparation' | 'inbound' | 'outbound'
): string => {
  const peer = direction === 'inbound' ? record.sender : record.receiver
  const local = direction === 'inbound' ? record.receiver : record.sender
  return owner(peer) === owner(local) ? name(peer) : peer
}

type TradeListDirection = 'preparation' | 'inbound' | 'outbound'

const badge = (label: string, icon: string, icons: boolean): string => `[${icons ? `${icon} ` : ''}${label}]`

export const tradeKindText = (kind: TradeKind): string => {
  const key = kind === 'work' ? 'trade.kind.work' : 'trade.kind.knowledge'
  return presentationText(key)
}

const kindBadge = (kind: TradeKind, icons: boolean): string =>
  badge(kind, presentation(kind === 'work' ? 'trade.kind.work' : 'trade.kind.knowledge').terminal, icons)

const observationBadge = (
  record: Pick<TradeRecord, 'observation'>,
  lifecycle: TradeLifecycle,
  icons: boolean
): string => {
  if (lifecycle.pruneEligible) return badge('prune', presentation('trade.observation.release').terminal, icons)
  if (lifecycle.releaseEligible) return badge('release', presentation('trade.observation.release').terminal, icons)
  if (lifecycle.deliveryStatus === 'awaiting-receipt')
    return badge('receipt', presentation('trade.observation.receipt').terminal, icons)
  if (record.observation === 'completion' && lifecycle.decisionStatus === 'adopted')
    return badge('completion', presentation('trade.observation.complete').terminal, icons)
  return badge('decision', presentation('trade.observation.pending').terminal, icons)
}

/** Renders the kind at the sending end and the sender's active observation at the receiving end. */
export const renderTradeRelation = (
  record: TradeRecord,
  direction: TradeListDirection,
  lifecycle: TradeLifecycle,
  icons = true
): string => {
  const tradeKind = kindBadge(record.kind, icons)
  const observation = observationBadge(record, lifecycle, icons)
  const peer = displayTradePeer(record, direction)
  const decision = lifecycle.decisionStatus ? ` ${badge(lifecycle.decisionStatus, '', false)}` : ''
  const relation =
    direction === 'inbound' ? `${observation} â ${tradeKind} ${peer}` : `${tradeKind} â ${observation} ${peer}`
  return `${relation}${decision}`
}
