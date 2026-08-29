import { readdir, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'
import { resolveAgora } from '../agora/index.ts'
import { REPOSITORY_DECLARATION_FILE } from '../configuration/index.ts'
import { KiError } from '../errors.ts'
import type { Environment } from '../paths.ts'
import type { Runner } from '../runtime/runner.ts'
import { inspectRepositoryDeclarationState, repositoryDeclarationError } from './declaration.ts'
import { physicalDirectory, type RepositoryLocation, targetFromDirectory } from './location.ts'
import { MGIT_MANIFEST_FILE, repositoriesFromMgitManifest } from './mgit.ts'

export type { RepositoryLocation } from './location.ts'

const isBoundary = (directory: string, homeDirectory: string): boolean =>
  directory === homeDirectory || directory === dirname(directory)

export const discoverRepository = async (
  workingDirectory: string,
  homeDirectory: string
): Promise<RepositoryLocation | null> => {
  const home = await realpath(homeDirectory).catch(() => resolve(homeDirectory))
  let candidate = await realpath(workingDirectory)
  while (!isBoundary(candidate, home)) {
    const state = await inspectRepositoryDeclarationState(candidate)
    if (state.state === 'canonical') return { root: candidate, declaration: state.path }
    if (state.state !== 'absent')
      throw repositoryDeclarationError(
        candidate,
        state,
        `no ${REPOSITORY_DECLARATION_FILE} found from the current working directory`
      )
    candidate = dirname(candidate)
  }
  return null
}

export const resolveRepository = async (options: {
  readonly repository?: string
  readonly workingDirectory: string
  readonly homeDirectory: string
}): Promise<RepositoryLocation> => {
  if (!options.repository) {
    const discovered = await discoverRepository(options.workingDirectory, options.homeDirectory)
    if (discovered) return discovered
    throw new KiError('no KI repository found from the current working directory', 2)
  }
  return targetFromDirectory(
    options.repository,
    '--repo must be an existing directory',
    `--repo must name a repository containing ${REPOSITORY_DECLARATION_FILE}`
  )
}

/** Resolves one physical Git worktree root without requiring a KI declaration. */
export const resolveRepositoryInitialisationTarget = async (options: {
  readonly directory?: string
  readonly workingDirectory: string
  readonly environment: Environment
  readonly runner: Runner
}): Promise<RepositoryLocation> => {
  const requested = resolve(options.workingDirectory, options.directory ?? '.')
  const root = await physicalDirectory(requested, 'ki repo init target must be an existing physical directory')
  const git = await options.runner('git', ['-C', root, 'rev-parse', '--show-toplevel'], options.environment)
  if (git.exitCode !== 0) throw new KiError('ki repo init target must be an existing Git repository', 2)
  const reported = git.output.trim()
  const gitRoot = await physicalDirectory(reported, 'ki repo init target must be an existing Git repository')
  if (gitRoot !== root) throw new KiError('ki repo init target must be the Git repository root', 2)
  const state = await inspectRepositoryDeclarationState(root)
  if (state.state === 'canonical')
    throw new KiError(`ki repo init target already has ${REPOSITORY_DECLARATION_FILE}`, 2)
  if (state.state !== 'absent')
    throw repositoryDeclarationError(root, state, `ki repo init target already has ${REPOSITORY_DECLARATION_FILE}`)
  return { root, declaration: join(root, REPOSITORY_DECLARATION_FILE) }
}

const hasPattern = (value: string): boolean => /[*?]/.test(value)

const globExpression = (value: string): RegExp => {
  let expression = '^'
  for (let index = 0; index < value.length; index += 1) {
    const character = value.charAt(index)
    if (character === '*') {
      if (value[index + 1] === '*') {
        expression += '.*'
        index += 1
      } else expression += `[^${sep}]*`
    } else if (character === '?') expression += `[^${sep}]`
    else expression += character.replace(/[|\\{}()[\]^$+*.]/g, '\\$&')
  }
  return new RegExp(`${expression}$`)
}

const globBase = (pattern: string): string =>
  pattern.slice(0, Math.max(1, pattern.lastIndexOf(sep, pattern.search(/[*?]/))))

const walkDirectories = async (directory: string): Promise<readonly string[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  const directories: string[] = [directory]
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue
    directories.push(...(await walkDirectories(join(directory, entry.name))))
  }
  return directories
}

const expandPattern = async (
  value: string,
  workingDirectory: string,
  source = '--repo'
): Promise<readonly string[]> => {
  const pattern = isAbsolute(value) ? resolve(value) : resolve(workingDirectory, value)
  const base = globBase(pattern)
  await physicalDirectory(base, `${source} pattern ${value} has no existing directory`)
  const expression = globExpression(pattern)
  return (await walkDirectories(base)).filter((directory) => expression.test(directory))
}

const distinctTargets = (targets: readonly RepositoryLocation[], source: string): readonly RepositoryLocation[] => {
  const seen = new Set<string>()
  for (const target of targets) {
    if (seen.has(target.root)) throw new KiError(`${source} selects duplicate repository ${target.root}`, 2)
    seen.add(target.root)
  }
  return targets
}

interface RepositorySelection {
  readonly repositories: readonly string[]
  readonly agora?: string
  readonly estate?: boolean
  readonly configurationDirectory: string
  readonly stateDirectory: string
  readonly workingDirectory: string
  readonly homeDirectory: string
}

const selectRepositoryTargets = async (options: RepositorySelection): Promise<readonly RepositoryLocation[]> => {
  const selectorCount =
    Number(options.repositories.length > 0) + Number(Boolean(options.agora)) + Number(Boolean(options.estate))
  if (selectorCount > 1) throw new KiError('--repo, --agora, and --estate cannot be used together', 2)
  if (options.repositories.length) {
    const targets: RepositoryLocation[] = []
    for (const value of options.repositories) {
      if (!hasPattern(value)) {
        targets.push(
          await targetFromDirectory(
            resolve(options.workingDirectory, value),
            '--repo must be an existing directory',
            `--repo must name a repository containing ${REPOSITORY_DECLARATION_FILE}`
          )
        )
        continue
      }
      const matches = await expandPattern(value, options.workingDirectory)
      if (!matches.length) throw new KiError(`--repo pattern ${value} matched no repositories`, 2)
      for (const match of matches)
        targets.push(await targetFromDirectory(match, `--repo pattern ${value} matched a non-KI directory`))
    }
    return distinctTargets(targets, '--repo')
  }
  const agora = options.estate ? 'estate' : options.agora
  if (agora) {
    const selected = await resolveAgora(options.stateDirectory, agora)
    if (!selected.members.length) throw new KiError(`Agora ${selected.id} has no members`, 2)
    const targets = await Promise.all(
      selected.members.map((member) =>
        targetFromDirectory(
          member.root,
          `Agora ${selected.id} member ${member.repository} must be an existing physical directory`,
          `Agora ${selected.id} member ${member.repository} is not a KI repository`
        )
      )
    )
    return distinctTargets(targets, `Agora ${selected.id}`)
  }
  const working = await realpath(options.workingDirectory)
  const members = await repositoriesFromMgitManifest(working)
  if (members) return distinctTargets(members, MGIT_MANIFEST_FILE)
  return [await resolveRepository({ workingDirectory: options.workingDirectory, homeDirectory: options.homeDirectory })]
}

/**
 * Resolves the repositories every `ki repo` operation runs over.  An empty selection is never a
 * result: an operation that completes over no repository and exits `0` reads as a clean estate to
 * its caller, so selection either yields at least one repository or fails loudly.
 */
export const resolveRepositoryTargets = async (
  options: RepositorySelection
): Promise<readonly RepositoryLocation[]> => {
  const targets = await selectRepositoryTargets(options)
  /* v8 ignore next 3 -- every selector above yields at least one repository or throws, so no CLI
     input reaches this; it keeps a future selector from completing an operation over nothing and
     reporting that silence as success. */
  if (!targets.length)
    throw new KiError('repository selection resolved no repositories; refusing to report success over nothing', 2)
  return targets
}

export * from './operations/index.ts'
export * from './subprocess.ts'
