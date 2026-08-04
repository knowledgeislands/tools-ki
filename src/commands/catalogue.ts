export const rootCommandNames = [
  'acquire',
  'agora',
  'bootstrap',
  'cleanup',
  'completion',
  'dev',
  'diag',
  'docs',
  'doctor',
  'harness',
  'help',
  'list',
  'missing',
  'outdated',
  'repair',
  'repo',
  'search',
  'skill',
  'trades',
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
  'agora',
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
  'trades',
  'acquire',
  'dev'
] as const

export type RootCommandName = (typeof rootCommandNames)[number]

export const rootCommandSummaries: Readonly<Record<RootCommandName, string>> = {
  acquire: 'import a local capture',
  agora: 'manage workspace profiles',
  bootstrap: 'configure KI for this user',
  cleanup: 'report eligible managed cleanup',
  completion: 'print shell completion source',
  dev: 'manage local harness development',
  diag: 'report installation and configuration',
  docs: 'print documentation locations',
  doctor: 'check KI configuration health',
  harness: 'install and inspect harnesses',
  help: 'show command help',
  list: 'list installed capabilities',
  missing: 'report unavailable capabilities',
  outdated: 'report comparable newer releases',
  repair: 'reconcile proven managed state',
  repo: 'manage KI repositories',
  search: 'search installed capabilities',
  skill: 'manage user skills',
  trades: 'manage cross-repository trades',
  update: 'update CLI and harnesses',
  version: 'print CLI version',
  workspace: 'manage repository workspace groups'
}

export const repoCommandNames = ['audit', 'conform', 'educate', 'init', 'list', 'plan', 'register', 'skill', 'upgrade'] as const

export type RepoCommandName = (typeof repoCommandNames)[number]

export const repoCommandSummaries: Readonly<Record<RepoCommandName, string>> = {
  audit: 'audit declared skills',
  conform: 'apply approved local repairs',
  educate: 'explain declared skill maintenance',
  init: 'initialize one KI repository',
  list: 'list registered KI repositories',
  plan: 'inspect governed work items',
  register: 'register explicit repository roots',
  skill: 'manage repository skills',
  upgrade: 'refresh declared capabilities'
}

export const repoHelpCommandNames = ['init', 'audit', 'conform', 'register', 'list', 'plan', 'educate', 'skill', 'upgrade'] as const
