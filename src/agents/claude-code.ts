import { join } from 'node:path'
import type { AgentDescriptor } from './types.ts'

const descriptor = {
  id: 'claude-code',
  capabilities: ['skills', 'subagents'],
  paths: {
    home: '.claude',
    skills: join('.claude', 'skills'),
    subagents: join('.claude', 'agents')
  }
} as const satisfies AgentDescriptor

export default descriptor
