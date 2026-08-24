import type { RubricFamily } from '../../shared/rubric.ts'
import type { SelfRubricContext } from '../contexts/self.ts'
import { diagnosticRemediation, sourceContains } from './shared.ts'

const framedCommands = [
  'src/commands/agora/list.ts',
  'src/commands/manage/diag.ts',
  'src/commands/manage/list.ts',
  'src/commands/manage/repair.ts',
  'src/commands/manage/update.ts',
  'src/commands/repo/diag.ts',
  'src/commands/repo/repair.ts',
  'src/commands/repo/upgrade.ts',
  'src/commands/trade/records.ts'
] as const

export const PRESENTATION: RubricFamily<SelfRubricContext, SelfRubricContext> = {
  code: 'PRESENTATION',
  title: 'Human-facing presentation',
  description: 'Keeps inventories and diagnostics framed while preserving direct contract-oriented streams.',
  standard: 'references/rubric.md#presentation',
  selectContext: (context) => context,
  items: [
    {
      code: 'SELF-OUTPUT-001',
      title: 'Human-facing report frame',
      description: 'Representative human-facing inventory and diagnostic commands retain titled tree summaries.',
      sources: [...framedCommands],
      mechanical: {
        level: 'WARN',
        remediation: diagnosticRemediation('Restore renderTree with a title and compact summary on human-facing reports.'),
        audit: {
          phase: 'PRIMARY',
          run: (context) =>
            framedCommands.flatMap((path) => sourceContains(context, path, ['renderTree', 'title:', 'summary:']))
        }
      }
    },
    {
      code: 'SELF-OUTPUT-002',
      title: 'Contract output boundary',
      description: 'Plain streams, canonical records, generated assets, and action receipts remain direct interfaces.',
      sources: ['references/rubric.md'],
      judgment: {
        scope: 'Changed CLI presentation and its consumer-facing contract tests.',
        prompt: 'Do contract-oriented outputs remain concise, stable, and unframed where framing would alter their interface?',
        outcomes: ['conforming', 'gap identified'],
        guidance: 'Keep tree framing for human reports; preserve direct output for machine or action contracts.'
      }
    }
  ]
}
