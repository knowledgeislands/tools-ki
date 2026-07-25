import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { Command } from 'commander'
import { agentSkillDirectory, configuredAgents, inspectUserConfiguration } from '../agents/index.ts'
import type { KiContext } from '../context.ts'
import { discoverInstalledHarnesses } from '../core/harness.ts'

type CheckStatus = 'pass' | 'fail' | 'skip'

interface DoctorCheck {
  readonly status: CheckStatus
  readonly label: string
  readonly detail: string
}

const mark = (status: CheckStatus): string => ({ pass: '✓', fail: '✗', skip: '○' })[status]

const physicalDirectory = async (path: string): Promise<boolean> => {
  const state = await lstat(path).catch(() => undefined)
  return Boolean(state?.isDirectory() && !state.isSymbolicLink())
}

const managedSkillName = (identity: string): string | undefined => {
  const separator = identity.indexOf(':')
  return separator > 0 && separator < identity.length - 1 ? identity.slice(separator + 1) : undefined
}

export const createDoctorCommand = (context: KiContext): Command =>
  new Command('doctor').description('check ki configuration, agents, harnesses, and user skills').action(async () => {
    const configuration = await inspectUserConfiguration(context.paths.config)
    const checks: DoctorCheck[] = []
    if (configuration.state === 'valid') {
      checks.push({ status: 'pass', label: 'Configuration', detail: configuration.path })
    } else if (configuration.state === 'missing') {
      checks.push({ status: 'fail', label: 'Configuration', detail: 'missing; run ki bootstrap' })
    } else {
      checks.push({ status: 'fail', label: 'Configuration', detail: configuration.errors.join('; ') })
    }

    try {
      const installed = await discoverInstalledHarnesses(context.paths.data)
      const identifiers = new Set(installed.map((harness) => harness.id))
      const missing = configuration.harnesses.filter((identifier) => !identifiers.has(identifier))
      checks.push({
        status: missing.length ? 'fail' : 'pass',
        label: 'Harness inventory',
        detail: missing.length ? `missing ${missing.join(', ')}` : `${installed.length} installed`
      })
    } catch (error) {
      checks.push({ status: 'fail', label: 'Harness inventory', detail: error instanceof Error ? error.message : 'unavailable' })
    }

    if (configuration.state !== 'valid') {
      checks.push({ status: 'skip', label: 'Agents', detail: 'configuration is not valid' })
      checks.push({ status: 'skip', label: 'User skills', detail: 'configuration is not valid' })
    } else {
      let agents: Awaited<ReturnType<typeof configuredAgents>>
      try {
        agents = await configuredAgents({ homeDirectory: context.homeDirectory, configurationDirectory: context.paths.config })
      } catch (error) {
        checks.push({ status: 'fail', label: 'Agents', detail: error instanceof Error ? error.message : 'unavailable' })
        checks.push({ status: 'skip', label: 'User skills', detail: 'agents are unavailable' })
        context.stdout.write(`ki doctor\n${checks.map((check) => `  ${mark(check.status)} ${check.label}: ${check.detail}`).join('\n')}\n`)
        return
      }
      for (const agent of agents) {
        const skills = agentSkillDirectory(agent, 'user')
        const ready = (await physicalDirectory(agent.home)) && (await physicalDirectory(skills))
        checks.push({
          status: ready ? 'pass' : 'fail',
          label: `Agent ${agent.descriptor.id}`,
          detail: ready ? 'ready' : 'user skill directory missing'
        })
      }
      for (const identity of configuration.skills) {
        const name = managedSkillName(identity)
        if (!name) {
          checks.push({ status: 'fail', label: `User skill ${identity}`, detail: 'invalid identity' })
          continue
        }
        const absent = await Promise.all(
          agents.map(
            async (agent) => !(await lstat(join(agentSkillDirectory(agent, 'user'), name)).catch(() => undefined))?.isSymbolicLink()
          )
        )
        checks.push({
          status: absent.some(Boolean) ? 'fail' : 'pass',
          label: `User skill ${name}`,
          detail: absent.some(Boolean) ? 'not linked for every configured agent' : 'linked'
        })
      }
    }
    context.stdout.write(`ki doctor\n${checks.map((check) => `  ${mark(check.status)} ${check.label}: ${check.detail}`).join('\n')}\n`)
  })
