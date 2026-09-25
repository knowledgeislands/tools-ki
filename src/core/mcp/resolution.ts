import { KiError } from '../errors.ts'
import type { Fetcher } from '../harness/acquire.ts'
import type { Environment } from '../paths.ts'
import type { Runner } from '../runtime/runner.ts'
import type { McpSourceAuth } from './types.ts'

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
const REPOSITORY = /^[a-z0-9](?:[a-z0-9-]{0,38})\/[a-z0-9](?:[a-z0-9._-]{0,99})$/

export const mcpRepositoryIdentity = (value: string): string => {
  if (!REPOSITORY.test(value) || value.includes('..'))
    throw new KiError('MCP repository must be a lower-case owner/repository identifier', 2)
  return value
}

export const mcpVersion = (value: string): string => {
  if (!SEMVER.test(value)) throw new KiError('MCP version must be valid Semantic Versioning without a v prefix', 2)
  return value
}

const releaseVersion = (tag: string, explicit: boolean): string => {
  if (!tag.startsWith('v')) throw new KiError('GitHub latest release must use a v<SemVer> tag', 1)
  let version: string
  try {
    version = mcpVersion(tag.slice(1))
  } catch {
    throw new KiError('GitHub latest release must use a v<SemVer> tag', 1)
  }
  if (!explicit && version.includes('-')) throw new KiError('GitHub latest release must not be a prerelease', 1)
  return version
}

const publicLatestTag = async (repository: string, fetcher: Fetcher): Promise<string> => {
  let response: Response
  try {
    response = await fetcher(`https://api.github.com/repos/${repository}/releases/latest`, {
      redirect: 'error',
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
    })
  } catch {
    throw new KiError(`could not resolve latest GitHub release for ${repository}`, 1)
  }
  if (!response.ok)
    throw new KiError(`could not resolve latest GitHub release for ${repository}: HTTP ${response.status}`, 1)
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new KiError(`GitHub latest release response for ${repository} is not valid JSON`, 1)
  }
  const tag = typeof payload === 'object' && payload !== null ? (payload as { tag_name?: unknown }).tag_name : undefined
  if (typeof tag !== 'string') throw new KiError(`GitHub latest release response for ${repository} has no tag`, 1)
  return tag
}

const authenticatedLatestTag = async (
  repository: string,
  runner: Runner,
  environment: Environment
): Promise<string> => {
  let result: Awaited<ReturnType<Runner>>
  try {
    result = await runner('gh', ['api', `repos/${repository}/releases/latest`, '--jq', '.tag_name'], environment)
  } catch {
    throw new KiError('could not resolve private GitHub release; install gh and run gh auth login', 1)
  }
  const tag = result.output.trim()
  if (result.exitCode !== 0 || !tag)
    throw new KiError('could not resolve private GitHub release; install gh and run gh auth login', 1)
  return tag
}

export const resolveMcpRelease = async (options: {
  readonly repository: string
  readonly version?: string
  readonly auth: McpSourceAuth
  readonly fetcher: Fetcher
  readonly runner: Runner
  readonly environment: Environment
}): Promise<{ readonly version: string; readonly tag: string }> => {
  if (options.version !== undefined) {
    const version = mcpVersion(options.version)
    return { version, tag: `v${version}` }
  }
  const tag =
    options.auth === 'github-cli'
      ? await authenticatedLatestTag(options.repository, options.runner, options.environment)
      : await publicLatestTag(options.repository, options.fetcher)
  return { version: releaseVersion(tag, false), tag }
}
