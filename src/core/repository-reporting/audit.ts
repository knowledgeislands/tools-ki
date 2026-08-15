import { basename } from 'node:path'
import type { KiContext } from '../../context.ts'
import { KiError } from '../errors.ts'
import type { ReporterLevel } from '../repository-progress.ts'
import type { Finding, PreparedSkill } from '../runtime.ts'
import { renderTree, type TreeReporter } from '../tree-rendering.ts'
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

const auditSummaryLabel = (summary: AuditRepositorySummary): string =>
  `summary: KI REPO AUDIT on ${basename(summary.repository)} PASS=${summary.passingSkills} WARN=${summary.warningSkills} FAIL=${summary.failingSkills} · FINDINGS: FAIL=${summary.failingFindings} WARN=${summary.warningFindings}`

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
  skills: readonly { readonly identity: string }[]
): TreeReporter => renderOperationFrameStart(context, 'AUDIT', repository, skills)

/** Render the result portion and close one framed audit report. */
export const renderAuditResults = (
  reporter: TreeReporter,
  repository: string,
  reports: readonly AuditSkillReport[],
  reporterLevels: readonly ReporterLevel[],
  registrationFailure?: string
): AuditRepositorySummary => {
  const skillSummaries = reports.map((report) => auditSkillSummary(report.findings))
  const summary = auditRepositorySummary(repository, reports, registrationFailure)
  const results = reporter.section('results', reports.length + Number(Boolean(registrationFailure)))
  for (const [index, report] of reports.entries()) {
    const reportSummary = skillSummaries[index]
    // The aligned map above is fixed by reports.map(); preserve a guard for future changes.
    /* v8 ignore next */
    if (!reportSummary) throw new KiError(`audit report lost summary for ${report.skill.skill.identity}`, 1)
    const visible = report.findings.filter((entry) => reporterLevels.includes(entry.level))
    results.entry({
      label: `${REPORT_ICON[reportSummary.level]} ${report.skill.skill.identity} ${REPORT_LABEL[reportSummary.level].toUpperCase()} · FAIL=${reportSummary.fails} WARN=${reportSummary.warnings}`,
      children: visible.map(findingEntry)
    })
  }
  if (registrationFailure)
    results.entry({
      label: `${REPORT_ICON.fail} local repository registration FAIL [Local repository registration (REPO-REG-1)] — ${registrationFailure}`
    })
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
