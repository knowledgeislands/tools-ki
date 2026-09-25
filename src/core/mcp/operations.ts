import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, readlink, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { parse } from 'smol-toml'
import { KiError } from '../errors.ts'
import type { Fetcher } from '../harness/acquire.ts'
import type { Environment } from '../paths.ts'
import type { Runner } from '../runtime/runner.ts'
import { mcpRepositoryIdentity, mcpVersion, resolveMcpRelease } from './resolution.ts'
import {
  MCP_ENTRY_POINT,
  MCP_SOURCE_RECEIPT_SCHEMA,
  MCP_SOURCE_REPORT_SCHEMA,
  type McpSourceAuth,
  type McpSourceInstallation,
  type McpSourceReceipt,
  type McpSourceReport
} from './types.ts'

const COMMIT = /^[0-9a-f]{40}$/

interface McpContext {
  readonly dataDirectory: string
  readonly environment: Environment
  readonly fetcher: Fetcher
  readonly runner: Runner
  readonly now: () => number
}

interface InstallOptions extends McpContext {
  readonly repository: string
  readonly version?: string
  readonly auth?: 'github-cli'
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const physicalDirectory = async (path: string, description: string, create = false): Promise<void> => {
  let state = await lstat(path).catch(() => undefined)
  if (!state && create) {
    await mkdir(path)
    state = await lstat(path)
  }
  if (!state?.isDirectory()) throw new KiError(`${description} must be a physical directory`, 1)
}

const mcpRoot = (dataDirectory: string): string => join(dataDirectory, 'mcp')

const sourceRoot = (dataDirectory: string, repository: string): string =>
  join(mcpRoot(dataDirectory), ...repository.split('/'))

const prepareSourceRoot = async (dataDirectory: string, repository: string): Promise<string> => {
  const dataState = await lstat(dataDirectory).catch(() => undefined)
  if (!dataState) await mkdir(dataDirectory, { recursive: true })
  await physicalDirectory(dataDirectory, 'KI data directory')
  const root = mcpRoot(dataDirectory)
  const [owner] = repository.split('/') as [string, string]
  const ownerRoot = join(root, owner)
  await physicalDirectory(root, 'MCP source directory', true)
  await physicalDirectory(ownerRoot, `MCP source owner ${owner}`, true)
  const source = sourceRoot(dataDirectory, repository)
  await physicalDirectory(source, `MCP source ${repository}`, true)
  await physicalDirectory(join(source, 'versions'), `MCP source versions ${repository}`, true)
  return source
}

const run = async (
  runner: Runner,
  command: string,
  arguments_: readonly string[],
  environment: Environment,
  failure: string
): Promise<string> => {
  let result: Awaited<ReturnType<Runner>>
  try {
    result = await runner(command, arguments_, environment)
  } catch {
    throw new KiError(failure, 1)
  }
  if (result.exitCode !== 0) throw new KiError(failure, 1)
  return result.output.trim()
}

const git = (
  runner: Runner,
  repository: string,
  arguments_: readonly string[],
  environment: Environment,
  failure: string
): Promise<string> => run(runner, 'git', ['--no-optional-locks', '-C', repository, ...arguments_], environment, failure)

const normalizedOrigin = (value: string): string | undefined => {
  const trimmed = value.trim().replace(/\.git$/, '')
  const match =
    trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/#]+)$/i) ??
    trimmed.match(/^git@github\.com:([^/]+)\/([^/#]+)$/i) ??
    trimmed.match(/^ssh:\/\/git@github\.com\/([^/]+)\/([^/#]+)$/i)
  if (!match) return undefined
  return `${match[1]}/${match[2]}`.toLowerCase()
}

const regularFile = async (path: string, description: string): Promise<void> => {
  const state = await lstat(path).catch(() => undefined)
  if (!state?.isFile()) throw new KiError(`${description} must be a regular file`, 1)
}

const sourceDeclaration = async (path: string): Promise<void> => {
  await regularFile(path, 'MCP source .ki.toml')
  let declaration: unknown
  try {
    declaration = parse(await readFile(path, 'utf8'))
  } catch {
    throw new KiError('MCP source .ki.toml must be valid TOML', 1)
  }
  const skills = isRecord(declaration) && isRecord(declaration['skills']) ? declaration['skills'] : undefined
  if (!skills || !isRecord(skills['ki-repo-mcp'])) throw new KiError('MCP source must declare [skills.ki-repo-mcp]', 1)
}

interface PackageEvidence {
  readonly version: string
}

const packageEvidence = async (path: string, selectedVersion: string): Promise<PackageEvidence> => {
  await regularFile(path, 'MCP source package.json')
  let packageJson: unknown
  try {
    packageJson = JSON.parse(await readFile(path, 'utf8'))
  } catch {
    throw new KiError('MCP source package.json must be valid JSON', 1)
  }
  if (!isRecord(packageJson)) throw new KiError('MCP source package.json must be an object', 1)
  if (packageJson['version'] !== selectedVersion)
    throw new KiError(`MCP source package version must match ${selectedVersion}`, 1)
  const scripts = isRecord(packageJson['scripts']) ? packageJson['scripts'] : undefined
  if (typeof scripts?.['build'] !== 'string' || !scripts['build'].trim())
    throw new KiError('MCP source package.json must declare a build script', 1)
  if (packageJson['main'] !== MCP_ENTRY_POINT)
    throw new KiError(`MCP source package.json main must be ${MCP_ENTRY_POINT}`, 1)
  return { version: selectedVersion }
}

const requireLockfile = async (root: string): Promise<void> => {
  const candidates = await Promise.all(
    ['bun.lock', 'bun.lockb'].map(async (name) => {
      const state = await lstat(join(root, name)).catch(() => undefined)
      return Boolean(state?.isFile())
    })
  )
  if (!candidates.some(Boolean)) throw new KiError('MCP source must contain a committed Bun lockfile', 1)
}

const installedAt = (now: () => number): string =>
  new Date(Math.floor(now() / 1000) * 1000).toISOString().replace('.000Z', 'Z')

const receiptPath = (versionRoot: string): string => join(versionRoot, 'receipt.json')

const renderReceipt = (receipt: McpSourceReceipt): string => `${JSON.stringify(receipt, undefined, 2)}\n`

const readReceipt = async (versionRoot: string): Promise<McpSourceReceipt> => {
  await physicalDirectory(versionRoot, 'installed MCP source version')
  await regularFile(receiptPath(versionRoot), 'MCP source receipt')
  let value: unknown
  try {
    value = JSON.parse(await readFile(receiptPath(versionRoot), 'utf8'))
  } catch {
    throw new KiError('MCP source receipt must be valid JSON', 1)
  }
  if (
    !isRecord(value) ||
    value['schema'] !== MCP_SOURCE_RECEIPT_SCHEMA ||
    typeof value['repository'] !== 'string' ||
    typeof value['tag'] !== 'string' ||
    typeof value['commit'] !== 'string' ||
    typeof value['packageVersion'] !== 'string' ||
    value['entryPoint'] !== MCP_ENTRY_POINT ||
    typeof value['installedAt'] !== 'string' ||
    (value['auth'] !== 'public' && value['auth'] !== 'github-cli')
  )
    throw new KiError('MCP source receipt is invalid', 1)
  mcpRepositoryIdentity(value['repository'])
  mcpVersion(value['packageVersion'])
  if (value['tag'] !== `v${value['packageVersion']}` || !COMMIT.test(value['commit']))
    throw new KiError('MCP source receipt provenance is invalid', 1)
  return value as unknown as McpSourceReceipt
}

const activeVersionName = async (root: string): Promise<string> => {
  const active = join(root, 'active')
  const state = await lstat(active).catch(() => undefined)
  if (!state?.isSymbolicLink()) throw new KiError('MCP source active selection must be a symbolic link', 1)
  const target = await readlink(active)
  if (isAbsolute(target) || target.split('/').includes('..') || dirname(target) !== 'versions')
    throw new KiError('MCP source active selection is invalid', 1)
  return basename(target)
}

const activate = async (root: string, versionName: string): Promise<void> => {
  const temporary = join(root, `.active-${randomUUID()}`)
  try {
    await symlink(join('versions', versionName), temporary, 'dir')
    await rename(temporary, join(root, 'active'))
  } catch (error) {
    /* v8 ignore next -- requires a host filesystem failure after creating the same-filesystem temporary link. */
    await rm(temporary, { force: true })
    /* v8 ignore next -- preserves the original host filesystem failure. */
    throw error
  }
}

const sourceInstallations = async (dataDirectory: string, repository: string): Promise<McpSourceInstallation[]> => {
  const root = sourceRoot(dataDirectory, repository)
  await physicalDirectory(root, `installed MCP source ${repository}`)
  const versions = join(root, 'versions')
  await physicalDirectory(versions, `installed MCP source versions ${repository}`)
  const active = await activeVersionName(root)
  const entries = await readdir(versions, { withFileTypes: true })
  const installations: McpSourceInstallation[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (!entry.isDirectory()) throw new KiError('installed MCP source version is unsafe', 1)
    const receipt = await readReceipt(join(versions, entry.name))
    if (receipt.repository !== repository || entry.name !== `${receipt.tag}-${receipt.commit}`)
      throw new KiError('installed MCP source receipt does not match its path', 1)
    installations.push({ ...receipt, active: entry.name === active })
  }
  if (!installations.some((entry) => entry.active))
    throw new KiError('installed MCP source active version is missing', 1)
  return installations.sort((left, right) => left.packageVersion.localeCompare(right.packageVersion))
}

const sourceExists = async (dataDirectory: string, repository: string): Promise<boolean> =>
  Boolean(await lstat(sourceRoot(dataDirectory, repository)).catch(() => undefined))

const install = async (options: InstallOptions, requireExisting: boolean): Promise<McpSourceInstallation> => {
  const repository = mcpRepositoryIdentity(options.repository)
  const exists = await sourceExists(options.dataDirectory, repository)
  if (requireExisting && !exists) throw new KiError(`MCP source ${repository} is not installed`, 1)
  const prior = exists ? await sourceInstallations(options.dataDirectory, repository) : []
  const active = prior.find((entry) => entry.active)
  const auth: McpSourceAuth = options.auth ?? active?.auth ?? 'public'
  const release = await resolveMcpRelease({
    repository,
    ...(options.version === undefined ? {} : { version: options.version }),
    auth,
    fetcher: options.fetcher,
    runner: options.runner,
    environment: options.environment
  })
  const root = await prepareSourceRoot(options.dataDirectory, repository)
  const versions = join(root, 'versions')
  const staging = join(versions, `.install-${randomUUID()}`)
  let promoted: string | undefined
  try {
    const clone =
      auth === 'github-cli'
        ? {
            command: 'gh',
            arguments: [
              'repo',
              'clone',
              repository,
              staging,
              '--',
              '--branch',
              release.tag,
              '--depth',
              '1',
              '--single-branch'
            ]
          }
        : {
            command: 'git',
            arguments: [
              '--no-optional-locks',
              'clone',
              '--branch',
              release.tag,
              '--depth',
              '1',
              '--single-branch',
              `https://github.com/${repository}.git`,
              staging
            ]
          }
    await run(
      options.runner,
      clone.command,
      clone.arguments,
      { ...options.environment, GIT_TERMINAL_PROMPT: '0' },
      `could not clone MCP source ${repository}`
    )
    const origin = normalizedOrigin(
      await git(
        options.runner,
        staging,
        ['remote', 'get-url', 'origin'],
        options.environment,
        'could not verify MCP source origin'
      )
    )
    if (origin !== repository) throw new KiError(`MCP source origin does not match ${repository}`, 1)
    const tagType = await git(
      options.runner,
      staging,
      ['cat-file', '-t', `refs/tags/${release.tag}`],
      options.environment,
      'could not verify MCP source release tag'
    )
    if (tagType !== 'tag') throw new KiError(`MCP source ${release.tag} must be an annotated tag`, 1)
    const commit = await git(
      options.runner,
      staging,
      ['rev-parse', `refs/tags/${release.tag}^{commit}`],
      options.environment,
      'could not resolve MCP source release commit'
    )
    if (!COMMIT.test(commit)) throw new KiError('MCP source release must resolve to a full commit', 1)
    const head = await git(
      options.runner,
      staging,
      ['rev-parse', 'HEAD'],
      options.environment,
      'could not verify MCP source checkout'
    )
    if (head !== commit) throw new KiError('MCP source checkout does not match the release commit', 1)
    await sourceDeclaration(join(staging, '.ki.toml'))
    const package_ = await packageEvidence(join(staging, 'package.json'), release.version)
    await requireLockfile(staging)
    await run(
      options.runner,
      'bun',
      ['--cwd', staging, 'install', '--frozen-lockfile'],
      options.environment,
      `could not install locked dependencies for MCP source ${repository}`
    )
    await run(
      options.runner,
      'bun',
      ['--cwd', staging, 'run', 'build'],
      options.environment,
      `could not build MCP source ${repository}`
    )
    await regularFile(join(staging, MCP_ENTRY_POINT), 'built MCP source entry point')
    const receipt: McpSourceReceipt = {
      schema: MCP_SOURCE_RECEIPT_SCHEMA,
      repository,
      tag: release.tag,
      commit,
      packageVersion: package_.version,
      entryPoint: MCP_ENTRY_POINT,
      installedAt: installedAt(options.now),
      auth
    }
    const conflict = prior.find((entry) => entry.tag === receipt.tag && entry.commit !== receipt.commit)
    if (conflict) throw new KiError(`MCP source tag ${receipt.tag} conflicts with installed provenance`, 1)
    await rm(join(staging, '.git'), { recursive: true, force: true })
    await writeFile(receiptPath(staging), renderReceipt(receipt), { flag: 'wx' })
    const versionName = `${receipt.tag}-${receipt.commit}`
    const destination = join(versions, versionName)
    const destinationState = await lstat(destination).catch(() => undefined)
    if (destinationState) {
      const existing = await readReceipt(destination)
      if (JSON.stringify({ ...existing, installedAt: receipt.installedAt }) !== JSON.stringify(receipt))
        throw new KiError(`installed MCP source ${receipt.tag} has conflicting provenance`, 1)
      await rm(staging, { recursive: true, force: true })
    } else {
      await rename(staging, destination)
      promoted = destination
    }
    /* v8 ignore start -- activation failure requires a host filesystem fault after successful same-filesystem promotion. */
    try {
      await activate(root, versionName)
    } catch (error) {
      if (promoted) await rm(promoted, { recursive: true, force: true })
      throw error
    }
    /* v8 ignore stop */
    return { ...receipt, active: true }
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    if (!exists) await rm(root, { recursive: true, force: true })
    throw error
  }
}

export const installMcpSource = (options: InstallOptions): Promise<McpSourceInstallation> => install(options, false)

export const updateMcpSource = (options: InstallOptions): Promise<McpSourceInstallation> => install(options, true)

export const listMcpSources = async (dataDirectory: string, repository?: string): Promise<McpSourceReport> => {
  const root = mcpRoot(dataDirectory)
  const state = await lstat(root).catch(() => undefined)
  if (!state) {
    if (repository !== undefined) {
      const identity = mcpRepositoryIdentity(repository)
      throw new KiError(`MCP source ${identity} is not installed`, 1)
    }
    return { schema: MCP_SOURCE_REPORT_SCHEMA, installations: [] }
  }
  if (!state.isDirectory()) throw new KiError('MCP source directory must be physical', 1)
  const repositories: string[] = []
  if (repository !== undefined) {
    repositories.push(mcpRepositoryIdentity(repository))
  } else {
    for (const owner of await readdir(root, { withFileTypes: true })) {
      if (!owner.isDirectory()) throw new KiError('MCP source owner directory is unsafe', 1)
      for (const name of await readdir(join(root, owner.name), { withFileTypes: true })) {
        if (!name.isDirectory()) throw new KiError('MCP source repository directory is unsafe', 1)
        repositories.push(mcpRepositoryIdentity(`${owner.name}/${name.name}`))
      }
    }
  }
  const installations = (
    await Promise.all(
      repositories.sort().map(async (identity) => {
        /* v8 ignore start -- the source was just enumerated as a physical directory; only a concurrent deletion reaches this guard. */
        if (!(await sourceExists(dataDirectory, identity))) {
          if (repository !== undefined) throw new KiError(`MCP source ${identity} is not installed`, 1)
          return []
        }
        /* v8 ignore stop */
        return sourceInstallations(dataDirectory, identity)
      })
    )
  ).flat()
  return { schema: MCP_SOURCE_REPORT_SCHEMA, installations }
}

export const rollbackMcpSource = async (
  dataDirectory: string,
  repositoryValue: string,
  versionValue: string
): Promise<McpSourceInstallation> => {
  const repository = mcpRepositoryIdentity(repositoryValue)
  const version = mcpVersion(versionValue)
  const installations = (await listMcpSources(dataDirectory, repository)).installations
  const selected = installations.find((entry) => entry.packageVersion === version)
  if (!selected) throw new KiError(`MCP source ${repository} has no installed version ${version}`, 1)
  await activate(sourceRoot(dataDirectory, repository), `${selected.tag}-${selected.commit}`)
  return { ...selected, active: true }
}

export const uninstallMcpSource = async (dataDirectory: string, repositoryValue: string): Promise<void> => {
  const repository = mcpRepositoryIdentity(repositoryValue)
  await listMcpSources(dataDirectory, repository)
  const root = sourceRoot(dataDirectory, repository)
  const removal = join(dirname(root), `.uninstall-${randomUUID()}`)
  await rename(root, removal)
  try {
    await rm(removal, { recursive: true })
    /* v8 ignore start -- requires a host filesystem failure after a successful same-filesystem rename. */
  } catch (error) {
    await rename(removal, root).catch(() => undefined)
    throw error
  }
  /* v8 ignore stop */
}
