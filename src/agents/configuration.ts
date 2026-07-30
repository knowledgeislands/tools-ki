import { lstat, readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import { parse } from 'smol-toml'
import { KiError } from '../core/errors.ts'
import {
  agentDescriptors,
  bootstrapConfigurationPath,
  descriptor,
  type HarnessSection,
  type InstalledAgent,
  isRecord,
  type LocalSection,
  type RepositoriesSection,
  type StringListSection,
  type UserConfigurationInspection
} from './internal.ts'

export const renderConfiguration = (
  agents: readonly InstalledAgent[],
  harnesses: readonly string[] = [],
  skills: readonly string[] = [],
  local?: string,
  repositories: readonly string[] = []
): string =>
  [
    'schema = 1',
    '',
    '[agents]',
    'ids = [',
    ...agents.map((agent) => `  ${JSON.stringify(agent.descriptor.id)},`),
    ']',
    '',
    '[harnesses]',
    'ids = [',
    ...harnesses.map((harness) => `  ${JSON.stringify(harness)},`),
    ']',
    '',
    '[skills]',
    ...skills.flatMap((skill) => {
      const separator = skill.lastIndexOf(':')
      return ['', `[skills.${skill.slice(separator + 1)}]`, `harness = ${JSON.stringify(skill.slice(0, separator))}`]
    }),
    ...(local ? ['', '[local]', `path = ${JSON.stringify(local)}`] : []),
    ...(repositories.length ? ['', '[repositories]', 'paths = [', ...repositories.map((repository) => `  ${JSON.stringify(repository)},`), ']'] : []),
    ''
  ].join('\n')

const inspectStringList = (value: unknown, key: string, errors: string[]): string[] => {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry)) {
    errors.push(`${key} must be an array of non-empty strings`)
    return []
  }
  if (new Set(value).size !== value.length) errors.push(`${key} repeats a value`)
  return value
}

const inspectSection = (value: unknown, key: string, errors: string[]): Record<string, unknown> => {
  if (isRecord(value)) return value
  errors.push(`${key} must be a TOML table`)
  return {}
}

export const inspectUserConfiguration = async (configurationDirectory: string): Promise<UserConfigurationInspection> => {
  const path = bootstrapConfigurationPath(configurationDirectory)
  const state = await lstat(path).catch(() => undefined)
  if (!state) return { path, state: 'missing', agents: [], harnesses: [], skills: [], local: null, repositories: [], warnings: [], errors: [] }
  if (!state.isFile() || state.isSymbolicLink()) {
    return {
      path,
      state: 'invalid',
      agents: [],
      harnesses: [],
      skills: [],
      local: null,
      repositories: [],
      warnings: [],
      errors: ['configuration must be a regular file']
    }
  }
  let parsed: unknown
  try {
    parsed = parse(await readFile(path, 'utf8'))
  } catch {
    return {
      path,
      state: 'invalid',
      agents: [],
      harnesses: [],
      skills: [],
      local: null,
      repositories: [],
      warnings: [],
      errors: ['configuration must be valid TOML']
    }
  }
  // A successfully parsed TOML document is always a table (the TOML grammar has no bare top-level
  // scalar or array form), so this defends only against a future parser change, not a reachable input.
  /* v8 ignore next */
  if (!isRecord(parsed)) {
    return {
      path,
      state: 'invalid',
      agents: [],
      harnesses: [],
      skills: [],
      local: null,
      repositories: [],
      warnings: [],
      errors: ['configuration must be a TOML table']
    }
  }

  const configuration = parsed as Record<string, unknown> & {
    schema?: unknown
    agents?: unknown
    harnesses?: unknown
    skills?: unknown
    local?: unknown
    repositories?: unknown
  }
  const warnings = Object.keys(configuration)
    .filter((key) => !['schema', 'agents', 'harnesses', 'skills', 'local', 'repositories'].includes(key))
    .map((key) => `unrecognised key ${key}`)
  const errors: string[] = []
  if (configuration.schema !== 1) errors.push('schema must equal 1')
  const agentSection = inspectSection(configuration.agents, 'agents', errors) as StringListSection
  for (const key of Object.keys(agentSection)) {
    if (key !== 'ids') warnings.push(`agents has unrecognised key ${key}`)
  }
  const agents = inspectStringList(agentSection.ids, 'agents.ids', errors)
  for (const agent of agents) {
    if (!agentDescriptors.some((candidate) => candidate.id === agent)) warnings.push(`unrecognised agent ${agent}`)
  }
  const skillSection = inspectSection(configuration.skills, 'skills', errors)
  const skills: string[] = []
  for (const [name, value] of Object.entries(skillSection)) {
    if (!isRecord(value)) {
      errors.push(`skills.${name} must be a TOML table`)
      continue
    }
    const harness = (value as { harness?: unknown }).harness
    if (typeof harness !== 'string' || !harness) {
      errors.push(`skills.${name} must declare a harness string`)
      continue
    }
    skills.push(`${harness}:${name}`)
  }
  const harnessSection = inspectSection(configuration.harnesses, 'harnesses', errors) as HarnessSection
  for (const key of Object.keys(harnessSection)) {
    if (key !== 'ids' && key !== 'releases') warnings.push(`harnesses has unrecognised key ${key}`)
  }
  const harnesses: string[] = []
  if (harnessSection.ids !== undefined) harnesses.push(...inspectStringList(harnessSection.ids, 'harnesses.ids', errors))
  else if (!Array.isArray(harnessSection.releases)) errors.push('harnesses must declare an ids array')
  else {
    for (const [index, harness] of harnessSection.releases.entries()) {
      if (!isRecord(harness)) {
        errors.push(`harnesses[${index}] must be a table`)
        continue
      }
      for (const key of Object.keys(harness)) {
        if (!['id', 'url', 'sha256'].includes(key)) warnings.push(`harnesses[${index}] has unrecognised key ${key}`)
      }
      const release = harness as Record<string, unknown> & { id?: unknown; url?: unknown; sha256?: unknown }
      const id = release.id
      const url = release.url
      const digest = release.sha256
      if (typeof id !== 'string' || !id) errors.push(`harnesses[${index}] id must be a non-empty string`)
      else harnesses.push(id)
      if (typeof url !== 'string' || !url.startsWith('https://')) errors.push(`harnesses[${index}] url must be an HTTPS URL`)
      if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) errors.push(`harnesses[${index}] sha256 must be lowercase SHA-256`)
    }
  }
  const localSection = configuration.local === undefined ? undefined : (inspectSection(configuration.local, 'local', errors) as LocalSection)
  if (localSection) {
    for (const key of Object.keys(localSection)) {
      if (key !== 'path') warnings.push(`local has unrecognised key ${key}`)
    }
  }
  const local = localSection === undefined ? null : typeof localSection.path === 'string' && localSection.path ? localSection.path : null
  if (localSection !== undefined && local === null) errors.push('local.path must be a non-empty path string')
  const repositoriesSection =
    configuration.repositories === undefined ? undefined : (inspectSection(configuration.repositories, 'repositories', errors) as RepositoriesSection)
  if (repositoriesSection) {
    for (const key of Object.keys(repositoriesSection)) {
      if (key !== 'paths') warnings.push(`repositories has unrecognised key ${key}`)
    }
  }
  const repositories = repositoriesSection === undefined ? [] : inspectStringList(repositoriesSection.paths, 'repositories.paths', errors)
  if (repositories.some((repository) => !isAbsolute(repository))) errors.push('repositories.paths must contain absolute paths')
  return { path, state: errors.length ? 'invalid' : 'valid', agents, harnesses, skills, local, repositories, warnings, errors }
}

export const readConfiguration = async (configurationDirectory: string, homeDirectory: string): Promise<readonly InstalledAgent[] | undefined> => {
  const path = bootstrapConfigurationPath(configurationDirectory)
  const state = await lstat(path).catch(() => undefined)
  if (!state) return undefined
  if (!state.isFile() || state.isSymbolicLink()) throw new KiError('agent configuration must be a regular file', 1)
  let parsed: unknown
  try {
    parsed = parse(await readFile(path, 'utf8'))
  } catch {
    throw new KiError('agent configuration must be valid TOML', 1)
  }
  // A successfully parsed TOML document is always a table; this only guards a future parser change.
  /* v8 ignore next */
  if (!isRecord(parsed)) throw new KiError('agent configuration must use schema 1', 1)
  const configuration = parsed as { schema?: unknown; agents?: unknown; skills?: unknown; local?: unknown }
  const agentSection = isRecord(configuration.agents) ? (configuration.agents as StringListSection) : undefined
  const localSection = configuration.local === undefined ? undefined : isRecord(configuration.local) ? (configuration.local as LocalSection) : null
  if (
    configuration.schema !== 1 ||
    !agentSection ||
    !Array.isArray(agentSection.ids) ||
    agentSection.ids.some((agent) => typeof agent !== 'string') ||
    (localSection !== undefined && (localSection === null || typeof localSection.path !== 'string' || !localSection.path))
  ) {
    throw new KiError('ki configuration must declare an agents.ids string array and an optional local.path', 1)
  }
  const agents = agentSection.ids as string[]
  if (new Set(agents).size !== agents.length) throw new KiError('agent configuration repeats an agent', 1)
  return agents.map((id) => {
    const known = descriptor(id)
    return { descriptor: known, home: resolve(homeDirectory, known.paths.home) }
  })
}

export const configuredAgents = async (options: {
  readonly homeDirectory: string
  readonly configurationDirectory: string
}): Promise<readonly InstalledAgent[]> => {
  const configured = await readConfiguration(options.configurationDirectory, options.homeDirectory)
  if (!configured) throw new KiError('ki environment is not bootstrapped; run `ki bootstrap` first', 1)
  return configured
}

export const clearLocalBootstrapHarness = async (configurationDirectory: string): Promise<void> => {
  const path = bootstrapConfigurationPath(configurationDirectory)
  const contents = await readFile(path, 'utf8')
  const expression = /(?:^|\n)\[local\]\npath\s*=.*(?:\n|$)/m
  await writeFile(path, contents.replace(expression, ''), 'utf8')
}

export const setLocalBootstrapHarness = async (configurationDirectory: string, homeDirectory: string, local: string): Promise<void> => {
  const agents = await configuredAgents({ homeDirectory, configurationDirectory })
  const inspection = await inspectUserConfiguration(configurationDirectory)
  await writeFile(
    bootstrapConfigurationPath(configurationDirectory),
    renderConfiguration(agents, inspection.harnesses, inspection.skills, local, inspection.repositories),
    'utf8'
  )
}

export const setConfiguredUserSkills = async (configurationDirectory: string, homeDirectory: string, skills: readonly string[]): Promise<void> => {
  const agents = await configuredAgents({ homeDirectory, configurationDirectory })
  const inspection = await inspectUserConfiguration(configurationDirectory)
  await writeFile(
    bootstrapConfigurationPath(configurationDirectory),
    renderConfiguration(agents, inspection.harnesses, skills, inspection.local ?? undefined, inspection.repositories),
    'utf8'
  )
}

const renderedRepositorySection = (repositories: readonly string[]): string =>
  ['[repositories]', 'paths = [', ...repositories.map((repository) => `  ${JSON.stringify(repository)},`), ']'].join('\n')

/**
 * Produces the one local-user configuration update that records a physical KI
 * repository. The host owns publication, so native repository operations cannot
 * mutate XDG configuration directly.
 */
export const configuredRepositoryWrite = async (
  configurationDirectory: string,
  repository: string
): Promise<{ readonly path: string; readonly content: string } | undefined> => {
  const inspection = await inspectUserConfiguration(configurationDirectory)
  if (inspection.state === 'missing') throw new KiError('ki environment is not bootstrapped; run `ki bootstrap` first', 1)
  if (inspection.state === 'invalid') throw new KiError(`ki configuration is invalid: ${inspection.errors.join('; ')}`, 1)
  if (inspection.warnings.some((warning) => warning.startsWith('repositories has unrecognised key ')))
    throw new KiError('ki configuration repositories section has unrecognised keys; resolve them before conforming', 1)
  if (inspection.repositories.includes(repository)) return undefined

  const path = bootstrapConfigurationPath(configurationDirectory)
  const contents = await readFile(path, 'utf8')
  const replacement = renderedRepositorySection([...inspection.repositories, repository].sort((left, right) => left.localeCompare(right)))
  const section = /(?:^|\n)\[repositories\]\n[\s\S]*?(?=\n\[[^\n]+\]|$)/
  const content = section.test(contents) ? contents.replace(section, `\n${replacement}`) : `${contents.trimEnd()}\n\n${replacement}\n`
  return { path: 'config.toml', content }
}
