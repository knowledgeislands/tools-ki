import type { ResolvedSkill } from '../configuration/index.ts'
import type { Finding } from '../runtime/types.ts'
import type { RepositoryOperationContext } from './operations/types.ts'

interface GitOverviewEvidence {
  readonly gitOverview?: unknown
  readonly findings: readonly Finding[]
}

/** Acquire only producer evidence. The selected Harness catalogue owns its interpretation. */
export const gatherGitOverview = async (
  context: Pick<RepositoryOperationContext, 'runner' | 'environment' | 'platform'>,
  repository: string,
  skills: readonly ResolvedSkill[]
): Promise<GitOverviewEvidence> => {
  if (!skills.some((skill) => skill.declaration.name === 'ki-git')) return { findings: [] }
  try {
    const result = await context.runner('mgit', ['--ignore', '--physical', 'overview', '--json'], context.environment, {
      cwd: repository,
      timeoutMs: 30_000,
      maxBytes: 8 * 1024 * 1024,
      platform: context.platform
    })
    if (result.exitCode !== 0 && result.exitCode !== 1) throw new Error(`mgit exited with status ${result.exitCode}`)
    if (result.stdout === undefined) throw new Error('mgit returned no stdout')
    return { gitOverview: JSON.parse(result.stdout), findings: [] }
  } catch (error) {
    return {
      findings: [
        {
          level: 'warn',
          code: 'GIT-OVERVIEW',
          title: 'Git overview acquisition',
          subject: repository,
          message: `Git overview evidence unavailable for ${repository}: ${error instanceof Error ? error.message : String(error)}`
        }
      ]
    }
  }
}

/** Acquisition warnings accompany the owning skill without substituting for catalogue outcomes. */
export const withGitOverviewFindings = <T extends { readonly findings: readonly Finding[] }>(
  name: string,
  result: T,
  evidence: GitOverviewEvidence
): T => (name === 'ki-git' ? { ...result, findings: [...result.findings, ...evidence.findings] } : result)
