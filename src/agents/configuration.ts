import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { parse } from 'smol-toml'
import {
  declaredRepositoryIdentity,
  REPOSITORY_DECLARATION_FILE,
  readRepositoryDeclaration
} from '../core/configuration/index.ts'
import { KiError } from '../core/errors.ts'
import type { Runner } from '../core/runtime/runner.ts'
import { canonicalRepositoryIdentity, registryEntry, renderLocalRegistry } from '../core/storage/index.ts'
import {
  agentDescriptors,
  bootstrapConfigurationPath,
  descriptor,
  type HarnessSection,
  type InstalledAgent,
  isRecord,
  type LocalDevelopmentConfiguration,
  type LocalSourceSection,
  type RepositoriesSection,
  type StringListSection,
  type UserConfigurationInspection
} from './internal.ts'

export const renderConfiguration = (
  agents: readonly InstalledAgent[],
  harnesses: readonly string[] = [],
  skills: readonly string[] = [],
  locals: readonly LocalDevelopmentConfiguration[] = [],
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
    ...locals
      .toSorted((left, right) => left.harness.localeCompare(right.harness))
      .flatMap((local) => ['', `[locals.${JSON.stringify(local.harness)}]`, `path = ${JSON.stringify(local.path)}`]),
    ...(repositories.length
      ? [
          '',
          '[repositories]',
          'paths = [',
          ...repositories.map((repository) => `  ${JSON.stringify(repository)},`),
          ']'
        ]
      : []),
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

export const inspectUserConfiguration = async (
  configurationDirectory: string
): Promise<UserConfigurationInspection> => {
  const path = bootstrapConfigurationPath(configurationDirectory)
  const state = await lstat(path).catch(() => undefined)
  if (!state)
    return {
      path,
      state: 'missing',
      agents: [],
      harnesses: [],
      skills: [],
      locals: [],
      repositories: [],
      warnings: [],
      errors: []
    }
  if (!state.isFile() || state.isSymbolicLink()) {
    return {
      path,
      state: 'invalid',
      agents: [],
      harnesses: [],
      skills: [],
      locals: [],
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
      locals: [],
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
      locals: [],
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
    locals?: unknown
    repositories?: unknown
  }
  const warnings = Object.keys(configuration)
    .filter((key) => !['schema', 'agents', 'harnesses', 'skills', 'locals', 'repositories'].includes(key))
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
  if (harnessSection.ids !== undefined)
    harnesses.push(...inspectStringList(harnessSection.ids, 'harnesses.ids', errors))
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
      if (typeof url !== 'string' || !url.startsWith('https://'))
        errors.push(`harnesses[${index}] url must be an HTTPS URL`)
      if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest))
        errors.push(`harnesses[${index}] sha256 must be lowercase SHA-256`)
    }
  }
  const localsSection = configuration.locals === undefined ? {} : inspectSection(configuration.locals, 'locals', errors)
  const locals: LocalDevelopmentConfiguration[] = []
  for (const [harness, value] of Object.entries(localsSection)) {
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(harness)) {
      errors.push(`locals.${harness} must name a harness owner/name identifier`)
      continue
    }
    const source = inspectSection(value, `locals.${harness}`, errors) as LocalSourceSection
    for (const key of Object.keys(source)) {
      if (key !== 'path') warnings.push(`locals.${harness} has unrecognised key ${key}`)
    }
    if (typeof source.path !== 'string' || !source.path) {
      errors.push(`locals.${harness}.path must be a non-empty string`)
      continue
    }
    locals.push({ harness, path: source.path })
  }
  const repositoriesSection =
    configuration.repositories === undefined
      ? undefined
      : (inspectSection(configuration.repositories, 'repositories', errors) as RepositoriesSection)
  if (repositoriesSection) {
    for (const key of Object.keys(repositoriesSection)) {
      if (key !== 'paths') warnings.push(`repositories has unrecognised key ${key}`)
    }
  }
  const repositories =
    repositoriesSection === undefined ? [] : inspectStringList(repositoriesSection.paths, 'repositories.paths', errors)
  if (repositories.some((repository) => !isAbsolute(repository)))
    errors.push('repositories.paths must contain absolute paths')
  return {
    path,
    state: errors.length ? 'invalid' : 'valid',
    agents,
    harnesses,
    skills,
    locals: locals.toSorted((left, right) => left.harness.localeCompare(right.harness)),
    repositories,
    warnings,
    errors
  }
}

export const readConfiguration = async (
  configurationDirectory: string,
  homeDirectory: string
): Promise<readonly InstalledAgent[] | undefined> => {
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
  const configuration = parsed as { schema?: unknown; agents?: unknown; skills?: unknown; locals?: unknown }
  const agentSection = isRecord(configuration.agents) ? (configuration.agents as StringListSection) : undefined
  const localsSection =
    configuration.locals === undefined ? {} : isRecord(configuration.locals) ? configuration.locals : null
  const validLocals =
    localsSection !== null &&
    Object.values(localsSection).every(
      (source) => isRecord(source) && typeof source['path'] === 'string' && Boolean(source['path'])
    )
  if (
    configuration.schema !== 1 ||
    !agentSection ||
    !Array.isArray(agentSection.ids) ||
    agentSection.ids.some((agent) => typeof agent !== 'string') ||
    !validLocals
  ) {
    throw new KiError(
      'ki configuration must declare an agents.ids string array and optional locals.<harness-id>.path strings',
      1
    )
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

export const setLocalBootstrapHarness = async (
  configurationDirectory: string,
  homeDirectory: string,
  local: LocalDevelopmentConfiguration
): Promise<void> => {
  const agents = await configuredAgents({ homeDirectory, configurationDirectory })
  const inspection = await inspectUserConfiguration(configurationDirectory)
  const locals = [...inspection.locals.filter((candidate) => candidate.harness !== local.harness), local]
  await writeFile(
    bootstrapConfigurationPath(configurationDirectory),
    renderConfiguration(agents, inspection.harnesses, inspection.skills, locals, inspection.repositories),
    'utf8'
  )
}

export const setConfiguredUserSkills = async (
  configurationDirectory: string,
  homeDirectory: string,
  skills: readonly string[]
): Promise<void> => {
  const agents = await configuredAgents({ homeDirectory, configurationDirectory })
  const inspection = await inspectUserConfiguration(configurationDirectory)
  await writeFile(
    bootstrapConfigurationPath(configurationDirectory),
    renderConfiguration(agents, inspection.harnesses, skills, inspection.locals, inspection.repositories),
    'utf8'
  )
}

/**
 * Imports the retired user-configuration path list exactly when a user asks
 * `ki bootstrap --refresh`. Resolution never reads this legacy field.
 */
export const migrateLegacyRepositoryRegistry = async (
  configurationDirectory: string,
  stateDirectory: string,
  runner: Runner,
  environment: NodeJS.ProcessEnv
): Promise<number> => {
  const inspection = await inspectUserConfiguration(configurationDirectory)
  if (inspection.state !== 'valid' || !inspection.repositories.length) return 0
  const entries = await Promise.all(
    inspection.repositories.map(async (root) => {
      try {
        return registryEntry(
          root,
          declaredRepositoryIdentity(await readRepositoryDeclaration(join(root, REPOSITORY_DECLARATION_FILE)))
        )
      } catch {
        const remote = await runner('git', ['-C', root, 'remote', 'get-url', 'origin'], environment)
        const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+)\/([^/]+?)(?:\.git)?\s*$/.exec(remote.output)
        const identity = match && `https://github.com/${match[1]}/${match[2]}`
        if (remote.exitCode !== 0 || !canonicalRepositoryIdentity(identity))
          throw new KiError(`legacy repository ${root} has no canonical GitHub identity`, 1)
        return registryEntry(root, identity)
      }
    })
  )
  await mkdir(stateDirectory, { recursive: true })
  await writeFile(join(stateDirectory, 'registry.toml'), renderLocalRegistry(entries), { encoding: 'utf8' })
  return entries.length
}
