import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { KiError } from './errors.ts'

const harnessIdentifier = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const harnessComponent = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const payloadRoots = ['skills', 'agents', 'hooks'] as const

export const baseHarnessIdentifier = 'knowledgeislands/ki-agentic-harness'

export interface RegisteredOperation {
  readonly protocol: 'ki/native-operation@1'
  readonly module: string
  readonly export: 'audit' | 'conform'
  readonly mode: 'audit' | 'conform'
}

export interface HarnessCapability {
  readonly kind: 'skill'
  readonly name: string
  readonly source: string
  readonly dependsOn: readonly string[]
  readonly operations: readonly RegisteredOperation[]
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

const frontmatterDependencies = (value: string | undefined, path: string): readonly string[] => {
  if (!value || !/^\[[^\]]*\]$/.test(value)) throw new KiError(`${path} must declare ki-depends-on as a flow list`, 1)
  const dependencies = value
    .slice(1, -1)
    .split(',')
    .map((dependency) => dependency.trim())
    .filter(Boolean)
  if (new Set(dependencies).size !== dependencies.length) throw new KiError(`${path} repeats a dependency`, 1)
  return dependencies
}

const enumeratePayloadFiles = async (root: string, directory: string): Promise<readonly string[]> => {
  const path = join(root, directory)
  const state = await lstat(path).catch(() => undefined)
  if (!state) return []
  const physicalDirectoryPath = await physicalDirectory(path, `installed harness payload ${directory}`)
  if (!contained(root, physicalDirectoryPath)) throw new KiError(`installed harness payload ${directory} escapes the harness`, 1)
  const entries = await readdir(physicalDirectoryPath, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const relativePath = `${directory}/${entry.name}`
    if (entry.isSymbolicLink()) throw new KiError(`installed harness payload ${relativePath} must not be a symlink`, 1)
    if (entry.isDirectory()) files.push(...(await enumeratePayloadFiles(root, relativePath)))
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
    const operations = (['audit', 'conform'] as const)
      .filter((mode) => files.includes(`${source}/scripts/native/${mode}.mjs`))
      .map((mode) => ({
        protocol: 'ki/native-operation@1' as const,
        module: `${source}/scripts/native/${mode}.mjs`,
        export: mode,
        mode
      }))
    capabilities.push({ kind: 'skill', name, source, dependsOn: frontmatterDependencies(metadata['ki-depends-on'], file), operations })
  }
  const names = new Set<string>()
  for (const capability of capabilities) {
    if (names.has(capability.name)) throw new KiError(`installed harness ${identifier} repeats skill ${capability.name}`, 1)
    names.add(capability.name)
  }
  return capabilities.sort((left, right) => left.name.localeCompare(right.name))
}

export const inspectHarnessRoot = async (rootPath: string, identifier: string): Promise<InstalledHarness> => {
  if (!harnessIdentifier.test(identifier)) throw new KiError('harness identifier must be an owner/name identifier', 2)
  const root = await physicalDirectory(rootPath, `installed harness ${identifier}`)
  return { id: identifier, root, capabilities: await discoverCapabilities(root, identifier) }
}

export const readInstalledHarness = async (dataDirectory: string, identifier: string): Promise<InstalledHarness> => {
  if (!harnessIdentifier.test(identifier)) throw new KiError('harness identifier must be an owner/name identifier', 2)
  const harnesses = await physicalDirectory(join(dataDirectory, 'harnesses'), 'installed harnesses directory')
  const [owner, name] = identifier.split('/') as [string, string]
  const ownerDirectory = await physicalDirectory(join(harnesses, owner), `installed harness ${identifier}`)
  if (!contained(harnesses, ownerDirectory)) throw new KiError(`installed harness ${identifier} escapes the harnesses directory`, 1)
  const root = await physicalDirectory(join(ownerDirectory, name), `installed harness ${identifier}`)
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
