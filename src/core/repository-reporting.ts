import { basename } from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import type { KiContext } from '../context.ts'
import { KiError } from './errors.ts'
import type { ResolvedSkill } from './resolution.ts'
import { type educateSkill, type Finding, type FindingLevel, type FixedItem, type PreparedSkill, prepareSkill } from './runtime.ts'

const FALLBACK_TERMINAL_COLUMNS = 80
const PROGRESS_PREFIX = '├─ progress '

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

/**
 * A bar carries two measures. `complete` is finished weight; `started` is finished
 * weight plus the item currently executing. Under sequential execution they differ
 * by exactly one item, and the width of that difference is the point: it shows how
 * large the running item is, which is what explains an apparently stalled bar.
 */
interface BarModel {
  readonly complete: number
  readonly started: number
  /** Undefined while the total is not yet known, which renders an animated sweep. */
  readonly total: number | undefined
  readonly text: string
}

const SGR_RESET = '\x1b[0m'
const SGR_COMPLETE = '\x1b[7m'
const SGR_STARTED = '\x1b[7;2m'
const CURSOR_HIDE = '\x1b[?25l'
const CURSOR_SHOW = '\x1b[?25h'

const terminalColumns = (columns: number | undefined): number =>
  columns !== undefined && Number.isFinite(columns) && columns > 0 ? Math.floor(columns) : FALLBACK_TERMINAL_COLUMNS

/** Resolves the two zone boundaries, in columns, that split a bar into complete, running, and pending. */
const barZones = (model: BarModel, width: number, tick: number): readonly [number, number] => {
  if (model.total === undefined) {
    const band = Math.max(1, Math.floor(width / 8))
    const offset = tick % (width + band)
    return [Math.max(0, Math.min(width, offset - band)), Math.max(0, Math.min(width, offset))]
  }
  const bounded = model.total
  if (bounded <= 0) return [width, width]
  const scale = (value: number): number => Math.max(0, Math.min(width, Math.round((value / bounded) * width)))
  const complete = scale(model.complete)
  return [complete, Math.max(complete, scale(model.started))]
}

const centred = (text: string, width: number): string => {
  const clipped = truncate(text, width)
  return `${' '.repeat(Math.max(0, Math.floor((width - clipped.length) / 2)))}${clipped}`.padEnd(width)
}

/** Draws the status text inside the bar, recolouring it in place at the zone boundaries. */
const styledBar = (model: BarModel, width: number, tick: number): string => {
  const text = centred(model.text, width)
  const [completeEnd, startedEnd] = barZones(model, width, tick)
  const zone = (code: string, span: string): string => (span ? `${code}${span}${SGR_RESET}` : '')
  return `${zone(SGR_COMPLETE, text.slice(0, completeEnd))}${zone(SGR_STARTED, text.slice(completeEnd, startedEnd))}${text.slice(startedEnd)}`
}

/** The plain-stream form keeps the bar beside its text so a log line stays greppable. */
const bracketBar = (model: BarModel, width: number, tick: number): string => {
  const inner = Math.max(0, width - 2)
  const [completeEnd, startedEnd] = barZones(model, inner, tick)
  return `[${'#'.repeat(completeEnd)}${'>'.repeat(startedEnd - completeEnd)}${'.'.repeat(inner - startedEnd)}]`
}

interface RenderOptions {
  readonly columns: number | undefined
  readonly styled: boolean
  readonly tick: number
}

const progressLine = (model: BarModel, { columns, styled, tick }: RenderOptions): string => {
  const width = terminalColumns(columns)
  if (width <= PROGRESS_PREFIX.length) return truncate(model.text, width)
  if (styled) return `${PROGRESS_PREFIX}${styledBar(model, width - PROGRESS_PREFIX.length, tick)}`
  const remaining = width - PROGRESS_PREFIX.length - 1
  // The status text carries the running item, which is the part a reader needs; give the bar the smaller share.
  const barWidth = Math.min(40, Math.floor(remaining / 3))
  if (barWidth < 3) return `${PROGRESS_PREFIX}${truncate(model.text, width - PROGRESS_PREFIX.length)}`
  return `${PROGRESS_PREFIX}${bracketBar(model, barWidth, tick)} ${truncate(model.text, remaining - barWidth)}`.padEnd(width)
}

const elapsed = (milliseconds: number): string => `${(Math.max(0, milliseconds) / 1000).toFixed(1)}s`

interface ProgressTracker {
  readonly loading: (loaded: number, total: number) => void
  readonly planned: (skills: readonly PreparedSkill[]) => void
  readonly start: (skill: PreparedSkill, code: string) => void
  readonly item: (skill: PreparedSkill, code: string) => void
  readonly complete: () => void
  readonly failed: () => void
}

/** Identity keys the tracker; the bare declaration name is what a reader sees. */
interface TrackedSkill {
  readonly identity: string
  readonly name: string
}

interface SkillProgressState {
  readonly complete: number
  readonly started: number
  readonly total: number
  readonly planned: boolean
  readonly status: string
}

const PENDING_STATE: SkillProgressState = { complete: 0, started: 0, total: 0, planned: false, status: 'loading' }

const trackedSkills = (skills: readonly ResolvedSkill[]): readonly TrackedSkill[] =>
  skills.map((skill) => ({ identity: skill.identity, name: skill.declaration.name }))

const trackedPreparedSkills = (skills: readonly PreparedSkill[]): readonly TrackedSkill[] => trackedSkills(skills.map(({ skill }) => skill))

const createProgressTracker = (context: KiContext, options: OperationOptions, skills: readonly TrackedSkill[], phase: string): ProgressTracker | undefined => {
  const enabled = options.progress === 'always' || (options.progress === 'auto' && context.stderr.isTTY === true)
  if (!enabled) return undefined
  const interactive = context.stderr.isTTY === true
  // Reverse video is styling, so NO_COLOR suppresses it exactly as it suppresses colour.
  const { NO_COLOR } = context.environment
  const styled = interactive && !NO_COLOR
  const started = context.now()
  let complete = 0
  let inFlight = 0
  let total: number | undefined
  let tick = 0
  let lastFrame: string | undefined
  let cursorHidden = false
  let lastRunning: string | undefined
  const states = new Map<string, SkillProgressState>(skills.map((skill) => [skill.identity, PENDING_STATE]))
  const skillState = (identity: string): SkillProgressState => {
    const state = states.get(identity)
    // Every caller uses the fixed skill list used to initialise this tracker; this only protects a future refactor.
    /* v8 ignore next */
    if (!state) throw new KiError(`progress lost state for ${identity}`, 1)
    return state
  }
  const hideCursor = (): void => {
    if (!interactive || cursorHidden) return
    context.stderr.write(CURSOR_HIDE)
    cursorHidden = true
  }
  const showCursor = (): void => {
    if (!cursorHidden) return
    context.stderr.write(CURSOR_SHOW)
    cursorHidden = false
  }
  const releaseInterrupt = context.onInterrupt(() => {
    showCursor()
    context.stderr.write('\n')
  })
  const renderOptions = (): RenderOptions => ({ columns: context.stderr.columns, styled, tick })
  /** The trailing counters; the leading detail names the work, which matters more when width is short. */
  const counters = (): string => {
    const clock = elapsed(context.now() - started)
    if (total === undefined) return clock
    const percentage = total === 0 ? 100 : Math.round((complete / total) * 100)
    return `${complete}/${total} ${percentage}% ${clock}`
  }
  const summaryText = (detail: string): string => `${phase} ${detail} · ${counters()}`
  const singleFrame = (text: string): readonly string[] => [progressLine({ complete, started: complete + inFlight, total, text }, renderOptions())]
  const multiFrame = (): readonly string[] => [
    ...skills.map((skill) => {
      const state = skillState(skill.identity)
      const model: BarModel = {
        complete: state.complete,
        started: state.started,
        total: state.planned ? state.total : undefined,
        text: `[${skill.name}] ${state.status}`
      }
      return progressLine(model, renderOptions())
    }),
    progressLine({ complete, started: complete + inFlight, total, text: summaryText(lastRunning ? `running ${lastRunning}` : 'working') }, renderOptions())
  ]
  let renderedRows = 0
  const writeRows = (rows: readonly string[], final: boolean): void => {
    if (options.progressStyle === 'single') {
      context.stderr.write(`${interactive ? '\r\x1b[2K' : ''}${rows[0]}${final || !interactive ? '\n' : ''}`)
      return
    }
    // Only rewind over rows this tracker drew; a list taller than the terminal would
    // otherwise scroll and the cursor-up would overwrite unrelated output.
    const height = Math.max(1, Math.floor(terminalColumns(context.stderr.columns) / 2))
    const rewind = interactive && renderedRows && renderedRows <= height ? `\x1b[${renderedRows}A` : ''
    context.stderr.write(`${rewind}${rows.map((row) => `${interactive ? '\r\x1b[2K' : ''}${row}\n`).join('')}`)
    renderedRows = rows.length
  }
  const render = (text: string, final = false): void => {
    tick += 1
    const rows = options.progressStyle === 'single' ? singleFrame(text) : multiFrame()
    const frame = rows.join('\n')
    // Coalesce identical consecutive frames; a fast rubric otherwise redraws the same line.
    if (!final && frame === lastFrame) return
    lastFrame = frame
    hideCursor()
    writeRows(rows, final)
  }
  const finish = (): void => {
    showCursor()
    releaseInterrupt()
  }
  return {
    loading: (loaded, definitions) => {
      total = undefined
      render(summaryText(`loading ${loaded}/${definitions} definitions`))
    },
    planned: (planned) => {
      total = planned.reduce((count, skill) => count + skill.items.length, 0)
      for (const skill of planned) states.set(skill.skill.identity, { complete: 0, started: 0, total: skill.items.length, planned: true, status: 'pending' })
      render(summaryText('starting'))
    },
    start: (skill, code) => {
      inFlight = 1
      lastRunning = code
      const { identity, declaration } = skill.skill
      const state = skillState(identity)
      states.set(identity, { ...state, started: state.complete + 1, planned: true, total: skill.items.length, status: `running ${code}` })
      render(summaryText(`${declaration.name} running ${code}`))
    },
    item: (skill, code) => {
      complete += 1
      inFlight = 0
      const { identity, declaration } = skill.skill
      const state = skillState(identity)
      const done = state.complete + 1
      states.set(identity, { complete: done, started: done, total: skill.items.length, planned: true, status: code })
      render(summaryText(`${declaration.name} ${code}`))
    },
    complete: () => {
      inFlight = 0
      for (const skill of skills) {
        const state = skillState(skill.identity)
        states.set(skill.identity, { ...state, complete: state.total, started: state.total, status: 'complete' })
      }
      render(summaryText('complete'), true)
      finish()
    },
    failed: () => {
      inFlight = 0
      for (const skill of skills) states.set(skill.identity, { ...skillState(skill.identity), status: 'failed' })
      render(summaryText(lastRunning ? `failed at ${lastRunning}` : 'failed'), true)
      finish()
    }
  }
}

/** Reports the item edges a live progress line needs, narrowed to the item code the renderer displays. */
export interface ItemProgressCodes {
  readonly onItemStart: (code: string) => void
  readonly onItemComplete: (code: string) => void
}

export const runPreparedWithProgress = async <Result>(
  context: KiContext,
  prepared: readonly PreparedSkill[],
  run: (skill: PreparedSkill, progress: ItemProgressCodes) => Promise<Result>,
  options: OperationOptions,
  phase: string,
  existing?: ProgressTracker
): Promise<Result[]> => {
  const progress = existing ?? (prepared.length ? createProgressTracker(context, options, trackedPreparedSkills(prepared), phase) : undefined)
  const results: Result[] = []
  try {
    progress?.planned(prepared)
    for (const skill of prepared) {
      results.push(
        await run(skill, {
          onItemStart: (code) => progress?.start(skill, code),
          onItemComplete: (code) => progress?.item(skill, code)
        })
      )
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
  skills: readonly ResolvedSkill[],
  run: (skill: PreparedSkill, progress: ItemProgressCodes) => Promise<Result>,
  options: OperationOptions,
  phase: string
): Promise<Result[]> => {
  const progress = skills.length ? createProgressTracker(context, options, trackedSkills(skills), phase) : undefined
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
  return runPreparedWithProgress(context, prepared, run, options, phase, progress)
}

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

const auditSkillSummary = (findings: readonly Finding[]): { readonly level: 'pass' | 'warn' | 'fail'; readonly fails: number; readonly warnings: number } => {
  const fails = findings.filter((finding) => finding.level === 'fail').length
  const warnings = findings.filter((finding) => finding.level === 'warn').length
  return { level: fails ? 'fail' : warnings ? 'warn' : 'pass', fails, warnings }
}

const auditSummaryIcon = (summary: Pick<AuditRepositorySummary, 'failingSkills' | 'warningSkills'>): string =>
  summary.failingSkills ? REPORT_ICON.fail : summary.warningSkills ? REPORT_ICON.warn : REPORT_ICON.pass

const renderOperationFrameStart = (
  context: KiContext,
  operation: 'AUDIT' | 'CONFORM',
  repository: string,
  skills: readonly { readonly identity: string }[]
): void => {
  const count = skills.length
  const skillLines = skills.map((skill, index) => `│     ${index === count - 1 ? '╰─' : '├─'} ${skill.identity}`)
  context.stdout.write(
    `${[
      `╭─ KI REPO ${operation}`,
      `│  📁 ${basename(repository)}`,
      `│     ${repository}`,
      `│  ✦ ${count} skill${count === 1 ? '' : 's'} selected`,
      ...skillLines
    ].join('\n')}\n`
  )
}

/** Begin one framed audit report before its live progress stream starts. */
export const renderAuditFrameStart = (context: KiContext, repository: string, skills: readonly { readonly identity: string }[]): void =>
  renderOperationFrameStart(context, 'AUDIT', repository, skills)

/** Begin one framed conform report before its live progress stream starts. */
export const renderConformFrameStart = (context: KiContext, repository: string, skills: readonly { readonly identity: string }[]): void =>
  renderOperationFrameStart(context, 'CONFORM', repository, skills)

/** Render the result portion and close one framed audit report. */
export const renderAuditResults = (
  context: KiContext,
  repository: string,
  reports: readonly AuditSkillReport[],
  reporterLevels: readonly ReporterLevel[],
  registrationFailure?: string
): AuditRepositorySummary => {
  const skillSummaries = reports.map((report) => auditSkillSummary(report.findings))
  const failingFindings = skillSummaries.reduce((total, summary) => total + summary.fails, 0) + Number(Boolean(registrationFailure))
  const warningFindings = skillSummaries.reduce((total, summary) => total + summary.warnings, 0)
  const summary: AuditRepositorySummary = {
    repository,
    passingSkills: skillSummaries.filter((item) => item.level === 'pass').length,
    warningSkills: skillSummaries.filter((item) => item.level === 'warn').length,
    failingSkills: skillSummaries.filter((item) => item.level === 'fail').length + Number(Boolean(registrationFailure)),
    failingFindings,
    warningFindings
  }
  context.stdout.write('├─ results\n')
  for (const [index, report] of reports.entries()) {
    const reportSummary = skillSummaries[index]
    // The aligned map above is fixed by reports.map(); preserve a guard for future changes.
    /* v8 ignore next */
    if (!reportSummary) throw new KiError(`audit report lost summary for ${report.skill.skill.identity}`, 1)
    const last = index === reports.length - 1 && !registrationFailure
    const branch = last ? '╰─' : '├─'
    context.stdout.write(
      `│  ${branch} ${REPORT_ICON[reportSummary.level]} ${report.skill.skill.identity} ${REPORT_LABEL[reportSummary.level].toUpperCase()} · FAIL=${reportSummary.fails} WARN=${reportSummary.warnings}\n`
    )
    const detailPrefix = `│  ${last ? '   ' : '│  '}`
    const visible = report.findings.filter((entry) => reporterLevels.includes(entry.level))
    for (const [findingIndex, finding] of visible.entries()) {
      const findingLast = findingIndex === visible.length - 1
      const findingBranch = findingLast ? '╰─' : '├─'
      const [firstLine = '', ...continuation] = formatFinding(finding).replace(/^ {2}/, '').split('\n')
      context.stdout.write(`${detailPrefix}${findingBranch} ${firstLine}\n`)
      for (const line of continuation) context.stdout.write(`${detailPrefix}${findingLast ? '   ' : '│  '}   ${line}\n`)
    }
  }
  if (registrationFailure)
    context.stdout.write(`│  ╰─ ${REPORT_ICON.fail} local repository registration FAIL [Local repository registration (REPO-REG-1)] — ${registrationFailure}\n`)
  context.stdout.write(
    `╰─ summary: PASS=${summary.passingSkills} WARN=${summary.warningSkills} FAIL=${summary.failingSkills} · FINDINGS: FAIL=${summary.failingFindings} WARN=${summary.warningFindings}\n`
  )
  return summary
}

/** Render one compact recap after every selected repository completed its audit. */
export const renderMultiRepositoryAuditSummary = (context: KiContext, summaries: readonly AuditRepositorySummary[]): void => {
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
  context.stdout.write('\n╭─ KI REPO AUDIT · MULTI-REPOSITORY SUMMARY\n')
  for (const [index, summary] of summaries.entries()) {
    const branch = index === summaries.length - 1 ? '╰─' : '├─'
    context.stdout.write(
      `│  ${branch} ${auditSummaryIcon(summary)} ${basename(summary.repository)} PASS=${summary.passingSkills} WARN=${summary.warningSkills} FAIL=${summary.failingSkills} · FINDINGS: FAIL=${summary.failingFindings} WARN=${summary.warningFindings}\n`
    )
  }
  context.stdout.write(
    `╰─ totals: PASS=${totals.passingSkills} WARN=${totals.warningSkills} FAIL=${totals.failingSkills} · FINDINGS: FAIL=${totals.failingFindings} WARN=${totals.warningFindings}\n`
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
  const prefix = `  ${REPORT_ICON[finding.level]} ${REPORT_LABEL[finding.level].padEnd(5)}`
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

/**
 * The host owns presentation just as it owns execution. Rubric contracts return
 * structured outcomes; this renderer keeps their item title and evidence subject intact
 * instead of making each harness ship a runner merely to format a report.
 */
export const renderConformReports = (context: KiContext, reports: readonly SkillReport[], reporterLevels: readonly ReporterLevel[]): void => {
  const reportFindings = reports.map((report) => ({ report, findings: withFixed(report) }))
  const skillSummaries = reportFindings.map(({ findings }) => conformSkillSummary(findings))
  const countSkills = (level: ReporterLevel): number => skillSummaries.filter((item) => item.level === level).length
  const countFindings = (level: ReporterLevel): number =>
    skillSummaries.reduce((total, item) => total + (level === 'fail' ? item.fails : level === 'warn' ? item.warnings : item.fixed), 0)
  context.stdout.write('├─ results\n')
  for (const [index, { report, findings }] of reportFindings.entries()) {
    const reportSummary = skillSummaries[index]
    // The aligned map above is fixed by reportFindings.map(); preserve a guard for future changes.
    /* v8 ignore next */
    if (!reportSummary) throw new KiError(`conform report lost summary for ${report.skill.skill.identity}`, 1)
    const last = index === reportFindings.length - 1
    const branch = last ? '╰─' : '├─'
    context.stdout.write(
      `│  ${branch} ${REPORT_ICON[reportSummary.level]} ${report.skill.skill.identity} ${REPORT_LABEL[reportSummary.level].toUpperCase()} · FAIL=${reportSummary.fails} WARN=${reportSummary.warnings} FIXED=${reportSummary.fixed}\n`
    )
    const detailPrefix = `│  ${last ? '   ' : '│  '}`
    const visible = findings.filter((finding) => reporterLevels.includes(finding.level))
    for (const [findingIndex, finding] of visible.entries()) {
      const findingLast = findingIndex === visible.length - 1
      const findingBranch = findingLast ? '╰─' : '├─'
      const [firstLine = '', ...continuation] = formatFinding(finding).replace(/^ {2}/, '').split('\n')
      context.stdout.write(`${detailPrefix}${findingBranch} ${firstLine}\n`)
      for (const line of continuation) context.stdout.write(`${detailPrefix}${findingLast ? '   ' : '│  '}   ${line}\n`)
    }
  }
  context.stdout.write(
    `╰─ summary: PASS=${countSkills('pass')} WARN=${countSkills('warn')} FAIL=${countSkills('fail')} FIXED=${countSkills('fixed')} · FINDINGS: FAIL=${countFindings('fail')} WARN=${countFindings('warn')} FIXED=${countFindings('fixed')}\n`
  )
}
