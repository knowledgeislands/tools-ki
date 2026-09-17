import type { RubricFamily } from '../../shared/rubric.ts'
import type { SelfRubricContext } from '../contexts/self.ts'

export const PRODUCT_ENGINEERING: RubricFamily<SelfRubricContext, SelfRubricContext> = {
  code: 'PRODUCT',
  title: 'Product engineering',
  description: 'Keeps tools-ki architecture, executable-contract tests, and portable boundaries explicit.',
  standard: 'references/standards-product-engineering.md',
  selectContext: (context) => context,
  items: [
    {
      code: 'SELF-ARCH-001',
      title: 'Command and domain ownership',
      description:
        'Command modules own grammar, selection, and rendering while core modules own typed domain behaviour and repository effects.',
      sources: ['references/standards-product-engineering.md', 'src/commands', 'src/core'],
      judgment: {
        scope: 'Changed command and core modules, their imports, and public behaviour.',
        prompt:
          'Do command, core, presentation, and provider boundaries retain one clear owner without hidden reverse dependencies?',
        outcomes: ['conforming', 'gap identified'],
        guidance: 'Move behaviour to its owning domain and expose one typed seam; do not add a compatibility coordinator.'
      }
    },
    {
      code: 'SELF-ARCH-002',
      title: 'Cohesive domain modules',
      description: 'Modules group one domain concern and split only when responsibilities have independent reasons to change.',
      sources: ['references/standards-product-engineering.md', 'src/core', 'src/commands'],
      judgment: {
        scope: 'Large or cross-cutting changed modules and their callers.',
        prompt:
          'Can a maintainer locate each policy and follow the ordinary flow without reconstructing unrelated lifecycle stages or abstractions?',
        outcomes: ['conforming', 'gap identified'],
        guidance: 'Extract a named domain seam when responsibilities evolve independently; never split solely by line count.'
      }
    },
    {
      code: 'SELF-TEST-001',
      title: 'Executable contract evidence',
      description: 'Tests drive the in-process CLI seam with injected capabilities and no live network.',
      sources: ['references/standards-product-engineering.md', 'src/tests/cli/_cli_helper.ts', 'src/context.ts'],
      judgment: {
        scope: 'Changed product behaviour, failure paths, and provider interactions.',
        prompt:
          'Does each supported behaviour remain observable through run(args, context), with provider and filesystem effects controlled at the same boundary?',
        outcomes: ['conforming', 'gap identified'],
        guidance:
          'Add CLI contract evidence or expose a supported port; do not freeze an internal helper with a substitute unit test.'
      }
    },
    {
      code: 'SELF-TEST-002',
      title: 'Coverage exclusion proof',
      description:
        'Coverage exclusions document a whole-call-graph reason that no supported CLI input can reach the guarded branch.',
      sources: ['references/standards-product-engineering.md', 'src'],
      judgment: {
        scope: 'Every added or changed v8 ignore and every new caller of an excluded function.',
        prompt:
          'Does each exclusion remain unreachable for every caller, with interface-level fault injection used only where one CLI invocation cannot produce the documented failure?',
        outcomes: ['conforming', 'gap identified'],
        guidance:
          'Test reachable behaviour through the CLI, remove unsupported dead code, or document the complete boundary proof beside the narrow exclusion.'
      }
    },
    {
      code: 'SELF-PORT-001',
      title: 'Portable meaning and authority',
      description:
        'Portable claims use their normative owner and cross-boundary records compare semantic projections without expanding authority.',
      sources: ['references/standards-product-engineering.md'],
      judgment: {
        scope: 'Changed parsers, validators, cross-repository records, provider adapters, and normative documentation.',
        prompt:
          'Are external claims grounded in the owning standard, semantic equality used where formatting is non-authoritative, and mutation authority kept explicit?',
        outcomes: ['conforming', 'gap identified'],
        guidance:
          'Verify the normative source, compare the owned semantic projection, and fail closed at repository or provider boundaries.'
      }
    }
  ]
}
