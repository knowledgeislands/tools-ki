import type { IConfiguration } from 'dependency-cruiser'

const area = (...names: readonly string[]) => `^src/(${names.join('|')})(/|$)`
const config: IConfiguration = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'Dependency cycles obscure command/domain ownership, including type-only dependencies.',
      severity: 'error',
      from: {},
      to: { circular: true }
    },
    {
      name: 'no-unresolvable',
      comment: 'An unresolved import is an unchecked boundary, not evidence of a clean graph.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true }
    },
    {
      name: 'core-does-not-import-commands',
      comment: 'Typed domain behaviour must remain usable without CLI grammar and rendering.',
      severity: 'error',
      from: { path: area('core') },
      to: { path: area('commands') }
    },
    {
      name: 'cli-contract-tests-use-the-sandbox',
      comment: 'Public CLI tests reach product modules only through the shared injected sandbox.',
      severity: 'error',
      from: { path: '^src/tests/cli/', pathNot: '^src/tests/cli/_cli_helper\\.ts$' },
      to: { path: '^src/', pathNot: '^src/tests/' }
    },
    {
      name: 'fixtures-do-not-enter-the-product',
      comment: 'Test fixtures must never become runtime behaviour.',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/tests/' },
      to: { path: '^src/tests/' }
    }
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'types', 'default'],
      extensions: ['.ts', '.js', '.mjs', '.cjs', '.d.ts', '.json']
    }
  }
}

export default config
