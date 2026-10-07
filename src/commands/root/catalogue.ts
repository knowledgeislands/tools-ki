/** Root command families; Commander sorts the complete help inventory. */
export const rootCommandNames = [
  'acquire',
  'agent',
  'territory',
  'bootstrap',
  'dev',
  'harness',
  'kb',
  'registry',
  'repo',
  'skill'
] as const

export type RootCommandName = (typeof rootCommandNames)[number]
