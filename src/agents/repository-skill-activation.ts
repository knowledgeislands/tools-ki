import { lstat, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import type { ResolvedSkill } from '../core/configuration/index.ts'
import { KiError } from '../core/errors.ts'
import type { RepositorySkillActivation, RepositorySkillActivationState } from '../core/rubric/index.ts'
import { configuredAgents } from './configuration.ts'
import { compatibleWithSkill, repositorySupportedRuntimes, runtimeForAgent } from './runtimes.ts'
import { agentSkillDirectory } from './shared/index.ts'
import { linkManagedSkill } from './skills.ts'

type ActivationTarget = {
  readonly path: string
  readonly skill: ResolvedSkill
}

export interface RepositorySkillActivationHost {
  readonly rubric: RepositorySkillActivation
  readonly hasProposals: () => boolean
  readonly proposedNames: () => readonly string[]
  readonly apply: () => Promise<readonly string[]>
  readonly started: () => boolean
}

const validNames = (names: readonly string[]): string[] => {
  if (!Array.isArray(names) || names.some((name) => typeof name !== 'string' || !name)) {
    throw new KiError('repository skill request must contain non-empty names', 1)
  }
  if (new Set(names).size !== names.length) {
    throw new KiError('repository skill request must not contain duplicates', 1)
  }
  return [...names]
}

const stateForTarget = async (target: ActivationTarget): Promise<'active' | 'missing' | 'blocked'> => {
  const metadata = await lstat(target.path).catch(() => undefined)
  if (!metadata) return 'missing'
  if (!metadata.isSymbolicLink()) return 'blocked'

  const [actual, expected] = await Promise.all([
    realpath(target.path).catch(() => undefined),
    realpath(join(target.skill.harness.root, target.skill.capability.source)).catch(() => undefined)
  ])
  return actual && expected && actual === expected ? 'active' : 'blocked'
}

const messageForState = (name: string, state: 'active' | 'missing' | 'blocked'): string => {
  if (state === 'active') return `${name} is active for every compatible runtime`
  if (state === 'missing') return `${name} is not active for every compatible runtime`
  return `${name} has an unsafe or incompatible managed-skill link`
}

export const createRepositorySkillActivation = async (options: {
  readonly configurationDirectory: string
  readonly homeDirectory: string
  readonly repository: string
  readonly repositoryConfiguration: string
  readonly skills: readonly ResolvedSkill[]
}): Promise<RepositorySkillActivationHost> => {
  const [agents, runtimes] = await Promise.all([
    configuredAgents({ configurationDirectory: options.configurationDirectory, homeDirectory: options.homeDirectory }),
    repositorySupportedRuntimes(options.repositoryConfiguration)
  ])
  const skills = new Map(options.skills.map((skill) => [skill.declaration.name, skill]))
  const targetsFor = (name: string): ActivationTarget[] => {
    const skill = skills.get(name)
    if (!skill) return []
    return agents
      .filter(
        (agent) =>
          runtimes.includes(runtimeForAgent(agent)) && compatibleWithSkill(agent, skill.capability.supportedRuntimes)
      )
      .map((agent) => ({
        path: join(agentSkillDirectory(agent, 'repo', options.repository), skill.capability.name),
        skill
      }))
  }
  const inspect = async (names: readonly string[]): Promise<RepositorySkillActivationState[]> =>
    Promise.all(
      validNames(names).map(async (name) => {
        const targets = targetsFor(name)
        if (!targets.length) return { name, status: 'blocked', message: `${name} has no compatible configured runtime` }
        const states = await Promise.all(targets.map(stateForTarget))
        const status = states.includes('blocked')
          ? 'blocked'
          : states.every((state) => state === 'active')
            ? 'active'
            : 'missing'
        return { name, status, message: messageForState(name, status) }
      })
    )
  const initial = new Map((await inspect([...skills.keys()])).map((state) => [state.name, state]))
  const proposed = new Set<string>()
  let didStart = false

  return {
    rubric: {
      inspect: (names) =>
        validNames(names).map(
          (name) =>
            initial.get(name) ?? { name, status: 'blocked', message: `${name} is not a declared repository skill` }
        ),
      propose: (names) => {
        for (const name of validNames(names)) {
          const state = initial.get(name)
          if (state?.status !== 'missing')
            throw new KiError(`repository skill ${name} is not available for activation`, 1)
          proposed.add(name)
        }
      }
    },
    hasProposals: () => proposed.size > 0,
    proposedNames: () => [...proposed].sort((left, right) => left.localeCompare(right)),
    started: () => didStart,
    apply: async () => {
      const names = [...proposed].sort((left, right) => left.localeCompare(right))
      const states = await inspect(names)
      const blocked = states.find((state) => state.status === 'blocked')
      if (blocked) throw new KiError(blocked.message, 1)

      const applied: string[] = []
      for (const state of states) {
        if (state.status === 'active') continue
        const skill = skills.get(state.name)
        if (!skill) throw new KiError(`${state.name} is not a declared repository skill`, 1)
        for (const agent of agents.filter(
          (candidate) =>
            runtimes.includes(runtimeForAgent(candidate)) &&
            compatibleWithSkill(candidate, skill.capability.supportedRuntimes)
        )) {
          didStart = true
          await linkManagedSkill(
            agent,
            { scope: 'repo', repository: options.repository },
            {
              name: skill.capability.name,
              source: join(skill.harness.root, skill.capability.source)
            }
          )
        }
        applied.push(state.name)
      }
      return applied
    }
  }
}
