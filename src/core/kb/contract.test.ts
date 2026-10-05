import { expect, test } from 'vitest'
import {
  assertOwnedPath,
  authenticateResults,
  ENGINE,
  loopback,
  scopedFile,
  sha256,
  validateMapping,
  validateRequest
} from './contract.ts'

const root = '/synthetic/alpha'
const state = '/synthetic/state'
const generation = `${state}/search/alpha/generations/example`
const text = '# Local note\n\nBudget approval\n'
const key = `documents/${sha256('Resources/Note.md')}.md`
const mapping = () => ({
  schema: 'ki/kb-search/v1',
  registry_id: 'alpha',
  repository: 'https://github.com/example/alpha',
  root,
  trust_boundary: 'owner-alpha',
  index: 'ki-kb-alpha',
  generation: 'example',
  engine: ENGINE,
  collections: ['ki-kb-alpha'],
  purpose: { title: 'Alpha', description: 'Explicit scope' },
  zones: {
    Calendar: 'Calendar',
    Pillars: 'Pillars',
    Resources: 'Resources',
    Streams: 'Streams',
    Admin: 'Admin',
    inbound: '+',
    outbound: '-'
  },
  declaration_sha256: 'a'.repeat(64),
  projection: `${generation}/projection`,
  config: `${generation}/config/ki-kb-alpha.yml`,
  database: `${generation}/index.sqlite`,
  model_cache: '/synthetic/cache',
  daemon_url: null,
  source_store_declared: false,
  source_store_binding_declared: false,
  documents: { [key]: { path: 'Resources/Note.md', sha256: sha256(text) } }
})

test('published mapping rejects unknown and contradictory authority fields', () => {
  expect(validateMapping(mapping(), state, 'alpha').registry_id).toBe('alpha')
  const mutations: Record<string, unknown>[] = [
    { extra: 'unknown' },
    { schema: 'other' },
    { registry_id: 'omega' },
    { trust_boundary: '../private' },
    { generation: '../private' },
    { index: 'ki-kb-omega' },
    { root: 'relative' },
    { repository: 'https://evil.test/private' },
    { engine: null },
    { engine: { ...ENGINE, extra: true } },
    { engine: { ...ENGINE, version: '3.0.0' } },
    { collections: 'alpha' },
    { collections: ['ki-kb-alpha', 'omega'] },
    { collections: ['omega'] },
    { purpose: null },
    { purpose: { title: '', description: 'purpose' } },
    { purpose: { title: 'Alpha', description: 42 } },
    { purpose: { title: 'Alpha', description: 'x'.repeat(4097) } },
    { zones: null },
    { zones: { ...mapping().zones, Secret: 'Secret' } },
    { zones: { ...mapping().zones, Resources: '../private' } },
    { zones: { ...mapping().zones, Pillars: 'Resources/sub' } },
    { zones: { ...mapping().zones, Pillars: 'Resources' } },
    { projection: '/unmanaged' },
    { config: '/unmanaged' },
    { database: '/unmanaged' },
    { model_cache: 'relative' },
    { declaration_sha256: 'not a digest' },
    { daemon_url: 'http://localhost:8181' },
    { source_store_declared: 1 },
    { source_store_binding_declared: null },
    { documents: [] },
    { documents: Object.fromEntries(Array.from({ length: 10001 }, (_, i) => [String(i), null])) },
    { documents: { [key]: null } },
    { documents: { [key]: { ...mapping().documents[key], extra: true } } },
    { documents: { [key]: { path: 'Resources/.private.md', sha256: sha256(text) } } },
    { documents: { [key]: { path: 'Resources/Other.md', sha256: sha256(text) } } },
    { documents: { [key]: { path: 'Resources/Note.bin', sha256: sha256(text) } } },
    { documents: { [key]: { path: 'Resources/Note.md', sha256: 'invalid' } } },
    { documents: { [`documents/${sha256('Outside/Note.md')}.md`]: { path: 'Outside/Note.md', sha256: sha256(text) } } }
  ]
  for (const change of mutations)
    expect(
      () => validateMapping({ ...mapping(), ...change }, state, 'alpha'),
      JSON.stringify(change).slice(0, 100)
    ).toThrow()
  for (const value of [null, [], {}, { ...mapping(), purpose: undefined }])
    expect(() => validateMapping(value, state, 'alpha')).toThrow()
})

test('published result contract never authenticates daemon text and states bounded completeness', () => {
  const m = validateMapping(mapping(), state, 'alpha')
  const candidate = {
    file: `qmd://ki-kb-alpha/${key}`,
    docid: `#${sha256(text).slice(0, 6)}`,
    score: 0.3,
    snippet: 'FOREIGN_PRIVATE',
    title: 'FOREIGN_PRIVATE',
    line: 999
  }
  const result = authenticateResults(
    m,
    new Map([[key, text]]),
    [candidate],
    { query: 'Budget', mode: 'query', limit: 1 },
    'http'
  )
  expect(result).toMatchObject({
    exhaustive: false,
    profile: 'http-lex-vec-rerank',
    results: [{ title: 'Local note', snippet: 'Budget approval\n', line_start: 3, line_end: 4 }]
  })
  expect(JSON.stringify(result)).not.toContain('FOREIGN_PRIVATE')
  expect(
    authenticateResults(m, new Map([[key, text]]), [], { query: 'Budget', mode: 'vsearch', limit: 1 }, 'http').profile
  ).toBe('http-vector')
  expect(
    authenticateResults(m, new Map([[key, text]]), [], { query: 'Budget', mode: 'search', limit: 1 }, 'http').profile
  ).toBe('http-lexical')
  for (const raw of [
    null,
    {},
    Array(201).fill(candidate),
    [{ ...candidate, score: NaN }],
    [{ ...candidate, file: `qmd://ki-kb-alpha/${key}?index=ki-kb-alpha` }],
    [{ ...candidate, file: `qmd://ki-kb-omega/${key}` }],
    [{ ...candidate, docid: '#000000' }]
  ])
    expect(() =>
      authenticateResults(m, new Map([[key, text]]), raw, { query: 'Budget', mode: 'search', limit: 1 }, 'http')
    ).toThrow()
})

test('published request schema rejects control text and unsafe path authority', () => {
  validateRequest({ query: 'Grant', mode: 'query', limit: 50, zone: 'inbound', pathPrefix: '+/Packets' })
  for (const path of ['', '.', '/private', 'a//b', 'a/../b', 'a\\b', 'C:private', 'a\u007fb'])
    expect(() => validateRequest({ query: 'Grant', mode: 'search', limit: 1, pathPrefix: path })).toThrow()
})

test('published result bounds select canonical complete lines and conservative incomplete metadata', () => {
  const sources = new Map<string, string>()
  const documents: Record<string, { path: string; sha256: string }> = {}
  const candidates: unknown[] = []
  for (let i = 0; i < 200; i++) {
    const path = `Resources/Note${i}.md`
    const projected = `documents/${sha256(path)}.md`
    documents[projected] = { path, sha256: sha256(text) }
    sources.set(projected, text)
    candidates.push({ file: `qmd://ki-kb-alpha/${projected}`, docid: `#${sha256(text).slice(0, 6)}`, score: 0.2 })
  }
  const m = validateMapping({ ...mapping(), documents }, state, 'alpha')
  expect(
    authenticateResults(m, sources, candidates, { query: 'Budget', mode: 'query', limit: 1 }, 'http').truncated
  ).toBe(true)
  const base = validateMapping(mapping(), state, 'alpha')
  const candidate = { file: `qmd://ki-kb-alpha/${key}`, docid: `#${sha256(text).slice(0, 6)}`, score: 0.2 }
  for (const source of [
    '---\nsource_path: /private/INVALID\n',
    '---\nsource_path: "unterminated\n---\nbody',
    'Plain note\n' + 'x'.repeat(1700),
    '---\nsource_path: Records/Example.pdf\nsource_sha256: invalid\n---\nbody'
  ]) {
    base.documents[key]!.sha256 = sha256(source)
    const hit = { ...candidate, docid: `#${sha256(source).slice(0, 6)}` }
    const result = authenticateResults(
      base,
      new Map([[key, source]]),
      [hit],
      { query: 'body', mode: 'search', limit: 1 },
      'http'
    ).results[0]!
    expect(result.title).toBe('Note')
    expect(result.snippet.length).toBeLessThanOrEqual(1600)
    expect(JSON.stringify(result)).not.toContain('/private')
  }
  expect(loopback('http://127.0.0.1:80')).toBe('http://127.0.0.1:80')
  expect(loopback('http://[::1]:8181')).toBe('http://[::1]:8181')
})

test('published source and derived guards reject escape declarations before any filesystem access', async () => {
  await expect(scopedFile('/nonexistent/synthetic-root', '../foreign.md')).rejects.toThrow('unsafe source path')
  await expect(assertOwnedPath('/nonexistent/synthetic-state', '/foreign/mapping.json')).rejects.toThrow(
    'derived path escaped state'
  )
})
