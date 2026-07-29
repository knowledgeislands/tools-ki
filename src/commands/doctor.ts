import { lstat, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { Command } from 'commander'
import {
  agentSkillDirectory,
  compatibleWithSkill,
  configuredAgents,
  type InstalledAgent,
  inspectUserConfiguration,
  localBootstrapHarness
} from '../agents/index.ts'
import type { KiContext } from '../context.ts'
import { KiExit } from '../core/errors.ts'
import { discoverInstalledHarnesses, type InstalledHarness } from '../core/harness.ts'
import { canonicalHarnessDevelopmentEnabled } from '../core/registry.ts'

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

const managedLink = async (agent: InstalledAgent, name: string): Promise<{ readonly link: boolean; readonly target?: string }> => {
  const path = join(agentSkillDirectory(agent, 'user'), name)
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isSymbolicLink()) return { link: false }
  return { link: true, target: await realpath(path).catch(() => undefined) }
}

const report = (context: KiContext, checks: readonly DoctorCheck[]): void => {
  context.stdout.write(`ki doctor\n${checks.map((check) => `  ${mark(check.status)} ${check.label}: ${check.detail}`).join('\n')}\n`)

  if (checks.some((check) => check.status === 'fail')) throw new KiExit(1)
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

    let installed: readonly InstalledHarness[] = []
    try {
      installed = await discoverInstalledHarnesses(context.paths.data)
      const identifiers = new Set(installed.map((harness) => harness.id))
      const missing = configuration.harnesses.filter((identifier) => !identifiers.has(identifier))
      checks.push({
        status: missing.length ? 'fail' : 'pass',
        label: 'Harness inventory',
        detail: missing.length ? `missing ${missing.join(', ')}` : `${installed.length} installed`
      })
    } catch (error) {
      checks.push({ status: 'fail', label: 'Harness inventory', detail: (error as Error).message })
    }

    if (configuration.state !== 'valid') {
      checks.push({ status: 'skip', label: 'Agents', detail: 'configuration is not valid' })
      checks.push({ status: 'skip', label: 'User skills', detail: 'configuration is not valid' })
    } else {
      let agents: Awaited<ReturnType<typeof configuredAgents>>
      try {
        agents = await configuredAgents({ homeDirectory: context.homeDirectory, configurationDirectory: context.paths.config })
      } catch (error) {
        checks.push({ status: 'fail', label: 'Agents', detail: (error as Error).message })
        checks.push({ status: 'skip', label: 'User skills', detail: 'agents are unavailable' })
        report(context, checks)
        return
      }
      const activeLocal = Boolean(configuration.local) && (await canonicalHarnessDevelopmentEnabled(context.paths.data))
      const localSources = new Map<string, string>()
      if (activeLocal && configuration.local) {
        try {
          const local = await localBootstrapHarness(configuration.local)
          for (const skill of local.skills) localSources.set(skill.name, skill.source)
          checks.push({ status: 'pass', label: 'Local development', detail: `active ${local.harness}` })
        } catch (error) {
          checks.push({ status: 'fail', label: 'Local development', detail: (error as Error).message })
        }
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
        // inspectUserConfiguration only ever pushes "harness:name" identities with a non-empty
        // harness and name when the configuration is valid, so this defends only a future change.
        /* v8 ignore next 4 */
        if (!name) {
          checks.push({ status: 'fail', label: `User skill ${identity}`, detail: 'invalid identity' })
          continue
        }
        const resolved = installed
          .flatMap((harness) => harness.capabilities.map((candidate) => ({ harness, capability: candidate })))
          .find(({ harness, capability }) => identity === `${harness.id}:${capability.name}`)
        const compatibleAgents = resolved ? agents.filter((agent) => compatibleWithSkill(agent, resolved.capability.supportedRuntimes)) : agents
        if (compatibleAgents.length === 0) {
          checks.push({ status: 'fail', label: `User skill ${name}`, detail: 'no compatible configured agent' })
          continue
        }
        const links = await Promise.all(compatibleAgents.map((agent) => managedLink(agent, name)))
        const expected =
          localSources.get(name) ??
          (resolved
            ? await realpath(join(resolved.harness.root, resolved.capability.source)).catch(
                /* v8 ignore next -- Discovery verifies this physical source; only concurrent filesystem mutation can make it unavailable here. */
                () => undefined
              )
            : undefined)
        const absent = links.some(({ link }) => !link)
        const wrongTarget = Boolean(expected) && links.some(({ target }) => target !== expected)
        checks.push({
          status: absent || wrongTarget ? 'fail' : 'pass',
          label: `User skill ${name}`,
          detail: absent
            ? 'not linked for every compatible configured agent'
            : wrongTarget
              ? `link target does not match ${activeLocal ? 'local development' : 'installed harness'} source`
              : 'linked'
        })
      }
    }
    report(context, checks)
  })
