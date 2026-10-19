import { symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from '../_cli_helper.ts'

/** A vault shaped like ki-principal: an `.obsidian` root, spaces and mixed case, diagrams and duplicate leaf names. */
const setupVault = async (box: Sandbox): Promise<void> => {
  await box.project.write('.obsidian/app.json', '{}\n')
  await box.project.write('Streams/Projects/Projects.md', '# Projects\n')
  await box.project.write('Streams/Projects/observatory.md', '# Observatory\n')
  await box.project.write('Streams/Themes/Themes.md', '# Themes\n')
  await box.project.write('+/_WORK/ki/design/themes.md', '# Themes design\n')
  await box.project.write('Admin/Operations/Processes/Enactment Process.md', '# Enactment Process\n')
  await box.project.write('Pillars/Model/Enactment Process/Enactment Process.md', '# Enactment\n')
  await box.project.write('Pillars/Diagrams/knowledge-hierarchy.png', 'png')
  await box.project.write('Pillars/Diagrams/Island Map (v2).png', 'png')
  await box.project.write('Resources/100% Done.md', '# Done\n')
  await box.project.write('Resources/Why?.md', '# Why\n')
  await box.project.write(
    'Resources/Guide.md',
    [
      '# Guide',
      '## Set up the Rig ##',
      '## Set up the Rig',
      '### `ki` and *more*',
      '## See [[Projects|the projects]], [docs](x) and <b>now</b>',
      '```',
      '# Fake',
      '```',
      ''
    ].join('\n')
  )
  await box.project.write('node_modules/pkg/Guide.md', '# Ignored\n')
  await box.project.write('.trash/Guide.md', '# Ignored\n')
}

const gfm = (box: Sandbox, ...args: string[]) => box.run(['ki', 'markdown', 'gfm', ...args])

const items = (stdout: string): string[] =>
  stdout
    .slice(stdout.indexOf('items:\n') + 'items:\n'.length)
    .split('\n')
    .filter((line) => line && !line.startsWith('dry run:'))

describe('ki markdown gfm', () => {
  test('converts wikilinks and unsized embeds to document-relative GFM links in exact on-disk case', async () => {
    const box = await sandbox()
    await setupVault(box)
    await box.project.write(
      'Streams/Streams.md',
      [
        '# Streams',
        '',
        'See [[observatory|Observatory]], [[Projects/observatory]] and [[streams/themes/themes]].',
        'Read [[../Admin/Operations/Processes/Enactment Process]] and [[100% Done.md]] and [[Why?]].',
        '',
        '| Project | Note |',
        '| --- | --- |',
        '| [[Projects/observatory\\|Observatory]] | [[Enactment Process/Enactment Process|Enactment Process]] |',
        '',
        '![[knowledge-hierarchy.png]] and ![[Island Map (v2).png|The map]] and [[Streams|_draft_ a_b *c* `e` <f> ~g~ \\h_]].',
        '',
        '[ref]: <../Resources/Guide.md> "kept"',
        ''
      ].join('\n')
    )
    const result = await gfm(box, '--dry-run', 'Streams/Streams.md')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe(
      [
        '--- a/Streams/Streams.md',
        '+++ b/Streams/Streams.md',
        '@@ -3,2 +3,2 @@',
        '-See [[observatory|Observatory]], [[Projects/observatory]] and [[streams/themes/themes]].',
        '-Read [[../Admin/Operations/Processes/Enactment Process]] and [[100% Done.md]] and [[Why?]].',
        '+See [Observatory](Projects/observatory.md), [Projects/observatory](Projects/observatory.md) and [streams/themes/themes](Themes/Themes.md).',
        '+Read [../Admin/Operations/Processes/Enactment Process](<../Admin/Operations/Processes/Enactment Process.md>) and [100% Done.md](<../Resources/100%25 Done.md>) and [Why?](../Resources/Why%3F.md).',
        '@@ -8 +8 @@',
        '-| [[Projects/observatory\\|Observatory]] | [[Enactment Process/Enactment Process|Enactment Process]] |',
        '+| [Observatory](Projects/observatory.md) | [Enactment Process](<../Pillars/Model/Enactment Process/Enactment Process.md>) |',
        '@@ -10 +10 @@',
        '-![[knowledge-hierarchy.png]] and ![[Island Map (v2).png|The map]] and [[Streams|_draft_ a_b *c* `e` <f> ~g~ \\h_]].',
        '+![knowledge-hierarchy.png](../Pillars/Diagrams/knowledge-hierarchy.png) and ![The map](<../Pillars/Diagrams/Island Map (v2).png>) and [\\_draft\\_ a_b \\*c\\* \\`e\\` \\<f> \\~g\\~ \\\\h\\_](Streams.md).',
        'dry run: 1 file, 1 changed, 11 links converted, 0 items, 0 undecided',
        ''
      ].join('\n')
    )
  })

  test('leaves every construct needing judgement untouched and lists it by line', async () => {
    const box = await sandbox()
    await setupVault(box)
    const note = [
      '---',
      'up: "[[Projects]]"',
      '...',
      '# Items',
      '[[Guide#Set up the Rig]] [[Guide#^block]] ![[Island Map (v2).png|400]] ![[knowledge-hierarchy.png|alt|200x100]]',
      '![[Guide]] ![[knowledge-hierarchy.png#x]] [[Themes]] [[Nowhere]] [[../../Escape]] [[/Streams/Projects/Projects]]',
      '[[{{project}}]] [[<% tp.file.title %>]] {{ [[Guide]] }} <%* [[Guide]] %> {{ unclosed [[Guide]]',
      '%% [[Guide]] %% <!-- [[Guide]] --> \\[[Guide]] `[[Guide]]` ``a ` [[Guide]]`` ` [[Guide]]',
      '> [!todo] Callout [[Guide]]',
      '> [!note] Standard',
      '> [!NOTE]- Folded',
      '> [!warning]',
      '```dataview',
      'LIST FROM [[Guide]]',
      '```',
      '`= this.file.name` and `$= dv.current()`',
      '- item',
      '  > ````',
      '  > ```',
      '  > [[Guide]] > [!todo]',
      '  > ````',
      '~~~dataviewjs',
      '[[Guide]]',
      '~~~',
      '[see](Missing%20File.md) [bad](bad%2%20.md) [web](https://example.com/a%20b) [abs](/a%20b.md) \\[esc](a%20b.md)',
      '%% unclosed [[Guide]]',
      ''
    ].join('\n')
    await box.project.write('Streams/Items.md', note)
    const result = await gfm(box, '--dry-run', 'Streams/Items.md')
    expect(result.exitCode).toBe(0)
    expect(result.stdout.startsWith('--- a/Streams/Items.md\n+++ b/Streams/Items.md\n@@ -7,3 +7,3 @@\n')).toBe(true)
    expect(result.stdout).toContain(
      '+[[{{project}}]] [[<% tp.file.title %>]] {{ [[Guide]] }} <%* [[Guide]] %> {{ unclosed [Guide](../Resources/Guide.md)\n'
    )
    expect(result.stdout).toContain(
      '+%% [[Guide]] %% <!-- [[Guide]] --> \\[[Guide]] `[[Guide]]` ``a ` [[Guide]]`` ` [Guide](../Resources/Guide.md)\n'
    )
    expect(result.stdout).toContain('+> [!todo] Callout [Guide](../Resources/Guide.md)\n')
    expect(items(result.stdout)).toEqual([
      'Streams/Items.md:2: front-matter-link [[Projects]]',
      'Streams/Items.md:5: heading-link [[Guide#Set up the Rig]]',
      'Streams/Items.md:5: block-reference [[Guide#^block]]',
      'Streams/Items.md:5: sized-embed ![[Island Map (v2).png|400]]',
      'Streams/Items.md:5: sized-embed ![[knowledge-hierarchy.png|alt|200x100]]',
      'Streams/Items.md:6: transclusion ![[Guide]]',
      'Streams/Items.md:6: transclusion ![[knowledge-hierarchy.png#x]]',
      'Streams/Items.md:6: ambiguous [[Themes]] (+/_WORK/ki/design/themes.md, Streams/Themes/Themes.md)',
      'Streams/Items.md:6: unresolved [[Nowhere]]',
      'Streams/Items.md:6: unresolved [[../../Escape]]',
      'Streams/Items.md:6: unresolved [[/Streams/Projects/Projects]]',
      'Streams/Items.md:7: template-destination [[{{project}}]]',
      'Streams/Items.md:7: template-destination [[<% tp.file.title %>]]',
      'Streams/Items.md:7: template-destination [[Guide]]',
      'Streams/Items.md:7: template-destination [[Guide]]',
      'Streams/Items.md:8: comment-link [[Guide]]',
      'Streams/Items.md:8: comment-link [[Guide]]',
      'Streams/Items.md:9: callout [!todo]',
      'Streams/Items.md:11: callout [!NOTE]-',
      'Streams/Items.md:13: dataview ```dataview',
      'Streams/Items.md:16: dataview `= this.file.name`',
      'Streams/Items.md:16: dataview `$= dv.current()`',
      'Streams/Items.md:22: dataview ~~~dataviewjs',
      'Streams/Items.md:25: unresolved [see](Missing%20File.md)',
      'Streams/Items.md:25: unresolved [bad](bad%2%20.md)',
      'Streams/Items.md:26: comment-link [[Guide]]'
    ])
    expect(result.stdout).toContain(
      'dry run: 1 file, 1 changed, 3 links converted, 26 items (front-matter-link 1, heading-link 1, block-reference 1, sized-embed 2, transclusion 2, ambiguous 1, unresolved 5, template-destination 4, comment-link 3, callout 2, dataview 4), 26 undecided\n'
    )
  })

  test('respells Obsidian %20 destinations with a bracketed space, keeping fragments and other escapes', async () => {
    const box = await sandbox()
    await setupVault(box)
    await box.project.write(
      'Streams/Percent.md',
      [
        '[the rig](../Admin/Operations/Processes/Enactment%20Process.md#Some%20Heading) and [plain](../Resources/Guide.md)',
        '![map](../Pillars/Diagrams/Island%20Map%20(v2).png) and [done](../Resources/100%25%20Done.md)',
        '`[code](a%20b.md)`',
        ''
      ].join('\n')
    )
    const result = await gfm(box, '--dry-run', 'Streams/Percent.md')
    expect(result.stdout).toBe(
      [
        '--- a/Streams/Percent.md',
        '+++ b/Streams/Percent.md',
        '@@ -1,2 +1,2 @@',
        '-[the rig](../Admin/Operations/Processes/Enactment%20Process.md#Some%20Heading) and [plain](../Resources/Guide.md)',
        '-![map](../Pillars/Diagrams/Island%20Map%20(v2).png) and [done](../Resources/100%25%20Done.md)',
        '+[the rig](<../Admin/Operations/Processes/Enactment Process.md#Some%20Heading>) and [plain](../Resources/Guide.md)',
        '+![map](<../Pillars/Diagrams/Island Map (v2).png>) and [done](<../Resources/100%25 Done.md>)',
        'dry run: 1 file, 1 changed, 3 links converted, 0 items, 0 undecided',
        ''
      ].join('\n')
    )
  })

  test('converts heading links to GitHub slugs when the batch decides heading fragments', async () => {
    const box = await sandbox()
    await setupVault(box)
    await box.project.write('decisions.toml', 'heading_fragments = "github"\n')
    await box.project.write(
      'Streams/Headings.md',
      [
        '# Heading Links',
        '[[Guide#Set up the Rig]] [[Guide#set up the rig|the Rig]] [[Guide#`ki` and *more*]]',
        '[[Guide#See [[Projects|the projects]], [docs](x) and <b>now</b>]] [[#Heading Links]] [[#heading links|top]]',
        '[[Guide#Fake]] [[Guide#Missing]] [[knowledge-hierarchy.png#x]] [[Nowhere#x]]',
        ''
      ].join('\n')
    )
    const result = await gfm(box, '--dry-run', '--decisions', 'decisions.toml', 'Streams/Headings.md')
    expect(result.stdout).toContain(
      '+[Guide > Set up the Rig](../Resources/Guide.md#set-up-the-rig) [the Rig](../Resources/Guide.md#set-up-the-rig) [Guide > \\`ki\\` and \\*more\\*](../Resources/Guide.md#ki-and-more)\n'
    )
    expect(result.stdout).toContain('[Heading Links](#heading-links) [top](#heading-links)\n')
    expect(items(result.stdout)).toEqual([
      'Streams/Headings.md:4: missing-heading [[Guide#Fake]]',
      'Streams/Headings.md:4: missing-heading [[Guide#Missing]]',
      'Streams/Headings.md:4: missing-heading [[knowledge-hierarchy.png#x]]',
      'Streams/Headings.md:4: unresolved [[Nowhere#x]]'
    ])
  })

  test('lists a whole file it must not convert: protected, generated or not valid UTF-8', async () => {
    const box = await sandbox()
    await setupVault(box)
    await box.project.write('Streams/_Voice Notes/rec.md', '[[Guide]]\n')
    await box.project.write('Streams/Held/held.md', '[[Guide]]\n')
    await box.project.write('Streams/Generated.md', '﻿<!-- Generated by ki -->\n[[Guide]]\n')
    await writeFile(join(box.project.path, 'Streams/Binary.md'), Buffer.from([0x5b, 0x5b, 0xff, 0x5d, 0x5d, 0x0a]))
    await box.project.write('Streams/.hidden/skipped.md', '[[Guide]]\n')
    await box.project.write('Streams/picture.png', 'png')
    await box.project.write('decisions.toml', 'protected = ["Streams/Held/"]\n')
    const result = await gfm(box, '--dry-run', '--decisions', 'decisions.toml', 'Streams')
    expect(result.stdout).toBe(
      [
        'items:',
        'Streams/Binary.md:1: encoding Streams/Binary.md',
        'Streams/Generated.md:1: generated Streams/Generated.md',
        'Streams/Held/held.md:1: protected Streams/Held/held.md',
        'Streams/_Voice Notes/rec.md:1: protected Streams/_Voice Notes/rec.md',
        'dry run: 7 files, 0 changed, 0 links converted, 4 items (encoding 1, generated 1, protected 2), 4 undecided',
        ''
      ].join('\n')
    )
  })

  test('applies keep and convert decisions to listed items, refusing a convert for any other kind', async () => {
    const box = await sandbox()
    await setupVault(box)
    await box.project.write('Streams/Decided.md', '[[Themes]] [[Nowhere]] [[Later]] [[Guide#Set up the Rig]]\n')
    await box.project.write('Streams/Later Note.md', '# Later\n')
    await box.project.write(
      'decisions.toml',
      [
        '[[item]]',
        'path = "Streams/Decided.md"',
        'text = "[[Themes]]"',
        'action = "convert"',
        'target = "Streams/Themes/Themes.md"',
        '',
        '[[item]]',
        'path = "Streams/Decided.md"',
        'text = "[[Nowhere]]"',
        'action = "keep"',
        '',
        '[[item]]',
        'path = "Streams/Decided.md"',
        'text = "[[Later]]"',
        'action = "convert"',
        'target = "Streams/Later Note.md"',
        '',
        '[[item]]',
        'path = "Streams/Decided.md"',
        'text = "[[Guide#Set up the Rig]]"',
        'action = "convert"',
        'target = "Resources/Guide.md"',
        ''
      ].join('\n')
    )
    const result = await gfm(box, '--dry-run', '--decisions', 'decisions.toml', 'Streams/Decided.md')
    expect(result.stdout).toBe(
      [
        '--- a/Streams/Decided.md',
        '+++ b/Streams/Decided.md',
        '@@ -1 +1 @@',
        '-[[Themes]] [[Nowhere]] [[Later]] [[Guide#Set up the Rig]]',
        '+[Themes](Themes/Themes.md) [[Nowhere]] [Later](<Later Note.md>) [[Guide#Set up the Rig]]',
        'items:',
        'Streams/Decided.md:1: unresolved [[Nowhere]] (keep)',
        'Streams/Decided.md:1: heading-link [[Guide#Set up the Rig]]',
        'dry run: 1 file, 1 changed, 2 links converted, 2 items (unresolved 1, heading-link 1), 1 undecided',
        ''
      ].join('\n')
    )
  })

  test.each([
    ['a = ', 'invalid decisions file'],
    ['other = 1\n', 'unknown key other'],
    ['heading_fragments = "obsidian"\n', 'heading_fragments must be "github"'],
    ['protected = "Streams"\n', 'protected must be an array of root-relative paths'],
    ['protected = [1]\n', 'protected must be an array of root-relative paths'],
    ['item = 1\n', 'item must be an array of tables'],
    ['[[item]]\npath = "a.md"\ntext = "b"\naction = "keep"\nnote = 1\n', 'item 1 has unknown key note'],
    ['[[item]]\ntext = "b"\naction = "keep"\n', 'item 1 needs a path and a text'],
    ['[[item]]\npath = "a.md"\ntext = "b"\naction = "drop"\n', 'item 1 needs action "keep"'],
    ['[[item]]\npath = "a.md"\ntext = "b"\naction = "keep"\ntarget = "Resources/Guide.md"\n', 'item 1 needs action'],
    ['[[item]]\npath = "a.md"\ntext = "b"\naction = "convert"\ntarget = "resources/guide.md"\n', 'exact case']
  ])('refuses a decisions file %j', async (content, message) => {
    const box = await sandbox()
    await setupVault(box)
    await box.project.write('decisions.toml', content)
    const result = await gfm(box, '--dry-run', '--decisions', 'decisions.toml', 'Resources')
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain(message)
    expect(result.stdout).toBe('')
  })

  test('refuses a missing decisions file', async () => {
    const box = await sandbox()
    await setupVault(box)
    const result = await gfm(box, '--dry-run', '--decisions', 'none.toml', 'Resources')
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('decisions file not found')
  })

  test('finds the vault root from .obsidian or .git, or takes --root, and fails closed without one', async () => {
    const box = await sandbox()
    await box.project.write('vault/.git/HEAD', 'ref: refs/heads/main\n')
    await box.project.write('vault/Notes/a.md', '---\n[[b]]\n')
    await box.project.write('vault/b.md', '# B\n')
    await box.project.write('vault/Notes/c.png', 'png')
    await symlink('b.md', join(box.project.path, 'vault/link.md'))
    box.cd('vault/Notes')
    expect((await gfm(box, '--dry-run', 'a.md')).stdout).toContain('+[b](../b.md)\n')
    expect((await gfm(box, '--dry-run', '--root', '.', 'a.md')).stdout).toContain('unresolved [[b]]')
    const missing = await gfm(box, '--dry-run', '--root', 'nowhere', 'a.md')
    expect(missing.stderr).toContain('vault root is not a directory: nowhere')
    const file = await gfm(box, '--dry-run', '--root', 'a.md', 'a.md')
    expect(file.stderr).toContain('vault root is not a directory: a.md')
    const outside = await gfm(box, '--dry-run', '--root', '.', '../b.md')
    expect(outside.stderr).toContain('path ../b.md is outside the vault root')
    expect((await gfm(box, '--dry-run', 'gone.md')).stderr).toContain('path not found: gone.md')
    expect((await gfm(box, '--dry-run', 'c.png')).stderr).toContain('path c.png is not a Markdown file or directory')
    const bare = await sandbox()
    await bare.project.write('a.md', '[[b]]\n')
    const none = await gfm(bare, '--dry-run', 'a.md')
    expect(none.exitCode).toBe(1)
    expect(none.stderr).toContain('no vault root holding .obsidian or .git encloses')
  })

  test.each([
    [['--dry-run', '--manifest', 'm.json', 'a.md'], '--manifest applies only without --dry-run'],
    [['a.md'], 'an apply needs --preview <file> from a dry run and --manifest <file>'],
    [['--preview', 'p.json', 'a.md'], 'an apply needs --preview']
  ])('refuses the grammar %j', async (args, message) => {
    const box = await sandbox()
    const result = await gfm(box, ...args)
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain(message)
  })

  test('applies a reviewed preview, writing the manifest first, and a second run changes nothing', async () => {
    const box = await sandbox()
    await setupVault(box)
    await box.project.write('Streams/One.md', '---\ntitle: one\n---\r\n[[Guide]] and [[Two]]\r\n\nkept [ref]: x\n')
    await box.project.write('Streams/Two.md', '[[One|back]]\n')
    await box.project.write('Streams/Untouched.md', '[[Guide]]\n')
    const dry = await gfm(box, '--dry-run', '--preview', 'preview.json', 'Streams/One.md', 'Streams/Two.md')
    expect(dry.stdout).toContain('preview: preview.json\n')
    const preview = JSON.parse(await box.project.read('preview.json'))
    expect(preview.schema).toBe('ki/markdown-gfm-preview/v1')
    expect(preview.files.map((file: { path: string }) => file.path)).toEqual(['Streams/One.md', 'Streams/Two.md'])
    const applied = await gfm(
      box,
      '--preview',
      'preview.json',
      '--manifest',
      'manifest.json',
      'Streams/One.md',
      'Streams/Two.md'
    )
    expect(applied.exitCode).toBe(0)
    expect(applied.stdout).toBe(
      'applied: 2 files, 2 changed, 3 links converted, 0 items, 0 undecided\nmanifest: manifest.json\n'
    )
    expect(await box.project.read('Streams/One.md')).toBe(
      '---\ntitle: one\n---\r\n[Guide](../Resources/Guide.md) and [Two](Two.md)\r\n\nkept [ref]: x\n'
    )
    expect(await box.project.read('Streams/Two.md')).toBe('[back](One.md)\n')
    expect(await box.project.read('Streams/Untouched.md')).toBe('[[Guide]]\n')
    const manifest = JSON.parse(await box.project.read('manifest.json'))
    expect(manifest.schema).toBe('ki/markdown-gfm-manifest/v1')
    expect(manifest.files[1]).toEqual({
      path: 'Streams/Two.md',
      before: expect.stringMatching(/^[0-9a-f]{64}$/),
      after: expect.stringMatching(/^[0-9a-f]{64}$/),
      preimage: '[[One|back]]\n'
    })
    const again = await gfm(box, '--dry-run', 'Streams/One.md', 'Streams/Two.md')
    expect(again.stdout).toBe('dry run: 2 files, 0 changed, 0 links converted, 0 items, 0 undecided\n')
    const reused = await gfm(box, '--preview', 'preview.json', '--manifest', 'manifest.json', 'Streams/One.md')
    expect(reused.stderr).toContain('batch aborted, nothing written')
  })

  test('aborts the whole batch, writing nothing, when it departs from the preview or leaves items undecided', async () => {
    const box = await sandbox()
    await setupVault(box)
    await box.project.write('Streams/One.md', '[[Guide]]\n')
    await box.project.write('Streams/Two.md', '[[Later]]\n')
    await box.project.write('decisions.toml', 'heading_fragments = "github"\n')
    const apply = (...paths: string[]) => gfm(box, '--preview', 'preview.json', '--manifest', 'manifest.json', ...paths)
    const dry = (...paths: string[]) => gfm(box, '--dry-run', '--preview', 'preview.json', ...paths)

    expect((await apply('Streams/One.md')).stderr).toContain('preview not found')
    await box.project.write('preview.json', 'not json')
    expect((await apply('Streams/One.md')).stderr).toContain('not a ki/markdown-gfm-preview/v1 preview')

    await dry('Streams/One.md')
    const preview = await box.project.read('preview.json')
    await box.project.write('preview.json', preview.replace(/"root": "[^"]*"/, '"root": "/elsewhere"'))
    expect((await apply('Streams/One.md')).stderr).toContain('not the previewed /elsewhere')
    await box.project.write('preview.json', preview)
    const decided = await gfm(
      box,
      '--decisions',
      'decisions.toml',
      '--preview',
      'preview.json',
      '--manifest',
      'manifest.json',
      'Streams/One.md'
    )
    expect(decided.stderr).toContain('the decisions file differs from the previewed one')
    expect((await apply('Streams/One.md', 'Streams/Two.md')).stderr).toContain('Streams/Two.md: not in the preview')
    await dry('Streams/One.md', 'Streams/Two.md')
    expect((await apply('Streams/One.md')).stderr).toContain('Streams/Two.md: previewed but not named now')
    await box.project.write('Streams/One.md', '[[Guide]] \n')
    expect((await apply('Streams/One.md', 'Streams/Two.md')).stderr).toContain(
      'Streams/One.md: changed since the preview'
    )
    await dry('Streams/One.md', 'Streams/Two.md')
    await box.project.write('Streams/Later.md', '# Later\n')
    expect((await apply('Streams/One.md', 'Streams/Two.md')).stderr).toContain(
      'Streams/Two.md: its conversion differs from the preview'
    )

    await box.project.write('Streams/Two.md', '[[Nowhere]] [[Elsewhere]]\n')
    await dry('Streams/One.md', 'Streams/Two.md')
    const refused = await apply('Streams/One.md', 'Streams/Two.md')
    expect(refused.exitCode).toBe(1)
    expect(refused.stdout).toBe(
      'items:\nStreams/Two.md:1: unresolved [[Nowhere]]\nStreams/Two.md:1: unresolved [[Elsewhere]]\n'
    )
    expect(refused.stderr).toContain('batch refused, nothing written: 2 undecided items')
    await box.project.write('Streams/Two.md', '[[Nowhere]]\n')
    await dry('Streams/One.md', 'Streams/Two.md')
    expect((await apply('Streams/One.md', 'Streams/Two.md')).stderr).toContain(
      'batch refused, nothing written: 1 undecided item\n'
    )
    expect(await box.project.read('Streams/One.md')).toBe('[[Guide]] \n')

    await dry('Streams/One.md')
    await box.project.write('manifest.json', '{}\n')
    const exists = await apply('Streams/One.md')
    expect(exists.stderr).toContain('it must be a new file')
    expect(await box.project.read('Streams/One.md')).toBe('[[Guide]] \n')
  })
})
