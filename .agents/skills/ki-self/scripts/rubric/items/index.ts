import type { SkillRubricDefinition } from '../../shared/rubric.ts'
import { createSelfSession, type SelfRubricContext } from '../contexts/self.ts'
import { CLASSIFICATION } from './classification.ts'
import { PRESENTATION } from './presentation.ts'
import { REPAIR } from './repair.ts'
import { RUBRIC } from './publication.ts'

export default {
  contract: 1,
  name: 'ki-self',
  concern: 'tools-ki repository-local governance',
  createSession: createSelfSession,
  families: [RUBRIC, CLASSIFICATION, REPAIR, PRESENTATION]
} satisfies SkillRubricDefinition<SelfRubricContext>
