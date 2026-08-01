import { readFile, writeFile } from 'node:fs/promises'
import { parse } from 'smol-toml'
import { KiError } from './errors.ts'
import { type SupportedRuntime, supportedRuntimes } from './harness.ts'

export const REPOSITORY_CONFIGURATION_FILE = '.ki-config.toml'
export const REPOSITORY_SKILL_IDENTITY = 'knowledgeislands/ki-agentic-harness:ki-repo'

export interface DeclaredSkill {
  readonly identity: string
  readonly harness: string
  readonly name: string
  readonly configuration: Readonly<Record<string, unknown>>
}

export interface RepositoryMetadata {
  readonly title: string
  readonly description: string
  readonly repoCode: string
}

export interface RepositoryInitialisation {
  readonly title: string
  readonly description: string
  readonly repoCode: string
  readonly supportedRuntimes: readonly string[]
  readonly visibility: string
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const metadataField = (configurationPath: string, metadata: Record<string, unknown>, name: string): string => {
  const value = metadata[name]
  if (typeof value !== 'string' || !value) throw new KiError(`${configurationPath} [ki-repo].${name} must be a non-empty string`, 2)
  return value
}

export const readRepositoryMetadata = async (configurationPath: string): Promise<RepositoryMetadata> => {
  let parsed: unknown
  try {
    parsed = parse(await readFile(configurationPath, 'utf8'))
  } catch {
    throw new KiError(`${configurationPath} must be valid TOML`, 2)
  }
  /* v8 ignore next -- a TOML document always parses to a table. */
  if (!isRecord(parsed)) throw new KiError(`${configurationPath} must be a table`, 2)
  const metadata = parsed[REPOSITORY_SKILL_IDENTITY]
  if (!isRecord(metadata)) throw new KiError(`${configurationPath} must declare [ki-repo] metadata`, 2)
  return {
    title: metadataField(configurationPath, metadata, 'title'),
    description: metadataField(configurationPath, metadata, 'description'),
    repoCode: metadataField(configurationPath, metadata, 'repo_code')
  }
}

const initialisationField = (value: string | undefined, name: string): string => {
  if (!value?.trim()) throw new KiError(`ki repo init requires --${name}`, 2)
  return value
}

export const renderRepositoryConfiguration = (initialisation: RepositoryInitialisation): string => {
  const title = initialisationField(initialisation.title, 'title')
  const description = initialisationField(initialisation.description, 'description')
  const repoCode = initialisationField(initialisation.repoCode, 'repo-code')
  const visibility = initialisationField(initialisation.visibility, 'visibility')
  if (!/^[A-Z][A-Z0-9-]{1,23}$/.test(repoCode)) throw new KiError('ki repo init --repo-code must be a stable uppercase identifier', 2)
  if (!initialisation.supportedRuntimes.length) throw new KiError('ki repo init requires at least one --runtime', 2)
  if (initialisation.supportedRuntimes.includes('codex')) throw new KiError('ki repo init --runtime codex is retired; use chatgpt-codex', 2)
  if (initialisation.supportedRuntimes.some((runtime) => !supportedRuntimes.includes(runtime as SupportedRuntime)))
    throw new KiError('ki repo init --runtime may contain only claude-code or chatgpt-codex', 2)
  if (new Set(initialisation.supportedRuntimes).size !== initialisation.supportedRuntimes.length)
    throw new KiError('ki repo init --runtime must not repeat a runtime', 2)
  if (visibility !== 'public' && visibility !== 'private') throw new KiError('ki repo init --visibility must be public or private', 2)
  return [
    `[${JSON.stringify(REPOSITORY_SKILL_IDENTITY)}]`,
    `title = ${JSON.stringify(title)}`,
    `description = ${JSON.stringify(description)}`,
    `repo_code = ${JSON.stringify(repoCode)}`,
    `supported_runtimes = [${initialisation.supportedRuntimes.map((runtime) => JSON.stringify(runtime)).join(', ')}]`,
    `visibility = ${JSON.stringify(visibility)}`,
    ''
  ].join('\n')
}

const harnessIdentifier = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const skillName = /^ki-[a-z0-9][a-z0-9-]*$/

const qualifiedSkill = (identity: string): { readonly harness: string; readonly name: string } | undefined => {
  const separator = identity.indexOf(':')
  if (separator === -1 || identity.indexOf(':', separator + 1) !== -1) return undefined
  const harness = identity.slice(0, separator)
  const name = identity.slice(separator + 1)
  return harnessIdentifier.test(harness) && skillName.test(name) ? { harness, name } : undefined
}

const looksLikeSkill = (name: string): boolean => name.startsWith('ki-') || name.includes(':')

const declarationError = (identity: string): KiError => new KiError(`declared skill ${identity} must use a qualified <harness-id>:<skill-name> TOML table`, 1)

export const readDeclaredSkills = async (configurationPath: string): Promise<readonly DeclaredSkill[]> => {
  let parsed: unknown
  try {
    parsed = parse(await readFile(configurationPath, 'utf8'))
  } catch {
    throw new KiError('.ki-config.toml must be valid TOML', 1)
  }
  // A successfully parsed TOML document is always a table; this only guards a future parser change.
  /* v8 ignore next */
  if (!isRecord(parsed)) throw new KiError('.ki-config.toml must be a table', 1)
  const declared = Object.entries(parsed).flatMap(([identity, configuration]) => {
    if (!looksLikeSkill(identity)) return []
    const qualified = qualifiedSkill(identity)
    if (!qualified) throw declarationError(identity)
    if (!isRecord(configuration)) throw new KiError(`declared skill ${identity} must use a TOML table`, 1)
    return [{ identity, ...qualified, configuration }]
  })
  const names = new Set<string>()
  for (const declaration of declared) {
    if (names.has(declaration.name)) throw new KiError(`declared skill ${declaration.name} is repeated by multiple providers`, 1)
    names.add(declaration.name)
  }
  return declared
}

// Declare a skill in a repository's .ki-config.toml by appending its quoted qualified table.
// Text-appended (not re-serialised) to preserve the file's comments and formatting.
export const declareRepositorySkill = async (configurationPath: string, identity: string): Promise<boolean> => {
  // v8 ignore next -- callers construct this only from a resolved installed harness identity.
  if (!qualifiedSkill(identity)) throw declarationError(identity)
  const contents = await readFile(configurationPath, 'utf8')
  if (contents.split('\n').some((line) => line.trim() === `["${identity}"]`)) return false
  const base = contents.endsWith('\n') ? contents : `${contents}\n`
  await writeFile(configurationPath, `${base}\n["${identity}"]\n`, 'utf8')
  return true
}

const isDeclaredHeader = (line: string, identity: string): boolean => {
  const header = line.trim()
  return header === `["${identity}"]` || header.startsWith(`["${identity}".`)
}

// Remove a skill's quoted root and nested tables, preserving unrelated text and tables.
export const undeclareRepositorySkill = async (configurationPath: string, identity: string): Promise<boolean> => {
  // v8 ignore next -- callers receive this only from a validated repository declaration.
  if (!qualifiedSkill(identity)) throw declarationError(identity)
  const lines = (await readFile(configurationPath, 'utf8')).split('\n')
  let removed = false
  for (
    let start = lines.findIndex((line) => isDeclaredHeader(line, identity));
    start !== -1;
    start = lines.findIndex((line) => isDeclaredHeader(line, identity))
  ) {
    let end = start + 1
    while (end < lines.length && !(lines[end] as string).trimStart().startsWith('[')) end += 1
    const from = start > 0 && lines[start - 1]?.trim() === '' ? start - 1 : start
    lines.splice(from, end - from)
    removed = true
  }
  // v8 ignore next -- repository removal invokes this only after locating the declaration in the same parsed file.
  if (!removed) return false
  await writeFile(configurationPath, lines.join('\n'), 'utf8')
  return true
}
