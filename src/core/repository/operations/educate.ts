import { educateSkill, type SkillEducationResult } from '../../runtime/index.ts'
import { runWithProgress } from '../progress/run.ts'
import { selectRepositorySkills } from './selection.ts'
import type { RepositoryOperationContext, RepositorySelection } from './types.ts'

export interface RepositoryEducationResult {
  readonly repository: string
  readonly educations: readonly SkillEducationResult[]
}

export const educateRepositories = async (
  context: RepositoryOperationContext,
  selection: RepositorySelection,
  onResult: (result: RepositoryEducationResult) => void
): Promise<void> => {
  const selected = await selectRepositorySkills(context, selection)
  for (const { repository, skills } of selected) {
    const educations = await runWithProgress(
      skills,
      (skill) => educateSkill(skill),
      context.progress.resolved(skills, 'educate', 'last-root')
    )
    onResult({ repository: repository.root, educations })
  }
}
