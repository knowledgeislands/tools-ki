import { realpath } from 'node:fs/promises'
import type { Environment } from '../paths.ts'
import type { Runner } from './runner.ts'

// `git` resolves these from the environment ahead of `-C`, which sets the child's working
// directory without bounding repository discovery. A caller that compares two working-tree
// roots hands both calls the same environment, so an inherited GIT_WORK_TREE would collapse
// both answers onto whatever it names and make any comparison hold vacuously.
const discoveryVariables = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_CEILING_DIRECTORIES'] as const

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
  const scrubbed: Environment = { ...environment }
  for (const variable of discoveryVariables) delete scrubbed[variable]
  const reported = await runner('git', ['-C', directory, 'rev-parse', '--show-toplevel'], scrubbed)
  if (reported.exitCode !== 0) return undefined
  // Resolve git's output, never the inputs: `--show-toplevel` already reports a physical path,
  // so this only keeps the comparison independent of that normalisation being total. Comparing
  // the inputs instead would refuse a legitimate write anywhere a symlinked prefix is in play.
  return realpath(reported.output.trim())
}
