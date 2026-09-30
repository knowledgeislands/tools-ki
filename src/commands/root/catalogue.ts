/** Root help section order; Commander sorts commands within each section. */
export const rootHelpCommandNames = [
  'bootstrap',
  'agora',
  'batch',
  'repo',
  'trade',
  'acquire',
  'harness',
  'manage',
  'registry',
  'skill',
  'dev'
] as const

export type RootCommandName = (typeof rootHelpCommandNames)[number]

export const rootHelpGroups: Record<RootCommandName, string> = {
  bootstrap: 'Get started:',
  agora: 'Work with repositories:',
  batch: 'Work with repositories:',
  repo: 'Work with repositories:',
  trade: 'Work with repositories:',
  acquire: 'Acquisition:',
  harness: 'Maintain KI:',
  manage: 'Maintain KI:',
  registry: 'Maintain KI:',
  skill: 'Maintain KI:',
  dev: 'Development:'
}
