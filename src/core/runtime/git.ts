import { realpath } from 'node:fs/promises'
import type { Environment } from '../paths.ts'
import type { Runner } from './runner.ts'

// `git` resolves these from the environment ahead of `-C`, which sets the child's working
// directory without bounding repository discovery. A caller that compares two working-tree
// roots hands both calls the same environment, so an inherited GIT_WORK_TREE would collapse
// both answers onto whatever it names and make any comparison hold vacuously.
const discoveryVariables = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_CEILING_DIRECTORIES'] as const

/** The environment without Git's discovery variables, so `git -C <directory>` answers for that directory. */
export const scrubbedGitEnvironment = (environment: Environment): Environment => {
  const scrubbed: Environment = { ...environment }
  for (const variable of discoveryVariables) delete scrubbed[variable]
  return scrubbed
}

/**
 * The physical root of the Git working tree containing `directory`, or undefined when the
 * directory is not inside one.
 *
 * Scrubbing the discovery variables makes the answer deterministic; it does not make it
 * unspoofable, because a caller able to export them is equally able to write a `.git` file
 * into a directory it controls. Callers comparing two roots are asking a safety question
 * about which working tree receives bytes, not enforcing an isolation boundary.
 */
export const gitWorkingTreeRoot = async (
  directory: string,
  runner: Runner,
  environment: Environment
): Promise<string | undefined> => {
  const reported = await runner(
    'git',
    ['-C', directory, 'rev-parse', '--show-toplevel'],
    scrubbedGitEnvironment(environment)
  )
  if (reported.exitCode !== 0) return undefined
  // Resolve git's output, never the inputs: `--show-toplevel` already reports a physical path,
  // so this only keeps the comparison independent of that normalisation being total. Comparing
  // the inputs instead would refuse a legitimate write anywhere a symlinked prefix is in play.
  return realpath(reported.output.trim())
}

/** The primary checkout, proved by this working tree's own common Git directory and membership list. */
export const gitPrimaryWorkingTreeRoot = async (
  directory: string,
  runner: Runner,
  environment: Environment
): Promise<string | undefined> => {
  const root = await gitWorkingTreeRoot(directory, runner, environment)
  if (root === undefined) return undefined
  const common = await runner(
    'git',
    ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
    scrubbedGitEnvironment(environment)
  )
  if (common.exitCode !== 0) return undefined
  const listing = await runner(
    'git',
    ['--git-dir', common.output.trim(), 'worktree', 'list', '--porcelain', '-z'],
    scrubbedGitEnvironment(environment)
  )
  if (listing.exitCode !== 0) return undefined
  const trees = listing.output
    .split('\0')
    .filter((part) => part.startsWith('worktree '))
    .map((part) => part.slice('worktree '.length))
  if (!trees.includes(root)) return undefined
  return realpath(trees[0] as string)
}
