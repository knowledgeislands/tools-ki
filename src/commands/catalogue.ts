export const rootCommandNames = [
  'acquire',
  'bootstrap',
  'cleanup',
  'completion',
  'dev',
  'diag',
  'docs',
  'doctor',
  'handoffs',
  'harness',
  'help',
  'list',
  'missing',
  'outdated',
  'repair',
  'repo',
  'search',
  'skill',
  'update',
  'version',
  'workspace'
] as const

/**
 * Purpose-oriented order used by root help and the human-facing command
 * inventories. Shell completions deliberately use `rootCommandNames` instead:
 * alphabetical candidates are easier to scan while completing.
 */
export const rootHelpCommandNames = [
  'help',
  'bootstrap',
  'completion',
  'outdated',
  'missing',
  'update',
  'search',
  'cleanup',
  'version',
  'diag',
  'repair',
  'doctor',
  'docs',
  'list',
  'skill',
  'workspace',
  'repo',
  'harness',
  'handoffs',
  'acquire',
  'dev'
] as const

export type RootCommandName = (typeof rootCommandNames)[number]

export const repoCommandNames = ['audit', 'conform', 'educate', 'init', 'list', 'plan', 'register', 'skill', 'upgrade'] as const

export const repoHelpCommandNames = ['init', 'audit', 'conform', 'register', 'list', 'plan', 'educate', 'skill', 'upgrade'] as const
