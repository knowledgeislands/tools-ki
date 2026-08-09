import { readFile, writeFile } from 'node:fs/promises'
import { parse } from 'smol-toml'
import { KiError } from './errors.ts'
import { type SupportedRuntime, supportedRuntimes } from './harness.ts'
import { canonicalRepositoryIdentity } from './local-registry.ts'

export const REPOSITORY_CONFIGURATION_FILE = '.ki-config.toml'
export const DEFAULT_HARNESS = 'knowledgeislands/ki-agentic-harness'

export interface DeclaredSkill {
  /** The skill's key under `[skills]`: its bare name, or `<harness-id>:<name>` for an out-of-list provider. */
  readonly key: string
  readonly name: string
  /** Set only by the quoted out-of-list exception; otherwise the provider is resolved from the declared harnesses. */
  readonly harness?: string
  readonly configuration: Readonly<Record<string, unknown>>
}

export interface RepositoryDeclaration {
  readonly harnesses: readonly string[]
  readonly skills: readonly DeclaredSkill[]
}

export interface RepositoryInitialisation {
  readonly title: string
  readonly description: string
  readonly repoCode: string
  readonly supportedRuntimes: readonly string[]
  readonly visibility: string
  readonly repository: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const initialisationField = (value: string | undefined, name: string): string => {
  if (!value?.trim()) throw new KiError(`ki repo init requires --${name}`, 2)
  return value
}

export const renderRepositoryConfiguration = (initialisation: RepositoryInitialisation): string => {
  const title = initialisationField(initialisation.title, 'title')
  const description = initialisationField(initialisation.description, 'description')
  const repoCode = initialisationField(initialisation.repoCode, 'repo-code')
  const visibility = initialisationField(initialisation.visibility, 'visibility')
  const repository = initialisationField(initialisation.repository, 'repository')
  if (!/^[A-Z][A-Z0-9-]{1,23}$/.test(repoCode))
    throw new KiError('ki repo init --repo-code must be a stable uppercase identifier', 2)
  if (!initialisation.supportedRuntimes.length) throw new KiError('ki repo init requires at least one --runtime', 2)
  if (initialisation.supportedRuntimes.includes('codex'))
    throw new KiError('ki repo init --runtime codex is retired; use chatgpt-codex', 2)
  if (initialisation.supportedRuntimes.some((runtime) => !supportedRuntimes.includes(runtime as SupportedRuntime)))
    throw new KiError('ki repo init --runtime may contain only claude-code or chatgpt-codex', 2)
  if (new Set(initialisation.supportedRuntimes).size !== initialisation.supportedRuntimes.length)
    throw new KiError('ki repo init --runtime must not repeat a runtime', 2)
  if (visibility !== 'public' && visibility !== 'private')
    throw new KiError('ki repo init --visibility must be public or private', 2)
  if (!canonicalRepositoryIdentity(repository))
    throw new KiError('ki repo init --repository must be a canonical HTTPS GitHub repository', 2)
  return [
    '[repo]',
    `harnesses = [${JSON.stringify(DEFAULT_HARNESS)}]`,
    '',
    '[skills.ki-repo]',
    `repository = ${JSON.stringify(repository)}`,
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

const qualifiedSkill = (key: string): { readonly harness: string; readonly name: string } | undefined => {
  const separator = key.indexOf(':')
  if (separator === -1 || key.indexOf(':', separator + 1) !== -1) return undefined
  const harness = key.slice(0, separator)
  const name = key.slice(separator + 1)
  return harnessIdentifier.test(harness) && skillName.test(name) ? { harness, name } : undefined
}

const shapeError = (detail: string): KiError => new KiError(`.ki-config.toml ${detail}`, 1)

const declaredHarnesses = (parsed: Record<string, unknown>): readonly string[] => {
  const repository = parsed['repo']
  if (!isRecord(repository) || !Array.isArray(repository['harnesses']))
    throw shapeError('must declare [repo] with a harnesses array')
  const harnesses = repository['harnesses']
  if (!harnesses.length || harnesses.some((harness) => typeof harness !== 'string' || !harnessIdentifier.test(harness)))
    throw shapeError('[repo] harnesses must be a non-empty array of <owner>/<name> harness identifiers')
  const identifiers = harnesses as string[]
  if (new Set(identifiers).size !== identifiers.length) throw shapeError('[repo] harnesses must not repeat a harness')
  return identifiers
}

const declaredSkills = (parsed: Record<string, unknown>): readonly DeclaredSkill[] => {
  const skills = parsed['skills']
  if (skills === undefined) return []
  if (!isRecord(skills)) throw shapeError('[skills] must be a table')
  const declared = Object.entries(skills).map(([key, configuration]) => {
    if (!isRecord(configuration)) throw new KiError(`declared skill ${key} must use a TOML table`, 1)
    if (skillName.test(key)) return { key, name: key, configuration }
    const qualified = qualifiedSkill(key)
    if (!qualified)
      throw new KiError(
        `declared skill ${key} must be [skills.<skill-name>], or [skills."<harness-id>:<skill-name>"] for a harness outside [repo] harnesses`,
        1
      )
    return { key, ...qualified, configuration }
  })
  const names = new Set<string>()
  for (const declaration of declared) {
    if (names.has(declaration.name))
      throw new KiError(`declared skill ${declaration.name} is repeated by multiple providers`, 1)
    names.add(declaration.name)
  }
  return declared
}

export const readRepositoryDeclaration = async (configurationPath: string): Promise<RepositoryDeclaration> => {
  let parsed: unknown
  try {
    parsed = parse(await readFile(configurationPath, 'utf8'))
  } catch {
    throw shapeError('must be valid TOML')
  }
  // A successfully parsed TOML document is always a table; this only guards a future parser change.
  /* v8 ignore next */
  if (!isRecord(parsed)) throw shapeError('must be a table')
  return { harnesses: declaredHarnesses(parsed), skills: declaredSkills(parsed) }
}

export const declaredRepositoryIdentity = (declaration: RepositoryDeclaration): string => {
  const identity = declaration.skills.find((skill) => skill.name === 'ki-repo')?.configuration['repository']
  if (!canonicalRepositoryIdentity(identity))
    throw new KiError('[skills.ki-repo].repository must be a canonical HTTPS GitHub repository', 1)
  return identity
}

// Declare a skill in a repository's .ki-config.toml by appending its [skills.<name>] table. A
// provider outside the declared harness list keeps its quoted qualified key, so it stays visible.
// Text-appended (not re-serialised) to preserve the file's comments and formatting.
export const declareRepositorySkill = async (
  configurationPath: string,
  harness: string,
  name: string
): Promise<boolean> => {
  const declaration = await readRepositoryDeclaration(configurationPath)
  if (declaration.skills.some((skill) => skill.name === name)) return false
  const key = declaration.harnesses.includes(harness) ? name : JSON.stringify(`${harness}:${name}`)
  const contents = await readFile(configurationPath, 'utf8')
  const base = contents.endsWith('\n') ? contents : `${contents}\n`
  await writeFile(configurationPath, `${base}\n[skills.${key}]\n`, 'utf8')
  return true
}

/**
 * The dotted key path of a TOML table header, or undefined where the line is not one. The
 * declarations this tool writes are always bare or basic-string keys, but TOML also spells the same
 * key as a literal string and permits whitespace inside the brackets, and a hand-edited file is
 * entitled to either. Matching the rendered line instead of the key made the parser and this editor
 * disagree about the same file.
 */
const headerPath = (line: string): readonly string[] | undefined => {
  const header = line.trim()
  if (!header.startsWith('[') || !header.endsWith(']')) return undefined
  let table: unknown
  try {
    // The grammar's own parser decides what the keys are, so quoting style and escape
    // sequences cannot be read one way here and another way by readRepositoryDeclaration.
    table = parse(header)
  } catch {
    return undefined
  }
  const path: string[] = []
  while (isRecord(table)) {
    const [key] = Object.keys(table)
    if (key === undefined) break
    path.push(key)
    table = table[key]
  }
  return path
}

const isDeclaredHeader = (line: string, key: string): boolean => {
  const path = headerPath(line)
  return path?.[0] === 'skills' && path[1] === key
}

// Remove a skill's [skills.<key>] root and nested tables, preserving unrelated text and tables.
export const undeclareRepositorySkill = async (configurationPath: string, key: string): Promise<boolean> => {
  const lines = (await readFile(configurationPath, 'utf8')).split('\n')
  let removed = false
  for (
    let start = lines.findIndex((line) => isDeclaredHeader(line, key));
    start !== -1;
    start = lines.findIndex((line) => isDeclaredHeader(line, key))
  ) {
    let end = start + 1
    while (end < lines.length && !(lines[end] as string).trimStart().startsWith('[')) end += 1
    const from = start > 0 && lines[start - 1]?.trim() === '' ? start - 1 : start
    lines.splice(from, end - from)
    removed = true
  }
  if (!removed) return false
  await writeFile(configurationPath, lines.join('\n'), 'utf8')
  return true
}
