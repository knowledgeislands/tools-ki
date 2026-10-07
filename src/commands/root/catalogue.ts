/** Root command families; Commander sorts the complete help inventory. */
export const rootCommandNames = [
  'acquire',
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
