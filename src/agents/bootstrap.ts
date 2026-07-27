import { lstat, mkdir, readdir, realpath, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { KiError } from '../core/errors.ts'
import { canonicalHarnessIdentifier, discoverInstalledHarnesses, type HarnessCapability, readInstalledHarness } from '../core/harness.ts'
import { readConfiguration, renderConfiguration } from './configuration.ts'
import { detectAgents } from './detection.ts'
import {
  type BootstrapConfiguration,
  bootstrapConfigurationPath,
  bootstrapUserSkills,
  type InstalledAgent,
  type ManagedUserSkill,
  requiredPhysicalDirectory,
  skillCapability
} from './internal.ts'
import { linkManagedSkill } from './skills.ts'

const bootstrapSkillSources = async (
  harness: { readonly root: string; readonly capabilities: readonly HarnessCapability[] },
  description: string
): Promise<readonly ManagedUserSkill[]> =>
  Promise.all(
    bootstrapUserSkills.map(async (name) => {
      const capability = harness.capabilities.find((candidate) => candidate.kind === 'skill' && candidate.name === name)
      if (!capability) throw new KiError(`${description} does not provide ${name}`, 1)
      return { name, source: await requiredPhysicalDirectory(join(harness.root, capability.source), `${description} ${name} skill`) }
    })
  )

export const installedBootstrapSkillSources = async (
  dataDirectory: string,
  identifier = canonicalHarnessIdentifier
): Promise<readonly ManagedUserSkill[]> => {
  const harness = await readInstalledHarness(dataDirectory, identifier)
  return bootstrapSkillSources(harness, `installed harness ${identifier}`)
}

export const localBootstrapHarness = async (
  harnessDirectory: string
): Promise<{ readonly harness: string; readonly skills: readonly ManagedUserSkill[] }> => {
  const harness = await requiredPhysicalDirectory(resolve(harnessDirectory), 'local harness')
  const skills: ManagedUserSkill[] = []
  for (const name of bootstrapUserSkills) {
    const source = join(harness, 'skills', name === 'ki-bootstrap' ? 'keystone' : 'process', name)
    const entry = await lstat(join(source, 'SKILL.md')).catch(() => undefined)
    if (!entry?.isFile() || entry.isSymbolicLink()) {
      throw new KiError(`local harness must contain ${source.slice(harness.length + 1)}/SKILL.md`, 1)
    }
    skills.push({ name, source: await requiredPhysicalDirectory(source, `local harness ${name} skill`) })
  }
  return { harness, skills }
}

export const configureBootstrapAgents = async (options: {
  readonly homeDirectory: string
  readonly configurationDirectory: string
  readonly refresh?: boolean
}): Promise<BootstrapConfiguration> => {
  const path = bootstrapConfigurationPath(options.configurationDirectory)
  const state = await lstat(options.configurationDirectory).catch(() => undefined)
  if (state && (!state.isDirectory() || state.isSymbolicLink())) throw new KiError('ki configuration directory must be a directory', 1)
  const configured = options.refresh ? undefined : await readConfiguration(options.configurationDirectory, options.homeDirectory)
  const agents = options.refresh || !configured ? await detectAgents(options.homeDirectory) : configured
  if (!configured) {
    await mkdir(options.configurationDirectory, { recursive: true })
    await writeFile(path, renderConfiguration(agents), { encoding: 'utf8' })
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
  local?: string
): Promise<{ readonly harnesses: number; readonly skills: number }> => {
  const installed = await discoverInstalledHarnesses(dataDirectory)
  const harnesses = installed.map((harness) => harness.id).sort((left, right) => left.localeCompare(right))
  const localSkills = local ? (await localBootstrapHarness(local)).skills : []
  const skills = await discoverManagedUserSkills(agents, installed, localSkills)
  await writeFile(bootstrapConfigurationPath(configurationDirectory), renderConfiguration(agents, harnesses, skills, local), {
    encoding: 'utf8'
  })
  return { harnesses: harnesses.length, skills: skills.length }
}

export const installBootstrapSkills = async (
  skills: readonly ManagedUserSkill[],
  agents: readonly InstalledAgent[],
  options: { readonly replace?: boolean } = {}
): Promise<readonly { readonly agent: InstalledAgent; readonly skill: string; readonly installed: boolean }[]> => {
  return Promise.all(
    agents.flatMap((agent) =>
      skills.map(async (skill) => ({
        agent,
        skill: skill.name,
        installed: await linkManagedSkill(agent, { scope: 'user' }, skill, options.replace)
      }))
    )
  )
}
