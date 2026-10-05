/** Root command families; Commander sorts the complete help inventory. */
export const rootCommandNames = [
  'acquire',
  'agora',
  'bootstrap',
  'dev',
  'harness',
  'kb',
  'registry',
  'repo',
  'skill'
] as const

export type RootCommandName = (typeof rootCommandNames)[number]
