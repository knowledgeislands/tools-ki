import type { TradeKind } from '../configuration.ts'
import type { LocatedTrade, TradeDirection, TradeLifecycle, TradeRecord } from '../model.ts'

export interface TradeListSelection {
  readonly direction?: TradeDirection
  readonly status?: string
  readonly kind?: TradeKind
  readonly roots: ReadonlySet<string>
}

export interface ListedTrade {
  readonly trade: LocatedTrade
  readonly lifecycle: TradeLifecycle
}

export interface TradeListResult {
  readonly trades: readonly ListedTrade[]
  readonly receivable: readonly TradeRecord[]
}

interface ListTradePorts {
  readonly locate: () => Promise<readonly LocatedTrade[]>
  readonly previewReceivable: () => Promise<readonly TradeRecord[]>
  readonly lifecycle: (trade: LocatedTrade, estate: readonly LocatedTrade[]) => TradeLifecycle
}

const matchesSelection = (trade: LocatedTrade, selection: TradeListSelection): boolean =>
  (!selection.direction || trade.direction === selection.direction) &&
  selection.roots.has(trade.root) &&
  (!selection.status || trade.record.decisionStatus === selection.status) &&
  (!selection.kind || trade.record.kind === selection.kind)

const alreadyReceived = (record: TradeRecord, estate: readonly LocatedTrade[]): boolean =>
  estate.some(
    (trade) =>
      trade.direction === 'inbound' &&
      trade.record.id === record.id &&
      trade.record.sender === record.sender &&
      trade.record.receiver === record.receiver
  )

export const listTradeRecords = async (
  selection: TradeListSelection,
  ports: ListTradePorts
): Promise<TradeListResult> => {
  const estate = await ports.locate()
  const selected = estate.filter((trade) => matchesSelection(trade, selection))
  const receivable =
    selection.direction || selection.status || selection.kind
      ? []
      : (await ports.previewReceivable()).filter((record) => !alreadyReceived(record, estate))
  const identity = (record: TradeRecord): string => `${record.sender}\0${record.receiver}\0${record.id}`
  const receivableIds = new Set(receivable.map(identity))
  const receivedIds = new Set(
    selected.filter((trade) => trade.direction === 'inbound').map((trade) => identity(trade.record))
  )
  const visible = selected.filter(
    (trade) =>
      trade.direction !== 'outbound' ||
      (!receivableIds.has(identity(trade.record)) && !receivedIds.has(identity(trade.record)))
  )
  return {
    trades: visible.map((trade) => ({ trade, lifecycle: ports.lifecycle(trade, estate) })),
    receivable
  }
}

export const receiveTradeBatch = async (
  records: readonly TradeRecord[],
  receive: (id: string) => Promise<unknown>
): Promise<void> => {
  for (const record of records) await receive(record.id)
}

export type TradeCleanupOperation = 'release' | 'prune'

export const cleanupTradeBatch = async (
  operation: TradeCleanupOperation,
  trades: readonly LocatedTrade[],
  remove: (operation: TradeCleanupOperation, id: string) => Promise<void>
): Promise<void> => {
  for (const trade of trades) await remove(operation, trade.record.id)
}
