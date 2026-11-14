/** Root command families; Commander sorts the complete help inventory. */
export const rootCommandNames = [
  'territory',
  'bootstrap',
  'dev',
  'estate',
  'git',
  'backpack',
  'kb',
  'link',
  'markdown',
  'registry',
  'repo',
  'skill',
  'work'
] as const

export type RootCommandName = (typeof rootCommandNames)[number]
