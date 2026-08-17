import { join } from 'node:path'
import type { AgentDescriptor } from '../shared/types.ts'

const descriptor = {
  id: 'chatgpt-codex',
  capabilities: ['skills'],
  paths: {
    home: '.agents',
    skills: join('.agents', 'skills')
  }
} as const satisfies AgentDescriptor

export default descriptor
