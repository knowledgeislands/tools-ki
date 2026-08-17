import {
  type Finding,
  gatherSkillAuditEvidence,
  type PreparedSkill,
  runGatheredSkillAudit
} from '../../runtime/index.ts'
import { runWithEvidenceProgress } from '../progress/run.ts'
import { localRepositoryRegistration, repositorySkillActivation } from './local-state.ts'
import { selectRepositorySkills } from './selection.ts'
import type { RepositoryOperationContext, RepositorySelection } from './types.ts'

export interface RepositoryAuditReport {
  readonly skill: PreparedSkill
  readonly findings: readonly Finding[]
}

export interface RepositoryAuditResult {
  readonly repository: string
  readonly skills: readonly { readonly identity: string }[]
  readonly reports: readonly RepositoryAuditReport[]
  readonly registration?: string
}

export interface RepositoryAuditObserver {
  readonly repositoryStarted: (
    repository: string,
    skills: readonly { readonly identity: string }[],
    index: number
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
  selection: RepositorySelection,
  observer: RepositoryAuditObserver
): Promise<RepositoryAuditOperationResult> => {
  const selected = await selectRepositorySkills(context, selection)
  const completed: RepositoryAuditResult[] = []
  let failed = false
  for (const [index, { repository, skills }] of selected.entries()) {
    observer.repositoryStarted(repository.root, skills, index)
    try {
      const repositorySkills = await repositorySkillActivation(context, repository, skills)
      const results = await runWithEvidenceProgress(
        skills,
        async (skill, evidenceProgress) =>
          gatherSkillAuditEvidence(
            {
              kind: 'repository',
              repository: repository.root,
              userHome: context.homeDirectory,
              lstat: context.lstat,
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
        context.progress.resolved(skills, 'audit', 'root')
      )
      const findings = results.flatMap(({ audit }) => audit.findings)
      const registration = await localRepositoryRegistration(context, repository.root, skills)
      const result: RepositoryAuditResult = {
        repository: repository.root,
        skills,
        reports: results.map(({ skill, audit }) => ({ skill, findings: audit.findings })),
        ...(registration ? { registration } : {})
      }
      completed.push(result)
      observer.repositoryCompleted(result)
      failed ||= Boolean(registration) || findings.some((finding) => finding.level === 'fail')
    } catch (error) {
      observer.repositoryFailed(repository.root)
      throw error
    }
  }
  return { repositories: completed, failed }
}
