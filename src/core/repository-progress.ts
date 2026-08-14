import type { KiContext } from '../context.ts'
import { KiError } from './errors.ts'
import type { ResolvedSkill } from './resolution.ts'
import {
  EVIDENCE_STAGE_LABEL,
  type FindingLevel,
  type PreparedSkill,
  prepareSkill,
  type RubricProgressReport
} from './runtime.ts'
import { treeProgressPrefix } from './tree-rendering.ts'

const FALLBACK_TERMINAL_COLUMNS = 80
const REFRESH_INTERVAL_MS = 250
type ProgressMode = 'auto' | 'always' | 'never'
type ProgressStyle = 'single' | 'multi'
type TimingsPlacement = 'root' | 'last-root'
export type ReporterLevel = FindingLevel | 'fixed'
type ProgressPhase = 'loading' | 'evidence' | 'audit' | 'conform' | 'educate' | 're-audit'
const PROGRESS_PHASES: readonly ProgressPhase[] = ['loading', 'evidence', 'audit', 'conform', 'educate', 're-audit']

interface OperationOptions {
  readonly progress: ProgressMode
  readonly progressStyle: ProgressStyle
  readonly reporterLevels: readonly ReporterLevel[]
  readonly concise: boolean
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

const operationProgress = (options: { readonly progress?: string; readonly concise?: boolean }): ProgressMode => {
  const progress = parseProgressMode(options.progress)
  return options.concise ? 'never' : progress
}

export const operationOptions = (
  operation: 'audit' | 'conform',
  options: {
    readonly progress?: string
    readonly progressStyle?: string
    readonly reporterLevels?: string
    readonly concise?: boolean
  }
): OperationOptions => ({
  progress: operationProgress(options),
  progressStyle: parseProgressStyle(options.progressStyle),
  reporterLevels: parseReporterLevels(options.reporterLevels, operation),
  concise: Boolean(options.concise)
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
  // An item in flight always occupies at least one column. Without this a run with more
  // items than the bar has columns rounds the band away entirely and shows no work starting.
  if (model.started <= model.complete) return [complete, complete]
  return [Math.min(complete, width - 1), Math.max(Math.min(complete, width - 1) + 1, scale(model.started))]
}

/** Keeps the bar beside its status so all terminal themes expose its three states. */
const bracketBar = (model: BarModel, width: number, tick: number): string => {
  const inner = Math.max(0, width - 2)
  const [completeEnd, startedEnd] = barZones(model, inner, tick)
  return `[${'#'.repeat(completeEnd)}${'>'.repeat(startedEnd - completeEnd)}${'.'.repeat(inner - startedEnd)}]`
}

interface RenderOptions {
  readonly columns: number | undefined
  readonly label: string
  readonly placement?: 'root' | 'child' | 'last-child' | 'last-root'
  readonly tick: number
}

const progressLine = (model: BarModel, { columns, label, placement, tick }: RenderOptions): string => {
  const prefix = treeProgressPrefix(label, placement)
  const width = terminalColumns(columns)
  if (width <= prefix.length) return truncate(model.text, width)
  const remaining = width - prefix.length - 1
  // The status text carries the running item, which is the part a reader needs; give the bar the smaller share.
  const barWidth = Math.min(40, Math.floor(remaining / 3))
  if (barWidth < 3) return `${prefix}${truncate(model.text, width - prefix.length)}`
  return `${prefix}${bracketBar(model, barWidth, tick)} ${truncate(model.text, remaining - barWidth)}`.padEnd(width)
}

const elapsedTenths = (milliseconds: number): number => Math.round(Math.max(0, milliseconds) / 100)
const formatTenths = (tenths: number): string => `${(tenths / 10).toFixed(1)}s`
const elapsed = (milliseconds: number): string => formatTenths(elapsedTenths(milliseconds))

interface ProgressTracker {
  readonly loading: (loaded: number, total: number) => void
  readonly evidence: (gathered: number, total: number) => void
  readonly planned: (skills: readonly PreparedSkill[]) => void
  readonly start: (skill: PreparedSkill, code: string) => void
  readonly item: (skill: PreparedSkill, code: string) => void
  readonly report: (skill: PreparedSkill, event: RubricProgressReport) => void
  readonly complete: () => void
  readonly failed: () => void
}

/** A live evidence detail retains its own time and final state beneath the evidence phase. */
interface EvidenceProgressRow {
  readonly skill: string
  readonly detail: string
  readonly started: number
  readonly count?: { readonly completed: number; readonly total: number }
  readonly completedAt?: number
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
  /** True while the skill's session holds a named stage open, whose extent is unmeasured. */
  readonly staged: boolean
  readonly status: string
}

const PENDING_STATE: SkillProgressState = {
  complete: 0,
  started: 0,
  total: 0,
  planned: false,
  staged: false,
  status: 'loading'
}

const trackedSkills = (skills: readonly ResolvedSkill[]): readonly TrackedSkill[] =>
  skills.map((skill) => ({ identity: skill.identity, name: skill.declaration.name }))

const trackedPreparedSkills = (skills: readonly PreparedSkill[]): readonly TrackedSkill[] =>
  trackedSkills(skills.map(({ skill }) => skill))

const createProgressTracker = (
  context: KiContext,
  options: OperationOptions,
  skills: readonly TrackedSkill[],
  phase: string,
  timingsPlacement: TimingsPlacement
): ProgressTracker | undefined => {
  const enabled = options.progress === 'always' || (options.progress === 'auto' && context.stdout.isTTY === true)
  if (!enabled) return undefined
  const interactive = context.stdout.isTTY === true
  const started = context.now()
  let phaseStarted = started
  let activePhase: ProgressPhase = 'loading'
  const timings: { phase: ProgressPhase; elapsed: number }[] = []
  let complete = 0
  let inFlight = 0
  let total: number | undefined
  let completedItems = 0
  let totalItems: number | undefined
  let tick = 0
  let lastFrame: string | undefined
  let cursorHidden = false
  let lastRunning: string | undefined
  const stages = new Map<string, readonly string[]>()
  const evidenceRows: EvidenceProgressRow[] = []
  const activeEvidenceRows = new Map<string, EvidenceProgressRow>()
  // A child has one additional tree level. Reserve that three-column difference on root rows so
  // phase and skill bars share one visual column without making the renderer understand skills.
  const childLabelWidth = Math.max(9, ...skills.map((skill) => skill.name.length))
  const rootLabelWidth = childLabelWidth + 3
  let loading: { readonly loaded: number; readonly total: number } | undefined
  let evidence: { readonly gathered: number; readonly total: number } | undefined
  let batchedEvidence = false
  let completedEvidence = 0
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
    context.stdout.write(CURSOR_HIDE)
    cursorHidden = true
  }
  const showCursor = (): void => {
    if (!cursorHidden) return
    context.stdout.write(CURSOR_SHOW)
    cursorHidden = false
  }
  const releaseInterrupt = context.onInterrupt(() => {
    showCursor()
    context.stdout.write('\n')
  })
  const renderOptions = (
    label = activePhase.padEnd(rootLabelWidth),
    placement: RenderOptions['placement'] = 'root'
  ): RenderOptions => ({ columns: context.stdout.columns, label, placement, tick })
  const openPhase = (next: ProgressPhase): void => {
    if (activePhase === next) return
    const transitioned = context.now()
    timings.push({ phase: activePhase, elapsed: transitioned - phaseStarted })
    activePhase = next
    phaseStarted = transitioned
  }
  const countsOf = (done: number, of: number): string =>
    `${done}/${of} ${of === 0 ? 100 : Math.round((done / of) * 100)}%`
  /** The trailing counters; the leading detail names the work, which matters more when width is short. */
  const counters = (): string => {
    const clock = elapsed(context.now() - phaseStarted)
    if (loading) return `${countsOf(loading.loaded, loading.total)} ${clock}`
    if (evidence) return `${countsOf(evidence.gathered, evidence.total)} ${clock}`
    if (totalItems === undefined) return clock
    return `${countsOf(completedItems, totalItems)} ${clock}`
  }
  const summaryText = (detail: string): string => `${detail} · ${counters()}`
  const barModel = (text: string): BarModel => {
    if (loading) return { complete: loading.loaded, started: loading.loaded, total: loading.total, text }
    if (evidence) return { complete: evidence.gathered, started: evidence.gathered, total: evidence.total, text }
    return { complete, started: complete + inFlight, total, text }
  }
  const evidenceRowModel = (row: EvidenceProgressRow): BarModel => {
    const duration = elapsed((row.completedAt ?? context.now()) - row.started)
    if (row.completedAt !== undefined)
      return { complete: 1, started: 1, total: 1, text: `${row.detail} complete · ${duration}` }
    if (row.count)
      return {
        complete: row.count.completed,
        started: row.count.completed,
        total: row.count.total,
        text: `${row.detail} · ${countsOf(row.count.completed, row.count.total)} ${duration}`
      }
    return { complete: 0, started: 0, total: undefined, text: `${row.detail} · ${duration}` }
  }
  const evidenceFrame = (text: string): readonly string[] => [
    progressLine(barModel(text), renderOptions()),
    ...evidenceRows.map((row) =>
      progressLine(evidenceRowModel(row), renderOptions(row.skill.padEnd(childLabelWidth), 'child'))
    )
  ]
  const singleFrame = (text: string): readonly string[] =>
    activePhase === 'evidence' ? evidenceFrame(text) : [progressLine(barModel(text), renderOptions())]
  const multiFrame = (): readonly string[] =>
    activePhase === 'evidence'
      ? evidenceFrame(summaryText('gathering evidence'))
      : [
          ...skills.map((skill) => {
            const state = skillState(skill.identity)
            const model: BarModel = {
              complete: state.complete,
              started: state.started,
              total: state.planned && !state.staged ? state.total : undefined,
              text: `[${skill.name}] ${state.status}`
            }
            return progressLine(model, renderOptions())
          }),
          progressLine(barModel(summaryText(lastRunning ? `running ${lastRunning}` : 'working')), renderOptions())
        ]
  let renderedRows = 0
  const writeRows = (rows: readonly string[], final: boolean): void => {
    const lineBreak = interactive ? '\r\n' : '\n'
    if (rows.length === 1 && renderedRows <= 1) {
      context.stdout.write(`${interactive ? '\r\x1b[2K' : ''}${rows[0]}${final || !interactive ? lineBreak : ''}`)
      renderedRows = final ? 0 : 1
      return
    }
    // Only rewind over rows this tracker drew; a list taller than the terminal would
    // otherwise scroll and the cursor-up would overwrite unrelated output.
    const height = Math.max(1, Math.floor(terminalColumns(context.stdout.columns) / 2))
    const rewind = interactive && renderedRows > 1 && renderedRows <= height ? `\x1b[${renderedRows}A` : ''
    context.stdout.write(
      `${rewind}${rows.map((row) => `${interactive ? '\r\x1b[2K' : ''}${row}${lineBreak}`).join('')}`
    )
    renderedRows = final ? 0 : rows.length
  }
  // Retained so a refresh can redraw the current state with a fresh clock.
  let lastDetail = 'starting'
  const render = (detail: string, final = false): void => {
    lastDetail = detail
    tick += 1
    const rows = options.progressStyle === 'single' ? singleFrame(summaryText(detail)) : multiFrame()
    const frame = rows.join('\n')
    // Coalesce identical consecutive frames; a fast rubric otherwise redraws the same line.
    if (!final && frame === lastFrame) return
    lastFrame = frame
    hideCursor()
    writeRows(rows, final)
  }
  // Progress is otherwise reported only at item edges, so a slow item leaves the clock
  // frozen and the display indistinguishable from a hang. Refreshing on a timer advances
  // the elapsed time and the indeterminate sweep between events. A plain stream would
  // gain a line per refresh, so only an interactive display ticks.
  const releaseInterval = interactive ? context.startInterval(REFRESH_INTERVAL_MS, () => render(lastDetail)) : undefined
  const finish = (): void => {
    releaseInterval?.()
    showCursor()
    releaseInterrupt()
  }
  const renderTimings = (): void => {
    const finished = context.now()
    const byPhase = new Map<ProgressPhase, number>()
    for (const timing of [...timings, { phase: activePhase, elapsed: finished - phaseStarted }])
      byPhase.set(timing.phase, (byPhase.get(timing.phase) ?? 0) + timing.elapsed)
    const rendered = [...byPhase]
      .sort(([left], [right]) => PROGRESS_PHASES.indexOf(left) - PROGRESS_PHASES.indexOf(right))
      .map(([label, duration]) => [label, elapsedTenths(duration)] as const)
    const summary = rendered.map(([label, duration]) => `${label} ${formatTenths(duration)}`).join(' · ')
    const total = rendered.reduce((sum, [, duration]) => sum + duration, 0)
    context.stdout.write(
      `${treeProgressPrefix('timings'.padEnd(rootLabelWidth), timingsPlacement)}${summary} · total ${formatTenths(total)}\n`
    )
  }
  const activeEvidenceRow = (identity: string): EvidenceProgressRow | undefined => {
    return activeEvidenceRows.get(identity)
  }
  const completeEvidenceRow = (identity: string): void => {
    const row = activeEvidenceRow(identity)
    if (!row) return
    evidenceRows[evidenceRows.indexOf(row)] = { ...row, completedAt: context.now() }
    activeEvidenceRows.delete(identity)
  }
  const openEvidenceRow = (
    identity: string,
    skill: string,
    detail: string,
    count?: { readonly completed: number; readonly total: number }
  ): void => {
    completeEvidenceRow(identity)
    const row = { skill, detail, started: context.now(), ...(count ? { count } : {}) }
    activeEvidenceRows.set(identity, row)
    evidenceRows.push(row)
  }
  const updateEvidenceRow = (
    identity: string,
    skill: string,
    detail: string,
    count?: { readonly completed: number; readonly total: number }
  ): void => {
    const row = activeEvidenceRow(identity)
    if (!row || row.detail !== detail) {
      openEvidenceRow(identity, skill, detail, count)
      return
    }
    const updated = { ...row, ...(count ? { count } : {}) }
    evidenceRows[evidenceRows.indexOf(row)] = updated
    activeEvidenceRows.set(identity, updated)
  }
  const replaceEvidenceRow = (
    identity: string,
    row: EvidenceProgressRow,
    skill: string,
    detail: string,
    count?: { readonly completed: number; readonly total: number }
  ): void => {
    const updated = { ...row, skill, detail, ...(count ? { count } : {}) }
    evidenceRows[evidenceRows.indexOf(row)] = updated
    activeEvidenceRows.set(identity, updated)
  }
  const itemCost = (skill: PreparedSkill, code: string): number =>
    skill.items.find((item) => item.code === code)?.item.mechanical.cost ?? 1
  const skillCost = (skill: PreparedSkill): number =>
    skill.items.reduce((sum, item) => sum + (item.item.mechanical.cost ?? 1), 0)
  return {
    loading: (loaded, definitions) => {
      loading = { loaded, total: definitions }
      render('loading definitions')
    },
    evidence: (gathered, sessions) => {
      batchedEvidence = true
      if (loading) {
        render('loading definitions complete', true)
        loading = undefined
      }
      evidence = { gathered, total: sessions }
      openPhase('evidence')
      render('gathering evidence')
    },
    planned: (planned) => {
      if (loading) {
        render('loading definitions complete', true)
        loading = undefined
      }
      if (evidence) {
        render('gathering evidence complete', true)
        evidence = undefined
      }
      openPhase(phase as ProgressPhase)
      totalItems = planned.reduce((count, skill) => count + skill.items.length, 0)
      total = planned.reduce((sum, skill) => sum + skillCost(skill), 0)
      for (const skill of planned)
        states.set(skill.skill.identity, {
          complete: 0,
          started: 0,
          total: skillCost(skill),
          planned: true,
          staged: false,
          status: 'pending'
        })
      render('starting')
    },
    start: (skill, code) => {
      const cost = itemCost(skill, code)
      inFlight = cost
      lastRunning = code
      const { identity, declaration } = skill.skill
      const state = skillState(identity)
      states.set(identity, {
        ...state,
        started: state.complete + cost,
        planned: true,
        staged: false,
        total: skillCost(skill),
        status: `running ${code}`
      })
      render(`${declaration.name} running ${code}`)
    },
    item: (skill, code) => {
      const cost = itemCost(skill, code)
      complete += cost
      completedItems += 1
      inFlight = 0
      const { identity, declaration } = skill.skill
      const state = skillState(identity)
      const done = state.complete + cost
      states.set(identity, {
        complete: done,
        started: done,
        total: skillCost(skill),
        planned: true,
        staged: false,
        status: code
      })
      render(`${declaration.name} ${code}`)
    },
    report: (skill, event) => {
      const { identity, declaration } = skill.skill
      const currentStages = stages.get(identity) ?? []
      let closesReportedEvidence = false
      if (event.kind === 'stage') {
        if (event.label === EVIDENCE_STAGE_LABEL && event.edge === 'start') {
          if (!batchedEvidence) {
            evidence = { gathered: completedEvidence, total: skills.length }
            openPhase('evidence')
          }
          stages.set(identity, currentStages)
        } else if (event.label === EVIDENCE_STAGE_LABEL) {
          completeEvidenceRow(identity)
          if (!batchedEvidence) {
            completedEvidence += 1
            evidence = { gathered: completedEvidence, total: skills.length }
            closesReportedEvidence = true
          }
        } else if (event.edge === 'start') {
          const nextStages = [...currentStages, event.label]
          stages.set(identity, nextStages)
          updateEvidenceRow(identity, declaration.name, nextStages.join(' '))
        } else {
          completeEvidenceRow(identity)
          stages.set(identity, currentStages.slice(0, -1))
        }
      } else {
        const stageDetail = currentStages.join(' ')
        const detail = [...currentStages, event.label].join(' ')
        // A stage gives a reader an honest live row before it can report a concrete step. Once
        // it does, retain the useful step rather than a zero-duration wrapper before it.
        const row = activeEvidenceRow(identity)
        if (row?.detail === stageDetail) replaceEvidenceRow(identity, row, declaration.name, detail, event.count)
        else updateEvidenceRow(identity, declaration.name, detail, event.count)
      }
      const stateRow = activeEvidenceRow(identity)
      const state = skillState(identity)
      states.set(identity, {
        ...state,
        staged: stateRow !== undefined,
        status: stateRow?.detail ?? state.status
      })
      if (closesReportedEvidence) {
        render('gathering evidence complete', true)
        evidence = undefined
        openPhase(phase as ProgressPhase)
        return
      }
      render('gathering evidence')
    },
    complete: () => {
      inFlight = 0
      for (const skill of skills) {
        const state = skillState(skill.identity)
        states.set(skill.identity, { ...state, complete: state.total, started: state.total, status: 'complete' })
      }
      render('complete', true)
      renderTimings()
      finish()
    },
    failed: () => {
      inFlight = 0
      for (const skill of skills) states.set(skill.identity, { ...skillState(skill.identity), status: 'failed' })
      render(lastRunning ? `failed at ${lastRunning}` : 'failed', true)
      finish()
    }
  }
}

/** Reports the item edges a live progress line needs, narrowed to the item code the renderer displays. */
interface ItemProgressCodes {
  readonly onItemStart: (code: string) => void
  readonly onItemComplete: (code: string) => void
  /** Undefined while nothing is displaying, which is how a rubric learns not to emit at all. */
  readonly onProgressEvent?: (event: RubricProgressReport) => void
}

export const runPreparedWithProgress = async <Result>(
  context: KiContext,
  prepared: readonly PreparedSkill[],
  run: (skill: PreparedSkill, progress: ItemProgressCodes) => Promise<Result>,
  options: OperationOptions,
  phase: string,
  timingsPlacement: TimingsPlacement = 'last-root',
  existing?: ProgressTracker
): Promise<Result[]> => {
  const progress =
    existing ??
    (prepared.length
      ? createProgressTracker(context, options, trackedPreparedSkills(prepared), phase, timingsPlacement)
      : undefined)
  const results: Result[] = []
  try {
    progress?.planned(prepared)
    for (const skill of prepared) {
      results.push(
        await run(skill, {
          onItemStart: (code) => progress?.start(skill, code),
          onItemComplete: (code) => progress?.item(skill, code),
          ...(progress ? { onProgressEvent: (event) => progress.report(skill, event) } : {})
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
  phase: string,
  timingsPlacement: TimingsPlacement = 'last-root'
): Promise<Result[]> => {
  const progress = skills.length
    ? createProgressTracker(context, options, trackedSkills(skills), phase, timingsPlacement)
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
  return runPreparedWithProgress(context, prepared, run, options, phase, timingsPlacement, progress)
}

/** Runs a counted session-evidence phase before the prepared skills' mechanical-item phase. */
export const runWithEvidenceProgress = async <Evidence, Result>(
  context: KiContext,
  skills: readonly ResolvedSkill[],
  gather: (
    skill: PreparedSkill,
    progress: { readonly onProgressEvent?: (event: RubricProgressReport) => void }
  ) => Promise<Evidence>,
  run: (skill: PreparedSkill, evidence: Evidence, progress: ItemProgressCodes) => Promise<Result>,
  options: OperationOptions,
  phase: string,
  timingsPlacement: TimingsPlacement = 'last-root'
): Promise<Result[]> => {
  const progress = skills.length
    ? createProgressTracker(context, options, trackedSkills(skills), phase, timingsPlacement)
    : undefined
  const prepared: PreparedSkill[] = []
  const evidence = new Map<string, Evidence>()
  try {
    progress?.loading(0, skills.length)
    for (const skill of skills) {
      prepared.push(await prepareSkill(skill))
      progress?.loading(prepared.length, skills.length)
    }
    progress?.evidence(0, prepared.length)
    for (const skill of prepared) {
      evidence.set(
        skill.skill.identity,
        await gather(skill, { ...(progress ? { onProgressEvent: (event) => progress.report(skill, event) } : {}) })
      )
      progress?.evidence(evidence.size, prepared.length)
    }
  } catch (error) {
    progress?.failed()
    throw error
  }
  return runPreparedWithProgress(
    context,
    prepared,
    async (skill, itemProgress) => {
      const gathered = evidence.get(skill.skill.identity)
      // The map is filled from the same prepared collection immediately above; preserve a guard for future changes.
      /* v8 ignore next */
      if (gathered === undefined) throw new KiError(`progress lost evidence for ${skill.skill.identity}`, 1)
      return run(skill, gathered, itemProgress)
    },
    options,
    phase,
    timingsPlacement,
    progress
  )
}
