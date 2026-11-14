import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { parse, stringify } from 'smol-toml'
import { backpackIdentifier } from '../core/backpack/index.ts'
import {
  addTomlTable,
  declaredRepositoryIdentity,
  REPOSITORY_DECLARATION_FILE,
  readRepositoryDeclaration,
  removeTomlTable,
  renameTomlTable,
  setTomlString,
  setTomlStringArray
} from '../core/configuration/index.ts'
import { KiError } from '../core/errors.ts'
import type { Runner } from '../core/runtime/runner.ts'
import { canonicalRepositoryIdentity, registryEntry, renderLocalRegistry } from '../core/storage/index.ts'
import {
  agentDescriptors,
  type BackpackSection,
  bootstrapConfigurationPath,
  descriptor,
  type InstalledAgent,
  inspectLocalsTable,
  isRecord,
  type RepositoriesSection,
  type StringListSection,
  type UserConfigurationInspection
} from './internal.ts'

/** Top-level keys the bootstrap writer renders; every other table belongs to another reader. */
const OWNED_KEYS = ['schema', 'agents', 'backpacks', 'harnesses', 'skills', 'repositories']
/** Top-level tables other `ki` readers own, such as the territory ranking and the MCP inventory. */
const DELEGATED_KEYS = ['territories', 'mcp']
/** Host-local tables kept verbatim and read only as one-time migration input to the state directory. */
const MIGRATION_KEYS = ['locals']

/** The file's parsed tables; an unparseable file has nothing to keep. */
const parsedConfiguration = (contents: string): Record<string, unknown> => {
  try {
    return parse(contents)
  } catch {
    return {}
  }
}

/** The tables the bootstrap writer does not own, kept so a rewrite never drops a setting another reader validates. */
const preservedTables = (current: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(current).filter(([key]) => !OWNED_KEYS.includes(key)))

/**
 * The `backpacks.releases` entries as written, so a rewrite keeps every release location, digest
 * and authentication setting the backpack registry reads, neither dropping nor repairing them.
 */
const preservedReleases = (current: Record<string, unknown>): readonly unknown[] => {
  const backpacks = current['backpacks'] ?? current['harnesses']
  return isRecord(backpacks) && Array.isArray(backpacks['releases']) ? backpacks['releases'] : []
}

/** Release entries as `[[backpacks.releases]]` tables, or inline when a malformed entry is no table. */
const releaseLines = (releases: readonly unknown[]): string[] =>
  !releases.length
    ? []
    : releases.every(isRecord)
      ? ['', stringify({ backpacks: { releases } }).trimEnd()]
      : [stringify({ releases }).trimEnd()]

/**
 * The owned sections with no values, ahead of every table the bootstrap writer does not own; the
 * owned values are then filled in by the same edits that update an existing file.
 */
const renderSkeleton = (preserved: Record<string, unknown>, releases: readonly unknown[]): string =>
  [
    '[agents]',
    'ids = [',
    ']',
    '',
    '[backpacks]',
    'ids = [',
    ']',
    ...releaseLines(releases),
    '',
    '[skills]',
    ...(Object.keys(preserved).length ? ['', stringify(preserved).trimEnd()] : []),
    ''
  ].join('\n')

/** The values the bootstrap writer owns, each list compared as the set it represents. */
interface OwnedValues {
  readonly agents: readonly string[]
  readonly backpacks: readonly string[]
  readonly skills: readonly string[]
  readonly repositories: readonly string[]
}

const sameSet = (current: unknown, desired: readonly string[]): boolean =>
  Array.isArray(current) && current.length === desired.length && desired.every((value) => current.includes(value))

const table = (configuration: Record<string, unknown>, key: string): Record<string, unknown> => {
  const value = configuration[key]
  return isRecord(value) ? value : {}
}

const skillBackpacks = (skills: readonly string[]): ReadonlyMap<string, string> =>
  new Map(
    skills.map((skill) => {
      const separator = skill.lastIndexOf(':')
      return [skill.slice(separator + 1), skill.slice(0, separator)] as const
    })
  )

/** A table without `key`, absent once nothing else is left in it. */
const without = (value: unknown, key: string): unknown => {
  if (!isRecord(value)) return value
  const rest = Object.fromEntries(Object.entries(value).filter(([name]) => name !== key))
  return Object.keys(rest).length ? rest : undefined
}

/** A parsed configuration with every owned value masked, to prove an edit touched nothing else. */
const unowned = (configuration: Record<string, unknown>): Record<string, unknown> => ({
  ...configuration,
  agents: without(configuration['agents'], 'ids'),
  backpacks: without(configuration['backpacks'], 'ids'),
  skills: undefined,
  repositories: without(configuration['repositories'], 'paths')
})

/** Whether a configuration still spells `[backpacks]` as the retired `[harnesses]` table, and only that way. */
const retiredBackpacksTable = (configuration: Record<string, unknown>): boolean =>
  configuration['harnesses'] !== undefined && configuration['backpacks'] === undefined

/** A configuration read with its retired `[harnesses]` table as `[backpacks]`. */
const withBackpacksTable = (configuration: Record<string, unknown>): Record<string, unknown> => {
  if (!retiredBackpacksTable(configuration)) return configuration
  const { harnesses, ...rest } = configuration
  return { ...rest, backpacks: harnesses }
}

/** Whether a skill table holds only its backpack, under the current key rather than the retired `harness` key. */
const declaresBackpack = (skill: unknown, backpack: string): boolean =>
  isRecord(skill) && skill['backpack'] === backpack && Object.keys(skill).length === 1

/** Whether a parsed configuration already holds every owned value, so nothing needs writing. */
const holds = (configuration: Record<string, unknown>, desired: OwnedValues): boolean => {
  const skills = table(configuration, 'skills')
  const wanted = skillBackpacks(desired.skills)
  const repositories = table(configuration, 'repositories')['paths']
  return (
    sameSet(table(configuration, 'agents')['ids'], desired.agents) &&
    sameSet(table(configuration, 'backpacks')['ids'], desired.backpacks) &&
    isRecord(configuration['skills']) &&
    Object.keys(skills).length === wanted.size &&
    [...wanted].every(([name, backpack]) => declaresBackpack(skills[name], backpack)) &&
    (desired.repositories.length ? sameSet(repositories, desired.repositories) : repositories === undefined)
  )
}

/**
 * Edits only the owned statements whose values differ, leaving every other line, comment and
 * array layout as written. Undefined when the file does not parse, or when its layout defeats a
 * text edit (an owned value spelt as an inline table or dotted key), so the caller renders afresh.
 */
const editConfiguration = (before: string, desired: OwnedValues): string | undefined => {
  let current: Record<string, unknown>
  try {
    current = parse(before)
  } catch {
    return undefined
  }
  // A retired `[harnesses]` table that already holds every value is left for its owner to rename;
  // any other write renames it first, so ki writes only `[backpacks]`.
  if (holds(withBackpacksTable(current), desired)) return before
  let text = before
  if (retiredBackpacksTable(current)) {
    text = renameTomlTable(text, 'harnesses', 'backpacks')
    current = parsedConfiguration(text)
  }
  if (!sameSet(table(current, 'agents')['ids'], desired.agents))
    text = setTomlStringArray(text, ['agents'], 'ids', desired.agents)
  if (!sameSet(table(current, 'backpacks')['ids'], desired.backpacks))
    text = setTomlStringArray(text, ['backpacks'], 'ids', desired.backpacks)
  const skills = table(current, 'skills')
  const wanted = skillBackpacks(desired.skills)
  for (const name of Object.keys(skills)) if (!wanted.has(name)) text = removeTomlTable(text, ['skills', name])
  for (const [name, backpack] of wanted) {
    const skill = skills[name]
    if (declaresBackpack(skill, backpack)) continue
    // A table still spelt with the retired `harness` key is laid out afresh under `backpack`.
    if (isRecord(skill) && skill['harness'] !== undefined) text = removeTomlTable(text, ['skills', name])
    text = setTomlString(text, ['skills', name], 'backpack', backpack)
  }
  if (!isRecord(current['skills']) && !wanted.size) text = addTomlTable(text, ['skills'])
  const repositories = table(current, 'repositories')['paths']
  if (!desired.repositories.length) text = removeTomlTable(text, ['repositories'])
  else if (!sameSet(repositories, desired.repositories))
    text = setTomlStringArray(text, ['repositories'], 'paths', desired.repositories)
  const after = parsedConfiguration(text)
  return isDeepStrictEqual(unowned(after), unowned(current)) && holds(after, desired) ? text : undefined
}

/**
 * Brings the user configuration's owned values up to date, writing only when one changes and then
 * editing in place, so a file another tool manages stays byte-identical when nothing in it changes.
 * A missing file, or one a text edit cannot safely change, is laid out afresh keeping every table
 * the bootstrap writer does not own.
 */
export const writeUserConfiguration = async (
  configurationDirectory: string,
  agents: readonly InstalledAgent[],
  backpacks: readonly string[],
  skills: readonly string[],
  repositories: readonly string[]
): Promise<void> => {
  const path = bootstrapConfigurationPath(configurationDirectory)
  const before = await readFile(path, 'utf8').catch(() => undefined)
  const desired = { agents: agents.map((agent) => agent.descriptor.id), backpacks, skills, repositories }
  const current = parsedConfiguration(before ?? '')
  const next =
    (before !== undefined && editConfiguration(before, desired)) ||
    // A skeleton is laid out for these edits, so filling it in always succeeds.
    (editConfiguration(renderSkeleton(preservedTables(current), preservedReleases(current)), desired) as string)
  if (next !== before) await writeFile(path, next, 'utf8')
}

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
      backpacks: [],
      skills: [],
      legacyLocals: [],
      repositories: [],
      warnings: [],
      errors: []
    }
  if (!state.isFile() || state.isSymbolicLink()) {
    return {
      path,
      state: 'invalid',
      agents: [],
      backpacks: [],
      skills: [],
      legacyLocals: [],
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
      backpacks: [],
      skills: [],
      legacyLocals: [],
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
      backpacks: [],
      skills: [],
      legacyLocals: [],
      repositories: [],
      warnings: [],
      errors: ['configuration must be a TOML table']
    }
  }

  const configuration = parsed as Record<string, unknown> & {
    schema?: unknown
    agents?: unknown
    backpacks?: unknown
    harnesses?: unknown
    skills?: unknown
    locals?: unknown
    repositories?: unknown
  }
  const warnings = Object.keys(configuration)
    .filter((key) => ![...OWNED_KEYS, ...DELEGATED_KEYS, ...MIGRATION_KEYS].includes(key))
    .map((key) => `unrecognised key ${key}`)
  const errors: string[] = []
  if (configuration.schema !== undefined && configuration.schema !== 1) errors.push('schema must equal 1 when present')
  if (configuration.schema === 1) warnings.push('legacy schema = 1; preview its removal with ki repair --dry-run')
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
    const { backpack, harness } = value as { backpack?: unknown; harness?: unknown }
    if (harness !== undefined) {
      if (backpack !== undefined)
        errors.push(`skills.${name} must declare backpack only; remove its retired harness key`)
      else warnings.push(`skills.${name} uses the retired key harness; rename it to backpack`)
    }
    const provider = backpack ?? harness
    if (typeof provider !== 'string' || !provider) {
      errors.push(`skills.${name} must declare a backpack string`)
      continue
    }
    skills.push(`${backpackIdentifier(provider)}:${name}`)
  }
  if (configuration.harnesses !== undefined) {
    if (configuration.backpacks !== undefined)
      errors.push('configuration must declare [backpacks] only; remove its retired [harnesses] table')
    else warnings.push('configuration uses the retired [harnesses] table; rename it to [backpacks]')
  }
  const backpackSection = inspectSection(
    configuration.backpacks ?? configuration.harnesses,
    'backpacks',
    errors
  ) as BackpackSection
  for (const key of Object.keys(backpackSection)) {
    if (key !== 'ids' && key !== 'releases') warnings.push(`backpacks has unrecognised key ${key}`)
  }
  const backpacks: string[] = []
  if (backpackSection.ids !== undefined)
    backpacks.push(...inspectStringList(backpackSection.ids, 'backpacks.ids', errors).map(backpackIdentifier))
  else if (!Array.isArray(backpackSection.releases)) errors.push('backpacks must declare an ids array')
  else {
    for (const [index, backpack] of backpackSection.releases.entries()) {
      if (!isRecord(backpack)) {
        errors.push(`backpacks[${index}] must be a table`)
        continue
      }
      for (const key of Object.keys(backpack)) {
        if (!['id', 'url', 'sha256', 'auth'].includes(key))
          warnings.push(`backpacks[${index}] has unrecognised key ${key}`)
      }
      const release = backpack as Record<string, unknown> & { id?: unknown; url?: unknown; sha256?: unknown }
      const id = release.id
      const url = release.url
      const digest = release.sha256
      if (typeof id !== 'string' || !id) errors.push(`backpacks[${index}] id must be a non-empty string`)
      else backpacks.push(backpackIdentifier(id))
      if (typeof url !== 'string' || !url.startsWith('https://'))
        errors.push(`backpacks[${index}] url must be an HTTPS URL`)
      if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest))
        errors.push(`backpacks[${index}] sha256 must be lowercase SHA-256`)
    }
  }
  const legacyLocals = inspectLocalsTable(configuration.locals, errors, warnings)
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
    backpacks,
    skills,
    legacyLocals,
    repositories,
    warnings,
    errors,
    legacySchema: configuration.schema === 1
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
  if (!isRecord(parsed)) throw new KiError('agent configuration must be a TOML table', 1)
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
    (configuration.schema !== undefined && configuration.schema !== 1) ||
    !agentSection ||
    !Array.isArray(agentSection.ids) ||
    agentSection.ids.some((agent) => typeof agent !== 'string') ||
    !validLocals
  ) {
    throw new KiError(
      'ki configuration must declare an agents.ids string array and optional locals.<backpack-id>.path strings',
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

export const repairLegacyUserConfiguration = async (
  configurationDirectory: string,
  dryRun: boolean
): Promise<string> => {
  // The repair coordinator calls this only after a valid legacy inspection.
  const inspection = await inspectUserConfiguration(configurationDirectory)
  const before = await readFile(inspection.path, 'utf8')
  const firstTable = before.search(/^[ \t]*\[/m)
  const header = before.slice(0, firstTable)
  const marker = /^[ \t]*(?:schema|"schema"|'schema')[ \t]*=[ \t]*1[ \t]*(?:#[^\r\n]*)?(?:\r?\n|$)/m
  if (!marker.test(header))
    throw new KiError('legacy schema marker is not a simple top-level schema = 1 line; repair it manually', 1)
  const after = header.replace(marker, '') + before.slice(header.length)
  if (!dryRun) await writeFile(inspection.path, after, 'utf8')
  return inspection.path
}

export const configuredAgents = async (options: {
  readonly homeDirectory: string
  readonly configurationDirectory: string
}): Promise<readonly InstalledAgent[]> => {
  const configured = await readConfiguration(options.configurationDirectory, options.homeDirectory)
  if (!configured) throw new KiError('ki environment is not bootstrapped; run `ki bootstrap` first', 1)
  return configured
}

export const setConfiguredUserSkills = async (
  configurationDirectory: string,
  homeDirectory: string,
  skills: readonly string[]
): Promise<void> => {
  const agents = await configuredAgents({ homeDirectory, configurationDirectory })
  const inspection = await inspectUserConfiguration(configurationDirectory)
  await writeUserConfiguration(configurationDirectory, agents, inspection.backpacks, skills, inspection.repositories)
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
