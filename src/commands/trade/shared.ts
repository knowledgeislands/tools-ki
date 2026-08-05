import { grammarError } from '../../core/errors.ts'
import { isTradeIdentifier, isTradeKind, isTradeRepository, type RouteDirection, type RouteState, type TradeKind } from '../../core/trade-core.ts'

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
  ({ active: 'active', 'missing-repository': 'missing repository', 'ambiguous-repository': 'ambiguous repository', nonreciprocal: 'nonreciprocal' })[state]

export const count = (value: number, noun: string): string => `${value} ${noun}${value === 1 ? '' : 's'}`
