import { basename } from 'node:path'
import { renderTree, type TreeReporter } from '../../../commands/presentation/index.ts'
import type { KiContext } from '../../../context.ts'
import type { Finding, PreparedSkill } from '../../runtime/index.ts'
import type { ReporterLevel } from '../progress/index.ts'
import { findingEntry, REPORT_ICON, REPORT_LABEL, renderOperationFrameStart } from './shared.ts'

interface AuditSkillReport {
  readonly skill: PreparedSkill
  readonly findings: readonly Finding[]
}

export interface AuditRepositorySummary {
  readonly repository: string
  readonly passingSkills: number
  readonly warningSkills: number
  readonly failingSkills: number
  readonly failingFindings: number
  readonly warningFindings: number
}

const auditSkillSummary = (
  findings: readonly Finding[]
): { readonly level: 'pass' | 'warn' | 'fail'; readonly fails: number; readonly warnings: number } => {
  const fails = findings.filter((finding) => finding.level === 'fail').length
  const warnings = findings.filter((finding) => finding.level === 'warn').length
  return { level: fails ? 'fail' : warnings ? 'warn' : 'pass', fails, warnings }
}

const auditSummaryIcon = (summary: Pick<AuditRepositorySummary, 'failingSkills' | 'warningSkills'>): string =>
  summary.failingSkills ? REPORT_ICON.fail : summary.warningSkills ? REPORT_ICON.warn : REPORT_ICON.pass

const skillCount = (count: number): string => `${count} skill${count === 1 ? '' : 's'}`

const auditPassed = (summary: Pick<AuditRepositorySummary, 'failingSkills' | 'warningSkills'>): boolean =>
  summary.failingSkills === 0 && summary.warningSkills === 0

const auditSummaryLabel = (summary: AuditRepositorySummary): string => {
  const prefix = `summary: KI REPO AUDIT on ${basename(summary.repository)}`
  if (auditPassed(summary)) return `${prefix} PASS · ${skillCount(summary.passingSkills)}`
  return `${prefix} PASS=${summary.passingSkills} WARN=${summary.warningSkills} FAIL=${summary.failingSkills} · FINDINGS: FAIL=${summary.failingFindings} WARN=${summary.warningFindings}`
}

const auditSkillLabel = (identity: string, summary: ReturnType<typeof auditSkillSummary>): string => {
  const result = `${REPORT_ICON[summary.level]} ${identity} ${REPORT_LABEL[summary.level].toUpperCase()}`
  return `${result} · FAIL=${summary.fails} WARN=${summary.warnings}`
}

const auditRepositorySummary = (
  repository: string,
  reports: readonly AuditSkillReport[],
  registrationFailure?: string
): AuditRepositorySummary => {
  const skillSummaries = reports.map((report) => auditSkillSummary(report.findings))
  return {
    repository,
    passingSkills: skillSummaries.filter((item) => item.level === 'pass').length,
    warningSkills: skillSummaries.filter((item) => item.level === 'warn').length,
    failingSkills: skillSummaries.filter((item) => item.level === 'fail').length + Number(Boolean(registrationFailure)),
    failingFindings:
      skillSummaries.reduce((total, summary) => total + summary.fails, 0) + Number(Boolean(registrationFailure)),
    warningFindings: skillSummaries.reduce((total, summary) => total + summary.warnings, 0)
  }
}

/** Begin one framed audit report before its live progress stream starts. */
export const renderAuditFrameStart = (
  context: KiContext,
  repository: string,
  skills: readonly { readonly identity: string }[],
  compact = false
): TreeReporter => renderOperationFrameStart(context, 'AUDIT', repository, skills, compact)

/** Render the result portion and close one framed audit report. */
export const renderAuditResults = (
  reporter: TreeReporter,
  repository: string,
  reports: readonly AuditSkillReport[],
  reporterLevels: readonly ReporterLevel[],
  registrationFailure?: string
): AuditRepositorySummary => {
  const summary = auditRepositorySummary(repository, reports, registrationFailure)
  const resultReports = reports
    .map((report) => ({ report, summary: auditSkillSummary(report.findings) }))
    .filter(({ summary }) => summary.level !== 'pass')
  if (resultReports.length > 0 || registrationFailure) {
    const results = reporter.section('results', resultReports.length + Number(Boolean(registrationFailure)))
    for (const { report, summary: reportSummary } of resultReports) {
      const visible = report.findings.filter((entry) => reporterLevels.includes(entry.level))
      results.entry({
        label: auditSkillLabel(report.skill.skill.identity, reportSummary),
        children: visible.map(findingEntry)
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
  registrationFailure?: string
): AuditRepositorySummary => {
  const summary = auditRepositorySummary(repository, reports, registrationFailure)
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
      warningFindings: total.warningFindings + summary.warningFindings
    }),
    { passingSkills: 0, warningSkills: 0, failingSkills: 0, failingFindings: 0, warningFindings: 0 }
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
        label: `${auditSummaryIcon(summary)} ${basename(summary.repository)} PASS=${summary.passingSkills} WARN=${summary.warningSkills} FAIL=${summary.failingSkills} · FINDINGS: FAIL=${summary.failingFindings} WARN=${summary.warningFindings}`
      })),
      entries: [
        {
          label: `totals: PASS=${totals.passingSkills} WARN=${totals.warningSkills} FAIL=${totals.failingSkills} · FINDINGS: FAIL=${totals.failingFindings} WARN=${totals.warningFindings}`
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
  context.stdout.write(
    `totals: KI REPO AUDIT PASS=${totals.passingSkills} WARN=${totals.warningSkills} FAIL=${totals.failingSkills} · FINDINGS: FAIL=${totals.failingFindings} WARN=${totals.warningFindings}\n`
  )
}
