import type { RubricFamily } from '../../shared/rubric.ts'
import type { SelfRubricContext } from '../contexts/self.ts'

export const RUBRIC: RubricFamily<SelfRubricContext, SelfRubricContext> = {
  code: 'RUBRIC',
  title: 'Rubric publication',
  description: 'Keeps the human-readable local rubric derived from this executable catalogue.',
  standard: 'references/rubric.md',
  selectContext: (context) => context,
  items: [
    {
      code: 'SELF-RUBRIC-001',
      title: 'Generated publication',
      description: 'The committed rubric publication matches the native catalogue.',
      sources: ['scripts/rubric/items/index.ts', 'references/rubric.md'],
      mechanical: {
        level: 'FAIL',
        remediation: { class: 'automatic' },
        audit: {
          phase: 'PREPARE',
          run: (context) => [
            context.publication.state === 'in-sync'
              ? { status: 'PASS', message: 'generated rubric publication is in sync' }
              : { status: 'VIOLATION', message: `generated rubric publication is ${context.publication.state}` }
          ]
        },
        conform: { phase: 'PREPARE', run: (context) => context.publication.propose() }
      }
    }
  ]
}
