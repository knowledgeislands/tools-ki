import type { RubricFamily } from '../../shared/rubric.ts'
import type { SelfRubricContext } from '../contexts/self.ts'
import { diagnosticRemediation, sourceContains } from './shared.ts'

export const REPAIR: RubricFamily<SelfRubricContext, SelfRubricContext> = {
  code: 'REPAIR',
  title: 'Bootstrap and repair',
  description: 'Keeps bootstrap validation and repair coverage complete and automation-visible.',
  standard: 'references/rubric.md#bootstrap-and-repair',
  selectContext: (context) => context,
  items: [
    {
      code: 'SELF-BOOTSTRAP-001',
      title: 'Shared bootstrap inventory',
      description: 'Bootstrap and canonical Harness restoration consume the authoritative minimum inventory.',
      sources: ['src/agents/bootstrap.ts', 'src/core/storage/registry.ts'],
      mechanical: {
        level: 'FAIL',
        remediation: diagnosticRemediation('Route every bootstrap and restoration consumer through minimumBootstrapUserSkills.'),
        audit: {
          phase: 'PRIMARY',
          run: (context) => [
            ...sourceContains(context, 'src/agents/bootstrap.ts', ['minimumBootstrapUserSkills']),
            ...sourceContains(context, 'src/core/storage/registry.ts', [
              'requiredCapabilities: minimumBootstrapUserSkills'
            ])
          ]
        }
      }
    },
    {
      code: 'SELF-REPAIR-001',
      title: 'Configured skill coverage',
      description: 'Repair and diagnostics inspect every configured managed identity.',
      sources: ['src/core/manage/repair.ts', 'src/core/manage/doctor.ts'],
      mechanical: {
        level: 'FAIL',
        remediation: diagnosticRemediation('Iterate the complete configured skill inventory in repair and doctor.'),
        audit: {
          phase: 'PRIMARY',
          run: (context) => [
            ...sourceContains(context, 'src/core/manage/repair.ts', ['configuration.skills']),
            ...sourceContains(context, 'src/core/manage/doctor.ts', ['configuration.skills'])
          ]
        }
      }
    },
    {
      code: 'SELF-REPAIR-002',
      title: 'Local capability resolution',
      description: 'Local Harness development resolves sources through inspected capability metadata.',
      sources: ['src/agents/bootstrap.ts'],
      mechanical: {
        level: 'FAIL',
        remediation: diagnosticRemediation(
          'Keep localBootstrapHarness on inspectHarnessSourceRoot and capability.source.'
        ),
        audit: {
          phase: 'PRIMARY',
          run: (context) =>
            sourceContains(context, 'src/agents/bootstrap.ts', [
              'localBootstrapHarness',
              'inspectHarnessSourceRoot',
              'capability.source'
            ])
        }
      }
    },
    {
      code: 'SELF-REPAIR-003',
      title: 'Automation failure signal',
      description: 'A failed manage repair result exits non-zero after rendering its summary.',
      sources: ['src/commands/manage/repair.ts'],
      mechanical: {
        level: 'FAIL',
        remediation: diagnosticRemediation('Preserve FAIL summary rendering and KiExit(1) for repair failure.'),
        audit: {
          phase: 'PRIMARY',
          run: (context) =>
            sourceContains(context, 'src/commands/manage/repair.ts', [
              "result.failed ? 'FAIL' : 'PASS'",
              'if (result.failed) throw new KiExit(1)'
            ])
        }
      }
    }
  ]
}
