import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ObservationPolicy, TradeKind } from './configuration.ts'
import { localRegisteredConfiguration, requireDeclaredExportRoute } from './estate.ts'
import { assertTradeIdentifier as identifier } from './identifiers.ts'
import { localTrade } from './inventory.ts'
import type { TradeContext, TradeRecord } from './model.ts'
import { tradeError } from './model.ts'
import { recordFromContents, rewritePhase, senderContents, tradePath } from './record-codec.ts'

export const createTradePreparation = async (
  context: TradeContext,
  options: {
    readonly to: string
    readonly kind: TradeKind
    readonly observation: ObservationPolicy
    readonly title: string
    readonly sourceRef: string
    readonly context: string
    readonly submission: string
    readonly constraints: string
  }
): Promise<TradeRecord> => {
  const local = await localRegisteredConfiguration(context)
  const receiver = requireDeclaredExportRoute(local.configuration, options.to, options.kind)
  /* v8 ignore next 2 -- public CLI grammar rejects every empty authored field before invoking the core operation. */
  if (
    ![options.title, options.sourceRef, options.context, options.submission, options.constraints].every((value) =>
      value.trim()
    )
  )
    throw tradeError('trade title, source-ref, context, submission, and constraints must be non-empty')
  const id = `TRD-${randomUUID().slice(0, 8)}`
  const createdAt = new Date(context.now()).toISOString().replace(/\.\d{3}Z$/u, 'Z')
  const contents = senderContents({
    id,
    createdAt,
    sender: local.configuration.identity,
    receiver,
    ...options
  })
  const path = tradePath(local.repository.root, 'preparation', receiver, id)
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, contents, 'utf8')
  return recordFromContents(contents, path, 'preparation')
}

export const submitTrade = async (context: TradeContext, id: string): Promise<TradeRecord> => {
  const { trade } = await localTrade(context, 'preparation', identifier(id))
  // Preparation and submission share one path, so submission rewrites the phase field in
  // place rather than relocating the record.
  const destination = trade.path
  const contents = rewritePhase(trade.record.contents, 'submitted')
  const submitted = recordFromContents(contents, destination, 'outbound')
  await writeFile(destination, contents, 'utf8')
  return submitted
}

export const abandonTrade = async (context: TradeContext, id: string): Promise<void> => {
  const { trade } = await localTrade(context, 'preparation', identifier(id))
  await rm(trade.path)
}
