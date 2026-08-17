import { lstat, mkdir, readdir, readlink, realpath, symlink, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { minimumBootstrapUserSkills } from '../core/harness/bootstrap-capabilities.ts'
import { KiError } from '../core/errors.ts'
import {
  canonicalHarnessIdentifier,
  discoverInstalledHarnesses,
  type HarnessCapability,
  inspectHarnessRoot,
  readInstalledHarness
} from '../core/harness/index.ts'
import { inspectUserConfiguration, readConfiguration, renderConfiguration } from './configuration.ts'
import { detectAgents } from './detection.ts'
import {
  type BootstrapConfiguration,
  bootstrapConfigurationPath,
  type InstalledAgent,
  type ManagedUserSkill,
  requiredPhysicalDirectory,
  skillCapability
} from './internal.ts'
import { linkManagedSkill } from './skills.ts'

interface BootstrapSkillLinkSnapshot {
  readonly path: string
  readonly target?: string
}

const bootstrapSkillSources = async (
  harness: { readonly root: string; readonly capabilities: readonly HarnessCapability[] },
  description: string,
  preserveHarnessRoot = false
): Promise<readonly ManagedUserSkill[]> =>
  Promise.all(
    minimumBootstrapUserSkills.map(async (name) => {
      const capability = harness.capabilities.find((candidate) => candidate.kind === 'skill' && candidate.name === name)
      // Canonical restoration validates this exact inventory before this source resolver is reached.
      /* v8 ignore next */
      if (!capability) throw new KiError(`${description} does not provide ${name}`, 1)
      const source = join(harness.root, capability.source)
      const physicalSource = await requiredPhysicalDirectory(source, `${description} ${name} skill`)
      return { name, source: preserveHarnessRoot ? source : physicalSource }
    })
  )

export const installedBootstrapSkillSources = async (
  dataDirectory: string,
  identifier = canonicalHarnessIdentifier,
  options: { readonly preserveHarnessRoot?: boolean } = {}
): Promise<readonly ManagedUserSkill[]> => {
  const harness = await readInstalledHarness(dataDirectory, identifier)
  return bootstrapSkillSources(harness, `installed harness ${identifier}`, options.preserveHarnessRoot)
}

export const localBootstrapHarness = async (
  harnessDirectory: string
): Promise<{ readonly harness: string; readonly skills: readonly ManagedUserSkill[] }> => {
  const inspected = await inspectHarnessRoot(resolve(harnessDirectory), canonicalHarnessIdentifier)
  return { harness: inspected.root, skills: await bootstrapSkillSources(inspected, 'local harness') }
}

export const configureBootstrapAgents = async (options: {
  readonly homeDirectory: string
  readonly configurationDirectory: string
  readonly refresh?: boolean
  readonly dropLegacyRepositories?: boolean
}): Promise<BootstrapConfiguration> => {
  const path = bootstrapConfigurationPath(options.configurationDirectory)
  const state = await lstat(options.configurationDirectory).catch(() => undefined)
  if (state && (!state.isDirectory() || state.isSymbolicLink()))
    throw new KiError('ki configuration directory must be a directory', 1)
  const configured = options.refresh
    ? undefined
    : await readConfiguration(options.configurationDirectory, options.homeDirectory)
  const existing = options.refresh
    ? await inspectUserConfiguration(options.configurationDirectory)
    : { harnesses: [], skills: [], local: null, repositories: [] }
  const agents = options.refresh || !configured ? await detectAgents(options.homeDirectory) : configured
  if (!configured) {
    await mkdir(options.configurationDirectory, { recursive: true })
    await writeFile(
      path,
      renderConfiguration(
        agents,
        existing.harnesses,
        existing.skills,
        existing.local ?? undefined,
        options.dropLegacyRepositories ? [] : existing.repositories
      ),
      {
        encoding: 'utf8'
      }
    )
  }
  return { agents, disposition: options.refresh ? 'refreshed' : !configured ? 'created' : 'reused' }
}

const discoverManagedUserSkills = async (
  agents: readonly InstalledAgent[],
  harnesses: Awaited<ReturnType<typeof discoverInstalledHarnesses>>,
  localSkills: readonly ManagedUserSkill[] = []
): Promise<readonly string[]> => {
  const identities = new Map<string, string>()
  for (const harness of harnesses) {
    for (const capability of harness.capabilities) {
      const source = await realpath(join(harness.root, capability.source))
      identities.set(source, `${harness.id}:${capability.name}`)
    }
  }
  for (const skill of localSkills) identities.set(skill.source, `${canonicalHarnessIdentifier}:${skill.name}`)
  const skills = new Set<string>()
  for (const agent of agents) {
    skillCapability(agent)
    const directory = join(agent.home, 'skills')
    await requiredPhysicalDirectory(directory, `${agent.descriptor.id} user skills directory`)
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isSymbolicLink()) continue
      const source = await realpath(join(directory, entry.name)).catch(() => undefined)
      const identity = source ? identities.get(source) : undefined
      if (identity) skills.add(identity)
    }
  }
  return [...skills].sort((left, right) => left.localeCompare(right))
}

export const refreshUserConfiguration = async (
  configurationDirectory: string,
  dataDirectory: string,
  agents: readonly InstalledAgent[],
  local?: string,
  options: { readonly dropLegacyRepositories?: boolean } = {}
): Promise<{ readonly harnesses: number; readonly skills: number }> => {
  const installed = await discoverInstalledHarnesses(dataDirectory)
  const existing = await inspectUserConfiguration(configurationDirectory)
  const harnesses = installed.map((harness) => harness.id).sort((left, right) => left.localeCompare(right))
  const localSkills = local ? (await localBootstrapHarness(local)).skills : []
  const skills = await discoverManagedUserSkills(agents, installed, localSkills)
  await writeFile(
    bootstrapConfigurationPath(configurationDirectory),
    renderConfiguration(agents, harnesses, skills, local, options.dropLegacyRepositories ? [] : existing.repositories),
    {
      encoding: 'utf8'
    }
  )
  return { harnesses: harnesses.length, skills: skills.length }
}

export const installBootstrapSkills = async (
  skills: readonly ManagedUserSkill[],
  agents: readonly InstalledAgent[],
  options: { readonly replace?: boolean; readonly finalize?: () => Promise<void> } = {}
): Promise<readonly { readonly agent: InstalledAgent; readonly skill: string; readonly installed: boolean }[]> => {
  const snapshots: BootstrapSkillLinkSnapshot[] = []
  for (const agent of agents) {
    skillCapability(agent)
    const directory = join(agent.home, 'skills')
    await mkdir(directory, { recursive: true })
    await requiredPhysicalDirectory(directory, `${agent.descriptor.id} skills directory`)
    for (const skill of skills) {
      const path = join(directory, skill.name)
      const state = await lstat(path).catch(() => undefined)
      if (!state) {
        snapshots.push({ path })
        continue
      }
      if (!state.isSymbolicLink()) throw new KiError(`${agent.descriptor.id} ${skill.name} skill is not KI-managed`, 1)
      const [actual, expected, target] = await Promise.all([
        realpath(path).catch(() => undefined),
        realpath(skill.source),
        readlink(path)
      ])
      if (actual !== expected && !options.replace) {
        throw new KiError(`${agent.descriptor.id} ${skill.name} skill points elsewhere; pass --replace to re-point`, 1)
      }
      snapshots.push({ path, target })
    }
  }

  const applied: BootstrapSkillLinkSnapshot[] = []
  try {
    const projections: { readonly agent: InstalledAgent; readonly skill: string; readonly installed: boolean }[] = []
    for (const agent of agents) {
      for (const skill of skills) {
        const snapshot = snapshots[projections.length]
        // snapshots and projections traverse the same agents Ã skills product above and here.
        /* v8 ignore next */
        if (!snapshot) throw new KiError('bootstrap skill projection plan is incomplete', 1)
        applied.push(snapshot)
        projections.push({
          agent,
          skill: skill.name,
          installed: await linkManagedSkill(agent, { scope: 'user' }, skill, options.replace)
        })
      }
    }
    await options.finalize?.()
    return projections
  } catch (error) {
    for (const snapshot of applied.reverse()) {
      const state = await lstat(snapshot.path).catch(
        // A concurrent removal after preflight is tolerated by treating the projection as already rolled back.
        /* v8 ignore next */
        () => undefined
      )
      /* v8 ignore start -- Only a concurrent replacement after preflight can introduce a user-owned non-link during rollback. */
      if (state && !state.isSymbolicLink()) {
        throw new KiError(`bootstrap link rollback refused unfamiliar state at ${snapshot.path}`, 1)
      }
      /* v8 ignore stop */
      // Every applied projection exists unless it is concurrently removed after preflight.
      /* v8 ignore next */
      if (state) await unlink(snapshot.path)
      if (snapshot.target !== undefined) await symlink(snapshot.target, snapshot.path, 'dir')
    }
    throw error
  }
}
