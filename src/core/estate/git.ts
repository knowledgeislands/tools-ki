import { KiError } from '../errors.ts'
import type { EstatePorts } from './model.ts'

const REMOTE = /^(git@github\.com:|ssh:\/\/git@github\.com\/|https:\/\/github\.com\/)([^/]+\/[^/]+?)(\.git)?\/?$/i

/** The lower-case GitHub owner/name a remote URL names, in any supported scheme. */
export const remoteIdentity = (url: string): string | undefined => REMOTE.exec(url)?.[2]?.toLowerCase()

/** The same remote URL naming another identity, keeping its scheme and `.git` suffix. */
export const retargetRemote = (url: string, identity: string): string => {
  const [, prefix, , suffix] = REMOTE.exec(url) as RegExpExecArray
  return `${prefix}${identity}${suffix ?? ''}`
}

export const git = async (
  ports: EstatePorts,
  directory: string,
  arguments_: readonly string[]
): Promise<{ readonly exitCode: number; readonly output: string }> =>
  ports.runner('git', ['-C', directory, ...arguments_], { ...ports.environment, GIT_TERMINAL_PROMPT: '0' })

export const requiredGit = async (
  ports: EstatePorts,
  directory: string,
  arguments_: readonly string[]
): Promise<string> => {
  const result = await git(ports, directory, arguments_)
  if (result.exitCode !== 0)
    throw new KiError(`git ${arguments_.join(' ')} failed in ${directory}: ${result.output.trim()}`, 1)
  return result.output
}
