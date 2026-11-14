import { lstat, mkdir, readdir, readlink, realpath, symlink, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { bootstrapUserSkills } from '../core/backpack/bootstrap-capabilities.ts'
import {
  type BackpackCapability,
  canonicalBackpackIdentifier,
  discoverInstalledBackpacks,
  inspectBackpackSourceRoot,
  readInstalledBackpack,
  sameBackpack
} from '../core/backpack/index.ts'
import { KiError } from '../core/errors.ts'
import { inspectUserConfiguration, readConfiguration, writeUserConfiguration } from './configuration.ts'
import {
  type BootstrapConfiguration,
  type InstalledAgent,
  type ManagedUserSkill,
  requiredPhysicalDirectory,
  skillCapability
} from './internal.ts'
import { detectAgents } from './shared/index.ts'
import { linkManagedSkill } from './skills.ts'

interface BootstrapSkillLinkSnapshot {
  readonly path: string
  readonly target?: string
}

const bootstrapSkillSources = async (
  backpack: { readonly root: string; readonly capabilities: readonly BackpackCapability[] },
  description: string
): Promise<readonly ManagedUserSkill[]> =>
  Promise.all(
    bootstrapUserSkills(backpack.capabilities.map((capability) => capability.name)).map(async (name) => {
      const capability = backpack.capabilities.find(
        (candidate) => candidate.kind === 'skill' && candidate.name === name
      )
      if (!capability) throw new KiError(`${description} does not provide ${name}`, 1)
      const source = await requiredPhysicalDirectory(
        join(backpack.root, capability.source),
        `${description} ${name} skill`
      )
      return { name, source }
    })
  )

export const installedBootstrapSkillSources = async (
  dataDirectory: string,
  identifier = canonicalBackpackIdentifier
): Promise<readonly ManagedUserSkill[]> => {
  const backpack = await readInstalledBackpack(dataDirectory, identifier)
  return bootstrapSkillSources(backpack, `installed backpack ${identifier}`)
}

export const localBootstrapBackpack = async (
  backpackDirectory: string
): Promise<{ readonly backpack: string; readonly skills: readonly ManagedUserSkill[] }> => {
  const inspected = await inspectBackpackSourceRoot(resolve(backpackDirectory), canonicalBackpackIdentifier)
  return { backpack: inspected.root, skills: await bootstrapSkillSources(inspected, 'local backpack') }
}

const backpackSkillSources = async (
  backpack: { readonly root: string; readonly capabilities: readonly BackpackCapability[] },
  description: string
): Promise<readonly ManagedUserSkill[]> =>
  Promise.all(
    backpack.capabilities.map(async (capability) => ({
      name: capability.name,
      source: await requiredPhysicalDirectory(
        join(backpack.root, capability.source),
        `${description} ${capability.name} skill`
      )
    }))
  )

export const localBackpack = async (
  backpackDirectory: string,
  identifier: string
): Promise<{ readonly backpack: string; readonly prefix: string; readonly skills: readonly ManagedUserSkill[] }> => {
  const inspected = await inspectBackpackSourceRoot(resolve(backpackDirectory), identifier)
  if (sameBackpack(identifier, canonicalBackpackIdentifier))
    return {
      backpack: inspected.root,
      prefix: inspected.prefix,
      skills: await bootstrapSkillSources(inspected, `local backpack ${identifier}`)
    }
  return {
    backpack: inspected.root,
    prefix: inspected.prefix,
    skills: await backpackSkillSources(inspected, `local backpack ${identifier}`)
  }
}

export const installedBackpackSkillSources = async (
  dataDirectory: string,
  identifier: string
): Promise<readonly ManagedUserSkill[]> => {
  const backpack = await readInstalledBackpack(dataDirectory, identifier)
  return backpackSkillSources(backpack, `installed backpack ${identifier}`)
}

export const configureBootstrapAgents = async (options: {
  readonly homeDirectory: string
  readonly configurationDirectory: string
  readonly refresh?: boolean
  readonly dropLegacyRepositories?: boolean
}): Promise<BootstrapConfiguration> => {
  const state = await lstat(options.configurationDirectory).catch(() => undefined)
  if (state && (!state.isDirectory() || state.isSymbolicLink()))
    throw new KiError('ki configuration directory must be a directory', 1)
  const configured = options.refresh
    ? undefined
    : await readConfiguration(options.configurationDirectory, options.homeDirectory)
  const existing = options.refresh
    ? await inspectUserConfiguration(options.configurationDirectory)
    : { backpacks: [], skills: [], repositories: [] }
  const agents = options.refresh || !configured ? await detectAgents(options.homeDirectory) : configured
  if (!configured) {
    await mkdir(options.configurationDirectory, { recursive: true })
    await writeUserConfiguration(
      options.configurationDirectory,
      agents,
      existing.backpacks,
      existing.skills,
      options.dropLegacyRepositories ? [] : existing.repositories
    )
  }
  return { agents, disposition: options.refresh ? 'refreshed' : !configured ? 'created' : 'reused' }
}

const discoverManagedUserSkills = async (
  agents: readonly InstalledAgent[],
  backpacks: Awaited<ReturnType<typeof discoverInstalledBackpacks>>
): Promise<readonly string[]> => {
  const identities = new Map<string, string>()
  for (const backpack of backpacks) {
    for (const capability of backpack.capabilities) {
      const source = await realpath(join(backpack.root, capability.source))
      identities.set(source, `${backpack.id}:${capability.name}`)
    }
  }
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
  options: { readonly dropLegacyRepositories?: boolean } = {}
): Promise<{ readonly backpacks: number; readonly skills: number }> => {
  const installed = await discoverInstalledBackpacks(dataDirectory)
  const existing = await inspectUserConfiguration(configurationDirectory)
  const backpacks = installed.map((backpack) => backpack.id).sort((left, right) => left.localeCompare(right))
  const skills = await discoverManagedUserSkills(agents, installed)
  await writeUserConfiguration(
    configurationDirectory,
    agents,
    backpacks,
    skills,
    options.dropLegacyRepositories ? [] : existing.repositories
  )
  return { backpacks: backpacks.length, skills: skills.length }
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
        // snapshots and projections traverse the same agents × skills product above and here.
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
