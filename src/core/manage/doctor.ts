import { join } from 'node:path'

export type ManageCheckStatus = 'pass' | 'warn' | 'fail' | 'skip'
export type ManageSupportedRuntime = 'claude-code' | 'claude-desktop' | 'chatgpt-codex'

export interface ManageDoctorCheck {
  readonly status: ManageCheckStatus
  readonly label: string
  readonly detail: string
}

export interface ManageConfiguration {
  readonly path: string
  readonly state: 'missing' | 'valid' | 'invalid'
  readonly backpacks: readonly string[]
  readonly skills: readonly string[]
  readonly locals: readonly { readonly backpack: string; readonly path: string }[]
  readonly errors: readonly string[]
  readonly legacySchema?: boolean
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

export interface ManageBackpack {
  readonly id: string
  readonly root: string
  readonly capabilities: readonly ManageCapability[]
}

export interface ManageLocalBackpack {
  readonly backpack: string
  readonly skills: readonly { readonly name: string; readonly source: string }[]
}

/** One declared external store of a registered Knowledge Base, as this host sees it. */
export type ManageStoreState =
  | { readonly repository: string; readonly role: string; readonly state: 'available' | 'absent' }
  | {
      readonly repository: string
      readonly role: string
      readonly state: 'unavailable'
      readonly reason: string
      readonly fix: string
    }

export interface ManagePathState {
  readonly isDirectory: () => boolean
  readonly isFile: () => boolean
  readonly isSymbolicLink: () => boolean
}

export interface ManageDoctorPort {
  readonly inspectConfiguration: () => Promise<ManageConfiguration>
  readonly configuredAgents: () => Promise<readonly ManageAgent[]>
  readonly discoverBackpacks: () => Promise<readonly ManageBackpack[]>
  readonly localDevelopmentEnabled: (identifier: string, source?: string) => Promise<boolean>
  readonly inspectLocalBackpack: (source: string, identifier: string) => Promise<ManageLocalBackpack>
  readonly readRepositorySkills: (path: string) => Promise<readonly unknown[]>
  readonly lstat: (path: string) => Promise<ManagePathState | undefined>
  readonly realpath: (path: string) => Promise<string | undefined>
  readonly inspectStores: () => Promise<readonly ManageStoreState[]>
}

export interface ManageDoctorOptions {
  readonly workingDirectory: string
  readonly canonicalBackpackIdentifier: string
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

const repositoryDeclarationCheck = async (
  port: ManageDoctorPort,
  directory: string
): Promise<ManageDoctorCheck | undefined> => {
  const path = join(directory, '.ki.toml')
  const state = await port.lstat(path)
  if (!state) return undefined
  if (!state.isFile() || state.isSymbolicLink())
    return { status: 'fail', label: 'Repository declaration', detail: '.ki.toml must be a regular file' }
  try {
    const skills = await port.readRepositorySkills(path)
    return { status: 'pass', label: 'Repository declaration', detail: `${skills.length} declared skills` }
  } catch (error) {
    return { status: 'fail', label: 'Repository declaration', detail: (error as Error).message }
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

/** A warning per unavailable store, else one pass; a host with no declared stores has nothing to report. */
const storeChecks = async (port: ManageDoctorPort): Promise<readonly ManageDoctorCheck[]> => {
  let stores: readonly ManageStoreState[]
  try {
    stores = await port.inspectStores()
  } catch (error) {
    return [{ status: 'skip', label: 'Stores', detail: (error as Error).message }]
  }
  if (!stores.length) return []
  const unavailable = stores.flatMap((store) => (store.state === 'unavailable' ? [store] : []))
  if (!unavailable.length)
    return [
      { status: 'pass', label: 'Stores', detail: `${stores.length} declared stores available or absent by choice` }
    ]
  return unavailable.map((store) => ({
    status: 'warn',
    label: `Store ${store.role} of ${store.repository}`,
    detail: `unavailable on this host (${store.reason}); fix: ${store.fix}`
  }))
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
      detail: `${legacy.map((structure) => `${structure}/`).join(', ')} detected; remove after migrating to .ki.toml`
    })
  }
  const repositoryDeclaration = await repositoryDeclarationCheck(port, options.workingDirectory)
  if (repositoryDeclaration) checks.push(repositoryDeclaration)
  if (configuration.state === 'valid') {
    checks.push({ status: 'pass', label: 'Configuration', detail: configuration.path })
  } else if (configuration.state === 'missing') {
    checks.push({ status: 'fail', label: 'Configuration', detail: 'missing; run ki bootstrap' })
  } else {
    checks.push({ status: 'fail', label: 'Configuration', detail: configuration.errors.join('; ') })
  }

  let installed: readonly ManageBackpack[] = []
  try {
    installed = await port.discoverBackpacks()
    const identifiers = new Set(installed.map((backpack) => backpack.id))
    const missing = configuration.backpacks.filter((identifier) => !identifiers.has(identifier))
    checks.push({
      status: missing.length ? 'fail' : 'pass',
      label: 'Backpack inventory',
      detail: missing.length ? `missing ${missing.join(', ')}` : `${installed.length} installed`
    })
  } catch (error) {
    checks.push({ status: 'fail', label: 'Backpack inventory', detail: (error as Error).message })
  }

  checks.push(...(await storeChecks(port)))

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
  const activeLocals = new Set<string>()
  for (const source of configuration.locals) {
    const active = await port.localDevelopmentEnabled(source.backpack, source.path)
    if (active) {
      try {
        const local = await port.inspectLocalBackpack(source.path, source.backpack)
        activeLocals.add(source.backpack)
        checks.push({
          status: 'pass',
          label: `Local development ${source.backpack}`,
          detail: `active ${local.backpack}`
        })
      } catch (error) {
        checks.push({ status: 'fail', label: `Local development ${source.backpack}`, detail: (error as Error).message })
      }
    } else if (await port.localDevelopmentEnabled(source.backpack)) {
      checks.push({
        status: 'fail',
        label: `Local development ${source.backpack}`,
        detail: 'active root does not match the configured local source'
      })
    }
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
    // Configuration inspection guarantees non-empty backpack:name identities when valid.
    /* v8 ignore next 4 */
    if (!name) {
      checks.push({ status: 'fail', label: `User skill ${identity}`, detail: 'invalid identity' })
      continue
    }
    const resolved = installed
      .flatMap((backpack) => backpack.capabilities.map((capability) => ({ backpack, capability })))
      .find(({ backpack, capability }) => identity === `${backpack.id}:${capability.name}`)
    if (!resolved) {
      checks.push({
        status: 'fail',
        label: `User skill ${name}`,
        detail: `configured skill cannot be resolved from the active source ${identity.slice(0, identity.indexOf(':'))}`
      })
      continue
    }
    const expected = await port.realpath(join(resolved.backpack.root, resolved.capability.source))
    const compatibleAgents = agents.filter((agent) => agent.supports(resolved.capability.supportedRuntimes))
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
          ? `link target does not match ${activeLocals.has(identity.slice(0, identity.indexOf(':'))) ? 'local development' : 'installed backpack'} source`
          : 'linked'
    })
  }
  return checks
}
