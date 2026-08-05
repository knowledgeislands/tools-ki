import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { KiError } from './errors.ts'
import { RUBRIC_MODULE_PATH } from './rubric.ts'

const harnessIdentifier = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const harnessComponent = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const payloadRoots = ['skills', 'subagents', 'hooks'] as const

export const canonicalHarnessIdentifier = 'knowledgeislands/ki-agentic-harness'

export const supportedRuntimes = ['claude-code', 'chatgpt-codex'] as const
export type SupportedRuntime = (typeof supportedRuntimes)[number]

export interface HarnessCapability {
  readonly kind: 'skill'
  readonly name: string
  readonly source: string
  readonly dependsOn: readonly string[]
  /** Optional capabilities to load first when they are active in the same scope. */
  readonly optionalDependsOn: readonly string[]
  /** Runtime identifiers this skill supports; absent means portable across supported runtimes. */
  readonly supportedRuntimes?: readonly SupportedRuntime[]
  /** Payload-relative path to the skill's canonical `scripts/rubric/items/index.ts` catalogue, when it provides one. */
  readonly rubricModule?: string
}

export interface InstalledHarness {
  readonly id: string
  readonly root: string
  readonly capabilities: readonly HarnessCapability[]
}

const contained = (root: string, path: string): boolean => {
  const remainder = relative(root, path)
  return remainder === '' || (!remainder.startsWith('..') && remainder !== '..')
}

const physicalDirectory = async (path: string, description: string): Promise<string> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isDirectory() || state.isSymbolicLink()) throw new KiError(`${description} must be a directory`, 1)
  return realpath(path)
}

const frontmatter = (text: string, path: string): Record<string, string> => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (!match?.[1]) throw new KiError(`${path} must declare frontmatter`, 1)
  return Object.fromEntries(
    match[1].split(/\r?\n/).flatMap((line) => {
      const separator = line.indexOf(':')
      return separator > 0 ? [[line.slice(0, separator).trim(), line.slice(separator + 1).trim()]] : []
    })
  )
}

const frontmatterDependencies = (
  value: string | undefined,
  path: string,
  field: 'ki-depends-on' | 'ki-optional-depends-on',
  required: boolean
): readonly string[] => {
  if (value === undefined && !required) return []
  if (!value || !/^\[[^\]]*\]$/.test(value)) throw new KiError(`${path} must declare ${field} as a flow list`, 1)
  const dependencies = value
    .slice(1, -1)
    .split(',')
    .map((dependency) => dependency.trim())
    .filter(Boolean)
  if (new Set(dependencies).size !== dependencies.length) throw new KiError(`${path} repeats a ${required ? '' : 'optional '}dependency`, 1)
  return dependencies
}

const frontmatterSupportedRuntimes = (value: string | undefined, path: string): readonly SupportedRuntime[] | undefined => {
  if (value === undefined) return undefined
  if (!/^\[[^\]]+\]$/.test(value)) {
    throw new KiError(`${path} must declare ki-supported-runtimes as a non-empty flow list`, 1)
  }
  const runtimes = value
    .slice(1, -1)
    .split(',')
    .map((runtime) => runtime.trim())
  if (runtimes.includes('codex')) throw new KiError(`${path} declares retired runtime codex; use chatgpt-codex`, 1)
  if (runtimes.some((runtime) => !runtime || !supportedRuntimes.includes(runtime as SupportedRuntime)))
    throw new KiError(`${path} must declare ki-supported-runtimes using only claude-code or chatgpt-codex`, 1)
  if (new Set(runtimes).size !== runtimes.length) throw new KiError(`${path} repeats a supported runtime`, 1)
  return runtimes as readonly SupportedRuntime[]
}

const enumeratePayloadFiles = async (root: string, directory: string, externalPayload = false): Promise<readonly string[]> => {
  const path = join(root, directory)
  const state = await lstat(path).catch(() => undefined)
  if (!state) return []
  const linkedRoot = state.isSymbolicLink()
  // Recursion reaches nested entries only after their parent was verified non-symlinked.
  /* v8 ignore next */
  if (linkedRoot && directory.includes('/')) throw new KiError(`installed harness payload ${directory} must not be a symlink`, 1)
  const physicalDirectoryPath = linkedRoot ? await realpath(path) : await physicalDirectory(path, `installed harness payload ${directory}`)
  const physicalState = await lstat(physicalDirectoryPath)
  if (!physicalState?.isDirectory() || physicalState.isSymbolicLink()) {
    throw new KiError(`installed harness payload ${directory} must be a directory`, 1)
  }
  // A non-linked child of a physical harness root cannot resolve outside that root; this guards a future path refactor.
  /* v8 ignore next */
  if (!linkedRoot && !externalPayload && !contained(root, physicalDirectoryPath)) {
    throw new KiError(`installed harness payload ${directory} escapes the harness`, 1)
  }
  const entries = await readdir(physicalDirectoryPath, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const relativePath = `${directory}/${entry.name}`
    if (entry.isSymbolicLink()) throw new KiError(`installed harness payload ${relativePath} must not be a symlink`, 1)
    if (entry.isDirectory()) files.push(...(await enumeratePayloadFiles(root, relativePath, externalPayload || linkedRoot)))
    else if (entry.isFile()) files.push(relativePath)
    else throw new KiError(`installed harness payload ${relativePath} must be a regular file or directory`, 1)
  }
  return files
}

const discoverCapabilities = async (root: string, identifier: string): Promise<readonly HarnessCapability[]> => {
  const files = (await Promise.all(payloadRoots.map((directory) => enumeratePayloadFiles(root, directory))))
    .flat()
    .sort((left, right) => left.localeCompare(right))
  const capabilities: HarnessCapability[] = []
  for (const file of files) {
    if (!file.startsWith('skills/') || !file.endsWith('/SKILL.md')) continue
    const source = dirname(file)
    const metadata = frontmatter(await readFile(join(root, file), 'utf8'), file)
    const { name } = metadata
    if (!name) throw new KiError(`${file} must declare name`, 1)
    const rubricPath = `${source}/${RUBRIC_MODULE_PATH}`
    const rubricModule = files.includes(rubricPath) ? rubricPath : undefined
    capabilities.push({
      kind: 'skill',
      name,
      source,
      dependsOn: frontmatterDependencies(metadata['ki-depends-on'], file, 'ki-depends-on', true),
      optionalDependsOn: frontmatterDependencies(metadata['ki-optional-depends-on'], file, 'ki-optional-depends-on', false),
      supportedRuntimes: frontmatterSupportedRuntimes(metadata['ki-supported-runtimes'], file),
      rubricModule
    })
  }
  const names = new Set<string>()
  for (const capability of capabilities) {
    if (names.has(capability.name)) throw new KiError(`installed harness ${identifier} repeats skill ${capability.name}`, 1)
    names.add(capability.name)
  }
  return capabilities.sort((left, right) => left.name.localeCompare(right.name))
}

export const inspectHarnessRoot = async (rootPath: string, identifier: string): Promise<InstalledHarness> => {
  // Every CLI caller validates identifiers before invoking this internal inspection boundary.
  /* v8 ignore next */
  if (!harnessIdentifier.test(identifier)) throw new KiError('harness identifier must be an owner/name identifier', 2)
  const root = await physicalDirectory(rootPath, `installed harness ${identifier}`)
  return { id: identifier, root, capabilities: await discoverCapabilities(root, identifier) }
}

export const readInstalledHarness = async (dataDirectory: string, identifier: string): Promise<InstalledHarness> => {
  if (!harnessIdentifier.test(identifier)) throw new KiError('harness identifier must be an owner/name identifier', 2)
  const harnesses = await physicalDirectory(join(dataDirectory, 'harnesses'), 'installed harnesses directory')
  const [owner, name] = identifier.split('/') as [string, string]
  const ownerDirectory = await physicalDirectory(join(harnesses, owner), `installed harness ${identifier}`)
  // physicalDirectory rejects symlinks; a physical child cannot escape its physical parent.
  /* v8 ignore next */
  if (!contained(harnesses, ownerDirectory)) throw new KiError(`installed harness ${identifier} escapes the harnesses directory`, 1)
  const root = await physicalDirectory(join(ownerDirectory, name), `installed harness ${identifier}`)
  // physicalDirectory rejects symlinks; a physical child cannot escape its physical parent.
  /* v8 ignore next */
  if (!contained(harnesses, root)) throw new KiError(`installed harness ${identifier} escapes the harnesses directory`, 1)
  return inspectHarnessRoot(root, identifier)
}

export const discoverInstalledHarnesses = async (dataDirectory: string): Promise<readonly InstalledHarness[]> => {
  const harnesses = join(dataDirectory, 'harnesses')
  const state = await lstat(harnesses).catch(() => undefined)
  if (!state) return []
  const physicalHarnesses = await physicalDirectory(harnesses, 'installed harnesses directory')
  const owners = await readdir(physicalHarnesses, { withFileTypes: true })
  const identifiers: string[] = []
  for (const owner of owners) {
    if (!owner.isDirectory() || owner.isSymbolicLink() || !harnessComponent.test(owner.name)) {
      throw new KiError('installed harnesses directory contains an unsafe owner entry', 1)
    }
    const names = await readdir(join(physicalHarnesses, owner.name), { withFileTypes: true })
    for (const name of names) {
      if (!name.isDirectory() || name.isSymbolicLink() || !harnessComponent.test(name.name)) {
        throw new KiError(`installed harness ${owner.name} contains an unsafe name entry`, 1)
      }
      identifiers.push(`${owner.name}/${name.name}`)
    }
  }
  return Promise.all(identifiers.sort().map((identifier) => readInstalledHarness(dataDirectory, identifier)))
}
