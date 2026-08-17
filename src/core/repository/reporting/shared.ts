import { basename } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import type { KiContext } from '../../../context.ts'
import { createTreeReporter, presentation, type TreeEntry, type TreeReporter } from '../../presentation/index.ts'
import type { Finding, FixedItem, PreparedSkill } from '../../runtime/index.ts'
import type { ReporterLevel } from '../progress/index.ts'

export type RenderedFinding = (Finding | FixedItem) & { readonly level: ReporterLevel }

export interface SkillReport {
  readonly skill: PreparedSkill
  readonly findings: readonly Finding[]
  readonly fixed?: readonly FixedItem[]
}

export const REPORT_ICON: Record<RenderedFinding['level'], string> = {
  fail: presentation('status.audit-fail').terminal,
  warn: presentation('status.warn').terminal,
  fixed: presentation('status.fixed').terminal,
  info: presentation('status.info').terminal,
  'not-applicable': presentation('status.not-applicable').terminal,
  pass: presentation('status.pass').terminal
}

export const REPORT_LABEL: Record<RenderedFinding['level'], string> = {
  fail: 'fail',
  warn: 'warn',
  fixed: 'fixed',
  info: 'info',
  'not-applicable': 'na',
  pass: 'pass'
}

export const renderOperationFrameStart = (
  context: KiContext,
  operation: 'AUDIT' | 'CONFORM',
  repository: string,
  skills: readonly { readonly identity: string }[],
  compact = false
): TreeReporter => {
  const count = skills.length
  return createTreeReporter((output) => context.stdout.write(output), {
    title: `KI REPO ${operation}`,
    context: compact
      ? [{ label: `📁 ${basename(repository)} · ${count} skill${count === 1 ? '' : 's'}` }]
      : [
          { label: `📁 ${basename(repository)} (${repository})` },
          {
            label: `✦ ${count} skill${count === 1 ? '' : 's'} selected`,
            children: skills.map((skill) => ({ label: skill.identity }))
          }
        ]
  })
}

export const withFixed = (report: SkillReport): readonly RenderedFinding[] => [
  ...report.findings,
  ...(report.fixed ?? []).map((finding) => ({ ...finding, level: 'fixed' as const }))
]

const formatFinding = (finding: RenderedFinding): string => {
  const safeMessage = stripVTControlCharacters(finding.message)
  const subject = finding.subject ? ` ${finding.subject}` : ''
  const prefix = `${REPORT_ICON[finding.level]} ${REPORT_LABEL[finding.level]}`
  return `${prefix} [${finding.title} (${finding.code})]${subject} — ${safeMessage.replace(/\r?\n/g, '\n    ')}`
}

export const findingEntry = (finding: RenderedFinding): TreeEntry => {
  const [label = '', ...continuation] = formatFinding(finding).split('\n')
  return { label, ...(continuation.length ? { continuation } : {}) }
}
