import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, test } from 'vitest'
import { ambiguousMirrorFrontmatter, classifySourceMirror } from './source-mirrors.ts'

const fields = { source_path: 'Records/Example.pdf', source_sha256: 'a'.repeat(64) }
const extract = Array.from({ length: 40 }, (_, index) => `fact${index}`).join(' ')

test('ordinary notes retain no mirror label and malformed provenance stays unknown', () => {
  expect(classifySourceMirror({ fields: { note_type: 'resource' }, body: extract }).mirror_content).toBeNull()
  expect(classifySourceMirror({ fields: null, body: extract, malformed: true }).mirror_content).toBe('unknown')
  expect(classifySourceMirror({ fields: { source_sha256: fields.source_sha256 }, body: extract }).mirror_content).toBe(
    'unknown'
  )
})

test('recognized declarations distinguish minimum extracts from pointers without attesting fidelity', () => {
  expect(classifySourceMirror({ fields, body: extract })).toMatchObject({
    mirror_content: 'extract',
    source_path: fields.source_path,
    source_sha256: fields.source_sha256,
    word_count: 40,
    issues: []
  })
  expect(classifySourceMirror({ fields, body: 'See the source.' }).mirror_content).toBe('pointer')
  expect(classifySourceMirror({ fields: { source_path: fields.source_path }, body: extract }).mirror_content).toBe(
    'unknown'
  )
  expect(classifySourceMirror({ fields: { ...fields, source_sha256: 'forged' }, body: extract }).mirror_content).toBe(
    'unknown'
  )
})

test('headings, links and comments cannot manufacture an extract', () => {
  const body = `# ${extract}\n\n[${extract}](Records/Example.pdf)\n[[Records/Example|${extract}]]\n<!-- ${extract} -->`
  expect(classifySourceMirror({ fields, body })).toMatchObject({ mirror_content: 'pointer', word_count: 0 })
})

test('source paths cannot cross the declared store-relative boundary', () => {
  for (const source_path of [
    '/private/a.pdf',
    '../a.pdf',
    'Records/../a.pdf',
    'C:\\a.pdf',
    'https://host/a.pdf',
    'Records//a.pdf',
    'Records/./a.pdf',
    'Records/a\u0000.pdf'
  ])
    expect(classifySourceMirror({ fields: { ...fields, source_path }, body: extract }).mirror_content).toBe('unknown')
})

test('raw provenance grammar cannot accept last-wins, quoted-key, merge, flow or alias declarations', () => {
  for (const frontmatter of [
    'source_path: ../Outside.pdf\nsource_path: Records/Example.pdf',
    '"source_path": Records/Example.pdf',
    '"source_\\u0070ath": Records/Example.pdf',
    'base: &base\n  source_path: Records/Example.pdf\n<<: *base',
    '{source_path: Records/Example.pdf, source_sha256: abc}',
    'source_path: *approved',
    'source_sha256: &checksum abc'
  ]) {
    expect(ambiguousMirrorFrontmatter(frontmatter)).toBe(true)
    expect(classifySourceMirror({ fields, body: extract, frontmatter }).mirror_content).toBe('unknown')
  }
  expect(
    ambiguousMirrorFrontmatter(
      `note_type: resource\nsource_path: "Records/Example.pdf"\nsource_sha256: '${'a'.repeat(64)}'`
    )
  ).toBe(false)
})

test('byte-vendored canonical mirror helper retains frozen upstream receipt', async () => {
  const bytes = await readFile(new URL('./source-mirrors.ts', import.meta.url))
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    '427930c35888981bad777a3da9e7cc71023d145dc4fa8da8b3f0bc5caa99065d'
  )
})

test('unrelated nested fields, blank lines and comments never invent mirror authority', () => {
  expect(ambiguousMirrorFrontmatter('\n# comment\nnote_type: resource\n  nested: ordinary\n')).toBe(false)
  expect(ambiguousMirrorFrontmatter('note_type: resource\n  source_path: Records/Source.pdf')).toBe(true)
})
