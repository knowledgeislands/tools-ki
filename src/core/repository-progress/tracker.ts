import type { KiContext } from '../../context.ts'
import { KiError } from '../errors.ts'
import { presentation } from '../presentation.ts'
import { EVIDENCE_STAGE_LABEL, type PreparedSkill, type RubricProgressReport } from '../runtime.ts'
import { createProgressDisplay } from './display.ts'
import type { OperationOptions } from './options.ts'
import { elapsed } from './rendering.ts'

export type CompletionPlacement = 'root' | 'last-root'
type ProgressPhase = 'loading' | 'evidence' | 'audit' | 'conform' | 'educate' | 're-audit'
export type OperationPhase = Exclude<ProgressPhase, 'loading' | 'evidence'>

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

/** Identity keys the tracker; the bare declaration name is what a reader sees. */
export interface TrackedSkill {
  readonly identity: string
  readonly name: string
}

interface EvidenceActivity {
  readonly identity: string
  readonly name: string
  readonly started: number
  readonly detail: string
  readonly detailStarted: number
}

const skillCount = (count: number): string => `${count} skill${count === 1 ? '' : 's'}`

export const createProgressTracker = (
  context: KiContext,
  options: OperationOptions,
  skills: readonly TrackedSkill[],
  phase: OperationPhase,
  completionPlacement: CompletionPlacement
): ProgressTracker | undefined => {
  const enabled = options.progress === 'always' || (options.progress === 'auto' && context.stdout.isTTY === true)
  if (!enabled) return undefined

  const interactive = context.stdout.isTTY === true
  const detailedEvidence = (options.progressStyle ?? (interactive ? 'multi' : 'single')) === 'multi'
  const started = context.now()
  let phaseStarted = started
  let activePhase: ProgressPhase = 'loading'
  const phaseDurations = new Map<ProgressPhase, number>()
  const operationPhase = phase
  const labelWidth = Math.max(9, phase.length + 2, ...skills.map((skill) => skill.name.length + 2))
  const display = createProgressDisplay(context, labelWidth, interactive)
  const stages = new Map<string, readonly string[]>()
  let loadingTotal = skills.length
  let loadingShown = false
  let loadingFinished = false
  let batchedEvidence = false
  let evidenceActivity: EvidenceActivity | undefined
  let completedEvidence = 0
  let evidenceReceiptWritten = false
  let activeSkill: TrackedSkill | undefined
  let operationDetail = ''
  let operationDetailStarted = started
  let lastRunning: string | undefined

  const transition = (next: ProgressPhase): void => {
    if (activePhase === next) return
    const transitioned = context.now()
    phaseDurations.set(activePhase, (phaseDurations.get(activePhase) ?? 0) + transitioned - phaseStarted)
    activePhase = next
    phaseStarted = transitioned
  }
  const phaseElapsed = (target: ProgressPhase): number =>
    (phaseDurations.get(target) ?? 0) + (activePhase === target ? context.now() - phaseStarted : 0)
  const passGlyph = presentation('status.pass').terminal
  const activeGlyph = presentation('entity.skill').terminal
  const failGlyph = presentation('status.fail').terminal
  const finishLoading = (): void => {
    if (loadingFinished) return
    display.receipt(
      `${passGlyph} loading`,
      `definitions loaded · ${skillCount(loadingTotal)} · ${elapsed(phaseElapsed('loading'))}`
    )
    loadingFinished = true
  }
  const evidenceText = (activity: EvidenceActivity): string =>
    `${activity.detail} · ${elapsed(context.now() - activity.detailStarted)}`
  const showEvidenceActivity = (activity: EvidenceActivity): void => {
    display.activity(`${activeGlyph} ${activity.name}`, () => evidenceText(activity))
  }
  const openEvidenceActivity = (skill: TrackedSkill): EvidenceActivity => {
    const now = context.now()
    const activity = {
      identity: skill.identity,
      name: skill.name,
      started: now,
      detail: 'gathering evidence',
      detailStarted: now
    }
    evidenceActivity = activity
    activeSkill = skill
    showEvidenceActivity(activity)
    return activity
  }
  const updateEvidenceActivity = (current: EvidenceActivity, detail: string): void => {
    const now = context.now()
    const activity = {
      ...current,
      detail,
      detailStarted: detail === current.detail ? current.detailStarted : now
    }
    evidenceActivity = activity
    showEvidenceActivity(activity)
  }
  const requiredEvidenceActivity = (subject: string): EvidenceActivity => {
    const activity = evidenceActivity
    // The sequential gather loop and host evidence bracket both open an activity before closing it.
    /* v8 ignore next */
    if (!activity) throw new KiError(`progress lost active evidence for ${subject}`, 1)
    return activity
  }
  const completeEvidenceActivity = (activity: EvidenceActivity): void => {
    if (detailedEvidence)
      display.receipt(
        `${passGlyph} ${activity.name}`,
        `evidence ready · ${elapsed(context.now() - activity.started)}`,
        { temporary: true }
      )
    evidenceActivity = undefined
    completedEvidence += 1
  }
  const finishEvidence = (): void => {
    if (evidenceReceiptWritten || completedEvidence === 0) return
    display.collapseTemporary()
    display.receipt(
      `${passGlyph} evidence`,
      `evidence gathered · ${skillCount(completedEvidence)} · ${elapsed(phaseElapsed('evidence'))}`
    )
    evidenceReceiptWritten = true
  }
  const setOperationActivity = (skill: TrackedSkill | undefined, detail: string): void => {
    const now = context.now()
    activeSkill = skill
    operationDetailStarted = detail === operationDetail ? operationDetailStarted : now
    operationDetail = detail
    display.activity(
      skill ? `${activeGlyph} ${skill.name}` : `${activeGlyph} ${phase}`,
      () => `${operationDetail} · ${elapsed(context.now() - operationDetailStarted)}`
    )
  }
  const trackedSkill = (identity: string): TrackedSkill => {
    const skill = skills.find((candidate) => candidate.identity === identity)
    // Callers can only report a skill from the collection used to create the tracker.
    /* v8 ignore next */
    if (!skill) throw new KiError(`progress lost state for ${identity}`, 1)
    return skill
  }
  const setEvidenceDetail = (identity: string, detail: string): void => {
    updateEvidenceActivity(requiredEvidenceActivity(identity), detail)
  }

  return {
    loading: (_loaded, total) => {
      loadingTotal = total
      if (!loadingShown) {
        display.activity(`${activeGlyph} loading`, () => `loading definitions · ${elapsed(phaseElapsed('loading'))}`)
        loadingShown = true
      }
    },
    evidence: (gathered, total) => {
      batchedEvidence = true
      finishLoading()
      transition('evidence')
      if (completedEvidence < gathered) {
        completeEvidenceActivity(requiredEvidenceActivity(`item ${gathered}`))
        completedEvidence = gathered
      }
      if (gathered < total) {
        const next = skills[gathered]
        // The gather loop and tracked skill list share their length and ordering.
        /* v8 ignore next */
        if (!next) throw new KiError(`progress lost evidence skill ${gathered + 1}`, 1)
        openEvidenceActivity(next)
      }
    },
    planned: () => {
      finishLoading()
      if (batchedEvidence) finishEvidence()
      transition(operationPhase)
      setOperationActivity(undefined, 'starting')
    },
    start: (skill, code) => {
      lastRunning = code
      const next = trackedSkill(skill.skill.identity)
      if (activeSkill?.identity !== next.identity || operationDetail !== 'checking')
        setOperationActivity(next, 'checking')
    },
    item: () => {},
    skillComplete: (skill) => {
      if (activeSkill?.identity === skill.skill.identity) activeSkill = undefined
    },
    report: (skill, event) => {
      const { identity } = skill.skill
      const currentStages = stages.get(identity) ?? []
      if (event.kind === 'stage') {
        if (event.label === EVIDENCE_STAGE_LABEL && event.edge === 'start') {
          if (!batchedEvidence) {
            finishLoading()
            transition('evidence')
            openEvidenceActivity(trackedSkill(identity))
          }
          stages.set(identity, currentStages)
          return
        }
        if (event.label === EVIDENCE_STAGE_LABEL) {
          if (!batchedEvidence) {
            completeEvidenceActivity(requiredEvidenceActivity(identity))
            transition(operationPhase)
            setOperationActivity(trackedSkill(identity), 'preparing checks')
          } else updateEvidenceActivity(requiredEvidenceActivity(identity), 'gathering evidence')
          return
        }
        if (event.edge === 'start') {
          const nextStages = [...currentStages, event.label]
          stages.set(identity, nextStages)
          setEvidenceDetail(identity, nextStages.join(' '))
          return
        }
        stages.set(identity, currentStages.slice(0, -1))
        updateEvidenceActivity(
          requiredEvidenceActivity(identity),
          currentStages.slice(0, -1).join(' ') || 'gathering evidence'
        )
        return
      }
      setEvidenceDetail(identity, [...currentStages, event.label].join(' '))
    },
    complete: () => {
      if (!batchedEvidence) finishEvidence()
      const operationDuration = phaseElapsed(operationPhase)
      const totalDuration = context.now() - started
      display.receipt(
        `${passGlyph} ${phase}`,
        `complete · ${elapsed(operationDuration)} · total ${elapsed(totalDuration)}`,
        { placement: completionPlacement }
      )
      display.finish()
    },
    failed: () => {
      const totalDuration = context.now() - started
      display.failure(
        `${failGlyph} ${activeSkill?.name ?? activePhase}`,
        `${lastRunning ? `failed at ${lastRunning}` : 'failed'} · total ${elapsed(totalDuration)}`,
        completionPlacement
      )
      display.finish()
    }
  }
}
