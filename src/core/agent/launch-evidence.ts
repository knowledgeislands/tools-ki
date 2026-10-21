import type { AgentEffort, AgentRuntime } from './runtimes.ts'

export const agentRoles = ['mechanical', 'plan', 'build', 'review', 'accept', 'prune', 'release'] as const
export type AgentRole = (typeof agentRoles)[number]

export interface ModelBinding {
  readonly profile: string
  readonly runtime: AgentRuntime
  readonly model: string
  readonly efforts: readonly AgentEffort[]
  readonly revision: string
  /** Local validity, availability and role suitability already reviewed under owner authority. */
  readonly evidenceRevision: string
}

/** Trusted evidence port. The native host deliberately supplies none until the contract's
 * evidence gates pass. An injected fixture establishes policy behaviour, never native proof.
 */
export interface AgentLaunchEvidence {
  readonly profiles: Readonly<Partial<Record<string, ModelBinding>>>
  readonly alternatives: readonly (ModelBinding & { readonly role: AgentRole; readonly authoritySha256: string })[]
  readonly bindings?: readonly ModelBinding[] | undefined
  /** Supplied only after combined Harness wording and validator verification. */
  readonly acceptance?:
    | {
        readonly revision: 'ki/scoped-acceptance/v1'
        readonly render: (declaration: unknown) => string
      }
    | undefined
}
