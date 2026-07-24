import { createHash } from 'node:crypto'
import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { parse } from 'smol-toml'
import { KiError } from './errors.ts'

const harnessIdentifier = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const sha256 = /^[a-f0-9]{64}$/

export interface RegisteredOperation {
  readonly protocol: string
  readonly module: string
  readonly export: string
  readonly mode: 'audit' | 'conform'
}

export interface HarnessCapability {
  readonly kind: string
  readonly name: string
  readonly source: string
  readonly dependsOn: readonly string[]
  readonly operations: readonly RegisteredOperation[]
}

export interface HarnessManifest {
  readonly schema: 1
  readonly id: string
  readonly latest: string
  readonly ki: string
  readonly files: readonly { readonly path: string; readonly sha256: string }[]
  readonly capabilities: readonly HarnessCapability[]
}

export interface InstalledHarness {
  readonly root: string
  readonly manifest: HarnessManifest
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const safeRelativePath = (value: unknown, description: string): string => {
  if (
    typeof value !== 'string' ||
    !value ||
    value.startsWith('/') ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new KiError(`${description} must be a safe relative path`, 1)
  }
  return value
}

const stringField = (source: Record<string, unknown>, field: string, description: string): string => {
  const value = source[field]
  if (typeof value !== 'string' || !value) throw new KiError(`${description} must declare ${field}`, 1)
  return value
}

const parseOperation = (value: unknown, mode: 'audit' | 'conform', description: string): RegisteredOperation => {
  if (!isRecord(value)) throw new KiError(`${description} must be a table`, 1)
  const { module } = value
  return {
    protocol: stringField(value, 'protocol', description),
    module: safeRelativePath(module, `${description} module`),
    export: stringField(value, 'export', description),
    mode
  }
}

const parseFiles = (value: unknown): readonly { readonly path: string; readonly sha256: string }[] => {
  if (!isRecord(value)) throw new KiError('harness.toml must declare a [files] table', 1)
  const paths = new Set<string>()
  return Object.entries(value).map(([path, digest]) => {
    const safePath = safeRelativePath(path, 'files path')
    if (paths.has(safePath)) throw new KiError(`harness.toml repeats integrity file ${safePath}`, 1)
    paths.add(safePath)
    if (typeof digest !== 'string' || !sha256.test(digest)) throw new KiError(`integrity file ${safePath} must use lowercase SHA-256`, 1)
    return { path: safePath, sha256: digest }
  })
}

const parseDependencies = (value: unknown, description: string): readonly string[] => {
  if (!Array.isArray(value) || value.some((dependency) => typeof dependency !== 'string' || !dependency)) {
    throw new KiError(`${description} must declare depends_on as a string array`, 1)
  }
  if (new Set(value).size !== value.length) throw new KiError(`${description} repeats a dependency`, 1)
  return value
}

const parseCapability = (name: string, value: unknown): HarnessCapability => {
  const description = `capabilities.${name}`
  if (!isRecord(value)) throw new KiError(`${description} must be a table`, 1)
  const { depends_on: configuredDependencies, operations: configuredOperations, source } = value
  const operations =
    configuredOperations === undefined
      ? []
      : isRecord(configuredOperations)
        ? Object.entries(configuredOperations).map(([mode, operation]) => {
            if (mode !== 'audit' && mode !== 'conform') throw new KiError(`${description}.operations must use audit or conform keys`, 1)
            return parseOperation(operation, mode, `${description}.operations.${mode}`)
          })
        : null
  if (!operations) throw new KiError(`${description}.operations must be a table`, 1)
  return {
    kind: stringField(value, 'kind', description),
    name,
    source: safeRelativePath(source, `${description} source`),
    dependsOn: parseDependencies(configuredDependencies, description),
    operations
  }
}

export const parseHarnessManifest = (text: string): HarnessManifest => {
  let parsed: unknown
  try {
    parsed = parse(text)
  } catch {
    throw new KiError('harness.toml must be valid TOML', 1)
  }
  if (!isRecord(parsed)) throw new KiError('harness.toml must be a table', 1)
  const { schema, capabilities: configuredCapabilities, files: configuredFiles } = parsed
  if (schema !== 1) throw new KiError('harness.toml schema must be 1', 1)
  const id = stringField(parsed, 'id', 'harness.toml')
  if (!harnessIdentifier.test(id)) throw new KiError('harness.toml id must be an owner/name identifier', 1)
  if (!isRecord(configuredCapabilities)) throw new KiError('harness.toml must declare a [capabilities] table', 1)
  const files = parseFiles(configuredFiles)
  const capabilities = Object.entries(configuredCapabilities).map(([name, capability]) => parseCapability(name, capability))
  const identities = new Set<string>()
  for (const capability of capabilities) {
    const identity = `${capability.kind}:${capability.name}`
    if (identities.has(identity)) throw new KiError(`harness.toml repeats capability ${identity}`, 1)
    identities.add(identity)
  }
  return {
    schema: 1,
    id,
    latest: stringField(parsed, 'latest', 'harness.toml'),
    ki: stringField(parsed, 'ki', 'harness.toml'),
    files,
    capabilities
  }
}

const contained = (root: string, path: string): boolean => {
  const remainder = relative(root, path)
  return remainder === '' || (!remainder.startsWith('..') && remainder !== '..')
}

const regularFile = async (path: string, description: string): Promise<void> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isFile() || state.isSymbolicLink()) throw new KiError(`${description} must be a regular file`, 1)
}

const physicalDirectory = async (path: string, description: string): Promise<string> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isDirectory() || state.isSymbolicLink()) throw new KiError(`${description} must be a directory`, 1)
  return realpath(path)
}

const verifyCapability = async (root: string, capability: HarnessCapability, paths: ReadonlySet<string>): Promise<void> => {
  const source = join(root, capability.source)
  const physicalSource = await physicalDirectory(source, `${capability.kind}:${capability.name} source`)
  if (!contained(root, physicalSource)) throw new KiError(`${capability.kind}:${capability.name} source escapes the harness`, 1)
  for (const operation of capability.operations) {
    if (!paths.has(operation.module)) {
      throw new KiError(`${capability.kind}:${capability.name} operation module must be integrity-covered`, 1)
    }
  }
}

export const verifyHarnessRoot = async (rootPath: string, identifier: string): Promise<HarnessManifest> => {
  if (!harnessIdentifier.test(identifier)) throw new KiError('harness identifier must be an owner/name identifier', 2)
  const root = await physicalDirectory(rootPath, `installed harness ${identifier}`)
  const manifestPath = join(root, 'harness.toml')
  await regularFile(manifestPath, `installed harness ${identifier} manifest`)
  const manifest = parseHarnessManifest(await readFile(manifestPath, 'utf8'))
  if (manifest.id !== identifier) throw new KiError(`installed harness ${identifier} manifest identity does not match its location`, 1)
  const paths = new Set(manifest.files.map((file) => file.path))
  await Promise.all(
    manifest.files.map(async (file) => {
      const path = join(root, file.path)
      await regularFile(path, `installed harness ${identifier} integrity file ${file.path}`)
      const physicalFile = await realpath(path)
      if (!contained(root, physicalFile)) throw new KiError(`installed harness ${identifier} integrity file escapes the harness`, 1)
      const digest = createHash('sha256')
        .update(await readFile(path))
        .digest('hex')
      if (digest !== file.sha256)
        throw new KiError(`installed harness ${identifier} integrity file ${file.path} does not match its digest`, 1)
    })
  )
  await Promise.all(manifest.capabilities.map((capability) => verifyCapability(root, capability, paths)))
  return manifest
}

export const readInstalledHarness = async (dataDirectory: string, identifier: string): Promise<InstalledHarness> => {
  if (!harnessIdentifier.test(identifier)) throw new KiError('harness identifier must be an owner/name identifier', 2)
  const harnesses = await physicalDirectory(join(dataDirectory, 'harnesses'), 'installed harnesses directory')
  const [owner, name] = identifier.split('/') as [string, string]
  const ownerDirectory = await physicalDirectory(join(harnesses, owner), `installed harness ${identifier}`)
  if (!contained(harnesses, ownerDirectory)) throw new KiError(`installed harness ${identifier} escapes the harnesses directory`, 1)
  const root = await physicalDirectory(join(ownerDirectory, name, 'latest'), `installed harness ${identifier}`)
  if (!contained(harnesses, root)) throw new KiError(`installed harness ${identifier} escapes the harnesses directory`, 1)
  return { root, manifest: await verifyHarnessRoot(root, identifier) }
}

export const discoverInstalledHarnesses = async (dataDirectory: string): Promise<readonly InstalledHarness[]> => {
  const harnesses = join(dataDirectory, 'harnesses')
  const state = await lstat(harnesses).catch(() => undefined)
  if (!state) return []
  const physicalHarnesses = await physicalDirectory(harnesses, 'installed harnesses directory')
  const owners = await readdir(physicalHarnesses, { withFileTypes: true })
  const identifiers: string[] = []
  for (const owner of owners) {
    if (!owner.isDirectory() || owner.isSymbolicLink() || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(owner.name)) {
      throw new KiError('installed harnesses directory contains an unsafe owner entry', 1)
    }
    const names = await readdir(join(physicalHarnesses, owner.name), { withFileTypes: true })
    for (const name of names) {
      if (!name.isDirectory() || name.isSymbolicLink() || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name.name)) {
        throw new KiError(`installed harness ${owner.name} contains an unsafe name entry`, 1)
      }
      identifiers.push(`${owner.name}/${name.name}`)
    }
  }
  return Promise.all(identifiers.sort().map((identifier) => readInstalledHarness(dataDirectory, identifier)))
}
