import type { TradeRecord } from './index.ts'

const senderPayloadProjection = (record: TradeRecord): string =>
  JSON.stringify([
    record.id,
    record.title,
    record.createdAt,
    record.sender,
    record.receiver,
    record.kind,
    record.sourceRef,
    record.observation,
    record.body.trim()
  ])

export const sameSenderPayload = (outbound: TradeRecord, inbound: TradeRecord): boolean =>
  senderPayloadProjection(outbound) === senderPayloadProjection(inbound)
