import type { KiContext } from '../../../../context.ts'
import type { ResolvedSkill } from '../../../../core/configuration/index.ts'
import type { RepositoryOperationProgress } from '../../../../core/repository/index.ts'
import type { PreparedSkill } from '../../../../core/runtime/index.ts'
import type { OperationOptions } from './options.ts'
import { createProgressTracker, type TrackedSkill } from './tracker.ts'

const trackedSkills = (skills: readonly ResolvedSkill[]): readonly TrackedSkill[] =>
  skills.map((skill) => ({ identity: skill.identity, name: skill.declaration.name }))

const trackedPreparedSkills = (skills: readonly PreparedSkill[]): readonly TrackedSkill[] =>
  trackedSkills(skills.map(({ skill }) => skill))

export const repositoryOperationProgress = (
  context: KiContext,
  options: OperationOptions
): RepositoryOperationProgress => ({
  resolved: (skills, phase, completion) =>
    skills.length ? createProgressTracker(context, options, trackedSkills(skills), phase, completion) : undefined,
  prepared: (skills, phase, completion) =>
    skills.length
      ? createProgressTracker(context, options, trackedPreparedSkills(skills), phase, completion)
      : undefined
})
