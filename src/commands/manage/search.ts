import { Command } from 'commander'
import type { KiContext } from '../../context.ts'
import { discoverInstalledBackpacks } from '../../core/backpack/index.ts'
import { grammarError } from '../../core/errors.ts'
import { renderTree } from '../presentation/index.ts'

interface CapabilityMatch {
  readonly backpack: string
  readonly kind: string
  readonly name: string
}

const compareMatches = (left: CapabilityMatch, right: CapabilityMatch): number =>
  left.backpack.localeCompare(right.backpack) ||
  left.kind.localeCompare(right.kind) ||
  left.name.localeCompare(right.name)

const matches = (query: string, entry: CapabilityMatch): boolean => {
  const needle = query.toLowerCase()
  return [entry.backpack, entry.kind, entry.name].some((value) => value.toLowerCase().includes(needle))
}

export const createSearchCommand = (context: KiContext): Command =>
  new Command('search')
    .description('search verified installed backpack capabilities')
    .argument('<query>', 'non-empty backpack or capability search text')
    .action(async (query: string) => {
      if (!query.trim()) throw grammarError('search query must not be empty')
      const capabilities = (await discoverInstalledBackpacks(context.paths.data)).flatMap((backpack) =>
        backpack.capabilities.map((capability) => ({
          backpack: backpack.id,
          kind: capability.kind,
          name: capability.name
        }))
      )
      const found = capabilities.filter((entry) => matches(query, entry)).sort(compareMatches)
      const matchEntries = found.length
        ? found.map((entry) => ({ label: `${entry.backpack} ${entry.kind} ${entry.name}` }))
        : [{ label: 'none' }]
      context.stdout.write(
        `${renderTree({
          title: 'KI BACKPACK SEARCH',
          entries: [
            { label: `query: ${query}` },
            { label: `matches (${found.length})`, children: matchEntries },
            { label: `summary: MATCHES=${found.length}` }
          ]
        }).join('\n')}\n`
      )
    })
