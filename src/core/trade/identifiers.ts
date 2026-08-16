import { KiError } from '../errors.ts'

const addressExpression = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/
const identifierExpression = /^TRD-[0-9a-f]{8}$/

export const isTradeIdentifier = (value: string): boolean => identifierExpression.test(value)

export const parseTradeAddress = (address: string): readonly [string, string] => {
  if (!addressExpression.test(address))
    throw new KiError('trade record address must use canonical lower-case owner/repository form')
  return address.split('/') as [string, string]
}

export const assertTradeIdentifier = (value: string): string => {
  if (!isTradeIdentifier(value))
    throw new KiError('trade id must use TRD- followed by eight lower-case hexadecimal characters')
  return value
}
