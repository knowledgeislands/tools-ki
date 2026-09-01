import type { TradeKind } from '../../core/trade/configuration.ts'
import type { RouteState, TradeLifecycle, TradeRecord } from '../../core/trade/index.ts'
import { presentation, presentationText } from './registry.ts'

export const routeState = (state: RouteState): string =>
  ({
    active: 'active',
    'awaiting-receiver': 'awaiting receiver activation',
    'awaiting-sender': 'awaiting sender activation',
    'ambiguous-repository': 'ambiguous repository'
  })[state]

const owner = (repository: string): string => repository.slice(0, repository.indexOf('/'))

const name = (repository: string): string => repository.slice(repository.indexOf('/') + 1)

const displayTradePeer = (
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
    direction === 'inbound' ? `${observation} ← ${tradeKind} ${peer}` : `${tradeKind} → ${observation} ${peer}`
  return `${relation}${decision}`
}
