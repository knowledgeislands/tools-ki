import { createHash } from 'node:crypto'
import { lstat, readdir, readFile, readlink } from 'node:fs/promises'
import { join, posix } from 'node:path'
import type { InstalledBackpack } from '../backpack/inspection.ts'
import type { DeclaredSkill, RepositoryDeclaration } from '../configuration/declaration.ts'
import { scrubbedGitEnvironment } from '../runtime/git.ts'
import type { Finding } from '../runtime/types.ts'
import type { RepositoryOperationContext } from './operations/types.ts'

/** Where a vendored skill keeps its committed copy, relative to the repository root. */
export const VENDORED_SKILL_ROOT = '.agents/skills'

const CODE = 'VENDORED-COPY'
const TITLE = 'Vendored skill copy'
const LIMITS = { timeoutMs: 30_000, maxBytes: 8 * 1024 * 1024 } as const

type GitContext = Pick<RepositoryOperationContext, 'runner' | 'environment' | 'platform'>

/** Path to Git blob id, for every file under one tree. */
type Tree = ReadonlyMap<string, string>

const git = async (context: GitContext, cwd: string, arguments_: readonly string[]): Promise<string | undefined> => {
  try {
    const result = await context.runner('git', arguments_, scrubbedGitEnvironment(context.environment), {
      ...LIMITS,
      cwd,
      platform: context.platform
    })
    return result.exitCode === 0 ? (result.stdout ?? result.output) : undefined
  } catch {
    return undefined
  }
}

/** Git's blob id for these bytes, in the object format the commit's own ids use. */
const blobId = (content: Buffer, format: 'sha1' | 'sha256'): string =>
  createHash(format).update(`blob ${content.length}\0`).update(content).digest('hex')

/** One blob in a commit's tree: its full path and Git object id. */
interface CommittedBlob {
  readonly path: string
  readonly id: string
}

/** Every blob in `commit`'s tree, or undefined when the backpack holds no such commit. */
const committedBlobs = async (
  context: GitContext,
  root: string,
  commit: string
): Promise<CommittedBlob[] | undefined> =>
  (await git(context, root, ['ls-tree', '-r', '-z', '--full-tree', `${commit}^{commit}`]))
    ?.split('\0')
    .flatMap((entry) => {
      const match = /^\d{6} blob ([0-9a-f]+)\t(.+)$/su.exec(entry)
      return match ? [{ id: match[1] as string, path: match[2] as string }] : []
    })

/**
 * The directory holding `<name>/SKILL.md` among a commit's blobs. A skill that a backpack
 * once kept in two places is taken from the one its installed copy now uses.
 */
const committedSkillDirectory = (
  blobs: readonly CommittedBlob[],
  backpack: InstalledBackpack,
  name: string
): string | undefined => {
  const candidates = blobs
    .map(({ path }) => path)
    .filter((path) => posix.basename(path) === 'SKILL.md' && posix.basename(posix.dirname(path)) === name)
    .map((path) => posix.dirname(path))
  return candidates.length === 1
    ? candidates[0]
    : candidates.find((candidate) => backpack.capabilities.some((capability) => capability.source === candidate))
}

const walk = async (root: string, relative = ''): Promise<string[]> => {
  const files: string[] = []
  for (const entry of (await readdir(join(root, relative), { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    const path = relative ? posix.join(relative, entry.name) : entry.name
    if (entry.isDirectory()) files.push(...(await walk(root, path)))
    else files.push(path)
  }
  return files
}

/**
 * The copy's files as Git would record them. In a Git checkout these are the tracked and the
 * untracked, unignored files, so an ignored `.DS_Store` is not drift; elsewhere, every file.
 */
const copyTree = async (context: GitContext, copy: string, format: 'sha1' | 'sha256'): Promise<Tree> => {
  const listed = await git(context, copy, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.'])
  const paths =
    listed === undefined ? await walk(copy) : [...new Set(listed.split('\0').filter((path) => path.length > 0))]
  const tree = new Map<string, string>()
  for (const path of paths) {
    const absolute = join(copy, path)
    const state = await lstat(absolute).catch(() => undefined)
    // A tracked file deleted from the working tree is missing from the copy.
    if (!state || state.isDirectory()) continue
    const content = state.isSymbolicLink() ? Buffer.from(await readlink(absolute), 'utf8') : await readFile(absolute)
    tree.set(path, blobId(content, format))
  }
  return tree
}

const listed = (paths: readonly string[]): string =>
  paths.length > 5 ? `${paths.slice(0, 5).join(', ')} and ${paths.length - 5} more` : paths.join(', ')

/** Compares one vendored copy with its recorded commit in the first declared backpack that holds it. */
const vendoredSkillFinding = async (
  context: GitContext,
  repository: string,
  skill: DeclaredSkill & { readonly commit: string },
  backpacks: readonly InstalledBackpack[]
): Promise<Finding> => {
  const copyPath = posix.join(VENDORED_SKILL_ROOT, skill.name)
  const copy = join(repository, VENDORED_SKILL_ROOT, skill.name)
  const short = skill.commit.slice(0, 12)
  const unverified = (reason: string): Finding => ({
    level: 'info',
    code: CODE,
    title: TITLE,
    subject: copyPath,
    message: `vendored ${skill.name} cannot be checked against ${short}: ${reason}`
  })
  const state = await lstat(copy).catch(() => undefined)
  // lstat reports a linked directory as a link, never as a directory.
  if (!state?.isDirectory()) return unverified(`${copyPath} is not a physical directory`)

  for (const backpack of backpacks) {
    const blobs = await committedBlobs(context, backpack.root, skill.commit)
    if (!blobs) continue
    const directory = committedSkillDirectory(blobs, backpack, skill.name)
    if (!directory) return unverified(`${backpack.id} has no ${skill.name} at that commit`)
    const expected: Tree = new Map(
      blobs
        .filter(({ path }) => path.startsWith(`${directory}/`))
        .map(({ path, id }) => [posix.relative(directory, path), id])
    )
    const actual = await copyTree(context, copy, skill.commit.length === 64 ? 'sha256' : 'sha1')
    const changed = [...expected].filter(([path, id]) => actual.has(path) && actual.get(path) !== id).map(([p]) => p)
    const removed = [...expected.keys()].filter((path) => !actual.has(path))
    const added = [...actual.keys()].filter((path) => !expected.has(path))
    if (!changed.length && !removed.length && !added.length)
      return {
        level: 'info',
        code: CODE,
        title: TITLE,
        subject: copyPath,
        message: `vendored ${skill.name} matches ${backpack.id} at ${short}`
      }
    const parts = [
      changed.length ? `${changed.length} changed (${listed(changed)})` : '',
      added.length ? `${added.length} added (${listed(added)})` : '',
      removed.length ? `${removed.length} removed (${listed(removed)})` : ''
    ].filter(Boolean)
    return {
      level: 'warn',
      code: CODE,
      title: TITLE,
      subject: copyPath,
      message: `vendored ${skill.name} has drifted from ${backpack.id} at ${short}: ${parts.join('; ')}; ki leaves the copy alone, so refresh it from the backpack or record the commit it now matches`
    }
  }
  return unverified('no declared backpack is a Git checkout holding that commit')
}

/**
 * Checks each vendored skill that records its backpack commit against that commit. Drift is a
 * warning for the owner to resolve: no repair or conform action ever rewrites the copy.
 */
export const gatherVendoredSkillFindings = async (
  context: GitContext,
  repository: string,
  declaration: RepositoryDeclaration,
  installed: readonly InstalledBackpack[]
): Promise<readonly Finding[]> => {
  const vendored = declaration.skills.filter(
    (skill): skill is DeclaredSkill & { readonly commit: string } =>
      skill.mode === 'vendored' && skill.commit !== undefined
  )
  const backpacks = declaration.backpacks.flatMap((id) => installed.filter((backpack) => backpack.id === id))
  return Promise.all(vendored.map((skill) => vendoredSkillFinding(context, repository, skill, backpacks)))
}

/** Vendored-copy findings accompany the ki-repo report, whose `.ki.toml` contract declares the key. */
export const withVendoredSkillFindings = <T extends { readonly findings: readonly Finding[] }>(
  name: string,
  result: T,
  findings: readonly Finding[]
): T => (name === 'ki-repo' && findings.length ? { ...result, findings: [...result.findings, ...findings] } : result)
