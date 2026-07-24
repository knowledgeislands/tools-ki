import { createHash } from 'node:crypto'
import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { parse } from 'smol-toml'
import { KiError } from './errors.ts'

const harnessIdentifier = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/
const sha256 = /^[a-f0-9]{64}$/
const payloadRoots = ['skills', 'agents', 'hooks'] as const

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

export interface HarnessLock {
  readonly schema: 1
  readonly id: string
  readonly archive: { readonly url: string; readonly sha256: string }
  readonly files: readonly { readonly path: string; readonly sha256: string }[]
  readonly capabilities: readonly HarnessCapability[]
}

export interface InstalledHarness {
  readonly root: string
  readonly lock: HarnessLock
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

const parseFiles = (value: unknown): readonly { readonly path: string; readonly sha256: string }[] => {
  if (!isRecord(value)) throw new KiError('harness-lock.toml must declare a [files] table', 1)
  return Object.entries(value).map(([path, digest]) => {
    const safePath = safeRelativePath(path, 'files path')
    if (!payloadRoots.some((root) => safePath === root || safePath.startsWith(`${root}/`))) {
      throw new KiError(`harness-lock.toml file ${safePath} is outside the installed payload`, 1)
    }
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

const parseOperation = (value: unknown, mode: RegisteredOperation['mode'], description: string): RegisteredOperation => {
  if (!isRecord(value)) throw new KiError(`${description} must be a table`, 1)
  const { module } = value
  if (stringField(value, 'protocol', description) !== 'ki/native-operation@1') {
    throw new KiError(`${description} protocol must be ki/native-operation@1`, 1)
  }
  if (stringField(value, 'export', description) !== mode) throw new KiError(`${description} export must be ${mode}`, 1)
  return { protocol: 'ki/native-operation@1', module: safeRelativePath(module, `${description} module`), export: mode, mode }
}

const parseCapability = (name: string, value: unknown): HarnessCapability => {
  const description = `capabilities.${name}`
  if (!isRecord(value)) throw new KiError(`${description} must be a table`, 1)
  const { depends_on: dependencies, operations: configuredOperations, source: configuredSource } = value
  if (stringField(value, 'kind', description) !== 'skill') throw new KiError(`${description} kind must be skill`, 1)
  const source = safeRelativePath(configuredSource, `${description} source`)
  if (!source.startsWith('skills/')) throw new KiError(`${description} source must be beneath skills`, 1)
  const operations =
    configuredOperations === undefined
      ? []
      : isRecord(configuredOperations)
        ? Object.entries(configuredOperations).map(([mode, operation]) => {
            if (mode !== 'audit' && mode !== 'conform') throw new KiError(`${description}.operations must use audit or conform keys`, 1)
            return parseOperation(operation, mode, `${description}.operations.${mode}`)
          })
        : (() => {
            throw new KiError(`${description}.operations must be a table`, 1)
          })()
  return { kind: 'skill', name, source, dependsOn: parseDependencies(dependencies, description), operations }
}

export const parseHarnessLock = (text: string): HarnessLock => {
  let parsed: unknown
  try {
    parsed = parse(text)
  } catch {
    throw new KiError('harness-lock.toml must be valid TOML', 1)
  }
  if (!isRecord(parsed)) throw new KiError('harness-lock.toml must be a table', 1)
  const { archive: configuredArchive, capabilities: configuredCapabilities, files: configuredFiles, schema } = parsed
  if (schema !== 1) throw new KiError('harness-lock.toml schema must be 1', 1)
  const id = stringField(parsed, 'id', 'harness-lock.toml')
  if (!harnessIdentifier.test(id)) throw new KiError('harness-lock.toml id must be an owner/name identifier', 1)
  if (!isRecord(configuredArchive)) throw new KiError('harness-lock.toml must declare an [archive] table', 1)
  const archive = { url: stringField(configuredArchive, 'url', 'archive'), sha256: stringField(configuredArchive, 'sha256', 'archive') }
  if (!sha256.test(archive.sha256)) throw new KiError('archive sha256 must be lowercase SHA-256', 1)
  if (!isRecord(configuredCapabilities)) throw new KiError('harness-lock.toml must declare a [capabilities] table', 1)
  const files = parseFiles(configuredFiles)
  const paths = new Set(files.map((file) => file.path))
  const capabilities = Object.entries(configuredCapabilities).map(([name, capability]) => parseCapability(name, capability))
  for (const capability of capabilities) {
    if (!paths.has(`${capability.source}/SKILL.md`)) {
      throw new KiError(`${capability.name} source must include integrity-covered SKILL.md`, 1)
    }
  }
  return { schema: 1, id, archive, files, capabilities }
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

const enumerateFiles = async (root: string, directory: string): Promise<readonly { readonly path: string; readonly sha256: string }[]> => {
  const physicalDirectoryPath = await physicalDirectory(join(root, directory), `installed harness payload ${directory}`)
  if (!contained(root, physicalDirectoryPath)) throw new KiError(`installed harness payload ${directory} escapes the harness`, 1)
  const entries = await readdir(physicalDirectoryPath, { withFileTypes: true })
  const files: { path: string; sha256: string }[] = []
  for (const entry of entries) {
    const path = `${directory}/${entry.name}`
    if (entry.isSymbolicLink()) throw new KiError(`installed harness payload ${path} must not be a symlink`, 1)
    if (entry.isDirectory()) files.push(...(await enumerateFiles(root, path)))
    else if (entry.isFile())
      files.push({
        path,
        sha256: createHash('sha256')
          .update(await readFile(join(root, path)))
          .digest('hex')
      })
    else throw new KiError(`installed harness payload ${path} must be a regular file or directory`, 1)
  }
  return files
}

export const createHarnessLock = async (rootPath: string, id: string, archive: HarnessLock['archive']): Promise<HarnessLock> => {
  if (!harnessIdentifier.test(id)) throw new KiError('harness identifier must be an owner/name identifier', 2)
  const root = await physicalDirectory(rootPath, `installed harness ${id}`)
  const files = (
    await Promise.all(
      payloadRoots.map(async (directory) =>
        (await lstat(join(root, directory)).catch(() => undefined)) ? enumerateFiles(root, directory) : []
      )
    )
  )
    .flat()
    .sort((left, right) => left.path.localeCompare(right.path))
  const capabilities: HarnessCapability[] = []
  for (const file of files) {
    if (!file.path.startsWith('skills/') || !file.path.endsWith('/SKILL.md')) continue
    const source = dirname(file.path)
    const metadata = frontmatter(await readFile(join(root, file.path), 'utf8'), file.path)
    const { name } = metadata
    if (!name) throw new KiError(`${file.path} must declare name`, 1)
    const operations = (['audit', 'conform'] as const)
      .filter((mode) => files.some((candidate) => candidate.path === `${source}/scripts/native/${mode}.mjs`))
      .map((mode) => ({
        protocol: 'ki/native-operation@1' as const,
        module: `${source}/scripts/native/${mode}.mjs`,
        export: mode,
        mode
      }))
    capabilities.push({ kind: 'skill', name, source, dependsOn: frontmatterDependencies(metadata['ki-depends-on'], file.path), operations })
  }
  const names = new Set<string>()
  for (const capability of capabilities) {
    if (names.has(capability.name)) throw new KiError(`installed harness ${id} repeats skill ${capability.name}`, 1)
    names.add(capability.name)
  }
  return { schema: 1, id, archive, files, capabilities: capabilities.sort((left, right) => left.name.localeCompare(right.name)) }
}

export const renderHarnessLock = (lock: HarnessLock): string =>
  [
    'schema = 1',
    `id = ${JSON.stringify(lock.id)}`,
    '',
    '[archive]',
    `url = ${JSON.stringify(lock.archive.url)}`,
    `sha256 = ${JSON.stringify(lock.archive.sha256)}`,
    '',
    '[files]',
    ...lock.files.map((file) => `${JSON.stringify(file.path)} = ${JSON.stringify(file.sha256)}`),
    ...lock.capabilities.flatMap((capability) => [
      '',
      `[capabilities.${capability.name}]`,
      'kind = "skill"',
      `source = ${JSON.stringify(capability.source)}`,
      `depends_on = [${capability.dependsOn.map((dependency) => JSON.stringify(dependency)).join(', ')}]`,
      ...capability.operations.flatMap((operation) => [
        '',
        `[capabilities.${capability.name}.operations.${operation.mode}]`,
        'protocol = "ki/native-operation@1"',
        `module = ${JSON.stringify(operation.module)}`,
        `export = ${JSON.stringify(operation.export)}`
      ])
    ]),
    ''
  ].join('\n')

export const verifyHarnessRoot = async (rootPath: string, identifier: string): Promise<HarnessLock> => {
  if (!harnessIdentifier.test(identifier)) throw new KiError('harness identifier must be an owner/name identifier', 2)
  const root = await physicalDirectory(rootPath, `installed harness ${identifier}`)
  const lockPath = join(root, 'harness-lock.toml')
  await regularFile(lockPath, `installed harness ${identifier} lock`)
  const lock = parseHarnessLock(await readFile(lockPath, 'utf8'))
  if (lock.id !== identifier) throw new KiError(`installed harness ${identifier} lock identity does not match its location`, 1)
  await Promise.all(
    lock.files.map(async (file) => {
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
  return lock
}

export const readInstalledHarness = async (dataDirectory: string, identifier: string): Promise<InstalledHarness> => {
  if (!harnessIdentifier.test(identifier)) throw new KiError('harness identifier must be an owner/name identifier', 2)
  const harnesses = await physicalDirectory(join(dataDirectory, 'harnesses'), 'installed harnesses directory')
  const [owner, name] = identifier.split('/') as [string, string]
  const ownerDirectory = await physicalDirectory(join(harnesses, owner), `installed harness ${identifier}`)
  if (!contained(harnesses, ownerDirectory)) throw new KiError(`installed harness ${identifier} escapes the harnesses directory`, 1)
  const root = await physicalDirectory(join(ownerDirectory, name, 'latest'), `installed harness ${identifier}`)
  if (!contained(harnesses, root)) throw new KiError(`installed harness ${identifier} escapes the harnesses directory`, 1)
  return { root, lock: await verifyHarnessRoot(root, identifier) }
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
