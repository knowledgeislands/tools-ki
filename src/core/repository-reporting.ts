import { basename } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import type { KiContext } from '../context.ts'
import { KiError } from './errors.ts'
import type { ResolvedSkill } from './resolution.ts'
import { type educateSkill, type Finding, type FindingLevel, type FixedItem, type PreparedSkill, prepareSkill } from './runtime.ts'

const FALLBACK_TERMINAL_COLUMNS = 80
const COMMAND_COLUMN_WIDTH = 10

type ProgressMode = 'auto' | 'always' | 'never'
type ProgressStyle = 'single' | 'multi'
type ReporterLevel = FindingLevel | 'fixed'

interface OperationOptions {
  readonly progress: ProgressMode
  readonly progressStyle: ProgressStyle
  readonly reporterLevels: readonly ReporterLevel[]
}

const REPORTER_LEVELS: readonly ReporterLevel[] = ['fail', 'warn', 'fixed', 'info', 'not-applicable', 'pass']

const defaultReporterLevels = (operation: 'audit' | 'conform'): readonly ReporterLevel[] =>
  operation === 'audit' ? ['fail', 'warn'] : ['fail', 'warn', 'fixed']

const parseProgressMode = (value: string | undefined): ProgressMode => {
  if (value === undefined || value === 'auto' || value === 'always' || value === 'never') return value ?? 'auto'
  throw new KiError('--progress accepts auto, always, or never', 2)
}

const parseProgressStyle = (value: string | undefined): ProgressStyle => {
  if (value === undefined || value === 'single' || value === 'multi') return value ?? 'single'
  throw new KiError('--progress-style accepts single or multi', 2)
}

const parseReporterLevels = (value: string | undefined, operation: 'audit' | 'conform'): readonly ReporterLevel[] => {
  if (value === undefined) return defaultReporterLevels(operation)
  if (value.toLowerCase() === 'all') return REPORTER_LEVELS
  const levels = value
    .split(',')
    .map((level) => level.trim().toLowerCase())
    .filter(Boolean) as ReporterLevel[]
  if (!levels.length || levels.some((level) => !REPORTER_LEVELS.includes(level)))
    throw new KiError('--reporter-levels accepts FAIL, WARN, FIXED, INFO, NOT_APPLICABLE, PASS, or all', 2)
  return [...new Set(levels)]
}

export const operationOptions = (
  operation: 'audit' | 'conform',
  options: { readonly progress?: string; readonly progressStyle?: string; readonly reporterLevels?: string }
): OperationOptions => ({
  progress: parseProgressMode(options.progress),
  progressStyle: parseProgressStyle(options.progressStyle),
  reporterLevels: parseReporterLevels(options.reporterLevels, operation)
})

const truncate = (text: string, width: number): string => {
  if (text.length <= width) return text
  if (width <= 0) return ''
  if (width <= 3) return '.'.repeat(width)
  return `${text.slice(0, width - 3)}...`
}

const progressBar = (width: number, complete?: number, total?: number): string => {
  const innerWidth = width - 2
  if (complete === undefined || total === undefined) return `[>${'.'.repeat(Math.max(0, innerWidth - 1))}]`
  if (total <= 0) return `[${'#'.repeat(innerWidth)}]`
  const clamped = Math.max(0, Math.min(complete, total))
  const filled = clamped === total ? innerWidth : Math.floor((clamped / total) * innerWidth)
  return `[${'#'.repeat(filled)}${'.'.repeat(innerWidth - filled)}]`
}

// Mirrors the established harness aggregate layout: a stable command column, a bar
// consuming half the remaining terminal, and a right-hand live status column.  The
// bar itself is capped at 100 columns so wide terminals do not turn it into noise.
const progressLine = (left: string, right: string, complete: number | undefined, total: number | undefined, columns: number): string => {
  const terminalWidth = Number.isFinite(columns) && columns > 0 ? Math.floor(columns) : FALLBACK_TERMINAL_COLUMNS
  const leftWidth = Math.min(COMMAND_COLUMN_WIDTH, terminalWidth)
  const remainingWidth = terminalWidth - leftWidth - 2
  const barWidth = Math.min(100, Math.floor(remainingWidth / 2))
  const rightWidth = remainingWidth - barWidth
  if (barWidth >= 3 && rightWidth > 0)
    return `${truncate(left, leftWidth).padEnd(leftWidth)} ${progressBar(barWidth, complete, total)} ${truncate(right, rightWidth).padEnd(rightWidth)}`
  return truncate(right, terminalWidth)
}

const elapsed = (milliseconds: number): string => `${(Math.max(0, milliseconds) / 1000).toFixed(1)}s`

interface ProgressTracker {
  readonly loading: (loaded: number, total: number) => void
  readonly planned: (skills: readonly PreparedSkill[]) => void
  readonly item: (skill: PreparedSkill, code: string) => void
  readonly complete: () => void
  readonly failed: () => void
}

interface MultiProgressState {
  readonly complete: number
  readonly total: number
  readonly planned: boolean
  readonly status: string
}

const createProgressTracker = (
  context: KiContext,
  operation: string,
  options: OperationOptions,
  skillNames: readonly string[]
): ProgressTracker | undefined => {
  const enabled = options.progress === 'always' || (options.progress === 'auto' && context.stderr.isTTY === true)
  if (!enabled) return undefined
  const started = context.now()
  let complete = 0
  let total: number | undefined
  const columns = context.stderr.columns ?? FALLBACK_TERMINAL_COLUMNS
  const writeSingle = (right: string, final = false): void =>
    context.stderr.write(
      `${context.stderr.isTTY === true ? '\r\x1b[2K' : ''}${progressLine(
        operation.toUpperCase(),
        right,
        total === undefined ? undefined : complete,
        total,
        columns
      )}${final || context.stderr.isTTY !== true ? '\n' : ''}`
    )
  const states = new Map<string, MultiProgressState>(skillNames.map((skill) => [skill, { complete: 0, total: 0, planned: false, status: 'loading' }]))
  const progressState = (skill: string): MultiProgressState => {
    const state = states.get(skill)
    // Every caller uses the fixed skill list used to initialise this tracker; this only protects a future refactor.
    /* v8 ignore next */
    if (!state) throw new KiError(`progress lost state for ${skill}`, 1)
    return state
  }
  let multiRendered = false
  const renderMulti = (): void => {
    const lines = skillNames.map((skill) => {
      const state = progressState(skill)
      return progressLine(
        operation.toUpperCase(),
        `[${skill}] ${state.status}`,
        state.planned ? state.complete : undefined,
        state.planned ? state.total : undefined,
        columns
      )
    })
    if (context.stderr.isTTY === true && multiRendered) context.stderr.write(`\x1b[${lines.length}A`)
    context.stderr.write(lines.map((line) => `${context.stderr.isTTY === true ? '\r\x1b[2K' : ''}${line}\n`).join(''))
    multiRendered = true
  }
  const render = (right: string, final = false): void => {
    if (options.progressStyle === 'single') writeSingle(right, final)
    else renderMulti()
  }
  return {
    loading: (loaded, definitions) => {
      const detail = `${elapsed(context.now() - started)} loading ${loaded}/${definitions} definitions`
      for (const skill of skillNames) states.set(skill, { complete: 0, total: 0, planned: false, status: detail })
      render(detail)
    },
    planned: (skills) => {
      const itemTotal = skills.reduce((count, skill) => count + skill.items.length, 0)
      total = itemTotal
      for (const skill of skills) states.set(skill.skill.declaration.name, { complete: 0, total: skill.items.length, planned: true, status: 'pending' })
      render(`${complete}/${total} ${total === 0 ? 100 : 0}% starting`)
    },
    item: (skill, code) => {
      complete += 1
      const percentage = Math.round((complete / (total as number)) * 100)
      const name = skill.skill.declaration.name
      const state = progressState(name)
      states.set(name, { complete: state.complete + 1, total: skill.items.length, planned: true, status: code })
      render(`${complete}/${total} ${percentage}% ${name} ${code}`)
    },
    complete: () => {
      for (const skill of skillNames) {
        const state = progressState(skill)
        states.set(skill, { complete: state.total, total: state.total, planned: state.planned, status: 'complete' })
      }
      render(`${total as number}/${total as number} 100% complete`, true)
    },
    failed: () => {
      if (options.progressStyle === 'multi') {
        for (const skill of skillNames) {
          const state = progressState(skill)
          states.set(skill, { ...state, status: 'failed' })
        }
        renderMulti()
      } else if (context.stderr.isTTY === true) context.stderr.write('\n')
    }
  }
}

export const runPreparedWithProgress = async <Result>(
  context: KiContext,
  operation: string,
  prepared: readonly PreparedSkill[],
  run: (skill: PreparedSkill, onItemComplete: (code: string) => void) => Promise<Result>,
  options: OperationOptions,
  progress = prepared.length
    ? createProgressTracker(
        context,
        operation,
        options,
        prepared.map((skill) => skill.skill.declaration.name)
      )
    : undefined
): Promise<Result[]> => {
  const results: Result[] = []
  try {
    progress?.planned(prepared)
    for (const skill of prepared) {
      results.push(await run(skill, (code) => progress?.item(skill, code)))
    }
  } catch (error) {
    progress?.failed()
    throw error
  }
  progress?.complete()
  return results
}

export const runWithProgress = async <Result>(
  context: KiContext,
  operation: string,
  skills: readonly ResolvedSkill[],
  run: (skill: PreparedSkill, onItemComplete: (code: string) => void) => Promise<Result>,
  options: OperationOptions
): Promise<Result[]> => {
  const progress = skills.length
    ? createProgressTracker(
        context,
        operation,
        options,
        skills.map((skill) => skill.declaration.name)
      )
    : undefined
  const prepared: PreparedSkill[] = []
  try {
    progress?.loading(0, skills.length)
    for (const skill of skills) {
      prepared.push(await prepareSkill(skill))
      progress?.loading(prepared.length, skills.length)
    }
  } catch (error) {
    progress?.failed()
    throw error
  }
  return runPreparedWithProgress(context, operation, prepared, run, options, progress)
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
      const aspects = [...(item.mechanical ? [item.mechanical.heuristic ? 'M-heuristic' : 'M'] : []), ...(item.judgment ? ['J'] : [])].join(' + ')
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
  fail: '❌',
  warn: '⚠️ ',
  fixed: '✅',
  info: 'ℹ️ ',
  'not-applicable': '🚫',
  pass: '✅'
}

const REPORT_LABEL: Record<RenderedFinding['level'], string> = {
  fail: 'fail',
  warn: 'warn',
  fixed: 'fixed',
  info: 'info',
  'not-applicable': 'na',
  pass: 'pass'
}

const judgmentItemCount = (skill: PreparedSkill): number =>
  skill.definition.families.reduce((count, family) => count + family.items.filter((item) => item.judgment).length, 0)

const withFixed = (report: SkillReport): readonly RenderedFinding[] => [
  ...report.findings,
  ...(report.fixed ?? []).map((finding) => ({ ...finding, level: 'fixed' as const }))
]

const formatFinding = (finding: RenderedFinding, skill?: string, full = true): string => {
  const safeMessage = stripVTControlCharacters(finding.message)
  const message = full ? safeMessage : safeMessage.replace(/\r?\n[\s\S]*/, '')
  const subject = finding.subject ? ` ${finding.subject}` : ''
  const prefix = `  ${REPORT_ICON[finding.level]} ${REPORT_LABEL[finding.level].padEnd(5)}${skill ? ` ${skill.padEnd(20)}` : ''}`
  return `${prefix} [${finding.title} (${finding.code})]${subject} — ${message.replace(/\r?\n/g, '\n    ')}`
}

const summary = (findings: readonly RenderedFinding[], judgmentUnevaluated: number): string => {
  const count = (level: ReporterLevel): number => findings.filter((finding) => finding.level === level).length
  const icon = count('fail') ? REPORT_ICON.fail : count('warn') ? REPORT_ICON.warn : REPORT_ICON.fixed
  return `  ${icon} summary: FAIL=${count('fail')} WARN=${count('warn')} FIXED=${count('fixed')} JUDGMENT_UNEVALUATED=${judgmentUnevaluated}`
}

const resultLevel = (findings: readonly RenderedFinding[]): ReporterLevel => {
  if (findings.some((finding) => finding.level === 'fail')) return 'fail'
  if (findings.some((finding) => finding.level === 'warn')) return 'warn'
  if (findings.some((finding) => finding.level === 'fixed')) return 'fixed'
  return 'pass'
}

const completion = (findings: readonly RenderedFinding[]): string => {
  const level = resultLevel(findings)
  return `  ${REPORT_ICON[level]} ${REPORT_LABEL[level].padEnd(5)} complete`
}

/**
 * The host owns presentation just as it owns execution. Rubric contracts return
 * structured outcomes; this renderer keeps their item title and evidence subject intact
 * instead of making each harness ship a runner merely to format a report.
 */
export const renderReports = (
  context: KiContext,
  repository: string,
  operation: 'audit' | 'conform',
  reports: readonly SkillReport[],
  reporterLevels: readonly ReporterLevel[]
): void => {
  const reportFindings = reports.map((report) => ({ report, findings: withFixed(report) }))
  for (const { report, findings } of reportFindings) {
    const visible = findings.filter((finding) => reporterLevels.includes(finding.level))
    context.stdout.write(`\n==> [${basename(repository)}][${report.skill.skill.identity}] ${operation}\n`)
    for (const finding of visible) context.stdout.write(`${formatFinding(finding)}\n`)
    context.stdout.write(`${summary(findings, judgmentItemCount(report.skill))}\n`)
    context.stdout.write(`${completion(findings)}\n`)
  }

  const findings = reportFindings.flatMap(({ report, findings: entries }) => entries.map((finding) => ({ finding, skill: report.skill.skill.identity })))
  const visible = findings.filter(({ finding }) => reporterLevels.includes(finding.level))
  const count = (level: ReporterLevel): number => findings.filter(({ finding }) => finding.level === level).length
  const judgmentUnevaluated = reports.reduce((total, report) => total + judgmentItemCount(report.skill), 0)
  context.stdout.write('\n==> recap\n')
  if (!visible.length) {
    const label = findings.length ? `no ${reporterLevels.map((level) => level.toUpperCase().replace('-', '_')).join(' / ')} findings` : 'no findings'
    context.stdout.write(`  ✅ ${label} across ${operation === 'audit' ? 'audited' : 'conformed'} skills\n`)
  } else for (const { finding, skill } of visible) context.stdout.write(`${formatFinding(finding, skill, false)}\n`)
  const icon = count('fail') ? REPORT_ICON.fail : count('warn') ? REPORT_ICON.warn : REPORT_ICON.fixed
  context.stdout.write(`  ${icon} totals: FAIL=${count('fail')} WARN=${count('warn')} FIXED=${count('fixed')} JUDGMENT_UNEVALUATED=${judgmentUnevaluated}\n`)
}
