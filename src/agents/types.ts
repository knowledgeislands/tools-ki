

export type AgentId = 'claude-code' | 'chatgpt-codex'
export type AgentCapability = 'skills' | 'subagents'
export interface AgentDescriptor {
  id: AgentId
  capabilities: AgentCapability[]
  paths: {
    home: string
    skills?: string
    subagents?: string
  }
}
