import type { Command } from 'commander'
export const collectFilters = (value: string, previous: readonly string[] = []): readonly string[] => [
  ...previous,
  value
]
export const territoryOptions = (command: Command): Command =>
  command
    .option('-t, --territory <handle>', 'registered territory handle')
    .option('--estate', 'select the registered estate')
    .option('-f, --filter <prefix>', 'literal directory-name prefix (repeatable alternatives)', collectFilters, [])
