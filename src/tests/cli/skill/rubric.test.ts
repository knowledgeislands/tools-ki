import { rm, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from '../_cli_helper.ts'

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
      mechanical: { level: 'FAIL', remediation: { class: 'diagnostic', guidance: 'Diagnose the evidence.' }, audit: { phase: 'PRIMARY', run: async () => [] } } },
    { code: 'FAM-2', title: 'Judgment item', description: 'Judgment description.', sources: ['standard.md#judgment'],
      judgment: { scope: 'The item evidence.', prompt: 'weigh it by hand', outcomes: ['accepted', 'rework'], guidance: 'Record the selected outcome.' } },
    { code: 'FAM-3', title: 'Hybrid item', description: 'Hybrid description.', sources: ['standard.md#hybrid'],
      mechanical: { level: 'WARN', heuristic: true, remediation: { class: 'guarded', guidance: 'Apply the recorded review decision.' }, audit: { phase: 'INSPECT', run: async () => [] } },
      judgment: { scope: 'The heuristic evidence.', prompt: 'review the heuristic', outcomes: ['accepted', 'rework'], guidance: 'Record the selected outcome.' } }
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
  '  - _Remediation:_ diagnostic — Diagnose the evidence.',
  '- **FAM-2 [J] — Judgment item** — Judgment description. (standard.md#judgment)',
  '  - _Evidence scope:_ The item evidence.',
  '  - _Review prompt:_ weigh it by hand',
  '  - _Outcomes:_ accepted; rework',
  '  - _Conforming guidance:_ Record the selected outcome.',
  '- **FAM-3 [M-heuristic + J] — Hybrid item** — Hybrid description. (standard.md#hybrid)',
  '  - _Remediation:_ guarded — Apply the recorded review decision.',
  '  - _Evidence scope:_ The heuristic evidence.',
  '  - _Review prompt:_ review the heuristic',
  '  - _Outcomes:_ accepted; rework',
  '  - _Conforming guidance:_ Record the selected outcome.',
  ''
].join('\n')

// Simulates a complete local Harness root without going through `ki dev local on`. The checkout is a
// real Git working tree, as a development Harness always is — `--write` resolves that tree and refuses
// to publish into it from anywhere else. Returns the resolved skill source directory, which is the
// publication root every event now names.
const devLinkExampleHarness = async (
  box: Awaited<ReturnType<typeof sandbox>>,
  rubricSource: string
): Promise<string> => {
  await box.root.write('local/.ki.toml', '[skills.ki-repo-harness]\nprefix = "ki"\n')
  await box.root.write('local/skills/ki-example/SKILL.md', '---\nname: ki-example\nki-depends-on: []\n---\n')
  await box.root.write('local/skills/ki-example/scripts/rubric/items/index.ts', rubricSource)
  await Promise.all(['subagents', 'hooks'].map((payload) => box.root.mkdir(`local/${payload}`)))
  const installed = join(box.data.path, 'ki/harnesses/example/harness')
  await rm(installed, { recursive: true, force: true })
  await symlink(join(box.root.path, 'local'), installed)
  await box.root.git(['init'], 'local')
  return box.root.mkdir('local/skills/ki-example')
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
    const publicationRoot = await devLinkExampleHarness(box, rubric(mixedFamilies))
    box.cd('../local')

    const written = await box.run('ki dev skill rubric ki-example --write', { runner: 'default' })
    expect(written.exitCode).toBe(0)
    expect(written.output).toBe(`write ${publicationRoot}/references/rubric.md\n`)
    expect(await box.data.read(target)).toBe(expectedRendered)

    const checked = await box.run('ki dev skill rubric ki-example')
    expect(checked).toEqual({
      exitCode: 0,
      output: `ki dev skill rubric: example/harness:ki-example references/rubric.md is in sync in ${publicationRoot}\n`
    })
  })

  test('reports missing when references/rubric.md has never been generated', async () => {
    const box = await sandbox()
    await box.setupExampleHarness({ rubric: rubric(mixedFamilies) })

    const result = await box.run('ki dev skill rubric ki-example')

    expect(result.exitCode).toBe(1)
    expect(result.output).toMatch(
      /references\/rubric\.md is missing in .*skills\/ki-example; run with --write from a dev-linked harness/
    )
  })

  test('reports stale when the on-disk catalogue no longer matches the definition', async () => {
    const box = await sandbox()
    await box.setupExampleHarness({ rubric: rubric(mixedFamilies) })
    await box.data.write('ki/harnesses/example/harness/skills/ki-example/references/rubric.md', 'stale content\n')

    const result = await box.run('ki dev skill rubric ki-example')

    expect(result.exitCode).toBe(1)
    expect(result.output).toMatch(
      /references\/rubric\.md is stale in .*skills\/ki-example; run with --write from a dev-linked harness/
    )
  })

  test('produces byte-identical output across repeated renders', async () => {
    const box = await sandbox()
    await box.setupExampleHarness({ rubric: rubric(mixedFamilies) })
    await devLinkExampleHarness(box, rubric(mixedFamilies))
    box.cd('../local')
    const target = 'ki/harnesses/example/harness/skills/ki-example/references/rubric.md'

    await box.run('ki dev skill rubric ki-example --write', { runner: 'default' })
    const first = await box.data.read(target)
    await box.run('ki dev skill rubric ki-example --write', { runner: 'default' })
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

  test('names the resolved publication root even when the caller is nowhere near it', async () => {
    const box = await sandbox()
    await box.setupExampleHarness({ rubric: rubric(mixedFamilies) })
    const publicationRoot = await devLinkExampleHarness(box, rubric(mixedFamilies))
    box.cd('../home')

    const result = await box.run('ki dev skill rubric ki-example')

    // The command resolves the install and nothing about cwd, so a reader can only tell which tree it
    // answered about if the answer says so. `home` is not a checkout of anything.
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain(publicationRoot)
  })

  test('refuses an installed Harness prefix collision before resolving a skill', async () => {
    const box = await sandbox()
    await box.setupExampleHarness({ rubric: rubric(mixedFamilies) })
    await box.data.write('ki/harnesses/second/harness/.ki.toml', '[skills.ki-repo-harness]\nprefix = "ki"\n')
    await box.data.write(
      'ki/harnesses/second/harness/skills/ki-example/SKILL.md',
      '---\nname: ki-example\nki-depends-on: []\n---\n'
    )

    const result = await box.run('ki dev skill rubric ki-example')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('harness prefix ki is already owned by installed harness')
  })
})

// `--write` publishes into the tree the install resolves to, which under a dev-linked harness is a
// development checkout the caller may not be in. The guard compares working-tree roots for equality
// and refuses everything else, so a worktree cannot dirty the checkout its own install points at.
describe('[ki dev skill rubric --write publication-tree guard]', () => {
  const published = 'ki/harnesses/example/harness/skills/ki-example/references/rubric.md'

  const guardFixture = async (): Promise<{ readonly box: Sandbox; readonly checkoutRoot: string }> => {
    const box = await sandbox()
    await box.setupExampleHarness({ rubric: rubric(mixedFamilies) })
    await devLinkExampleHarness(box, rubric(mixedFamilies))
    return { box, checkoutRoot: await box.root.mkdir('local') }
  }

  test.each([
    ['the checkout root itself', '../local'],
    ['a subdirectory of the checkout', '../local/skills']
  ])('permits --write from %s', async (_, directory) => {
    const { box } = await guardFixture()
    box.cd(directory)

    const result = await box.run('ki dev skill rubric ki-example --write', { runner: 'default' })

    expect(result.exitCode).toBe(0)
    expect(await box.data.read(published)).toBe(expectedRendered)
  })

  test.each<[string, (box: Sandbox) => Promise<{ readonly directory: string; readonly caller: string }>]>([
    [
      'a linked worktree of the same repository',
      async (box) => {
        await box.root.git(['commit', '--allow-empty', '-m', 'base'], 'local')
        await box.root.git(['worktree', 'add', '../worktree', '-b', 'guard'], 'local')
        return { directory: '../worktree', caller: await box.root.mkdir('worktree') }
      }
    ],
    [
      'an unrelated repository',
      async (box) => {
        await box.root.git(['init'], 'other')
        return { directory: '../other', caller: await box.root.mkdir('other') }
      }
    ],
    [
      'a directory inside no repository at all',
      async (box) => ({
        directory: '.',
        caller: `${await box.project.mkdir('.')}, which is not inside a Git working tree`
      })
    ],
    [
      'a repository whose working tree encloses the checkout',
      async (box) => {
        await box.root.git(['init'])
        return { directory: '..', caller: await box.root.mkdir('.') }
      }
    ],
    [
      // The accidental form: a human exports GIT_WORK_TREE for their own tree, for an unrelated reason.
      // Both rev-parse calls inherit one environment, so unscrubbed this collapses each side onto that
      // value, equality holds vacuously, and the bytes still land in the resolved checkout.
      'a linked worktree with GIT_WORK_TREE exported for that same worktree',
      async (box) => {
        await box.root.git(['commit', '--allow-empty', '-m', 'base'], 'local')
        await box.root.git(['worktree', 'add', '../worktree', '-b', 'guard'], 'local')
        const caller = await box.root.mkdir('worktree')
        box.setEnv({ GIT_WORK_TREE: caller })
        return { directory: '../worktree', caller }
      }
    ]
  ])('refuses --write from %s', async (_, prepare) => {
    const { box, checkoutRoot } = await guardFixture()
    const { directory, caller } = await prepare(box)
    box.cd(directory)

    const result = await box.run('ki dev skill rubric ki-example --write', { runner: 'default' })

    expect(result.exitCode).toBe(2)
    expect(result.output).toContain(`rubric catalogue belongs to ${checkoutRoot}`)
    expect(result.output).toContain(`not to the current working tree ${caller}`)
    await expect(box.data.read(published)).rejects.toThrow()
  })
})
