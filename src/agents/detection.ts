import { join, resolve } from 'node:path'
import { KiError } from '../core/errors.ts'
import { agentDescriptors, type InstalledAgent, physicalDirectory, skillCapability } from './internal.ts'

export const detectAgents = async (homeDirectory: string): Promise<readonly InstalledAgent[]> => {
  const agents: InstalledAgent[] = []
  for (const candidate of agentDescriptors) {
    const home = resolve(homeDirectory, candidate.paths.home)
    if (await physicalDirectory(home)) agents.push({ descriptor: candidate, home })
  }
  return agents
}

export const agentSkillDirectory = (agent: InstalledAgent, scope: 'user' | 'repo', repository?: string): string => {
  const skillPath = skillCapability(agent)
  if (scope === 'user') return join(agent.home, 'skills')
  if (repository) return join(repository, skillPath)
  // Every repo-scope call site resolves a repository via resolveRepository() before reaching
  // here, so this defends only against a future caller that skips that resolution.
  /* v8 ignore next */
  throw new KiError('repository scope requires a repository', 2)
}
