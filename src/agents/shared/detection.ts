import { join, resolve } from 'node:path'
import { agentDescriptors, type InstalledAgent, physicalDirectory, skillCapability } from '../internal.ts'

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
  return join(repository as string, skillPath)
}
