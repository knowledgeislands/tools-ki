import { KiError } from '../errors.ts'
import type { Environment } from '../paths.ts'
import type { Runner } from '../runtime/runner.ts'
import type { PrunableWorkItem } from './items.ts'

export interface PruneCommitContext {
  readonly runner: Runner
  readonly environment: Environment
}

export interface PruneCommitMessage {
  readonly subject: string
  readonly body: string
}

const NO_COMMIT_HINT = 'or rerun with --no-commit to delete without committing'

/**
 * The standardised prune commit message: a counted subject and one `- <ID>` body line per record in
 * identifier order, so the commit is findable by identifier and every line stays within commitlint limits.
 */
export const pruneCommitMessage = (ids: readonly string[]): PruneCommitMessage => ({
  subject: `chore(roadmap): prune ${ids.length} done work record${ids.length === 1 ? '' : 's'}`,
  body: [...ids]
    .sort((left, right) => left.localeCompare(right))
    .map((id) => `- ${id}`)
    .join('\n')
})

const git = (context: PruneCommitContext, repository: string, arguments_: readonly string[]) =>
  context.runner('git', ['-C', repository, ...arguments_], context.environment)

const gitFailure = (repository: string, operation: string, output: string): KiError =>
  new KiError(`git ${operation} failed in ${repository}${output.trim() ? `\n${output.trim()}` : ''}`, 1)

/** Runs one Git command that must succeed and returns its output. */
const gitOutput = async (
  context: PruneCommitContext,
  repository: string,
  operation: string,
  arguments_: readonly string[]
): Promise<string> => {
  const result = await git(context, repository, arguments_)
  if (result.exitCode !== 0) throw gitFailure(repository, operation, result.output)
  return result.output
}

const listed = (output: string): readonly string[] => output.split('\0').filter(Boolean)

const named = (records: readonly PrunableWorkItem[], paths: ReadonlySet<string>): string =>
  records
    .filter(({ path }) => paths.has(path))
    .map(({ item }) => item.id)
    .join(', ')

const quoted = (paths: readonly string[]): string => paths.map((path) => `'${path}'`).join(' ')

/** Refuses when the index already holds a change, naming the staged paths relative to the work-tree root. */
const refuseStagedChanges = async (context: PruneCommitContext, repository: string): Promise<void> => {
  const staged = listed(
    await gitOutput(context, repository, 'diff --cached', ['diff', '--cached', '--name-only', '--no-renames', '-z'])
  )
  if (staged.length)
    throw new KiError(
      `repository ${repository} has staged changes (${staged.join(', ')}); commit or unstage them before pruning, ${NO_COMMIT_HINT}`,
      2
    )
}

/**
 * Refuses, without changing anything, unless the repository is a Git work tree with an empty index and every
 * selected record is tracked and unmodified, so the prune commit can contain exactly the record deletions and
 * each record's committed `done` state precedes it.
 */
export const preflightPruneCommit = async (
  context: PruneCommitContext,
  repository: string,
  records: readonly PrunableWorkItem[]
): Promise<void> => {
  const tree = await git(context, repository, ['rev-parse', '--is-inside-work-tree'])
  if (tree.exitCode !== 0 || tree.output.trim() !== 'true')
    throw new KiError(
      `repository ${repository} is not a Git work tree; rerun with --no-commit to delete without committing`,
      2
    )
  await refuseStagedChanges(context, repository)
  const paths = records.map(({ path }) => path)
  const trackedPaths = new Set(
    listed(await gitOutput(context, repository, 'ls-files', ['ls-files', '-z', '--', ...paths]))
  )
  const untracked = new Set(paths.filter((path) => !trackedPaths.has(path)))
  if (untracked.size)
    throw new KiError(
      `work item ${named(records, untracked)} in ${repository} is not committed; commit its done state before pruning, ${NO_COMMIT_HINT}`,
      2
    )
  const changedPaths = new Set(
    listed(await gitOutput(context, repository, 'diff', ['diff', '--name-only', '--relative', '-z', '--', ...paths]))
  )
  const modifiedPaths = new Set(paths.filter((path) => changedPaths.has(path)))
  if (modifiedPaths.size)
    throw new KiError(
      `work item ${named(records, modifiedPaths)} in ${repository} has uncommitted changes; commit its done state before pruning, ${NO_COMMIT_HINT}`,
      2
    )
}

/**
 * Re-checks the index, deletes and stages exactly the selected records, then commits them with the
 * standardised message and the repository's hooks. A commit that fails or throws restores the records from
 * `HEAD`. A commit that a hook widened beyond the record deletions is reported, because it already exists.
 */
export const commitPrune = async (
  context: PruneCommitContext,
  repository: string,
  records: readonly PrunableWorkItem[]
): Promise<{ readonly commit: string; readonly message: PruneCommitMessage }> => {
  const paths = records.map(({ path }) => path)
  // An earlier repository's hooks may have run since the preflight; never sweep a newly staged change in.
  await refuseStagedChanges(context, repository)
  const prefix = (
    await gitOutput(context, repository, 'rev-parse --show-prefix', ['rev-parse', '--show-prefix'])
  ).trim()
  await gitOutput(context, repository, 'rm', ['rm', '--quiet', '--', ...paths])
  const message = pruneCommitMessage(records.map(({ item }) => item.id))
  const restore = () => git(context, repository, ['checkout', 'HEAD', '--', ...paths])
  let commit: Awaited<ReturnType<typeof git>>
  try {
    commit = await git(context, repository, ['commit', '--quiet', '-m', message.subject, '-m', message.body])
  } catch (error) {
    await restore()
    throw error
  }
  if (commit.exitCode !== 0) {
    const restored = await restore()
    const state =
      restored.exitCode === 0
        ? `restored ${paths.length} work item record(s); nothing was pruned`
        : `the record deletions remain staged; restore them with git checkout HEAD -- ${quoted(paths)}`
    throw new KiError(
      `git commit failed in ${repository}; ${state}${commit.output.trim() ? `\n${commit.output.trim()}` : ''}`,
      1
    )
  }
  const head = (await gitOutput(context, repository, 'rev-parse HEAD', ['rev-parse', 'HEAD'])).trim()
  const expected = new Set(paths.map((path) => `${prefix}${path}`))
  const extra = listed(
    await gitOutput(context, repository, 'diff-tree', [
      'diff-tree',
      '-r',
      '--no-commit-id',
      '--no-renames',
      '--name-only',
      '-z',
      'HEAD'
    ])
  ).filter((path) => !expected.has(path))
  if (extra.length)
    throw new KiError(
      `prune commit ${head} in ${repository} also contains ${extra.join(', ')}, which a commit hook staged; inspect it with git show ${head.slice(0, 12)} and amend or revert it`,
      1
    )
  return { commit: head, message }
}
