import { grammarError } from '../../core/errors.ts'
import {
  isObservationPolicy,
  isTradeIdentifier,
  isTradeKind,
  isTradeRepository,
  type ObservationPolicy,
  type RouteDirection,
  type RouteState,
  type TradeKind,
  type TradeLifecycle,
  type TradeRecord
} from '../../core/trade-core.ts'

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

const kindBadge = (kind: TradeKind, icons: boolean): string => badge(kind, kind === 'work' ? '⚒' : 'ⓘ', icons)

const observationBadge = (
  record: Pick<TradeRecord, 'observation'>,
  lifecycle: TradeLifecycle,
  icons: boolean
): string => {
  if (lifecycle.pruneEligible) return badge('prune', '✓', icons)
  if (lifecycle.releaseEligible) return badge('release', '✓', icons)
  if (lifecycle.deliveryStatus === 'awaiting-receipt') return badge('receipt', '↓', icons)
  if (record.observation === 'completion' && lifecycle.decisionStatus === 'adopted')
    return badge('completion', '…', icons)
  return badge('decision', '?', icons)
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
  return direction === 'inbound' ? `${observation} ← ${tradeKind} ${peer}` : `${tradeKind} → ${observation} ${peer}`
}
