import type { KiContext } from '../../context.ts'
import { KiError } from '../errors.ts'
import type { ResolvedSkill } from '../resolution.ts'
import { type PreparedSkill, prepareSkill, type RubricProgressReport } from '../runtime.ts'
import type { OperationOptions } from './options.ts'
import { createProgressTracker, type ProgressTracker, type TimingsPlacement, type TrackedSkill } from './tracker.ts'

/** Reports the item edges a live progress line needs, narrowed to the item code the renderer displays. */
interface ItemProgressCodes {
  readonly onItemStart: (code: string) => void
  readonly onItemComplete: (code: string) => void
  /** Undefined while nothing is displaying, which is how a rubric learns not to emit at all. */
  readonly onProgressEvent?: (event: RubricProgressReport) => void
}

const trackedSkills = (skills: readonly ResolvedSkill[]): readonly TrackedSkill[] =>
  skills.map((skill) => ({ identity: skill.identity, name: skill.declaration.name }))

const trackedPreparedSkills = (skills: readonly PreparedSkill[]): readonly TrackedSkill[] =>
  trackedSkills(skills.map(({ skill }) => skill))

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
      const result = await run(skill, {
        onItemStart: (code) => progress?.start(skill, code),
        onItemComplete: (code) => progress?.item(skill, code),
        ...(progress ? { onProgressEvent: (event) => progress.report(skill, event) } : {})
      })
      results.push(result)
      progress?.skillComplete(skill)
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
