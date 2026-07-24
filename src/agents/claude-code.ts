import { join } from 'node:path'
import type { AgentDescriptor } from './types.ts';

const descriptor: AgentDescriptor = { 
  id: 'claude-code', 
  capabilities: ['skills', 'subagents'],
  paths: {
    home: '.claude',
    skills: join('.claude', 'skills'),
    subagents: join('.claude', 'agents')
  }
} 

export default descriptor