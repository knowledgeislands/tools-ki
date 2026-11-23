import type { Environment } from '../paths.ts'
import type { Runner } from '../runtime/runner.ts'
import type { PrunableWorkItem } from './items.ts'

/** A terminal record is due for the standing prune this many days after its terminal state was committed. */
export const STANDING_PRUNE_DAYS = 7

const DAY = 86_400_000

export interface StandingPruneContext {
  readonly runner: Runner
  readonly environment: Environment
  readonly now: () => number
}

/** Whether a terminal record may be pruned without asking the owner, or why it may not yet. */
export type StandingPruneOutcome = { readonly due: true } | { readonly due: false; readonly reason: string }

const git = (context: StandingPruneContext, repository: string, arguments_: readonly string[]) =>
  context.runner('git', ['-C', repository, ...arguments_], context.environment)

/**
 * The upstream default branch as the local checkout last saw it: `origin/HEAD`, else `origin/main` or
 * `origin/master`. Nothing is fetched, so a stale view only delays a prune.
 */
const upstreamDefaultBranch = async (
  context: StandingPruneContext,
  repository: string
): Promise<string | undefined> => {
  const head = await git(context, repository, ['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD'])
  if (head.exitCode === 0) return head.output.trim()
  for (const branch of ['origin/main', 'origin/master']) {
    const found = await git(context, repository, ['rev-parse', '--verify', '-q', `refs/remotes/${branch}`])
    if (found.exitCode === 0) return branch
  }
  return undefined
}

const TERMINAL_STATUS = /^status:\s*['"]?(done|cancelled)['"]?\s*$/m

const isTerminal = (contents: string): boolean => {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(contents)?.[1]
  return frontmatter !== undefined && TERMINAL_STATUS.test(frontmatter)
}

/**
 * The commit that first recorded the record's present terminal state, walking its history back from `HEAD` while
 * each committed version is still `done` or `cancelled`; undefined when `HEAD` does not hold a terminal version.
 */
const terminalCommit = async (
  context: StandingPruneContext,
  repository: string,
  path: string
): Promise<{ readonly commit: string; readonly committedAt: number } | undefined> => {
  // A failed command yields no terminal version, so an unreadable history only leaves the record in place.
  const log = await git(context, repository, ['log', '--format=%H %ct', '--', path])
  let first: { readonly commit: string; readonly committedAt: number } | undefined
  for (const line of log.output.split('\n').filter(Boolean)) {
    const [commit, seconds] = line.split(' ') as [string, string]
    const version = await git(context, repository, ['cat-file', 'blob', `${commit}:./${path}`])
    if (!isTerminal(version.output)) break
    first = { commit, committedAt: Number(seconds) * 1000 }
  }
  return first
}

const isLanded = async (
  context: StandingPruneContext,
  repository: string,
  commit: string,
  upstream: string
): Promise<boolean> =>
  (await git(context, repository, ['merge-base', '--is-ancestor', commit, upstream])).exitCode === 0

/** The commits of this repository that a record's text names, such as its baseline and delivery commits. */
const namedCommits = async (
  context: StandingPruneContext,
  repository: string,
  contents: string
): Promise<readonly string[]> => {
  const candidates = [...new Set(contents.match(/\b[0-9a-f]{7,40}\b/g) ?? [])]
  const commits: string[] = []
  for (const candidate of candidates) {
    const resolved = await git(context, repository, ['rev-parse', '--verify', '-q', `${candidate}^{commit}`])
    if (resolved.exitCode === 0) commits.push(resolved.output.trim())
  }
  return commits
}

/**
 * Decides, for each terminal record, whether the standing prune is due (PRUNE-RECORDS a): the commit that first
 * recorded its `done` or `cancelled` state is at least seven days old, and that commit, with every commit of this
 * repository the record names, is on the upstream default branch. Being due is the deletion authority for that
 * record alone; it never closes or cancels a record.
 */
export const evaluateStandingPrune = async (
  context: StandingPruneContext,
  repository: string,
  records: readonly PrunableWorkItem[]
): Promise<ReadonlyMap<string, StandingPruneOutcome>> => {
  const outcomes = new Map<string, StandingPruneOutcome>()
  if (!records.length) return outcomes
  const upstream = await upstreamDefaultBranch(context, repository)
  for (const { item, path, contents } of records) {
    if (!upstream) {
      outcomes.set(item.id, { due: false, reason: 'no upstream default branch is known' })
      continue
    }
    const terminal = await terminalCommit(context, repository, path)
    if (!terminal) {
      outcomes.set(item.id, { due: false, reason: 'its terminal state is not committed' })
      continue
    }
    const unlanded = []
    for (const commit of [terminal.commit, ...(await namedCommits(context, repository, contents))])
      if (!(await isLanded(context, repository, commit, upstream))) unlanded.push(commit.slice(0, 12))
    if (unlanded.length) {
      outcomes.set(item.id, { due: false, reason: `not landed on ${upstream}: ${[...new Set(unlanded)].join(', ')}` })
      continue
    }
    const days = Math.floor((context.now() - terminal.committedAt) / DAY)
    outcomes.set(
      item.id,
      days >= STANDING_PRUNE_DAYS
        ? { due: true }
        : { due: false, reason: `terminal for ${days} of ${STANDING_PRUNE_DAYS} days` }
    )
  }
  return outcomes
}
