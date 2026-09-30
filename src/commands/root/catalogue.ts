/** Task-oriented root help and completion order. */
export const rootHelpCommandNames = [
  'bootstrap',
  'repo',
  'agora',
  'trade',
  'acquire',
  'batch',
  'manage',
  'registry',
  'harness',
  'skill',
  'dev'
] as const

export type RootCommandName = (typeof rootHelpCommandNames)[number]

export const rootHelpGroups: Record<RootCommandName, string> = {
  bootstrap: 'Get started:',
  repo: 'Work with repositories:',
  agora: 'Work with repositories:',
  trade: 'Work with repositories:',
  acquire: 'Work with repositories:',
  batch: 'Work with repositories:',
  manage: 'Maintain KI:',
  registry: 'Maintain KI:',
  harness: 'Maintain KI:',
  skill: 'Maintain KI:',
  dev: 'Development:'
}

export const repoHelpCommandNames = [
  'roadmap',
  'diag',
  'audit',
  'store',
  'educate',
  'open',
  'init',
  'conform',
  'repair',
  'skill',
  'upgrade'
] as const

/** Help and completion order: inspect first, follow the workflow, then remove or reset. */
export const nestedHelpCommandNames: Readonly<Record<string, readonly string[]>> = {
  'ki manage': [
    'list',
    'search',
    'doctor',
    'diag',
    'missing',
    'outdated',
    'docs',
    'cleanup',
    'completion',
    'vscode',
    'mcp',
    'repair',
    'update'
  ],
  'ki manage mcp': ['list', 'install', 'update', 'rollback', 'uninstall'],
  'ki manage vscode': ['check', 'sync'],
  'ki repo': repoHelpCommandNames,
  'ki repo roadmap': ['summary', 'list', 'stats', 'promote', 'demote', 'prune'],
  'ki repo store': ['list', 'scan', 'create', 'bind', 'unbind'],
  'ki repo skill': ['add', 'remove'],
  'ki agora': ['list', 'show', 'audit', 'inspect', 'roots', 'open', 'reference'],
  'ki agora reference': ['list', 'set', 'remove'],
  'ki skill': ['add', 'remove'],
  'ki batch': ['prepare', 'validate', 'run', 'close'],
  'ki registry': ['list', 'add', 'remove'],
  'ki harness': ['list', 'info', 'install', 'reinstall', 'uninstall'],
  'ki trade': [
    'list',
    'show',
    'routes',
    'subtypes',
    'standing',
    'prepare',
    'observe',
    'submit',
    'receive',
    'abandon',
    'release',
    'prune'
  ],
  'ki trade routes': ['list', 'check', 'add', 'remove'],
  'ki trade subtypes': ['list', 'add', 'remove'],
  'ki trade standing': ['list', 'check', 'add', 'capture', 'remove'],
  'ki acquire': ['list', 'status', 'import', 'reconcile', 'reset'],
  'ki dev': ['local', 'skill'],
  'ki dev local': ['set', 'on', 'off'],
  'ki dev skill': ['rubric']
}
