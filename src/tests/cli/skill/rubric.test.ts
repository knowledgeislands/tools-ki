import { rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

// Builds a full canonical `scripts/rubric/items/index.ts` catalogue.
const rubric = (families: string, skill = 'ki-example'): string => `
export default {
  contract: 1,
  name: '${skill}',
  concern: 'example governance',
  createSession: async ({ repository }) => ({
    subjects: [{ families: ['EXAMPLE'], context: () => ({ repository }) }],
    proposal: () => ({ writes: [] })
  }),
  families: ${families}
}
`

const mixedFamilies = `[{
  code: 'FAM', title: 'Family title', description: 'The family description.', standard: 'standard.md',
  selectContext: (context) => context,
  items: [
    { code: 'FAM-1', title: 'Mechanical item', description: 'Mechanical description.', sources: ['standard.md#mechanical'],
      mechanical: { level: 'FAIL', audit: { phase: 'PRIMARY', run: async () => [] } } },
    { code: 'FAM-2', title: 'Judgment item', description: 'Judgment description.', sources: ['standard.md#judgment'],
      judgment: { prompt: 'weigh it by hand' } },
    { code: 'FAM-3', title: 'Hybrid item', description: 'Hybrid description.', sources: ['standard.md#hybrid'],
      mechanical: { level: 'WARN', heuristic: true, audit: { phase: 'INSPECT', run: async () => [] } },
      judgment: { prompt: 'review the heuristic' } }
  ]
}]`

const expectedRendered = [
  '<!-- GENERATED FILE: produced by `ki dev skill rubric`. Do not hand-edit; edit scripts/rubric/items/, then rerun `ki dev skill rubric <skill> --write`. -->',
  '',
  '# Generated rubric — example governance',
  '',
  '> **Generated publication.** The TypeScript rubric items under `scripts/rubric/items/` are canonical. Edit those definitions, then rerun `ki dev skill rubric ki-example --write`.',
  '',
  'Line-by-line criteria for auditing ki-example. Classifications are derived from item aspects: **[M]** mechanical, **[J]** judgment, **[M + J]** hybrid, and **[M-heuristic + J]** hybrid with heuristic mechanical evidence. Sources are cited as declared by each canonical item.',
  '',
  '## Contents',
  '',
  '- [FAM — Family title](#fam--family-title)',
  '',
  '## FAM — Family title',
  '',
  '→ [standard](standard.md)',
  '',
  'The family description.',
  '',
  '- **FAM-1 [M] — Mechanical item** — Mechanical description. (standard.md#mechanical)',
  '- **FAM-2 [J] — Judgment item** — Judgment description. (standard.md#judgment)',
  '  - _Review prompt:_ weigh it by hand',
  '- **FAM-3 [M-heuristic + J] — Hybrid item** — Hybrid description. (standard.md#hybrid)',
  '  - _Review prompt:_ review the heuristic',
  ''
].join('\n')

// Simulates a dev-linked harness install without going through `ki dev local on` (which only
// projects the canonical knowledgeislands/ki-agentic-harness): writes the real skill payload
// under the sandbox root, then symlinks the installed harness's `skills` payload root at it —
// the same signal `enableCanonicalHarnessDevelopment` establishes for the canonical harness.
const devLinkExampleHarness = async (box: Awaited<ReturnType<typeof sandbox>>, rubricSource: string): Promise<void> => {
  await box.root.write('local/skills/ki-example/SKILL.md', '---\nname: ki-example\nki-depends-on: []\n---\n')
  await box.root.write('local/skills/ki-example/scripts/rubric/items/index.ts', rubricSource)
  const installedSkills = join(box.data.path, 'ki/harnesses/example/harness/skills')
  await rm(installedSkills, { recursive: true, force: true })
  await symlink(join(box.root.path, 'local/skills'), installedSkills)
}

describe('[ki dev skill rubric]', () => {
  test('rejects the retired top-level rubric path', async () => {
    const box = await sandbox()

    const result = await box.run('ki skill rubric ki-example')

    expect(result.exitCode).toBe(2)
  })

  test('renders mechanical and judgment items and reports in sync once written', async () => {
    const box = await sandbox()
    await box.setupExampleHarness({ rubric: rubric(mixedFamilies) })
    const target = 'ki/harnesses/example/harness/skills/ki-example/references/rubric.md'
    await devLinkExampleHarness(box, rubric(mixedFamilies))

    const written = await box.run('ki dev skill rubric ki-example --write')
    expect(written.exitCode).toBe(0)
    expect(written.output).toMatch(/^write .*ki\/harnesses\/example\/harness\/skills\/ki-example\/references\/rubric\.md\n$/)
    expect(await box.data.read(target)).toBe(expectedRendered)

    const checked = await box.run('ki dev skill rubric ki-example')
    expect(checked).toEqual({ exitCode: 0, output: 'ki dev skill rubric: example/harness:ki-example references/rubric.md is in sync\n' })
  })

  test('reports missing when references/rubric.md has never been generated', async () => {
    const box = await sandbox()
    await box.setupExampleHarness({ rubric: rubric(mixedFamilies) })

    const result = await box.run('ki dev skill rubric ki-example')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('references/rubric.md is missing; run with --write from a dev-linked harness')
  })

  test('reports stale when the on-disk catalogue no longer matches the definition', async () => {
    const box = await sandbox()
    await box.setupExampleHarness({ rubric: rubric(mixedFamilies) })
    await box.data.write('ki/harnesses/example/harness/skills/ki-example/references/rubric.md', 'stale content\n')

    const result = await box.run('ki dev skill rubric ki-example')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('references/rubric.md is stale; run with --write from a dev-linked harness')
  })

  test('produces byte-identical output across repeated renders', async () => {
    const box = await sandbox()
    await box.setupExampleHarness({ rubric: rubric(mixedFamilies) })
    await devLinkExampleHarness(box, rubric(mixedFamilies))
    const target = 'ki/harnesses/example/harness/skills/ki-example/references/rubric.md'

    await box.run('ki dev skill rubric ki-example --write')
    const first = await box.data.read(target)
    await box.run('ki dev skill rubric ki-example --write')
    const second = await box.data.read(target)

    expect(first).toBe(second)
  })

  test('refuses --write against an installed, non-dev-linked payload', async () => {
    const box = await sandbox()
    await box.setupExampleHarness({ rubric: rubric(mixedFamilies) })

    const result = await box.run('ki dev skill rubric ki-example --write')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('run ki dev local on before writing its rubric catalogue')
    await expect(box.data.read('ki/harnesses/example/harness/skills/ki-example/references/rubric.md')).rejects.toThrow()
  })

  test('refuses a skill with no rubric definition module', async () => {
    const box = await sandbox()
    await box.setupExampleHarness()

    const result = await box.run('ki dev skill rubric ki-example')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('does not provide a rubric catalogue')
  })

  test('refuses an unknown skill', async () => {
    const box = await sandbox()
    await box.setupExampleHarness({ rubric: rubric(mixedFamilies) })

    const result = await box.run('ki dev skill rubric does-not-exist')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('no installed harness provides skill does-not-exist')
  })

  test('refuses a skill provided by multiple installed harnesses', async () => {
    const box = await sandbox()
    await box.setupExampleHarness({ rubric: rubric(mixedFamilies) })
    await box.data.write('ki/harnesses/second/harness/skills/ki-example/SKILL.md', '---\nname: ki-example\nki-depends-on: []\n---\n')

    const result = await box.run('ki dev skill rubric ki-example')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('is provided by multiple installed harnesses')
  })
})
