import { basename } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import type { KiContext } from '../context.ts'
import { KiError } from './errors.ts'
import type { ReporterLevel } from './repository-progress.ts'
import type { educateSkill, Finding, FixedItem, PreparedSkill } from './runtime.ts'
import { createTreeReporter, renderTree, type TreeEntry, type TreeReporter } from './tree-rendering.ts'

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

const renderOperationFrameStart = (
  context: KiContext,
  operation: 'AUDIT' | 'CONFORM',
  repository: string,
  skills: readonly { readonly identity: string }[]
): TreeReporter => {
  const count = skills.length
  return createTreeReporter((output) => context.stdout.write(output), {
    title: `KI REPO ${operation}`,
    context: [
      { label: `📁 ${basename(repository)} (${repository})` },
      {
        label: `✦ ${count} skill${count === 1 ? '' : 's'} selected`,
        children: skills.map((skill) => ({ label: skill.identity }))
      }
    ]
  })
}

/** Begin one framed audit report before its live progress stream starts. */
export const renderAuditFrameStart = (
  context: KiContext,
  repository: string,
  skills: readonly { readonly identity: string }[]
): TreeReporter => renderOperationFrameStart(context, 'AUDIT', repository, skills)

/** Begin one framed conform report before its live progress stream starts. */
export const renderConformFrameStart = (
  context: KiContext,
  repository: string,
  skills: readonly { readonly identity: string }[]
): TreeReporter => renderOperationFrameStart(context, 'CONFORM', repository, skills)

const findingEntry = (finding: RenderedFinding): TreeEntry => {
  const [label = '', ...continuation] = formatFinding(finding).split('\n')
  return { label, ...(continuation.length ? { continuation } : {}) }
}

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
  reporter.finish({
    label: auditSummaryLabel(summary)
  })
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

/** Render one compact recap after every selected repository completed its audit. */
export const renderMultiRepositoryAuditSummary = (
  context: KiContext,
  summaries: readonly AuditRepositorySummary[]
): void => {
  const totals = summaries.reduce(
    (total, summary) => ({
      passingSkills: total.passingSkills + summary.passingSkills,
      warningSkills: total.warningSkills + summary.warningSkills,
      failingSkills: total.failingSkills + summary.failingSkills,
      failingFindings: total.failingFindings + summary.failingFindings,
      warningFindings: total.warningFindings + summary.warningFindings
    }),
    { passingSkills: 0, warningSkills: 0, failingSkills: 0, failingFindings: 0, warningFindings: 0 }
  )
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
  const totals = summaries.reduce(
    (total, summary) => ({
      passingSkills: total.passingSkills + summary.passingSkills,
      warningSkills: total.warningSkills + summary.warningSkills,
      failingSkills: total.failingSkills + summary.failingSkills,
      failingFindings: total.failingFindings + summary.failingFindings,
      warningFindings: total.warningFindings + summary.warningFindings
    }),
    { passingSkills: 0, warningSkills: 0, failingSkills: 0, failingFindings: 0, warningFindings: 0 }
  )
  context.stdout.write(
    `totals: KI REPO AUDIT PASS=${totals.passingSkills} WARN=${totals.warningSkills} FAIL=${totals.failingSkills} · FINDINGS: FAIL=${totals.failingFindings} WARN=${totals.warningFindings}\n`
  )
}

export const renderEducation = (education: Awaited<ReturnType<typeof educateSkill>>): string[] => [
  education.identity,
  `  Concern: ${education.concern}`,
  `  Scope: ${education.scope.kind === 'repository' ? 'repository' : `user home (${education.scope.paths.join(', ')})`}`,
  ...education.families.flatMap((family) => [
    `  ${family.code}: ${family.title}`,
    `    ${family.description}`,
    `    Standard: ${family.standard}`,
    ...family.items.flatMap((item) => {
      const aspects = [
        ...(item.mechanical ? [item.mechanical.heuristic ? 'M-heuristic' : 'M'] : []),
        ...(item.judgment ? ['J'] : [])
      ].join(' + ')
      return [
        `    ${item.code} [${aspects}]: ${item.title}`,
        `      ${item.description}`,
        `      Sources: ${item.sources.join(', ')}`,
        ...(item.judgment ? [`      Review: ${item.judgment.prompt}`] : [])
      ]
    })
  ])
]

type RenderedFinding = (Finding | FixedItem) & { readonly level: ReporterLevel }

interface SkillReport {
  readonly skill: PreparedSkill
  readonly findings: readonly Finding[]
  readonly fixed?: readonly FixedItem[]
}

const REPORT_ICON: Record<RenderedFinding['level'], string> = {
  fail: '×',
  warn: '!',
  fixed: '↺',
  info: 'i',
  'not-applicable': '–',
  pass: '✓'
}

const REPORT_LABEL: Record<RenderedFinding['level'], string> = {
  fail: 'fail',
  warn: 'warn',
  fixed: 'fixed',
  info: 'info',
  'not-applicable': 'na',
  pass: 'pass'
}

const withFixed = (report: SkillReport): readonly RenderedFinding[] => [
  ...report.findings,
  ...(report.fixed ?? []).map((finding) => ({ ...finding, level: 'fixed' as const }))
]

const formatFinding = (finding: RenderedFinding): string => {
  const safeMessage = stripVTControlCharacters(finding.message)
  const subject = finding.subject ? ` ${finding.subject}` : ''
  const prefix = `${REPORT_ICON[finding.level]} ${REPORT_LABEL[finding.level]}`
  return `${prefix} [${finding.title} (${finding.code})]${subject} — ${safeMessage.replace(/\r?\n/g, '\n    ')}`
}

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
  return `PASS=${countSkills('pass')} WARN=${countSkills('warn')} FAIL=${countSkills('fail')} FIXED=${countSkills('fixed')} · FINDINGS: FAIL=${countFindings('fail')} WARN=${countFindings('warn')} FIXED=${countFindings('fixed')}`
}

/** Render the final conform line without a report frame or per-skill findings. */
export const renderConciseConformSummary = (
  context: KiContext,
  repository: string,
  reports: readonly SkillReport[]
): void => {
  const skillSummaries = reports.map((report) => conformSkillSummary(withFixed(report)))
  context.stdout.write(`summary: KI REPO CONFORM on ${basename(repository)} ${conformSummaryCounts(skillSummaries)}\n`)
}

/**
 * The host owns presentation just as it owns execution. Rubric contracts return
 * structured outcomes; this renderer keeps their item title and evidence subject intact
 * instead of making each harness ship a runner merely to format a report.
 */
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
      label: `${REPORT_ICON[reportSummary.level]} ${report.skill.skill.identity} ${REPORT_LABEL[reportSummary.level].toUpperCase()} · FAIL=${reportSummary.fails} WARN=${reportSummary.warnings} FIXED=${reportSummary.fixed}`,
      children: visible.map(findingEntry)
    })
  }
  reporter.finish({
    label: `summary: KI REPO CONFORM on ${basename(repository)} ${conformSummaryCounts(skillSummaries)}`
  })
}
