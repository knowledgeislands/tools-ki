import type { KiContext } from '../../context.ts'
import { KiError } from '../errors.ts'
import { presentation } from '../presentation.ts'
import { EVIDENCE_STAGE_LABEL, type PreparedSkill, type RubricProgressReport } from '../runtime.ts'
import { treeProgressPrefix } from '../tree-rendering.ts'
import type { OperationOptions } from './options.ts'
import {
  type BarModel,
  elapsed,
  elapsedTenths,
  formatTenths,
  progressLine,
  type RenderOptions,
  terminalColumns
} from './rendering.ts'

const REFRESH_INTERVAL_MS = 250
export type TimingsPlacement = 'root' | 'last-root'
type ProgressPhase = 'loading' | 'evidence' | 'audit' | 'conform' | 'educate' | 're-audit'
const PROGRESS_PHASES: readonly ProgressPhase[] = ['loading', 'evidence', 'audit', 'conform', 'educate', 're-audit']

const CURSOR_HIDE = '\x1b[?25l'
const CURSOR_SHOW = '\x1b[?25h'

export interface ProgressTracker {
  readonly loading: (loaded: number, total: number) => void
  readonly evidence: (gathered: number, total: number) => void
  readonly planned: (skills: readonly PreparedSkill[]) => void
  readonly start: (skill: PreparedSkill, code: string) => void
  readonly item: (skill: PreparedSkill, code: string) => void
  readonly skillComplete: (skill: PreparedSkill) => void
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
export interface TrackedSkill {
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

export const createProgressTracker = (
  context: KiContext,
  options: OperationOptions,
  skills: readonly TrackedSkill[],
  phase: string,
  timingsPlacement: TimingsPlacement
): ProgressTracker | undefined => {
  const enabled = options.progress === 'always' || (options.progress === 'auto' && context.stdout.isTTY === true)
  if (!enabled) return undefined
  const interactive = context.stdout.isTTY === true
  const progressStyle = options.progressStyle ?? (interactive ? 'multi' : 'single')
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
  let activeSkillIdentity: string | undefined
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
  const closedPhaseElapsed = (phase: ProgressPhase): number =>
    timings.reduce((sum, timing) => sum + (timing.phase === phase ? timing.elapsed : 0), 0)
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
  const completedDirectEvidenceFrame = (): readonly string[] => [
    progressLine(
      {
        complete: completedEvidence,
        started: completedEvidence,
        total: skills.length,
        text: `gathering evidence complete · ${countsOf(completedEvidence, skills.length)} ${elapsed(closedPhaseElapsed('evidence'))}`
      },
      renderOptions('evidence'.padEnd(rootLabelWidth))
    ),
    ...evidenceRows.map((row) =>
      progressLine(evidenceRowModel(row), renderOptions(row.skill.padEnd(childLabelWidth), 'child'))
    )
  ]
  const singleFrame = (text: string): readonly string[] =>
    activePhase === 'evidence' ? evidenceFrame(text) : [progressLine(barModel(text), renderOptions())]
  const skillGlyph = (state: SkillProgressState, active: boolean): string => {
    if (state.status === 'complete') return presentation('status.pass').terminal
    if (state.status === 'failed') return presentation('status.fail').terminal
    return presentation(active ? 'entity.skill' : 'status.skip').terminal
  }
  const skillBarModel = (state: SkillProgressState, active: boolean): BarModel => {
    const unitTotal = Math.max(1, state.total)
    if (state.status === 'complete')
      return { complete: unitTotal, started: unitTotal, total: unitTotal, text: 'complete' }
    if (!active) return { complete: state.complete, started: state.complete, total: unitTotal, text: state.status }
    return {
      complete: state.complete,
      started: state.started,
      total: state.staged || !state.planned ? undefined : unitTotal,
      text: state.status
    }
  }
  const skillFrame = (): readonly string[] =>
    skills.flatMap((skill) => {
      const state = skillState(skill.identity)
      const active = skill.identity === activeSkillIdentity
      const label = `${skillGlyph(state, active)} ${skill.name}`.padEnd(rootLabelWidth)
      const row = progressLine(skillBarModel(state, active), renderOptions(label))
      if (!active || activePhase !== 'evidence') return [row]
      return [
        row,
        ...evidenceRows
          .filter((evidenceRow) => evidenceRow.skill === skill.name)
          .map((evidenceRow) =>
            progressLine(
              evidenceRowModel(evidenceRow),
              renderOptions(evidenceRow.skill.padEnd(childLabelWidth), 'child')
            )
          )
      ]
    })
  const phaseElapsed = (target: ProgressPhase): number =>
    closedPhaseElapsed(target) + (activePhase === target ? context.now() - phaseStarted : 0)
  const multiPhaseFrame = (detail: string): readonly string[] => {
    const rows: string[] = []
    if (evidence !== undefined || completedEvidence > 0) {
      const evidenceActive = activePhase === 'evidence'
      const evidenceComplete = evidence?.gathered ?? completedEvidence
      rows.push(
        progressLine(
          {
            complete: evidenceComplete,
            started: evidenceActive ? Math.min(skills.length, evidenceComplete + 1) : evidenceComplete,
            total: skills.length,
            text: `${evidenceActive ? 'gathering evidence' : 'gathering evidence complete'} · ${countsOf(evidenceComplete, skills.length)} ${elapsed(phaseElapsed('evidence'))}`
          },
          renderOptions('evidence'.padEnd(rootLabelWidth))
        )
      )
    }
    if (total !== undefined && totalItems !== undefined) {
      const operationActive = activePhase === phase
      rows.push(
        progressLine(
          {
            complete,
            started: complete + inFlight,
            total,
            text: `${operationActive ? detail : 'waiting'} · ${countsOf(completedItems, totalItems)} ${elapsed(phaseElapsed(phase as ProgressPhase))}`
          },
          renderOptions(phase.padEnd(rootLabelWidth))
        )
      )
    }
    return rows
  }
  const multiFrame = (detail: string): readonly string[] => [...skillFrame(), ...multiPhaseFrame(detail)]
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
    const canRewind = interactive && renderedRows > 1 && renderedRows <= height
    const rewind = canRewind ? `\x1b[${renderedRows}A` : ''
    const staleRows = canRewind ? Math.max(0, renderedRows - rows.length) : 0
    const clearStaleRows = staleRows ? `${'\r\x1b[2K\r\n'.repeat(staleRows)}\x1b[${staleRows}A` : ''
    context.stdout.write(
      `${rewind}${rows.map((row) => `${interactive ? '\r\x1b[2K' : ''}${row}${lineBreak}`).join('')}${clearStaleRows}`
    )
    renderedRows = final ? 0 : rows.length
  }
  // Retained so a refresh can redraw the current state with a fresh clock.
  let lastDetail = 'starting'
  const render = (detail: string, final = false, retainDirectEvidence = false): void => {
    lastDetail = detail
    tick += 1
    const activeRows =
      progressStyle === 'single' || activePhase === 'loading' ? singleFrame(summaryText(detail)) : multiFrame(detail)
    const rows =
      progressStyle === 'single' && retainDirectEvidence && !batchedEvidence
        ? [...completedDirectEvidenceFrame(), ...activeRows]
        : activeRows
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
      completedEvidence = gathered
      for (const [index, skill] of skills.entries()) {
        const state = skillState(skill.identity)
        states.set(skill.identity, {
          ...state,
          staged: index === gathered,
          status: index < gathered ? 'evidence ready' : index === gathered ? 'gathering evidence' : 'queued'
        })
      }
      activeSkillIdentity = skills[gathered]?.identity
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
      activeSkillIdentity = undefined
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
      activeSkillIdentity = identity
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
    skillComplete: (skill) => {
      const { identity, declaration } = skill.skill
      const state = skillState(identity)
      states.set(identity, {
        ...state,
        complete: state.total,
        started: state.total,
        staged: false,
        status: 'complete'
      })
      if (activeSkillIdentity === identity) activeSkillIdentity = undefined
      render(`${declaration.name} complete`)
    },
    report: (skill, event) => {
      const { identity, declaration } = skill.skill
      activeSkillIdentity = identity
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
      const opensEvidence = event.kind === 'stage' && event.label === EVIDENCE_STAGE_LABEL && event.edge === 'start'
      states.set(identity, {
        ...state,
        staged: opensEvidence || stateRow !== undefined,
        status: opensEvidence ? 'gathering evidence' : (stateRow?.detail ?? state.status)
      })
      if (closesReportedEvidence) {
        render('gathering evidence')
        evidence = undefined
        openPhase(phase as ProgressPhase)
        return
      }
      render('gathering evidence')
    },
    complete: () => {
      inFlight = 0
      activeSkillIdentity = undefined
      for (const skill of skills) {
        const state = skillState(skill.identity)
        states.set(skill.identity, { ...state, complete: state.total, started: state.total, status: 'complete' })
      }
      render('complete', true, completedEvidence > 0)
      renderTimings()
      finish()
    },
    failed: () => {
      inFlight = 0
      if (activeSkillIdentity) {
        const state = skillState(activeSkillIdentity)
        states.set(activeSkillIdentity, { ...state, staged: false, status: 'failed' })
      }
      render(lastRunning ? `failed at ${lastRunning}` : 'failed', true)
      finish()
    }
  }
}
