/** Root command families; Commander sorts the complete help inventory. */
export const rootCommandNames = [
  'acquire',
  'agent',
  'territory',
  'bootstrap',
  'dev',
  'estate',
  'harness',
  'kb',
  'link',
  'markdown',
  'registry',
  'repo',
  'skill',
  'work'
] as const

export type RootCommandName = (typeof rootCommandNames)[number]
