import { basename } from 'node:path'
import type { KiContext } from '../../context.ts'
import { KiError } from '../errors.ts'
import type { ReporterLevel } from '../repository-progress.ts'
import type { TreeReporter } from '../tree-rendering.ts'
import {
  findingEntry,
  REPORT_ICON,
  REPORT_LABEL,
  type RenderedFinding,
  renderOperationFrameStart,
  type SkillReport,
  withFixed
} from './shared.ts'

interface ConformSkillSummary {
  readonly level: ReporterLevel
  readonly fails: number
  readonly warnings: number
  readonly fixed: number
}

const conformSkillSummary = (findings: readonly RenderedFinding[]): ConformSkillSummary => {
  const count = (level: ReporterLevel): number => findings.filter((finding) => finding.level === level).length
  const fails = count('fail')
  const warnings = count('warn')
  const fixed = count('fixed')
  return { level: fails ? 'fail' : warnings ? 'warn' : fixed ? 'fixed' : 'pass', fails, warnings, fixed }
}

const conformSummaryCounts = (skillSummaries: readonly ConformSkillSummary[]): string => {
  const countSkills = (level: ReporterLevel): number => skillSummaries.filter((item) => item.level === level).length
  const countFindings = (level: ReporterLevel): number =>
    skillSummaries.reduce(
      (total, item) => total + (level === 'fail' ? item.fails : level === 'warn' ? item.warnings : item.fixed),
      0
    )
  const passing = countSkills('pass')
  const warning = countSkills('warn')
  const failing = countSkills('fail')
  const fixed = countSkills('fixed')
  if (!warning && !failing && !fixed) return `PASS · ${passing} skill${passing === 1 ? '' : 's'}`
  return `PASS=${passing} WARN=${warning} FAIL=${failing} FIXED=${fixed} · FINDINGS: FAIL=${countFindings('fail')} WARN=${countFindings('warn')} FIXED=${countFindings('fixed')}`
}

const conformSkillLabel = (identity: string, summary: ConformSkillSummary): string => {
  const result = `${REPORT_ICON[summary.level]} ${identity} ${REPORT_LABEL[summary.level].toUpperCase()}`
  return summary.level === 'pass'
    ? result
    : `${result} · FAIL=${summary.fails} WARN=${summary.warnings} FIXED=${summary.fixed}`
}

/** Begin one framed conform report before its live progress stream starts. */
export const renderConformFrameStart = (
  context: KiContext,
  repository: string,
  skills: readonly { readonly identity: string }[],
  compact = false
): TreeReporter => renderOperationFrameStart(context, 'CONFORM', repository, skills, compact)

/** Render the final conform line without a report frame or per-skill findings. */
export const renderConciseConformSummary = (
  context: KiContext,
  repository: string,
  reports: readonly SkillReport[]
): void => {
  const skillSummaries = reports.map((report) => conformSkillSummary(withFixed(report)))
  context.stdout.write(`summary: KI REPO CONFORM on ${basename(repository)} ${conformSummaryCounts(skillSummaries)}\n`)
}

/** Render structured conform outcomes and close the repository report frame. */
export const renderConformReports = (
  reporter: TreeReporter,
  repository: string,
  reports: readonly SkillReport[],
  reporterLevels: readonly ReporterLevel[]
): void => {
  const reportFindings = reports.map((report) => ({ report, findings: withFixed(report) }))
  const skillSummaries = reportFindings.map(({ findings }) => conformSkillSummary(findings))
  const results = reporter.section('results', reportFindings.length)
  for (const [index, { report, findings }] of reportFindings.entries()) {
    const reportSummary = skillSummaries[index]
    // The aligned map above is fixed by reportFindings.map(); preserve a guard for future changes.
    /* v8 ignore next */
    if (!reportSummary) throw new KiError(`conform report lost summary for ${report.skill.skill.identity}`, 1)
    const visible = findings.filter((finding) => reporterLevels.includes(finding.level))
    results.entry({
      label: conformSkillLabel(report.skill.skill.identity, reportSummary),
      children: visible.map(findingEntry)
    })
  }
  reporter.finish({
    label: `summary: KI REPO CONFORM on ${basename(repository)} ${conformSummaryCounts(skillSummaries)}`
  })
}
