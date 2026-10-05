import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, test } from 'vitest'
import { ambiguousMirrorFrontmatter, classifySourceMirror } from './source-mirrors.ts'

const fields = {
  mirrors: 'kit-example-sources/Records/Example.pdf',
  mirror_type: 'summarised',
  mirror_sha256: 'a'.repeat(64)
}
const extract = Array.from({ length: 40 }, (_, index) => `fact${index}`).join(' ')

test('ordinary notes retain no mirror label and malformed provenance stays unknown', () => {
  expect(classifySourceMirror({ fields: { note_type: 'resource' }, body: extract }).mirror_content).toBeNull()
  expect(classifySourceMirror({ fields: null, body: extract, malformed: true }).mirror_content).toBe('unknown')
  expect(classifySourceMirror({ fields: { mirror_sha256: fields.mirror_sha256 }, body: extract }).mirror_content).toBe(
    'unknown'
  )
})

test('source provenance is a separate relationship and never makes a mirror', () => {
  const derived = { source_path: 'kit-example-sources/Records/Export.txt', source_sha256: 'b'.repeat(64) }
  expect(classifySourceMirror({ fields: derived, body: 'One day of a conversation.' })).toMatchObject({
    mirror_content: null,
    issues: []
  })
  expect(ambiguousMirrorFrontmatter('source_path: *alias\nsource_sha256: &checksum abc')).toBe(false)
})

test('mirror_type decides extract or pointer without attesting fidelity', () => {
  expect(classifySourceMirror({ fields, body: extract })).toMatchObject({
    mirror_content: 'extract',
    mirrors: fields.mirrors,
    mirror_type: 'summarised',
    mirror_sha256: fields.mirror_sha256,
    issues: []
  })
  expect(classifySourceMirror({ fields, body: 'MacBook 16-inch, £2,159.10.' })).toMatchObject({
    mirror_content: 'extract',
    issues: []
  })
  expect(
    classifySourceMirror({ fields, body: '# Example.pdf\n\n**Source:** `kit-example-sources/Records/Example.pdf`\n' })
  ).toMatchObject({ mirror_content: 'pointer', word_count: 0, issues: ['mirror body has no content'] })
  const { mirror_sha256: _checksum, ...unhashed } = fields
  expect(classifySourceMirror({ fields: unhashed, body: extract }).mirror_content).toBe('unknown')
  expect(classifySourceMirror({ fields: { ...fields, mirror_sha256: 'forged' }, body: extract }).mirror_content).toBe(
    'unknown'
  )
})

test('mirror_type is required and indexed mirrors may have no body', () => {
  for (const mirror_type of [undefined, 'pointer', 'full', 'Summarised'])
    expect(classifySourceMirror({ fields: { ...fields, mirror_type }, body: extract })).toMatchObject({
      mirror_content: 'unknown',
      issues: [expect.stringContaining('mirror_type')]
    })
  expect(
    classifySourceMirror({ fields: { ...fields, mirror_type: 'indexed' }, body: 'Timesheet for April.' })
  ).toMatchObject({ mirror_content: 'pointer', mirror_type: 'indexed', issues: [] })
  expect(classifySourceMirror({ fields: { ...fields, mirror_type: 'indexed' }, body: '' }).issues).toEqual([])
})

test('headings, links, code, labels and comments cannot manufacture an extract', () => {
  const body = `# ${extract}\n\n[${extract}](Records/Example.pdf)\n[[Records/Example|${extract}]]\n<!-- ${extract} -->\n\`${extract}\`\nOther source files:`
  expect(classifySourceMirror({ fields, body })).toMatchObject({ mirror_content: 'pointer', word_count: 0 })
})

test('mirrors names one file under a store alias and cannot cross the store boundary', () => {
  for (const mirrors of [
    'Records/Example.pdf',
    'kit-example-sources',
    'kit-example-sources/Records/',
    '/private/a.pdf',
    'kit-example-sources/../a.pdf',
    'kit-example-sources/Records/../a.pdf',
    'C:\\a.pdf',
    'https://host/a.pdf',
    'kit-example-sources/Records//a.pdf',
    'kit-example-sources/Records/./a.pdf',
    'kit-example-sources/Records/a\u0000.pdf',
    ['kit-example-sources/Records/a.pdf', 'kit-example-sources/Records/b.pdf']
  ])
    expect(classifySourceMirror({ fields: { ...fields, mirrors }, body: extract }).mirror_content).toBe('unknown')
})

test('raw provenance grammar cannot accept last-wins, quoted-key, merge, flow or alias declarations', () => {
  for (const frontmatter of [
    'mirrors: ../Outside.pdf\nmirrors: kit-example-sources/Records/Example.pdf',
    '"mirrors": kit-example-sources/Records/Example.pdf',
    '"mirror\\u0073": kit-example-sources/Records/Example.pdf',
    'base: &base\n  mirrors: kit-example-sources/Records/Example.pdf\n<<: *base',
    '{mirrors: kit-example-sources/Records/Example.pdf, mirror_sha256: abc}',
    'mirrors: *approved',
    'mirror_type: >-\n  summarised',
    'mirror_sha256: &checksum abc'
  ]) {
    expect(ambiguousMirrorFrontmatter(frontmatter)).toBe(true)
    expect(classifySourceMirror({ fields, body: extract, frontmatter }).mirror_content).toBe('unknown')
  }
  expect(
    ambiguousMirrorFrontmatter(
      `note_type: resource\nmirrors: "kit-example-sources/Records/Example.pdf"\nmirror_type: summarised\nmirror_sha256: '${'a'.repeat(64)}'`
    )
  ).toBe(false)
})

test('byte-vendored canonical mirror helper retains frozen upstream receipt', async () => {
  const bytes = await readFile(new URL('./source-mirrors.ts', import.meta.url))
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    'aeb36ba9e9840989b38f87ff81360c29239fe530ac0aed8fb43e2a0d4f134128'
  )
})

test('unrelated nested fields, blank lines and comments never invent mirror authority', () => {
  expect(ambiguousMirrorFrontmatter('\n# comment\nnote_type: resource\n  nested: ordinary\n')).toBe(false)
  expect(ambiguousMirrorFrontmatter('note_type: resource\n  mirrors: kit-example-sources/Records/Source.pdf')).toBe(
    true
  )
})
