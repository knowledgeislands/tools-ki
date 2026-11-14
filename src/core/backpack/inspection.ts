import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { parse } from 'smol-toml'
import { KiError } from '../errors.ts'
import { RUBRIC_MODULE_PATH } from '../rubric/index.ts'
import { isRetiredSlotAlias } from '../storage/backpack-migration.ts'
import { backpackIdentifier, retiredBackpackIdentifier } from './identity.ts'

const backpackIdentifierPattern = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const backpackComponent = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const payloadRoots = ['skills', 'subagents', 'hooks'] as const

export const canonicalBackpackIdentifier = 'knowledgeislands/ki-agent-backpack'
/** The canonical backpack's retired spelling, still recognised for this one release. */
export const retiredCanonicalBackpackIdentifier = retiredBackpackIdentifier(canonicalBackpackIdentifier) as string
/** The skill a backpack's root `.ki.toml` declares its capability prefix under. */
export const BACKPACK_SHAPE_SKILL = 'ki-repo-backpack'
/** The retired name of that skill, still read for this one release. */
export const RETIRED_BACKPACK_SHAPE_SKILL = 'ki-repo-harness'
export const BACKPACK_DECLARATION_FILE = '.ki.toml'

export const supportedRuntimes = ['claude-code', 'claude-desktop', 'chatgpt-codex'] as const
export type SupportedRuntime = (typeof supportedRuntimes)[number]

export interface BackpackCapability {
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

export interface InstalledBackpack {
  readonly id: string
  readonly root: string
  readonly prefix: string
  readonly capabilities: readonly BackpackCapability[]
}

const prefixPattern = /^[a-z][a-z0-9]*$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const backpackPrefix = async (
  root: string,
  identifier: string,
  metadataFile: string,
  description: string
): Promise<string> => {
  const path = join(root, metadataFile)
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isFile() || state.isSymbolicLink())
    throw new KiError(`${description} ${identifier} ${metadataFile} must be a regular file`, 1)
  let configuration: unknown
  try {
    configuration = parse(await readFile(path, 'utf8'))
  } catch {
    throw new KiError(`${description} ${identifier} ${metadataFile} must be valid TOML`, 1)
  }
  const skills = (configuration as Record<string, unknown>)['skills']
  const declaration = isRecord(skills)
    ? (skills[BACKPACK_SHAPE_SKILL] ?? skills[RETIRED_BACKPACK_SHAPE_SKILL])
    : undefined
  const prefix = isRecord(declaration) ? declaration['prefix'] : undefined
  if (typeof prefix !== 'string' || !prefixPattern.test(prefix))
    throw new KiError(
      `${description} ${identifier} must declare a lowercase alphanumeric [skills.${BACKPACK_SHAPE_SKILL}] prefix`,
      1
    )
  return prefix
}

export const requireUniqueBackpackPrefixes = (backpacks: readonly InstalledBackpack[]): void => {
  const owners = new Map<string, string>()
  for (const backpack of backpacks) {
    const existing = owners.get(backpack.prefix)
    if (existing && existing !== backpack.id)
      throw new KiError(`backpack prefix ${backpack.prefix} is already owned by installed backpack ${existing}`, 1)
    owners.set(backpack.prefix, backpack.id)
  }
}

const contained = (root: string, path: string): boolean => {
  const remainder = relative(root, path)
  return remainder === '' || (!remainder.startsWith('..') && remainder !== '..')
}

const physicalDirectory = async (path: string, description: string): Promise<string> => {
  const state = await lstat(path).catch(
    // Callers resolve or inspect the entry immediately before this boundary; only concurrent removal reaches this fallback.
    /* v8 ignore next */
    () => undefined
  )
  if (!state?.isDirectory()) throw new KiError(`${description} must be a directory`, 1)
  return realpath(path)
}

const frontmatter = (text: string, path: string): Record<string, string> => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (!match?.[1]) throw new KiError(`${path} must declare frontmatter`, 1)
  const metadata: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    if (metadata[key] !== undefined) throw new KiError(`${path} repeats frontmatter field ${key}`, 1)
    metadata[key] = line.slice(separator + 1).trim()
  }
  return metadata
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
  if (new Set(dependencies).size !== dependencies.length)
    throw new KiError(`${path} repeats a ${required ? '' : 'optional '}dependency`, 1)
  return dependencies
}

const frontmatterSupportedRuntimes = (
  value: string | undefined,
  path: string
): readonly SupportedRuntime[] | undefined => {
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
    throw new KiError(
      `${path} must declare ki-supported-runtimes using only claude-code, claude-desktop, or chatgpt-codex`,
      1
    )
  if (new Set(runtimes).size !== runtimes.length) throw new KiError(`${path} repeats a supported runtime`, 1)
  return runtimes as readonly SupportedRuntime[]
}

const enumeratePayloadFiles = async (
  root: string,
  directory: string,
  description = 'installed backpack payload'
): Promise<readonly string[]> => {
  const path = join(root, directory)
  const state = await lstat(path).catch(() => undefined)
  if (!state) return []
  if (state.isSymbolicLink()) throw new KiError(`${description} ${directory} must not be a symlink`, 1)
  const physicalDirectoryPath = await physicalDirectory(path, `${description} ${directory}`)
  // A physical child of a physical backpack root cannot resolve outside that root; this guards a future path refactor.
  /* v8 ignore next */
  if (!contained(root, physicalDirectoryPath)) {
    throw new KiError(`${description} ${directory} escapes its root`, 1)
  }
  const entries = await readdir(physicalDirectoryPath, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const relativePath = `${directory}/${entry.name}`
    if (entry.isSymbolicLink()) throw new KiError(`${description} ${relativePath} must not be a symlink`, 1)
    if (entry.isDirectory()) files.push(...(await enumeratePayloadFiles(root, relativePath, description)))
    else if (entry.isFile()) files.push(relativePath)
    else throw new KiError(`${description} ${relativePath} must be a regular file or directory`, 1)
  }
  return files
}

const skillCapability = async (root: string, source: string, files: readonly string[]): Promise<BackpackCapability> => {
  const file = `${source}/SKILL.md`
  if (!files.includes(file)) throw new KiError(`${file} must be a regular file`, 1)
  const metadata = frontmatter(await readFile(join(root, file), 'utf8'), file)
  const { name } = metadata
  if (!name) throw new KiError(`${file} must declare name`, 1)
  const rubricPath = `${source}/${RUBRIC_MODULE_PATH}`
  const rubricModule = files.includes(rubricPath) ? rubricPath : undefined
  return {
    kind: 'skill',
    name,
    source,
    dependsOn: frontmatterDependencies(metadata['ki-depends-on'], file, 'ki-depends-on', true),
    optionalDependsOn: frontmatterDependencies(
      metadata['ki-optional-depends-on'],
      file,
      'ki-optional-depends-on',
      false
    ),
    supportedRuntimes: frontmatterSupportedRuntimes(metadata['ki-supported-runtimes'], file),
    ...(rubricModule ? { rubricModule } : {})
  }
}

/** Inspects one physical skill source using the same metadata contract as installed backpack payloads. */
export const inspectSkillCapability = async (rootPath: string, source: string): Promise<BackpackCapability> => {
  const root = await physicalDirectory(rootPath, 'repository-local skill root')
  const files = await enumeratePayloadFiles(root, source, 'repository-local skill source')
  return skillCapability(root, source, files)
}

const discoverCapabilities = async (root: string, identifier: string): Promise<readonly BackpackCapability[]> => {
  const files = (await Promise.all(payloadRoots.map((directory) => enumeratePayloadFiles(root, directory))))
    .flat()
    .sort((left, right) => left.localeCompare(right))
  const capabilities: BackpackCapability[] = []
  for (const file of files) {
    if (!file.startsWith('skills/') || !file.endsWith('/SKILL.md')) continue
    capabilities.push(await skillCapability(root, dirname(file), files))
  }
  const names = new Set<string>()
  for (const capability of capabilities) {
    if (names.has(capability.name))
      throw new KiError(`installed backpack ${identifier} repeats skill ${capability.name}`, 1)
    names.add(capability.name)
  }
  return capabilities.sort((left, right) => left.name.localeCompare(right.name))
}

const inspectBackpackRoot = async (
  rootPath: string,
  identifier: string,
  metadataFile: string,
  description: string
): Promise<InstalledBackpack> => {
  // Every CLI caller validates identifiers before invoking this internal inspection boundary.
  /* v8 ignore next */
  if (!backpackIdentifierPattern.test(identifier))
    throw new KiError('backpack identifier must be an owner/name identifier', 2)
  const root = await physicalDirectory(rootPath, `${description} ${identifier}`)
  const [prefix, capabilities] = await Promise.all([
    backpackPrefix(root, identifier, metadataFile, description),
    discoverCapabilities(root, identifier)
  ])
  const mismatched = capabilities.find((capability) => !capability.name.startsWith(`${prefix}-`))
  if (mismatched)
    throw new KiError(
      `installed backpack ${identifier} skill ${mismatched.name} must begin with declared prefix ${prefix}-`,
      1
    )
  return { id: backpackIdentifier(identifier), root, prefix, capabilities }
}

export const inspectInstalledBackpackRoot = async (rootPath: string, identifier: string): Promise<InstalledBackpack> =>
  inspectBackpackRoot(rootPath, identifier, BACKPACK_DECLARATION_FILE, 'installed backpack')

export const inspectBackpackSourceRoot = async (rootPath: string, identifier: string): Promise<InstalledBackpack> =>
  inspectBackpackRoot(rootPath, identifier, BACKPACK_DECLARATION_FILE, 'backpack source')

export const readInstalledBackpack = async (dataDirectory: string, identifier: string): Promise<InstalledBackpack> => {
  if (!backpackIdentifierPattern.test(identifier))
    throw new KiError('backpack identifier must be an owner/name identifier', 2)
  const backpacks = await physicalDirectory(join(dataDirectory, 'backpacks'), 'installed backpacks directory')
  const [owner, name] = identifier.split('/') as [string, string]
  const ownerDirectory = await physicalDirectory(join(backpacks, owner), `installed backpack ${identifier}`)
  // physicalDirectory rejects symlinks; a physical child cannot escape its physical parent.
  /* v8 ignore next */
  if (!contained(backpacks, ownerDirectory))
    throw new KiError(`installed backpack ${identifier} escapes the backpacks directory`, 1)
  const destination = join(ownerDirectory, backpackIdentifier(`${owner}/${name}`).slice(owner.length + 1))
  const state = await lstat(destination).catch(() => undefined)
  if (!state?.isDirectory() && !state?.isSymbolicLink())
    throw new KiError(`installed backpack ${identifier} must be a directory`, 1)
  const root = state.isSymbolicLink()
    ? await realpath(destination).catch(() => {
        throw new KiError(`installed backpack ${identifier} local development link is broken`, 1)
      })
    : await physicalDirectory(destination, `installed backpack ${identifier}`)
  // A physical child of the already-validated physical owner directory cannot escape it.
  /* v8 ignore next */
  if (!state.isSymbolicLink() && !contained(backpacks, root))
    throw new KiError(`installed backpack ${identifier} escapes the backpacks directory`, 1)
  return inspectInstalledBackpackRoot(root, identifier)
}

// An install extracts into `.install-<random>` and parks the payload it replaces in
// `.replace-<uuid>-<name>`, both alongside the destination in the owner directory. A process
// killed between creating one and promoting it leaves the directory behind, so discovery has to
// tell this repository's own interrupted work apart from an entry it has no business touching.
export const installStagingPrefix = '.install-'
export const parkedPayloadPrefix = '.replace-'

// The parked name carries the destination it must be restored to, because a payload does not
// record its own identity — `inspectBackpackRoot` is told which backpack it is reading.
export const parkedPayloadEntry = (uuid: string, name: string): string => `${parkedPayloadPrefix}${uuid}-${name}`

const parkedDestination = (entry: string): string | undefined => {
  const rest = entry.slice(parkedPayloadPrefix.length)
  const name = rest.slice(37)
  return rest.length > 37 && backpackComponent.test(name) ? name : undefined
}

export interface InstallOrphan {
  // `staging` holds an unpromoted extraction and is worth nothing; `parked` may hold the only
  // verified copy of the payload it was displacing.
  readonly kind: 'staging' | 'parked'
  readonly owner: string
  readonly entry: string
  readonly path: string
  // The backpack name a parked payload restores to, absent when the entry does not carry one.
  readonly destination?: string
}

const installOrphan = (owner: string, entry: string, path: string): InstallOrphan | undefined => {
  if (entry.startsWith(installStagingPrefix)) return { kind: 'staging', owner, entry, path }
  if (!entry.startsWith(parkedPayloadPrefix)) return undefined
  const destination = parkedDestination(entry)
  return { kind: 'parked', owner, entry, path, ...(destination ? { destination } : {}) }
}

export const discoverInstalledBackpacks = async (
  dataDirectory: string,
  options: { readonly except?: string } = {}
): Promise<readonly InstalledBackpack[]> => {
  const backpacks = join(dataDirectory, 'backpacks')
  const state = await lstat(backpacks).catch(() => undefined)
  if (!state) return []
  const physicalBackpacks = await physicalDirectory(backpacks, 'installed backpacks directory')
  const owners = await readdir(physicalBackpacks, { withFileTypes: true })
  const identifiers: string[] = []
  for (const owner of owners) {
    if (!owner.isDirectory() || owner.isSymbolicLink() || !backpackComponent.test(owner.name)) {
      throw new KiError(`installed backpacks directory contains an unsafe owner entry ${owner.name}`, 1)
    }
    const names = await readdir(join(physicalBackpacks, owner.name), { withFileTypes: true })
    for (const name of names) {
      // An orphan is reported by `ki cleanup` and recovered by `ki repair`; it must
      // not fail the read paths that merely wanted to list what is installed.
      if (installOrphan(owner.name, name.name, join(physicalBackpacks, owner.name, name.name))) continue
      // The data migration leaves a retired slot name linking to the slot it moved, for one release.
      if (name.isSymbolicLink() && (await isRetiredSlotAlias(join(physicalBackpacks, owner.name), name.name))) continue
      if ((!name.isDirectory() && !name.isSymbolicLink()) || !backpackComponent.test(name.name)) {
        throw new KiError(
          `installed backpack ${owner.name} contains an unsafe name entry ${join(physicalBackpacks, owner.name, name.name)}`,
          1
        )
      }
      const identifier = backpackIdentifier(`${owner.name}/${name.name}`)
      if (identifiers.includes(identifier))
        throw new KiError(
          `installed backpack ${identifier} is installed under both ${identifier} and ${retiredBackpackIdentifier(identifier)}; remove one`,
          1
        )
      if (!options.except || identifier !== backpackIdentifier(options.except)) identifiers.push(identifier)
    }
  }
  const installed = await Promise.all(
    identifiers.sort().map((identifier) => readInstalledBackpack(dataDirectory, identifier))
  )
  requireUniqueBackpackPrefixes(installed)
  return installed
}

// Reports interrupted-install residue without touching it. Recovery is `recoverInstallOrphans`,
// reached only from a command the operator invoked for that purpose.
export const discoverInstallOrphans = async (dataDirectory: string): Promise<readonly InstallOrphan[]> => {
  const backpacks = join(dataDirectory, 'backpacks')
  if (!(await lstat(backpacks).catch(() => undefined))) return []
  const physicalBackpacks = await physicalDirectory(backpacks, 'installed backpacks directory')
  const owners = await readdir(physicalBackpacks, { withFileTypes: true })
  const orphans: InstallOrphan[] = []
  for (const owner of owners) {
    if (!owner.isDirectory() || owner.isSymbolicLink() || !backpackComponent.test(owner.name)) continue
    const ownerDirectory = join(physicalBackpacks, owner.name)
    for (const name of await readdir(ownerDirectory, { withFileTypes: true })) {
      const orphan = installOrphan(owner.name, name.name, join(ownerDirectory, name.name))
      if (orphan) orphans.push(orphan)
    }
  }
  return orphans.sort((left, right) => left.path.localeCompare(right.path))
}
