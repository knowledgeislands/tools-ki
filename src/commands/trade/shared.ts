import { grammarError } from '../../core/errors.ts'
import {
  isTradeIdentifier,
  isTradeKind,
  isTradeRepository,
  type RouteDirection,
  type RouteState,
  type TradeKind,
  type TradeRecord
} from '../../core/trade-core.ts'

export const repository = (value: string | undefined, option: string): string => {
  if (!value || !isTradeRepository(value)) throw grammarError(`${option} must use canonical HTTPS GitHub repository form`)
  return value
}

export const kind = (value: string | undefined, option = '--kind'): TradeKind => {
  if (!value || !isTradeKind(value)) throw grammarError(`${option} accepts work or knowledge`)
  return value
}

export const routeDirection = (value: string | undefined): RouteDirection => {
  if (value !== 'export' && value !== 'import') throw grammarError('--direction accepts export or import')
  return value
}

export const tradeId = (value: string | undefined, option = 'trade id'): string => {
  if (!value || !isTradeIdentifier(value)) throw grammarError(`${option} must use TRD- followed by eight lower-case hexadecimal characters`)
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

export const displayTradePeer = (record: Pick<TradeRecord, 'sender' | 'receiver'>, direction: 'inbound' | 'outbound'): string => {
  const peer = direction === 'outbound' ? record.receiver : record.sender
  const local = direction === 'outbound' ? record.sender : record.receiver
  return owner(peer) === owner(local) ? name(peer) : peer
}
