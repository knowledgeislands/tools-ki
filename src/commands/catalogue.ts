export const rootCommandNames = ['acquire', 'agora', 'bootstrap', 'dev', 'harness', 'manage', 'registry', 'repo', 'skill', 'trades', 'workspace'] as const

/**
 * Purpose-oriented order used by root help and the human-facing command
 * inventories. Shell completions deliberately use `rootCommandNames` instead:
 * alphabetical candidates are easier to scan while completing.
 */
export const rootHelpCommandNames = ['bootstrap', 'manage', 'agora', 'skill', 'workspace', 'repo', 'registry', 'harness', 'trades', 'acquire', 'dev'] as const

export type RootCommandName = (typeof rootCommandNames)[number]

export const rootCommandSummaries: Readonly<Record<RootCommandName, string>> = {
  acquire: 'import a local capture',
  agora: 'manage workspace profiles',
  bootstrap: 'configure KI for this user',
  dev: 'manage local harness development',
  harness: 'install and inspect harnesses',
  manage: 'inspect and maintain local KI state',
  repo: 'manage KI repositories',
  registry: 'manage the KI repository registry',
  skill: 'manage user skills',
  trades: 'manage cross-repository trades',
  workspace: 'manage repository workspace groups'
}

export const manageCommandNames = ['cleanup', 'completion', 'diag', 'docs', 'doctor', 'list', 'missing', 'outdated', 'search', 'update'] as const

export type ManageCommandName = (typeof manageCommandNames)[number]

export const manageCommandSummaries: Readonly<Record<ManageCommandName, string>> = {
  cleanup: 'report eligible managed cleanup',
  completion: 'print shell completion source',
  diag: 'report installation and configuration',
  docs: 'print documentation locations',
  doctor: 'check KI configuration health',
  list: 'list installed capabilities',
  missing: 'report unavailable capabilities',
  outdated: 'report comparable newer releases',
  search: 'search installed capabilities',
  update: 'update CLI and harnesses'
}

export const repoCommandNames = ['audit', 'conform', 'educate', 'init', 'plan', 'repair', 'skill', 'upgrade'] as const

export type RepoCommandName = (typeof repoCommandNames)[number]

export const repoCommandSummaries: Readonly<Record<RepoCommandName, string>> = {
  audit: 'audit declared skills',
  conform: 'apply approved local repairs',
  educate: 'explain declared skill maintenance',
  init: 'initialize one KI repository',
  plan: 'inspect governed work items',
  repair: 'reconcile proven managed state',
  skill: 'manage repository skills',
  upgrade: 'refresh declared capabilities'
}

export const repoHelpCommandNames = ['init', 'audit', 'conform', 'plan', 'educate', 'repair', 'skill', 'upgrade'] as const

export const registryCommandNames = ['add', 'list'] as const

export type RegistryCommandName = (typeof registryCommandNames)[number]

export const registryCommandSummaries: Readonly<Record<RegistryCommandName, string>> = {
  add: 'add selected repositories',
  list: 'list registered repositories'
}
