import { join } from 'node:path'

export type ManageCheckStatus = 'pass' | 'fail' | 'skip'
export type ManageSupportedRuntime = 'claude-code' | 'claude-desktop' | 'chatgpt-codex'

export interface ManageDoctorCheck {
  readonly status: ManageCheckStatus
  readonly label: string
  readonly detail: string
}

export interface ManageConfiguration {
  readonly path: string
  readonly state: 'missing' | 'valid' | 'invalid'
  readonly harnesses: readonly string[]
  readonly skills: readonly string[]
  readonly local: { readonly harness: string; readonly path: string } | null
  readonly errors: readonly string[]
}

export interface ManageAgent {
  readonly id: string
  readonly home: string
  readonly userSkills: string
  readonly supports: (runtimes: readonly ManageSupportedRuntime[] | undefined) => boolean
}

export interface ManageCapability {
  readonly name: string
  readonly source: string
  readonly supportedRuntimes?: readonly ManageSupportedRuntime[]
}

export interface ManageHarness {
  readonly id: string
  readonly root: string
  readonly capabilities: readonly ManageCapability[]
}

export interface ManageLocalHarness {
  readonly harness: string
  readonly skills: readonly { readonly name: string; readonly source: string }[]
}

export interface ManagePathState {
  readonly isDirectory: () => boolean
  readonly isFile: () => boolean
  readonly isSymbolicLink: () => boolean
}

export interface ManageDoctorPort {
  readonly inspectConfiguration: () => Promise<ManageConfiguration>
  readonly configuredAgents: () => Promise<readonly ManageAgent[]>
  readonly discoverHarnesses: () => Promise<readonly ManageHarness[]>
  readonly localDevelopmentEnabled: (identifier: string, source?: string) => Promise<boolean>
  readonly inspectLocalHarness: (source: string, identifier: string) => Promise<ManageLocalHarness>
  readonly readRepositorySkills: (path: string) => Promise<readonly unknown[]>
  readonly lstat: (path: string) => Promise<ManagePathState | undefined>
  readonly realpath: (path: string) => Promise<string | undefined>
}

export interface ManageDoctorOptions {
  readonly workingDirectory: string
  readonly canonicalHarnessIdentifier: string
}

const physicalDirectory = async (port: ManageDoctorPort, path: string): Promise<boolean> => {
  const state = await port.lstat(path)
  return Boolean(state?.isDirectory() && !state.isSymbolicLink())
}

const legacyRepositoryStructures = async (port: ManageDoctorPort, directory: string): Promise<readonly string[]> => {
  const structures = ['.ki-meta', '.ki'] as const
  const present = await Promise.all(
    structures.map(async (structure) => ({
      structure,
      present: await physicalDirectory(port, join(directory, structure))
    }))
  )
  return present.filter((entry) => entry.present).map((entry) => entry.structure)
}

const repositoryConfigurationCheck = async (
  port: ManageDoctorPort,
  directory: string
): Promise<ManageDoctorCheck | undefined> => {
  const path = join(directory, '.ki-config.toml')
  const state = await port.lstat(path)
  if (!state) return undefined
  if (!state.isFile() || state.isSymbolicLink())
    return { status: 'fail', label: 'Repository configuration', detail: '.ki-config.toml must be a regular file' }
  try {
    const skills = await port.readRepositorySkills(path)
    return { status: 'pass', label: 'Repository configuration', detail: `${skills.length} declared skills` }
  } catch (error) {
    return { status: 'fail', label: 'Repository configuration', detail: (error as Error).message }
  }
}

const managedSkillName = (identity: string): string | undefined => {
  const separator = identity.indexOf(':')
  return separator > 0 && separator < identity.length - 1 ? identity.slice(separator + 1) : undefined
}

const managedLink = async (
  port: ManageDoctorPort,
  agent: ManageAgent,
  name: string
): Promise<{ readonly link: boolean; readonly target?: string }> => {
  const path = join(agent.userSkills, name)
  const state = await port.lstat(path)
  if (!state?.isSymbolicLink()) return { link: false }
  return { link: true, target: await port.realpath(path) }
}

export const inspectManageDoctor = async (
  port: ManageDoctorPort,
  options: ManageDoctorOptions
): Promise<readonly ManageDoctorCheck[]> => {
  const configuration = await port.inspectConfiguration()
  const checks: ManageDoctorCheck[] = []
  const legacy = await legacyRepositoryStructures(port, options.workingDirectory)
  if (legacy.length) {
    checks.push({
      status: 'fail',
      label: 'Legacy repository state',
      detail: `${legacy.map((structure) => `${structure}/`).join(', ')} detected; remove after migrating to .ki-config.toml`
    })
  }
  const repositoryConfiguration = await repositoryConfigurationCheck(port, options.workingDirectory)
  if (repositoryConfiguration) checks.push(repositoryConfiguration)
  if (configuration.state === 'valid') {
    checks.push({ status: 'pass', label: 'Configuration', detail: configuration.path })
  } else if (configuration.state === 'missing') {
    checks.push({ status: 'fail', label: 'Configuration', detail: 'missing; run ki bootstrap' })
  } else {
    checks.push({ status: 'fail', label: 'Configuration', detail: configuration.errors.join('; ') })
  }

  let installed: readonly ManageHarness[] = []
  try {
    installed = await port.discoverHarnesses()
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
    return checks
  }

  let agents: readonly ManageAgent[]
  try {
    agents = await port.configuredAgents()
  } catch (error) {
    checks.push({ status: 'fail', label: 'Agents', detail: (error as Error).message })
    checks.push({ status: 'skip', label: 'User skills', detail: 'agents are unavailable' })
    return checks
  }
  const activeLocal = configuration.local
    ? await port.localDevelopmentEnabled(configuration.local.harness, configuration.local.path)
    : false
  const localSources = new Map<string, string>()
  if (activeLocal && configuration.local) {
    try {
      const local = await port.inspectLocalHarness(configuration.local.path, configuration.local.harness)
      for (const skill of local.skills) localSources.set(skill.name, skill.source)
      checks.push({ status: 'pass', label: 'Local development', detail: `active ${local.harness}` })
    } catch (error) {
      checks.push({ status: 'fail', label: 'Local development', detail: (error as Error).message })
    }
  } else if (configuration.local && (await port.localDevelopmentEnabled(configuration.local.harness))) {
    checks.push({
      status: 'fail',
      label: 'Local development',
      detail: `${configuration.local.harness} active root does not match the configured local source`
    })
  }
  for (const agent of agents) {
    const ready = (await physicalDirectory(port, agent.home)) && (await physicalDirectory(port, agent.userSkills))
    checks.push({
      status: ready ? 'pass' : 'fail',
      label: `Agent ${agent.id}`,
      detail: ready ? 'ready' : 'user skill directory missing'
    })
  }
  for (const identity of configuration.skills) {
    const name = managedSkillName(identity)
    // Configuration inspection guarantees non-empty harness:name identities when valid.
    /* v8 ignore next 4 */
    if (!name) {
      checks.push({ status: 'fail', label: `User skill ${identity}`, detail: 'invalid identity' })
      continue
    }
    const resolved = installed
      .flatMap((harness) => harness.capabilities.map((capability) => ({ harness, capability })))
      .find(({ harness, capability }) => identity === `${harness.id}:${capability.name}`)
    const expected =
      (identity.startsWith(`${options.canonicalHarnessIdentifier}:`) ? localSources.get(name) : undefined) ??
      (resolved ? await port.realpath(join(resolved.harness.root, resolved.capability.source)) : undefined)
    if (!expected) {
      checks.push({
        status: 'fail',
        label: `User skill ${name}`,
        detail: `configured skill cannot be resolved from the active source ${identity.slice(0, identity.indexOf(':'))}`
      })
      continue
    }
    const compatibleAgents = resolved
      ? agents.filter((agent) => agent.supports(resolved.capability.supportedRuntimes))
      : agents
    if (compatibleAgents.length === 0) {
      checks.push({ status: 'fail', label: `User skill ${name}`, detail: 'no compatible configured agent' })
      continue
    }
    const links = await Promise.all(compatibleAgents.map((agent) => managedLink(port, agent, name)))
    const absent = links.some(({ link }) => !link)
    const wrongTarget = links.some(({ target }) => target !== expected)
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
  return checks
}
