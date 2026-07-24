import { join } from 'node:path'
import type { AgentDescriptor } from './types.ts';

const descriptor: AgentDescriptor = { 
  id: 'chatgpt-codex', 
  capabilities: ['skills'],
  paths: {
    home: '.agents',
    skills: join('.agents', 'skills')
  }
} 

export default descriptor