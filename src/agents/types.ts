export type AgentCapability = 'skills' | 'subagents'
export type AgentCapabilities = readonly ['skills', ...AgentCapability[]]

export interface AgentDescriptor {
  readonly id: string
  readonly capabilities: AgentCapabilities
  readonly paths: {
    readonly home: string
    readonly skills?: string
    readonly subagents?: string
  }
}
