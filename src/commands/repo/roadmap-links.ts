import type { WorkItem } from '../../core/work/index.ts'
import type { TaskLink } from '../../core/work/items.ts'
import type { TreeEntry } from '../presentation/index.ts'

export interface RoadmapTextOptions {
  readonly links: 'compact' | 'all'
  readonly icons: boolean
  readonly dim: boolean
}

const providers = new Map([
  ['paperclip', { short: 'PC', name: 'Paperclip' }],
  ['linear', { short: 'LN', name: 'Linear' }]
])

const providerLabel = (provider: string) => providers.get(provider) ?? { short: provider, name: provider }

interface LinkedTask extends TaskLink {
  readonly provider: string
  readonly identity: string
}

const linkedTasks = (item: WorkItem): readonly LinkedTask[] =>
  Object.entries(item.taskLinks ?? {})
    .flatMap(([provider, links]) =>
      links.map((link) => ({
        ...link,
        provider,
        identity: JSON.stringify([provider, link.authority, link.scope, link.id])
      }))
    )
    .sort(
      (left, right) =>
        Number(right.relation === 'implementation') - Number(left.relation === 'implementation') ||
        left.identity.localeCompare(right.identity) ||
        left.relation.localeCompare(right.relation)
    )

export const renderRoadmapItem = (item: WorkItem, options: RoadmapTextOptions): TreeEntry => {
  const label = `${item.id} [${item.status}] ${item.title}`
  const links = linkedTasks(item)
  const first = links[0]
  if (!first) return { label }
  if (options.links === 'all') {
    return {
      label,
      children: links.map((link) => {
        const ambiguous = links.some(
          (other) => other.provider === link.provider && other.key === link.key && other.identity !== link.identity
        )
        return {
          label: `${providerLabel(link.provider).name} ${link.key} · ${link.relation}`,
          children: [
            { label: link.url },
            ...(ambiguous
              ? [
                  { label: `authority: ${link.authority}` },
                  { label: `scope: ${link.scope}` },
                  { label: `id: ${link.id}` }
                ]
              : [])
          ]
        }
      })
    }
  }
  const additional = new Set(links.map((link) => link.identity)).size - 1
  const suffix = ` · ${providerLabel(first.provider).short}:${first.key}${additional ? ` +${additional}` : ''}`
  return { label: label + (options.dim ? `\u001b[2m${suffix}\u001b[22m` : suffix) }
}

export const roadmapLinkLegend = (items: readonly WorkItem[], options: RoadmapTextOptions): readonly TreeEntry[] => {
  if (options.links === 'all') return []
  const names = new Set<string>()
  for (const item of items) {
    const first = linkedTasks(item)[0]
    if (first) {
      const provider = providerLabel(first.provider)
      if (provider.short !== provider.name) names.add(`${provider.short} = ${provider.name}`)
    }
  }
  return names.size ? [{ label: `Links: ${[...names].sort().join(' · ')}` }] : []
}
