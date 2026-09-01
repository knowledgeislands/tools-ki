import { grammarError } from '../../core/errors.ts'
import {
  isObservationPolicy,
  isTradeKind,
  isTradeRepository,
  type ObservationPolicy,
  type RouteDirection,
  type TradeKind
} from '../../core/trade/configuration.ts'
import { isTradeIdentifier } from '../../core/trade/index.ts'

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

export const count = (value: number, noun: string): string => `${value} ${noun}${value === 1 ? '' : 's'}`
