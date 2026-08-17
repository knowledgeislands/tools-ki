import type { KiContext } from '../../../../context.ts'
import type { ResolvedSkill } from '../../../../core/configuration/index.ts'
import {
  type ItemProgressCodes,
  type ProgressTracker,
  runPreparedWithProgress as runPrepared,
  runWithProgress as runResolved,
  runWithEvidenceProgress as runWithEvidence
} from '../../../../core/repository/progress/run.ts'
import type { PreparedSkill, RubricProgressReport } from '../../../../core/runtime/index.ts'
import type { OperationOptions } from './options.ts'
import { type CompletionPlacement, createProgressTracker, type OperationPhase, type TrackedSkill } from './tracker.ts'

const trackedSkills = (skills: readonly ResolvedSkill[]): readonly TrackedSkill[] =>
  skills.map((skill) => ({ identity: skill.identity, name: skill.declaration.name }))

const trackedPreparedSkills = (skills: readonly PreparedSkill[]): readonly TrackedSkill[] =>
  trackedSkills(skills.map(({ skill }) => skill))

const tracker = (
  context: KiContext,
  options: OperationOptions,
  skills: readonly TrackedSkill[],
  phase: OperationPhase,
  completionPlacement: CompletionPlacement
): ProgressTracker | undefined =>
  skills.length ? createProgressTracker(context, options, skills, phase, completionPlacement) : undefined

export const runPreparedWithProgress = async <Result>(
  context: KiContext,
  prepared: readonly PreparedSkill[],
  run: (skill: PreparedSkill, progress: ItemProgressCodes) => Promise<Result>,
  options: OperationOptions,
  phase: OperationPhase,
  completionPlacement: CompletionPlacement = 'last-root'
): Promise<Result[]> =>
  runPrepared(prepared, run, tracker(context, options, trackedPreparedSkills(prepared), phase, completionPlacement))

export const runWithProgress = async <Result>(
  context: KiContext,
  skills: readonly ResolvedSkill[],
  run: (skill: PreparedSkill, progress: ItemProgressCodes) => Promise<Result>,
  options: OperationOptions,
  phase: OperationPhase,
  completionPlacement: CompletionPlacement = 'last-root'
): Promise<Result[]> =>
  runResolved(skills, run, tracker(context, options, trackedSkills(skills), phase, completionPlacement))

export const runWithEvidenceProgress = async <Evidence, Result>(
  context: KiContext,
  skills: readonly ResolvedSkill[],
  gather: (
    skill: PreparedSkill,
    progress: { readonly onProgressEvent?: (event: RubricProgressReport) => void }
  ) => Promise<Evidence>,
  run: (skill: PreparedSkill, evidence: Evidence, progress: ItemProgressCodes) => Promise<Result>,
  options: OperationOptions,
  phase: OperationPhase,
  completionPlacement: CompletionPlacement = 'last-root'
): Promise<Result[]> =>
  runWithEvidence(skills, gather, run, tracker(context, options, trackedSkills(skills), phase, completionPlacement))
