// Renders a loaded SkillRubricDefinition into a deterministic, byte-stable Markdown
// catalogue (CLI-004 T1.7) — the host-owned replacement for every per-skill
// `scripts/rubric/publish.ts`. Skills declare rubric data; only `ki skill rubric`
// turns it into prose, so rendering stays out of the governed contract entirely.

import type { RubricItem, SkillRubricDefinition } from './rubric.ts'

// Mirrors GitHub's heading-anchor algorithm closely enough for internal cross-links:
// lowercase, drop everything but letters/digits/spaces/hyphens, then turn spaces into
// hyphens. An em dash between two spaces collapses to a double hyphen, which is what
// produces anchors like `#hand--handoff-readiness` from a "HAND — Handoff readiness" heading.
const slug = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/ /g, '-')

const renderItem = (item: RubricItem<unknown>): readonly string[] => {
  if (item.kind === 'judgment') return [`- **${item.code} [J] — ${item.title}**`, `  > ${item.prompt}`]
  return [`- **${item.code} [${item.level} · ${item.phase}] — ${item.title}**`]
}

/** Renders a rubric definition into Markdown. Deterministic: the same definition always renders to the same bytes. */
export const renderRubricMarkdown = (definition: SkillRubricDefinition<unknown>): string => {
  const familyHeading = (family: SkillRubricDefinition<unknown>['families'][number]): string => `${family.code} — ${family.title}`

  const lines: string[] = [
    '<!-- GENERATED FILE: produced by `ki skill rubric`. Do not hand-edit; edit scripts/rubric/index.ts, then rerun `ki skill rubric <skill> --write`. -->',
    '',
    `# Rubric — ${definition.skill}`,
    '',
    '> **Generated publication.** The TypeScript rubric items under `scripts/rubric/index.ts` are canonical. Edit that definition, then rerun `ki skill rubric <skill> --write`.',
    '',
    '## Contents',
    ''
  ]
  for (const family of definition.families) lines.push(`- [${familyHeading(family)}](#${slug(familyHeading(family))})`)

  for (const family of definition.families) {
    lines.push('', `## ${familyHeading(family)}`, '')
    for (const item of family.items) lines.push(...renderItem(item))
  }

  return `${lines.join('\n')}\n`
}
