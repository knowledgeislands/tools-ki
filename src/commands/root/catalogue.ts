export const rootCommandNames = [
  'acquire',
  'agora',
  'bootstrap',
  'dev',
  'harness',
  'manage',
  'registry',
  'repo',
  'skill',
  'trade'
] as const

/**
 * Purpose-oriented order used by root help and the human-facing command
 * inventories. Shell completions deliberately use `rootCommandNames` instead:
 * alphabetical candidates are easier to scan while completing.
 */
export const rootHelpCommandNames = [
  'bootstrap',
  'manage',
  'agora',
  'skill',
  'repo',
  'registry',
  'harness',
  'trade',
  'acquire',
  'dev'
] as const

export type RootCommandName = (typeof rootCommandNames)[number]

export const repoHelpCommandNames = [
  'init',
  'open',
  'audit',
  'conform',
  'diag',
  'roadmap',
  'educate',
  'repair',
  'skill',
  'upgrade'
] as const
