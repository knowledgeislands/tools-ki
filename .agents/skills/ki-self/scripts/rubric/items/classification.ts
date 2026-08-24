import type { RubricFamily } from '../../shared/rubric.ts'
import type { SelfRubricContext } from '../contexts/self.ts'
import { diagnosticRemediation, sourceContains } from './shared.ts'

export const CLASSIFICATION: RubricFamily<SelfRubricContext, SelfRubricContext> = {
  code: 'CLASSIFICATION',
  title: 'Skill classification',
  description: 'Preserves the host distinctions between bootstrap inventory, managed projections, and capability sources.',
  standard: 'references/rubric.md#classification',
  selectContext: (context) => context,
  items: [
    {
      code: 'SELF-CLASS-001',
      title: 'Bootstrap inventory authority',
      description: 'The minimum bootstrap user-skill inventory has one named typed authority.',
      sources: ['src/core/harness/bootstrap-capabilities.ts'],
      mechanical: {
        level: 'FAIL',
        remediation: diagnosticRemediation('Restore minimumBootstrapUserSkills as the single typed inventory.'),
        audit: {
          phase: 'PRIMARY',
          run: (context) =>
            sourceContains(context, 'src/core/harness/bootstrap-capabilities.ts', [
              'export const minimumBootstrapUserSkills',
              'as const'
            ])
        }
      }
    },
    {
      code: 'SELF-CLASS-002',
      title: 'Managed user scope',
      description: 'Bootstrap and repair retain explicit user-scoped managed-skill projection.',
      sources: ['src/agents/bootstrap.ts', 'src/commands/manage/repair.ts'],
      mechanical: {
        level: 'FAIL',
        remediation: diagnosticRemediation('Restore explicit user scope at the managed-skill activation boundary.'),
        audit: {
          phase: 'PRIMARY',
          run: (context) => [
            ...sourceContains(context, 'src/agents/bootstrap.ts', ["{ scope: 'user' }"]),
            ...sourceContains(context, 'src/commands/manage/repair.ts', ["{ scope: 'user' }"])
          ]
        }
      }
    },
    {
      code: 'SELF-CLASS-003',
      title: 'Capability source discovery',
      description: 'Bootstrap resolves classified capability sources rather than reconstructing category paths.',
      sources: ['src/agents/bootstrap.ts'],
      mechanical: {
        level: 'FAIL',
        remediation: diagnosticRemediation('Resolve managed skills through inspected capability.source metadata.'),
        audit: {
          phase: 'PRIMARY',
          run: (context) => sourceContains(context, 'src/agents/bootstrap.ts', ['capability.source'])
        }
      }
    }
  ]
}
