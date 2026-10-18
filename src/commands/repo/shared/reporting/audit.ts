import { basename } from 'node:path'
import type { KiContext } from '../../../../context.ts'
import { type AuditVerdictScope, findingInScope } from '../../../../core/repository/index.ts'
import type { AuditCriteria, Finding, PreparedSkill } from '../../../../core/runtime/index.ts'
import { renderTree, type TreeEntry, type TreeReporter } from '../../../presentation/index.ts'
import type { ReporterLevel } from '../progress/index.ts'
import { findingEntry, REPORT_ICON, REPORT_LABEL, renderOperationFrameStart } from './shared.ts'

interface AuditSkillReport {
  readonly skill: PreparedSkill
  readonly findings: readonly Finding[]
  readonly criteria: AuditCriteria
}

export interface AuditRepositorySummary {
  readonly repository: string
  readonly passingSkills: number
  readonly warningSkills: number
  readonly failingSkills: number
  readonly failingFindings: number
  readonly warningFindings: number
  readonly criteria: AuditCriteria
  /** The scoped verdict's own counts when the verdict was narrowed; the counts above stay whole-tree. */
  readonly scope?: {
    readonly paths: number
    readonly failingFindings: number
    readonly warningFindings: number
  }
}

const OUTSIDE_SCOPE = ' (outside scope)'

const NO_CRITERIA: AuditCriteria = { mechanical: 0, evaluated: 0, judgment: 0 }

const addCriteria = (total: AuditCriteria, criteria: AuditCriteria): AuditCriteria => ({
  mechanical: total.mechanical + criteria.mechanical,
  evaluated: total.evaluated + criteria.evaluated,
  judgment: total.judgment + criteria.judgment
})

/** Discloses coverage so a pass with nothing to check never reads as a fully checked pass. */
const criteriaLabel = (criteria: AuditCriteria): string =>
  `CRITERIA: EVALUATED=${criteria.evaluated}/${criteria.mechanical} JUDGMENT=${criteria.judgment}`

const auditSkillSummary = (
  findings: readonly Finding[]
): { readonly level: 'pass' | 'warn' | 'fail'; readonly fails: number; readonly warnings: number } => {
  const fails = findings.filter((finding) => finding.level === 'fail').length
  const warnings = findings.filter((finding) => finding.level === 'warn').length
  return { level: fails ? 'fail' : warnings ? 'warn' : 'pass', fails, warnings }
}

/**
 * The verdict a summary carries: the scoped counts when the verdict was narrowed, otherwise
 * the whole-tree skill verdicts. A registration failure is counted in the failing skills.
 */
const verdictLevel = (summary: Omit<AuditRepositorySummary, 'repository'>): 'pass' | 'warn' | 'fail' => {
  const failing = summary.scope ? summary.scope.failingFindings : summary.failingSkills
  const warning = summary.scope ? summary.scope.warningFindings : summary.warningSkills
  return failing ? 'fail' : warning ? 'warn' : 'pass'
}

const auditSummaryIcon = (summary: Omit<AuditRepositorySummary, 'repository'>): string =>
  REPORT_ICON[verdictLevel(summary)]

const skillCount = (count: number): string => `${count} skill${count === 1 ? '' : 's'}`

const scopeLabel = (scope: NonNullable<AuditRepositorySummary['scope']>): string =>
  `SCOPE: ${scope.paths} path${scope.paths === 1 ? '' : 's'} FAIL=${scope.failingFindings} WARN=${scope.warningFindings}`

const auditCountsLabel = (summary: Omit<AuditRepositorySummary, 'repository'>): string =>
  `PASS=${summary.passingSkills} WARN=${summary.warningSkills} FAIL=${summary.failingSkills} · FINDINGS: FAIL=${summary.failingFindings} WARN=${summary.warningFindings} · ${criteriaLabel(summary.criteria)}`

const auditSummaryLabel = (summary: AuditRepositorySummary): string => {
  const prefix = `summary: KI REPO AUDIT on ${basename(summary.repository)}`
  if (summary.scope)
    return `${prefix} ${REPORT_LABEL[verdictLevel(summary)].toUpperCase()} · ${scopeLabel(summary.scope)} · ${auditCountsLabel(summary)}`
  if (verdictLevel(summary) === 'pass')
    return `${prefix} PASS · ${skillCount(summary.passingSkills)} · ${criteriaLabel(summary.criteria)}`
  return `${prefix} ${auditCountsLabel(summary)}`
}

/** The verdict-scope line in the report frame, naming how many paths narrow the verdict. */
const scopeEntry = (scope: AuditVerdictScope): TreeEntry => ({
  label: `⌖ verdict scoped to ${scope.paths.length} ${scope.source} path${scope.paths.length === 1 ? '' : 's'}`
})

const auditSkillLabel = (report: AuditSkillReport, summary: ReturnType<typeof auditSkillSummary>): string => {
  const result = `${REPORT_ICON[summary.level]} ${report.skill.skill.identity} ${REPORT_LABEL[summary.level].toUpperCase()}`
  return `${result} · FAIL=${summary.fails} WARN=${summary.warnings} · ${criteriaLabel(report.criteria)}`
}

const auditRepositorySummary = (
  repository: string,
  reports: readonly AuditSkillReport[],
  registrationFailure?: string,
  scope?: AuditVerdictScope
): AuditRepositorySummary => {
  const skillSummaries = reports.map((report) => auditSkillSummary(report.findings))
  const scoped = scope
    ? auditSkillSummary(
        reports.flatMap((report) => report.findings).filter((finding) => findingInScope(scope, repository, finding))
      )
    : undefined
  return {
    repository,
    passingSkills: skillSummaries.filter((item) => item.level === 'pass').length,
    warningSkills: skillSummaries.filter((item) => item.level === 'warn').length,
    failingSkills: skillSummaries.filter((item) => item.level === 'fail').length + Number(Boolean(registrationFailure)),
    failingFindings:
      skillSummaries.reduce((total, summary) => total + summary.fails, 0) + Number(Boolean(registrationFailure)),
    warningFindings: skillSummaries.reduce((total, summary) => total + summary.warnings, 0),
    criteria: reports.reduce((total, report) => addCriteria(total, report.criteria), NO_CRITERIA),
    ...(scope && scoped
      ? {
          scope: {
            paths: scope.paths.length,
            // Registration is not a path, so its failure blocks every verdict, scoped or not.
            failingFindings: scoped.fails + Number(Boolean(registrationFailure)),
            warningFindings: scoped.warnings
          }
        }
      : {})
  }
}

/** Whether one repository's audit verdict fails, scoped when the verdict was narrowed. */
export const auditRepositoryFails = (
  repository: string,
  reports: readonly AuditSkillReport[],
  registrationFailure?: string,
  scope?: AuditVerdictScope
): boolean => verdictLevel(auditRepositorySummary(repository, reports, registrationFailure, scope)) === 'fail'

/** Begin one framed audit report before its live progress stream starts. */
export const renderAuditFrameStart = (
  context: KiContext,
  repository: string,
  skills: readonly { readonly identity: string }[],
  compact = false,
  scope?: AuditVerdictScope
): TreeReporter =>
  renderOperationFrameStart(context, 'AUDIT', repository, skills, compact, scope ? [scopeEntry(scope)] : [])

/** Render the result portion and close one framed audit report. */
export const renderAuditResults = (
  reporter: TreeReporter,
  repository: string,
  reports: readonly AuditSkillReport[],
  reporterLevels: readonly ReporterLevel[],
  registrationFailure?: string,
  scope?: AuditVerdictScope
): AuditRepositorySummary => {
  const summary = auditRepositorySummary(repository, reports, registrationFailure, scope)
  const resultReports = reports
    .map((report) => ({ report, summary: auditSkillSummary(report.findings) }))
    .filter(({ summary }) => summary.level !== 'pass')
  if (resultReports.length > 0 || registrationFailure) {
    const results = reporter.section('results', resultReports.length + Number(Boolean(registrationFailure)))
    for (const { report, summary: reportSummary } of resultReports) {
      const visible = report.findings.filter((entry) => reporterLevels.includes(entry.level))
      results.entry({
        label: auditSkillLabel(report, reportSummary),
        children: visible.map((finding) =>
          findingEntry(finding, scope && !findingInScope(scope, repository, finding) ? OUTSIDE_SCOPE : '')
        )
      })
    }
    if (registrationFailure)
      results.entry({
        label: `${REPORT_ICON.fail} local repository registration FAIL [Local repository registration (REPO-REG-1)] — ${registrationFailure}`
      })
  }
  reporter.finish({ label: auditSummaryLabel(summary) })
  return summary
}

/** Render the final audit line without a report frame or per-skill findings. */
export const renderConciseAuditSummary = (
  context: KiContext,
  repository: string,
  reports: readonly AuditSkillReport[],
  registrationFailure?: string,
  scope?: AuditVerdictScope
): AuditRepositorySummary => {
  const summary = auditRepositorySummary(repository, reports, registrationFailure, scope)
  context.stdout.write(`${auditSummaryLabel(summary)}\n`)
  return summary
}

const auditTotals = (summaries: readonly AuditRepositorySummary[]) =>
  summaries.reduce(
    (total, summary) => ({
      passingSkills: total.passingSkills + summary.passingSkills,
      warningSkills: total.warningSkills + summary.warningSkills,
      failingSkills: total.failingSkills + summary.failingSkills,
      failingFindings: total.failingFindings + summary.failingFindings,
      warningFindings: total.warningFindings + summary.warningFindings,
      criteria: addCriteria(total.criteria, summary.criteria)
    }),
    {
      passingSkills: 0,
      warningSkills: 0,
      failingSkills: 0,
      failingFindings: 0,
      warningFindings: 0,
      criteria: NO_CRITERIA
    }
  )

/** Render one compact recap after every selected repository completed its audit. */
export const renderMultiRepositoryAuditSummary = (
  context: KiContext,
  summaries: readonly AuditRepositorySummary[]
): void => {
  const totals = auditTotals(summaries)
  context.stdout.write(
    `\n${renderTree({
      title: 'KI REPO AUDIT · MULTI-REPOSITORY SUMMARY',
      context: summaries.map((summary) => ({
        label: `${auditSummaryIcon(summary)} ${basename(summary.repository)} ${summary.scope ? `${scopeLabel(summary.scope)} · ` : ''}${auditCountsLabel(summary)}`
      })),
      entries: [
        {
          label: `totals: ${auditCountsLabel(totals)}`
        }
      ]
    }).join('\n')}\n`
  )
}

/** Render aggregate audit counts without the multi-repository report frame. */
export const renderConciseMultiRepositoryAuditSummary = (
  context: KiContext,
  summaries: readonly AuditRepositorySummary[]
): void => {
  const totals = auditTotals(summaries)
  context.stdout.write(`totals: KI REPO AUDIT ${auditCountsLabel(totals)}\n`)
}
