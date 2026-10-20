import { gatherSkillAuditEvidence, runGatheredSkillAudit } from '../../runtime/audit.ts'
import type { AuditCriteria, Finding, PreparedSkill } from '../../runtime/types.ts'
import { completedAudit, incompleteAudit, recordAuditHealth } from '../audit-health.ts'
import { runWithEvidenceProgress } from '../progress/run.ts'
import { localRepositoryRegistration, repositorySkillActivation } from './local-state.ts'
import { selectRepositorySkills } from './selection.ts'
import type { RepositoryOperationContext, RepositorySelection } from './types.ts'
import {
  type AuditVerdictScope,
  findingInScope,
  resolveVerdictScope,
  type VerdictScopeRequest
} from './verdict-scope.ts'

export interface RepositoryAuditReport {
  readonly skill: PreparedSkill
  readonly findings: readonly Finding[]
  readonly criteria: AuditCriteria
}

export interface RepositoryAuditResult {
  readonly repository: string
  readonly skills: readonly { readonly identity: string }[]
  readonly reports: readonly RepositoryAuditReport[]
  readonly registration?: string
  /** Present when the verdict was scoped; evaluation and rendering stay whole-tree. */
  readonly scope?: AuditVerdictScope
}

export interface RepositoryAuditOptions extends RepositorySelection {
  readonly verdict?: VerdictScopeRequest
}

export interface RepositoryAuditObserver {
  readonly repositoryStarted: (
    repository: string,
    skills: readonly { readonly identity: string }[],
    index: number,
    scope?: AuditVerdictScope
  ) => void
  readonly repositoryCompleted: (result: RepositoryAuditResult) => void
  readonly repositoryFailed: (repository: string) => void
}

export interface RepositoryAuditOperationResult {
  readonly repositories: readonly RepositoryAuditResult[]
  readonly failed: boolean
}

export const auditRepositories = async (
  context: RepositoryOperationContext,
  selection: RepositoryAuditOptions,
  observer: RepositoryAuditObserver
): Promise<RepositoryAuditOperationResult> => {
  const selected = await selectRepositorySkills(context, selection)
  // Only an audit of every declared skill with an unscoped verdict is an island's audit health.
  const recorded = !selection.skill && !selection.verdict
  const completed: RepositoryAuditResult[] = []
  let failed = false
  for (const [index, { repository, skills, resolvedSkills }] of selected.entries()) {
    // Resolved before the frame opens, so an unreadable index fails the command, not the audit.
    const scope = selection.verdict
      ? await resolveVerdictScope(selection.verdict, repository.root, context.runner, context.environment)
      : undefined
    observer.repositoryStarted(repository.root, skills, index, scope)
    try {
      const repositorySkills = await repositorySkillActivation(context, repository, skills)
      const results = await runWithEvidenceProgress(
        skills,
        async (skill, evidenceProgress, packageScriptClaims) =>
          gatherSkillAuditEvidence(
            {
              kind: 'repository',
              repository: repository.root,
              userHome: context.homeDirectory,
              lstat: context.lstat,
              packageScriptClaims,
              ...(repositorySkills ? { repositorySkills: repositorySkills.rubric } : {})
            },
            skill,
            evidenceProgress
          ),
        async (skill, evidence, itemProgress) => ({
          skill,
          audit: await runGatheredSkillAudit(skill, evidence, {
            onItemStart: (item) => itemProgress.onItemStart(item.code),
            onItemComplete: (item) => itemProgress.onItemComplete(item.code),
            onProgressEvent: itemProgress.onProgressEvent
          })
        }),
        context.progress.resolved(skills, 'audit', 'root'),
        resolvedSkills
      )
      const findings = results.flatMap(({ audit }) => audit.findings)
      const registration = await localRepositoryRegistration(context, repository.root, skills)
      if (recorded)
        await recordAuditHealth(
          context.stateDirectory,
          repository.root,
          context.now(),
          completedAudit(findings, registration)
        )
      const result: RepositoryAuditResult = {
        repository: repository.root,
        skills,
        reports: results.map(({ skill, audit }) => ({ skill, findings: audit.findings, criteria: audit.criteria })),
        ...(registration ? { registration } : {}),
        ...(scope ? { scope } : {})
      }
      completed.push(result)
      observer.repositoryCompleted(result)
      const blocking = scope ? findings.filter((finding) => findingInScope(scope, repository.root, finding)) : findings
      failed ||= Boolean(registration) || blocking.some((finding) => finding.level === 'fail')
    } catch (error) {
      observer.repositoryFailed(repository.root)
      if (recorded) await recordAuditHealth(context.stateDirectory, repository.root, context.now(), incompleteAudit)
      throw error
    }
  }
  return { repositories: completed, failed }
}
