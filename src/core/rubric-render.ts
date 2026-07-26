// Renders the complete direct catalogue into its deterministic Markdown
// publication. Item modules remain canonical; this host-owned renderer replaces
// every per-skill publisher without discarding catalogue metadata.

import type { RubricItem, SkillRubricDefinition } from './rubric.ts'

const headingAnchor = (heading: string): string =>
  heading
    .toLowerCase()
    .replaceAll(/\s/g, '-')
    .replaceAll(/[^a-z0-9-]/g, '')

const classification = (item: RubricItem<unknown>): string => {
  const aspects = [...(item.mechanical ? [item.mechanical.heuristic ? 'M-heuristic' : 'M'] : []), ...(item.judgment ? ['J'] : [])]
  return aspects.join(' + ')
}

const renderItem = (item: RubricItem<unknown>): string => {
  const prompt = item.judgment ? `\n  - _Review prompt:_ ${item.judgment.prompt}` : ''
  return `- **${item.code} [${classification(item)}] — ${item.title}** — ${item.description} (${item.sources.join(', ')})${prompt}`
}

/** The same loaded catalogue drives both execution and publication. */
export const renderRubricMarkdown = (definition: SkillRubricDefinition<unknown>): string => {
  const contents = definition.families
    .map((family) => {
      const heading = `${family.code} — ${family.title}`
      return `- [${heading}](#${headingAnchor(heading)})`
    })
    .join('\n')
  const families = definition.families
    .map(
      (family) =>
        `## ${family.code} — ${family.title}\n\n→ [standard](${family.standard})\n\n${family.description}\n\n${family.items
          .map(renderItem)
          .join('\n')}`
    )
    .join('\n\n')

  return `<!-- GENERATED FILE: produced by \`ki skill rubric\`. Do not hand-edit; edit scripts/rubric/items/, then rerun \`ki skill rubric <skill> --write\`. -->

# Generated rubric — ${definition.concern}

> **Generated publication.** The TypeScript rubric items under \`scripts/rubric/items/\` are canonical. Edit those definitions, then rerun \`ki skill rubric ${definition.name} --write\`.

Line-by-line criteria for auditing ${definition.name}. Classifications are derived from item aspects: **[M]** mechanical, **[J]** judgment, **[M + J]** hybrid, and **[M-heuristic + J]** hybrid with heuristic mechanical evidence. Sources are cited as declared by each canonical item.

## Contents

${contents}

${families}
`
}
