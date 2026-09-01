import { KiError } from '../errors.ts'
import type { Runner } from '../runtime/runner.ts'
import type { ObservationPolicy, TradeConfiguration, TradeKind } from './configuration.ts'

export const timestampExpression = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
export const commitExpression = /^[0-9a-f]{40}$/

export interface TradeContext {
  readonly workingDirectory: string
  readonly homeDirectory: string
  readonly environment: NodeJS.ProcessEnv
  readonly paths: { readonly state: string }
  readonly runner: Runner
  readonly now: () => number
}
export const tradePhases = ['preparing', 'submitted', 'received'] as const
export const decisionStatuses = [
  'unconsidered',
  'in_progress',
  'parked',
  'clarify',
  'applied',
  'adopted',
  'retained',
  'declined',
  'superseded'
] as const
export const terminalDecisionStatuses = ['applied', 'adopted', 'retained', 'declined', 'superseded'] as const

export type TradeDirection = 'preparation' | 'inbound' | 'outbound'
export type TradePhase = (typeof tradePhases)[number]
export type DecisionStatus = (typeof decisionStatuses)[number]

export interface TradeRecord {
  readonly id: string
  readonly title: string
  readonly createdAt: string
  readonly sender: string
  readonly receiver: string
  readonly kind: TradeKind
  readonly sourceRef: string
  readonly observation: ObservationPolicy
  /** The copy's own lifecycle state, distinct from the receiver's `decisionStatus`. */
  readonly phase: TradePhase
  readonly decisionStatus?: DecisionStatus
  readonly receivedFromRef?: string
  readonly reviewedAt?: string
  readonly rationale?: string
  readonly appliedCommit?: string
  readonly adoptedAs?: string
  readonly retainedAs?: string
  readonly supersededBy?: string
  readonly body: string
  readonly contents: string
}

export interface LocatedTrade {
  readonly repository: string
  readonly root: string
  readonly direction: TradeDirection
  readonly path: string
  readonly record: TradeRecord
}

export interface TradeLifecycle {
  readonly publicationStatus: 'preparing' | 'submitted'
  readonly deliveryStatus: 'not-deliverable' | 'awaiting-receipt' | 'received'
  readonly decisionStatus?: DecisionStatus
  readonly releaseEligible: boolean
  readonly pruneEligible: boolean
}

export interface TradeFields {
  readonly id?: string
  readonly title?: string
  readonly created_at?: string
  readonly sender?: string
  readonly receiver?: string
  readonly kind?: string
  readonly source_ref?: string
  readonly observation?: string
  readonly phase?: string
  readonly decision_status?: string
  readonly received_from_ref?: string
  readonly reviewed_at?: string
  readonly rationale?: string
  readonly applied_commit?: string
  readonly adopted_as?: string
  readonly retained_as?: string
  readonly superseded_by?: string
  readonly [key: string]: string | undefined
}

export interface RegisteredRepository {
  readonly root: string
  readonly repository: string
  readonly configuration?: TradeConfiguration
}

export interface ActiveRegisteredRepository extends RegisteredRepository {
  readonly configuration: TradeConfiguration
}

export const tradeError = (message: string): KiError => new KiError(message, 2)
