import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { lstat, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { localRegisteredConfiguration, registeredRepositories, requireActiveRoute } from './estate.ts'
import { assertTradeIdentifier as identifier } from './identifiers.ts'
import { localTrade, locateTrades } from './inventory.ts'
import {
  type ActiveRegisteredRepository,
  type DecisionStatus,
  type LocatedTrade,
  type TradeContext,
  type TradeLifecycle,
  type TradeRecord,
  terminalDecisionStatuses,
  tradeError
} from './model.ts'
import { sameSenderPayload } from './payload.ts'
import { recordFromContents, tradePath } from './record-codec.ts'

const linkedWorkIsDone = (root: string, identity: string): boolean => {
  const directory = join(root, 'docs', 'roadmap')
  if (!existsSync(directory)) return false
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const contents = readFileSync(join(directory, entry.name), 'utf8')
    if (contents.includes(`\nid: ${identity}\n`) && contents.includes('\nstatus: done\n')) return true
  }
  return false
}

const releaseEligible = (record: TradeRecord, receiverRoot: string): boolean => {
  if (record.observation === 'unattended' || record.observation === 'receipt') return true
  if (
    !record.decisionStatus ||
    !terminalDecisionStatuses.includes(record.decisionStatus as (typeof terminalDecisionStatuses)[number])
  )
    return false
  if (
    record.observation === 'decision' ||
    ['applied', 'retained', 'declined', 'superseded'].includes(record.decisionStatus)
  )
    return true
  // Inbound validation already rejects an adopted record with no adopted_as, so the identity
  // is present whenever this short-circuit reaches the lookup.
  return record.decisionStatus === 'adopted' && linkedWorkIsDone(receiverRoot, record.adoptedAs as string)
}

export const tradeLifecycle = (trade: LocatedTrade, estate: readonly LocatedTrade[]): TradeLifecycle => {
  if (trade.direction === 'preparation')
    return {
      publicationStatus: 'preparing',
      deliveryStatus: 'not-deliverable',
      releaseEligible: false,
      pruneEligible: false
    }
  if (trade.direction === 'inbound') {
    const outbound = estate.find(
      (candidate) =>
        candidate.direction === 'outbound' &&
        candidate.record.id === trade.record.id &&
        candidate.record.sender === trade.record.sender &&
        candidate.record.receiver === trade.record.receiver
    )
    const eligible = releaseEligible(trade.record, trade.root)
    return {
      publicationStatus: 'submitted',
      deliveryStatus: 'received',
      decisionStatus: trade.record.decisionStatus as DecisionStatus,
      releaseEligible: Boolean(outbound && eligible),
      pruneEligible: Boolean(!outbound && eligible)
    }
  }
  const inbound = estate.find(
    (candidate) =>
      candidate.direction === 'inbound' &&
      candidate.record.id === trade.record.id &&
      candidate.record.sender === trade.record.sender &&
      candidate.record.receiver === trade.record.receiver
  )
  return inbound
    ? {
        publicationStatus: 'submitted',
        deliveryStatus: 'received',
        decisionStatus: inbound.record.decisionStatus as DecisionStatus,
        releaseEligible: releaseEligible(inbound.record, inbound.root),
        pruneEligible: false
      }
    : {
        publicationStatus: 'submitted',
        deliveryStatus: 'awaiting-receipt',
        releaseEligible: false,
        pruneEligible: false
      }
}

const peerForRecord = async (context: TradeContext, identity: string): Promise<ActiveRegisteredRepository> => {
  const candidates = (await registeredRepositories(context)).filter(
    (candidate): candidate is ActiveRegisteredRepository =>
      Boolean(candidate.configuration && candidate.configuration.identity === identity)
  )
  if (candidates.length !== 1)
    throw tradeError(`trade record peer ${identity} is unavailable or ambiguous in the registered repository estate`)
  return candidates[0] as ActiveRegisteredRepository
}

export const eligibleTradeCleanup = async (
  context: TradeContext,
  operation: 'release' | 'prune'
): Promise<readonly LocatedTrade[]> => {
  const local = await localRegisteredConfiguration(context)
  const estate = await locateTrades(context)
  const direction = operation === 'release' ? 'outbound' : 'inbound'
  const selected = estate.filter((trade) => trade.root === local.repository.root && trade.direction === direction)
  const eligible: LocatedTrade[] = []
  for (const trade of selected) {
    const lifecycle = tradeLifecycle(trade, estate)
    if (operation === 'release' ? lifecycle.releaseEligible : lifecycle.pruneEligible) eligible.push(trade)
  }
  return eligible
}

export const releaseTrade = async (context: TradeContext, id: string): Promise<void> => {
  const { local, trade } = await localTrade(context, 'outbound', identifier(id))
  if (trade.record.sender !== local.configuration.identity)
    throw tradeError(`outbound trade ${id} is not owned by the current repository`)
  const receiver = await peerForRecord(context, trade.record.receiver)
  await requireActiveRoute(context, local.configuration, receiver.configuration.repository, 'export', trade.record.kind)
  const inbound = tradePath(receiver.root, 'inbound', local.configuration.identity, id)
  const state = await lstat(inbound).catch(() => undefined)
  if (!state?.isFile()) throw tradeError(`receiver has not recorded an inbound trade ${id}`)
  const received = recordFromContents(await readFile(inbound, 'utf8'), inbound, 'inbound')
  if (!sameSenderPayload(trade.record, received))
    throw tradeError(`receiver inbound trade ${id} does not preserve the sender payload`)
  if (!releaseEligible(received, receiver.root))
    throw tradeError(
      `trade ${id} cannot be released before its ${trade.record.observation} observation policy is satisfied`
    )
  await rm(trade.path)
}

export const pruneTrade = async (context: TradeContext, id: string): Promise<void> => {
  const { local, trade } = await localTrade(context, 'inbound', identifier(id))
  if (trade.record.receiver !== local.configuration.identity)
    throw tradeError(`inbound trade ${id} is not addressed to the current repository`)
  const sender = await peerForRecord(context, trade.record.sender)
  await requireActiveRoute(context, local.configuration, sender.configuration.repository, 'import', trade.record.kind)
  const outbound = tradePath(sender.root, 'outbound', local.configuration.identity, id)
  if (await lstat(outbound).catch(() => undefined))
    throw tradeError(`trade ${id} cannot be pruned before sender release is observable`)
  if (!releaseEligible(trade.record, trade.root))
    throw tradeError(`trade ${id} cannot be pruned after a premature ${trade.record.observation} sender release`)
  await rm(trade.path)
}
