import { chmod, readdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

const declaration = `[repo]\nharnesses = ["example/harness"]\n[skills.ki-repo-kb]\n[skills.ki-repo]\nrepo_type = "kb"\nprimary_shape = "ki-repo-kb"\nstore_roles = ["notes"]\nrepository = "https://github.com/example/alpha"\ntitle = "Alpha"\ndescription = "Synthetic authorized notes"\nrepo_code = "ALPHA"\nvisibility = "private"\n`
const fixture = async () => {
  const box = await sandbox()
  await box.project.write('.ki.toml', declaration)
  await box.project.write('Resources/Note.md', '# Local title\n\nBudget approval lives here.\n')
  await box.state.write(
    'ki/registry.toml',
    `schema = 1\n[repositories.alpha]\nrepository = "https://github.com/example/alpha"\npath = ${JSON.stringify(await realpath(box.project.path))}\nsearch_boundary = "alpha-owner"\n`
  )
  const cache = await box.root.mkdir('cache')
  box.setEnv({ KI_CACHE_HOME: cache, KI_STATE_HOME: await box.state.mkdir('ki') })
  await box.root.write('cache/qmd/models/hf_ggml-org_embeddinggemma-300M-Q8_0.gguf', 'synthetic model')
  await box.root.write('cache/qmd/models/hf_ggml-org_qwen3-reranker-0.6b-q8_0.gguf', 'synthetic model')
  await box.root.write('cache/qmd/models/hf_tobil_qmd-query-expansion-1.7B-q4_k_m.gguf', 'synthetic model')
  let response: unknown | undefined
  let version = 'qmd 2.8.3 (facd35e)\n'
  let failure = false
  let corruptOwner = false
  let publicState = false
  const calls: string[][] = []
  box.setRunner(async (_command, args, env, limits) => {
    calls.push([...args])
    expect(limits?.maxBytes).toBe(2097152)
    if (failure) throw new Error('SIBLING_PRIVATE_DO_NOT_LEAK')
    if (args.includes('--version')) return { exitCode: 0, output: version }
    if (args.includes('update') || args.includes('embed')) {
      await writeFile(env['INDEX_PATH']!, 'synthetic db')
      if (args.includes('embed') && corruptOwner)
        await writeFile(join(env['INDEX_PATH']!, '../../..', '.owner'), 'different-owner')
      if (args.includes('embed') && publicState) await chmod(join(env['INDEX_PATH']!, '../../..'), 0o755)
      return { exitCode: 0, output: '' }
    }
    const mapping = JSON.parse(await box.state.read('ki/search/alpha/mapping.json'))
    const [path, doc] = Object.entries(mapping.documents)[0] as [string, { sha256: string }]
    return {
      exitCode: 0,
      output: JSON.stringify(
        response ?? [
          {
            file: `qmd://ki-kb-alpha/${path}?index=ki-kb-alpha`,
            docid: `#${doc.sha256.slice(0, 6)}`,
            score: 0.7,
            title: 'SIBLING_PRIVATE_DO_NOT_LEAK',
            snippet: 'SIBLING_PRIVATE_DO_NOT_LEAK',
            line: 999
          }
        ]
      )
    }
  })
  return {
    box,
    calls,
    publicState: () => {
      publicState = true
    },
    corruptOwner: () => {
      corruptOwner = true
    },
    respond: (value: unknown) => {
      response = value
    },
    version: (value: string) => {
      version = value
    },
    fail: () => {
      failure = true
    }
  }
}

test('isolates fresh projection and authenticates every visible field from local bytes', async () => {
  const { box, calls } = await fixture()
  await box.project.write('Resources/.secret.md', 'PRIVATE')
  await box.project.write('Outside/Note.md', 'PRIVATE')
  await box.project.write('Resources/Nested/.ki.toml', '[repo]')
  await box.project.write('Resources/Nested/Private.md', 'PRIVATE')
  await box.project.write('Resources/asset.bin', 'PRIVATE')
  await symlink(join(box.project.path, 'Outside'), join(box.project.path, 'Resources', 'Escape'))
  const indexed = await box.run('ki kb index --kb alpha --daemon-url http://127.0.0.1:8181')
  expect(indexed.exitCode, indexed.output).toBe(0)
  const mapping = JSON.parse(indexed.stdout)
  expect(Object.values(mapping.documents)).toEqual([
    { path: 'Resources/Note.md', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }
  ])
  expect(await readdir(join(mapping.projection, 'documents'))).toHaveLength(1)
  expect(await readFile(mapping.config, 'utf8')).toContain('models:')
  expect(calls.slice(0, 3).map((call) => call[2])).toEqual(['--version', 'update', 'embed'])
  const result = await box.run([
    'ki',
    'kb',
    'search',
    'budget approval',
    '--kb',
    'alpha',
    '--mode',
    'search',
    '--zone',
    'Resources',
    '--path-prefix',
    'Resources'
  ])
  expect(result.exitCode).toBe(0)
  expect(result.output).not.toContain('SIBLING_PRIVATE')
  const receipt = JSON.parse(result.stdout)
  expect(receipt).toMatchObject({
    exhaustive: false,
    profile: 'cli-lexical',
    source_store_declared: false,
    source_store_binding_declared: false
  })
  expect(receipt.results[0]).toMatchObject({
    path: 'Resources/Note.md',
    title: 'Local title',
    snippet: 'Budget approval lives here.\n',
    line_start: 3,
    line_end: 4,
    mirror_content: null,
    source_path: null
  })
  const first = mapping.generation
  expect((await box.run('ki kb index --kb alpha')).exitCode).toBe(0)
  const next = JSON.parse(await box.state.read('ki/search/alpha/mapping.json'))
  expect(next.generation).not.toBe(first)
  expect(await readFile(mapping.database, 'utf8')).toBe('synthetic db')
  box.setFetcher(async (url) => {
    expect(String(url)).toBe('http://127.0.0.1:8181/health')
    return Response.json({ status: 'ok', uptime: 1 })
  })
  // Refresh omitted endpoint deliberately; no implicit carry of operator binding.
  expect((await box.run('ki kb status --kb alpha')).output).toContain('explicit daemon binding required')
  expect((await box.run('ki kb index --kb alpha --daemon-url http://127.0.0.1:8181')).exitCode).toBe(0)
  const status = await box.run('ki kb status --kb alpha')
  expect(JSON.parse(status.stdout)).toMatchObject({ reachable: true, index_attested: false })
})

test.each(['--mode bad', '--limit 0', '--limit 51', '--limit 1.5', '--zone Secret', '--path-prefix ../private'])(
  'rejects bounded request %s before retrieval',
  async (options) => {
    const { box, calls } = await fixture()
    const result = await box.run(`ki kb search budget --kb alpha ${options}`)
    expect(result.exitCode).toBe(1)
    expect(calls).toHaveLength(0)
  }
)
test('rejects missing boundary, unknown registry ID and unmanaged collisions without engine reads', async () => {
  const { box, calls } = await fixture()
  expect((await box.run('ki kb index --kb missing')).exitCode).toBe(1)
  await box.state.write('ki/search/alpha/unmanaged', 'operator data')
  expect((await box.run('ki kb index --kb alpha')).output).toContain('unmanaged search state collision')
  expect(await box.state.read('ki/search/alpha/unmanaged')).toBe('operator data')
  await box.state.write(
    'ki/registry.toml',
    (await box.state.read('ki/registry.toml')).replace('search_boundary = "alpha-owner"\n', '')
  )
  expect((await box.run('ki kb index --kb alpha')).output).toContain('explicit registered KB boundary required')
  expect(calls).toHaveLength(0)
})
test('makes wrong engine, runtime failure, missing model, stale source and changed projection explicit', async () => {
  const f = await fixture()
  f.version('qmd 3.0.0\n')
  expect((await f.box.run('ki kb index --kb alpha')).exitCode).toBe(1)
  f.version('qmd 2.8.3\n')
  expect((await f.box.run('ki kb index --kb alpha')).exitCode).toBe(0)
  await rm(join(f.box.root.path, 'cache/qmd/models/hf_ggml-org_embeddinggemma-300M-Q8_0.gguf'))
  expect((await f.box.run('ki kb search budget --kb alpha --mode vsearch')).output).toContain(
    'provision the pinned embed model'
  )
  expect((await f.box.run('ki kb search budget --kb alpha --mode search')).exitCode).toBe(0)
  await f.box.project.write('Resources/Note.md', '# Changed\nPRIVATE\n')
  expect((await f.box.run('ki kb search budget --kb alpha --mode search')).output).toContain('source changed')
  await f.box.project.write('Resources/Note.md', '# Local title\n\nBudget approval lives here.\n')
  const m = JSON.parse(await f.box.state.read('ki/search/alpha/mapping.json'))
  await writeFile(join(m.projection, Object.keys(m.documents)[0]!), 'PRIVATE')
  expect((await f.box.run('ki kb search budget --kb alpha --mode search')).output).toContain(
    'projection content changed'
  )
  const g = await fixture()
  g.fail()
  const failed = await g.box.run('ki kb index --kb alpha')
  expect(failed.exitCode).toBe(1)
  expect(failed.output).not.toContain('SIBLING_PRIVATE')
})
test('rejects hostile and mismatched daemon candidates before returning any content', async () => {
  const f = await fixture()
  expect((await f.box.run('ki kb index --kb alpha')).exitCode).toBe(0)
  const m = JSON.parse(await f.box.state.read('ki/search/alpha/mapping.json'))
  const [key, doc] = Object.entries(m.documents)[0] as [string, { sha256: string }]
  const valid = { file: `qmd://ki-kb-alpha/${key}?index=ki-kb-alpha`, docid: `#${doc.sha256.slice(0, 6)}`, score: 0.2 }
  for (const candidate of [
    null,
    {},
    { ...valid, file: `qmd://ki-kb-omega/${key}?index=ki-kb-alpha` },
    { ...valid, docid: '#ffffff' },
    { ...valid, file: `qmd://ki-kb-alpha/documents/${'a'.repeat(64)}.md?index=ki-kb-alpha` },
    { ...valid, file: `qmd://ki-kb-alpha/${key}` },
    { ...valid, score: 'secret' },
    { ...valid, labels: 'SIBLING_PRIVATE' }
  ]) {
    f.respond([valid, candidate])
    const result = await f.box.run('ki kb search budget --kb alpha --mode search')
    expect(result.exitCode).toBe(1)
    expect(result.output).not.toContain('Local title')
    expect(result.output).not.toContain('SIBLING_PRIVATE')
  }
  f.respond([valid, valid])
  expect((await f.box.run('ki kb search budget --kb alpha --mode search')).exitCode).toBe(1)
  f.respond({ results: [] })
  expect((await f.box.run('ki kb search budget --kb alpha --mode search')).exitCode).toBe(1)
  f.respond([])
  expect(JSON.parse((await f.box.run('ki kb search budget --kb alpha --mode search')).stdout).results).toEqual([])
})
test('requires strict loopback binding and health and strips endpoint failures', async () => {
  const { box } = await fixture()
  for (const url of [
    'http://example.test:8181',
    'http://localhost:8181',
    'http://127.0.0.1:8181/path',
    'http://127.0.0.1:65536',
    'http://user:secret@127.0.0.1:8181'
  ])
    expect((await box.run(`ki kb index --kb alpha --daemon-url ${url}`)).exitCode).toBe(1)
  expect((await box.run('ki kb index --kb alpha --daemon-url http://127.0.0.1:8181')).exitCode).toBe(0)
  box.setFetcher(async () => Response.json({ status: 'no' }))
  expect((await box.run('ki kb status --kb alpha')).output).toContain('invalid daemon health')
  box.setFetcher(async () => {
    throw new Error('secret')
  })
  expect((await box.run('ki kb status --kb alpha')).output).not.toContain('secret')
})

test('explicit registration rejects projects and conflicting boundaries and preserves stores', async () => {
  const { box } = await fixture()
  await box.project.write('AGENTS.md', '# Synthetic')
  const assigned = await box.run('ki registry add --search-boundary revised-owner')
  expect(assigned.exitCode, assigned.output).toBe(0)
  expect(await box.state.read('ki/registry.toml')).toContain('search_boundary = "revised-owner"')
  expect((await box.run('ki registry add --search-boundary ../bad')).exitCode).toBe(2)
  const before = await box.state.read('ki/registry.toml')
  expect((await box.run(['ki', 'registry', 'add', '--search-boundary', 'a'.repeat(129)])).exitCode).toBe(2)
  expect(await box.state.read('ki/registry.toml')).toBe(before)
  await box.project.write(
    '.ki.toml',
    declaration
      .replace('repo_type = "kb"', 'repo_type = "project"')
      .replaceAll('ki-repo-kb', 'ki-repo-project')
      .replace('store_roles = ["notes"]\n', '')
  )
  expect((await box.run('ki registry add --search-boundary project-owner')).exitCode).toBe(2)
  await box.project.write('.ki.toml', declaration)
  await box.state.write(
    'ki/registry.toml',
    (await box.state.read('ki/registry.toml')) +
      `[repositories.omega]\nrepository = "https://github.com/example/omega"\npath = "/synthetic/omega"\nsearch_boundary = "omega-owner"\n`
  )
  expect((await box.run('ki registry add --search-boundary omega-owner')).exitCode).toBe(2)
})

test('mirror labels remain local, conservative and free of unsafe private declarations', async () => {
  const { box } = await fixture()
  const body = `# Mirror\n\n${'canonical fact '.repeat(40)}\n`
  for (const [header, label, path] of [
    ['source_path: Records/Example.pdf\nsource_sha256: ' + 'a'.repeat(64), 'extract', 'Records/Example.pdf'],
    ['source_path: /private/CANARY.pdf\nsource_sha256: ' + 'a'.repeat(64), 'unknown', null],
    [
      'source_path: /private/CANARY.pdf\nsource_path: Records/Example.pdf\nsource_sha256: ' + 'a'.repeat(64),
      'unknown',
      null
    ],
    ['"source_path": Records/Example.pdf\nsource_sha256: ' + 'a'.repeat(64), 'unknown', null],
    ['note_type: ordinary', null, null]
  ] as const) {
    await box.project.write('Resources/Note.md', `---\n${header}\n---\n${body}`)
    expect((await box.run('ki kb index --kb alpha')).exitCode).toBe(0)
    const result = await box.run('ki kb search canonical --kb alpha --mode search')
    expect(result.exitCode, result.output).toBe(0)
    const note = JSON.parse(result.stdout).results[0]
    expect(note).toMatchObject({ mirror_content: label, source_path: path })
    expect(result.stdout).not.toContain('CANARY')
    expect(note.line_start).toBeGreaterThan(1)
  }
  await box.project.write(
    'Resources/Note.md',
    `---\nsource_path: Records/Example.pdf\nsource_sha256: ${'a'.repeat(64)}\n---\n# Mirror\nshort pointer\n`
  )
  expect((await box.run('ki kb index --kb alpha')).exitCode).toBe(0)
  expect(
    JSON.parse((await box.run('ki kb search missing --kb alpha --mode query')).stdout).results[0].mirror_content
  ).toBe('pointer')
})

test('scope revocation, symlink replacement and generation tampering fail before engine retrieval', async () => {
  const f = await fixture()
  expect((await f.box.run('ki kb index --kb alpha')).exitCode).toBe(0)
  const mapping = JSON.parse(await f.box.state.read('ki/search/alpha/mapping.json'))
  const initialCalls = f.calls.length
  const operations = [
    async () => {
      await f.box.project.write('.ki.toml', declaration + '\n# scope changed\n')
    },
    async () => {
      await f.box.project.write('.ki.toml', declaration)
      await f.box.project.write('Resources/.ki.toml', '[repo]')
    },
    async () => {
      await rm(join(f.box.project.path, 'Resources/.ki.toml'))
      await rm(join(f.box.project.path, 'Resources/Note.md'))
      await symlink(join(f.box.project.path, '.ki.toml'), join(f.box.project.path, 'Resources/Note.md'))
    },
    async () => {
      await rm(join(f.box.project.path, 'Resources/Note.md'))
      await f.box.project.write('Resources/Note.md', '# Local title\n\nBudget approval lives here.\n')
      await writeFile(mapping.config, 'malicious config')
    }
  ]
  for (const operation of operations) {
    await operation()
    expect((await f.box.run('ki kb search budget --kb alpha --mode search')).exitCode).toBe(1)
    expect(f.calls.length).toBe(initialCalls)
  }
  await chmod(join(f.box.state.path, 'ki/search/alpha'), 0o755)
  expect((await f.box.run('ki kb index --kb alpha')).output).toContain('private owned directory')
})

test('query bytes, filtering and raw runtime response errors are bounded and explicit', async () => {
  const f = await fixture()
  for (const query of ['', ' '.repeat(10), 'x'.repeat(1025), 'bad\nquery'])
    expect((await f.box.run(['ki', 'kb', 'search', query, '--kb', 'alpha'])).exitCode).toBe(1)
  expect((await f.box.run('ki kb index --kb alpha')).exitCode).toBe(0)
  expect(
    JSON.parse((await f.box.run('ki kb search Budget --kb alpha --mode vsearch --zone Pillars')).stdout).results
  ).toEqual([])
  expect(
    JSON.parse((await f.box.run('ki kb search Budget --kb alpha --mode search --path-prefix Resources/Other')).stdout)
      .results
  ).toEqual([])
  f.box.setRunner(async () => ({ exitCode: 1, output: 'PRIVATE_ENGINE_ERROR' }))
  const result = await f.box.run('ki kb search Budget --kb alpha --mode search')
  expect(result.exitCode).toBe(1)
  expect(result.output).not.toContain('PRIVATE_ENGINE_ERROR')
  f.box.setRunner(async (_cmd, args) => ({
    exitCode: 0,
    output: args.includes('--version') ? 'qmd 2.8.3\n' : 'not json PRIVATE_ENGINE_ERROR'
  }))
  expect((await f.box.run('ki kb search Budget --kb alpha --mode search')).output).toContain('invalid JSON')
  f.box.setRunner(async () => ({ exitCode: 0, output: 'x'.repeat(2097153) }))
  expect((await f.box.run('ki kb search Budget --kb alpha --mode search')).output).toContain('exceeded its bound')
})

test('canonical declared zone aliases select sources before engine indexing', async () => {
  const { box } = await fixture()
  await box.project.write(
    '.ki.toml',
    declaration + '\n[skills.ki-repo-kb.zones]\nResources = "Library"\n"+" = "Incoming"\n'
  )
  await box.project.write('Library/Authorized.md', '# Library\nbudget authorization\n')
  await box.project.write('Incoming/Packet.md', '# Packet\nexplicit input\n')
  const result = await box.run('ki kb index --kb alpha')
  expect(result.exitCode, result.output).toBe(0)
  const mapping = JSON.parse(result.stdout)
  expect(mapping.zones).toMatchObject({ Resources: 'Library', inbound: 'Incoming' })
  expect(
    Object.values(mapping.documents)
      .map((doc: any) => doc.path)
      .sort()
  ).toEqual(['Incoming/Packet.md', 'Library/Authorized.md'])
  for (const extra of [
    '\n[skills.ki-repo-kb.zones]\nOther = "Other"\n',
    '\n[skills.ki-repo-kb]\nzones = 3\n',
    '\n[knowledgeislands-kb.zones]\nResources = "Outside"\n'
  ]) {
    await box.project.write('.ki.toml', declaration + extra)
    expect((await box.run('ki kb index --kb alpha')).exitCode).toBe(1)
  }
})

test('nested configured alias through an outside symlink never traverses or ingests that tree', async () => {
  const { box, calls } = await fixture()
  await box.root.write('outside/Hidden/Canary.md', 'EXTERNAL_PRIVATE_CANARY')
  await symlink(join(box.root.path, 'outside'), join(box.project.path, 'Link'))
  await box.project.write('.ki.toml', declaration + '\n[skills.ki-repo-kb.zones]\nResources = "Link/Hidden"\n')
  const result = await box.run('ki kb index --kb alpha')
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('configured zone ancestry contains a symlink')
  expect(calls).toHaveLength(0)
  expect(result.output).not.toContain('EXTERNAL_PRIVATE')
})

test('ownership lost during qmd execution refuses publication and preserves the previous mapping', async () => {
  const f = await fixture()
  expect((await f.box.run('ki kb index --kb alpha')).exitCode).toBe(0)
  const before = await f.box.state.read('ki/search/alpha/mapping.json')
  f.corruptOwner()
  const result = await f.box.run('ki kb index --kb alpha')
  expect(result.exitCode, result.output).toBe(1)
  expect(result.output).toContain('ownership changed before publication')
  expect(await f.box.state.read('ki/search/alpha/mapping.json')).toBe(before)
  expect(await f.box.state.read('ki/search/alpha/.owner')).toBe('different-owner')
})

test('malformed registry authority fails before engine and source bindings remain declarations only', async () => {
  const f = await fixture()
  const original = await f.box.state.read('ki/registry.toml')
  for (const boundary of ['3', JSON.stringify('a'.repeat(129)), JSON.stringify('../bad')]) {
    await f.box.state.write('ki/registry.toml', original.replace('"alpha-owner"', boundary))
    expect((await f.box.run('ki kb index --kb alpha')).exitCode).toBe(1)
  }
  await f.box.state.write(
    'ki/registry.toml',
    original +
      '\n[repositories.omega]\nrepository = "https://github.com/example/omega"\npath = "/synthetic/omega"\nsearch_boundary = "alpha-owner"\n'
  )
  expect((await f.box.run('ki kb index --kb alpha')).exitCode).toBe(1)
  expect(f.calls).toHaveLength(0)
  await f.box.state.write(
    'ki/registry.toml',
    original + '\n[repositories.alpha.stores]\nsources = "/synthetic/unavailable-private-store"\n'
  )
  expect((await f.box.run('ki registry add --search-boundary revised-owner')).exitCode).toBe(0)
  expect(await f.box.state.read('ki/registry.toml')).toContain('/synthetic/unavailable-private-store')
  expect(JSON.parse((await f.box.run('ki kb index --kb alpha')).stdout)).toMatchObject({
    source_store_declared: false,
    source_store_binding_declared: true
  })
})

test('identity, declaration, source and derived ancestry failures refuse all retrieval', async () => {
  const f = await fixture()
  const registry = await f.box.state.read('ki/registry.toml')
  expect((await f.box.run('ki kb index --kb ../bad')).exitCode).toBe(1)
  expect((await f.box.run('ki kb index')).exitCode).toBe(0)
  await f.box.root.write('outside-declaration.toml', declaration)
  await rm(join(f.box.project.path, '.ki.toml'))
  await symlink(join(f.box.root.path, 'outside-declaration.toml'), join(f.box.project.path, '.ki.toml'))
  expect((await f.box.run('ki kb index --kb alpha')).output).toContain('unsafe declaration')
  await rm(join(f.box.project.path, '.ki.toml'))
  await f.box.project.write(
    '.ki.toml',
    declaration.replace('https://github.com/example/alpha', 'https://github.com/example/other')
  )
  expect((await f.box.run('ki kb index --kb alpha')).output).toContain('repository identity mismatch')
  await f.box.project.write(
    '.ki.toml',
    declaration
      .replace('repo_type = "kb"', 'repo_type = "project"')
      .replaceAll('ki-repo-kb', 'ki-repo-project')
      .replace('store_roles = ["notes"]\n', '')
  )
  expect((await f.box.run('ki kb index --kb alpha')).output).toContain('not a KB')
  await f.box.project.write('.ki.toml', declaration)
  await symlink(f.box.project.path, join(f.box.root.path, 'root-alias'))
  await f.box.state.write(
    'ki/registry.toml',
    registry.replace(
      JSON.stringify(await realpath(f.box.project.path)),
      JSON.stringify(join(f.box.root.path, 'root-alias'))
    )
  )
  expect((await f.box.run('ki kb index --kb alpha')).output).toContain('physical root mismatch')
  await f.box.state.write('ki/registry.toml', registry)
  await rm(join(f.box.project.path, 'Resources/Note.md'))
  expect((await f.box.run('ki kb search budget --kb alpha --mode search')).exitCode).toBe(1)
  await f.box.project.write('Resources/Note.md', '# Local title\n\nBudget approval lives here.\n')
  await rm(join(f.box.project.path, 'Resources'), { recursive: true })
  await f.box.project.write('Resources', 'file in place of directory')
  expect((await f.box.run('ki kb search budget --kb alpha --mode search')).output).toContain(
    'unsafe or oversized source'
  )
})

test('derived mapping ownership, bounds and physical artifact checks refuse tampered state', async () => {
  const f = await fixture()
  expect((await f.box.run('ki kb index --kb alpha')).exitCode).toBe(0)
  const original = await f.box.state.read('ki/search/alpha/mapping.json')
  const m = JSON.parse(original)
  await f.box.state.write('ki/search/alpha/.owner', 'different-owner')
  expect((await f.box.run('ki kb search Budget --kb alpha --mode search')).output).toContain('unmanaged search state')
  await f.box.state.write('ki/search/alpha/.owner', 'ki/kb-search-owned/v1\n')
  const base = join(f.box.state.path, 'ki/search/alpha')
  await chmod(base, 0o755)
  expect((await f.box.run('ki kb search Budget --kb alpha --mode search')).output).toContain('remain private')
  await chmod(base, 0o700)
  for (const content of ['x'.repeat(4194305), 'not-json PRIVATE_CANARY']) {
    await f.box.state.write('ki/search/alpha/mapping.json', content)
    expect((await f.box.run('ki kb search Budget --kb alpha --mode search')).exitCode).toBe(1)
    expect((await f.box.run('ki kb index --kb alpha')).exitCode).toBe(1)
    expect(await f.box.state.read('ki/search/alpha/mapping.json')).toBe(content)
  }
  for (const change of [
    { trust_boundary: 'other-owner' },
    { zones: { ...m.zones, Admin: 'Operations' } },
    { source_store_declared: true },
    { source_store_binding_declared: true }
  ]) {
    await f.box.state.write('ki/search/alpha/mapping.json', JSON.stringify({ ...m, ...change }))
    expect((await f.box.run('ki kb search Budget --kb alpha --mode search')).output).toContain(
      'mapping authority changed'
    )
  }
  await f.box.state.write('ki/search/alpha/mapping.json', original)
  await rm(m.database)
  await f.box.state.mkdir(`ki/search/alpha/generations/${m.generation}/index.sqlite`)
  expect((await f.box.run('ki kb search Budget --kb alpha --mode search')).output).toContain('missing derived database')
  await rm(m.database, { recursive: true })
  await writeFile(m.database, 'synthetic db')
  await writeFile(join(m.projection, 'extra.md'), 'foreign')
  expect((await f.box.run('ki kb search Budget --kb alpha --mode search')).output).toContain('projection changed')
  await rm(join(m.projection, 'extra.md'))
  await writeFile(join(m.projection, 'documents/extra.md'), 'foreign')
  expect((await f.box.run('ki kb search Budget --kb alpha --mode search')).output).toContain('projection changed')
  await rm(join(m.projection, 'documents/extra.md'))
  await rm(join(base, 'mapping.json'))
  await f.box.state.mkdir('ki/search/alpha/mapping.json')
  expect((await f.box.run('ki kb search Budget --kb alpha --mode search')).output).toContain('invalid mapping file')
  expect((await f.box.run('ki kb index --kb alpha')).output).toContain('unsafe mapping destination')
})

test('state-directory aliases and symlinked generation ancestors fail closed', async () => {
  const f = await fixture()
  await symlink(join(f.box.state.path, 'ki'), join(f.box.root.path, 'state-alias'))
  f.box.setEnv({ KI_STATE_HOME: join(f.box.root.path, 'state-alias') })
  expect((await f.box.run('ki kb index --kb alpha')).output).toContain('unsafe state ancestry')
  f.box.setEnv({ KI_STATE_HOME: await realpath(join(f.box.state.path, 'ki')) })
  await f.box.state.write('ki/search', 'not a directory')
  expect((await f.box.run('ki kb index --kb alpha')).output).toContain('unsafe derived directory')
  await rm(join(f.box.state.path, 'ki/search'))
  expect((await f.box.run('ki kb index --kb alpha')).exitCode).toBe(0)
  const m = JSON.parse(await f.box.state.read('ki/search/alpha/mapping.json'))
  await rm(m.config)
  await symlink(join(f.box.project.path, '.ki.toml'), m.config)
  expect((await f.box.run('ki kb search Budget --kb alpha --mode search')).output).toContain('derived state symlink')
  f.box.setEnv({ KI_STATE_HOME: join(f.box.root.path, 'state-alias') })
  expect((await f.box.run('ki kb search Budget --kb alpha --mode search')).output).toContain(
    'derived state ancestry changed'
  )
})

test('status rejects bounded malformed, oversized and unsuccessful HTTP bodies', async () => {
  const { box } = await fixture()
  expect((await box.run('ki kb index --kb alpha --daemon-url http://127.0.0.1:8181')).exitCode).toBe(0)
  for (const response of [
    new Response('PRIVATE_ERROR', { status: 500 }),
    new Response('', { headers: { 'content-length': '2097153' } }),
    new Response('x'.repeat(2097153)),
    new Response('PRIVATE_NON_JSON'),
    Response.json(null)
  ]) {
    box.setFetcher(async () => response)
    const result = await box.run('ki kb status --kb alpha')
    expect(result.exitCode).toBe(1)
    expect(result.output).not.toContain('PRIVATE')
  }
})

test('invalid zone table type is refused rather than defaulted', async () => {
  const { box } = await fixture()
  await box.project.write('.ki.toml', declaration.replace('[skills.ki-repo-kb]\n', '[skills.ki-repo-kb]\nzones = 3\n'))
  expect((await box.run('ki kb index --kb alpha')).output).toContain('invalid declared zones')
})

test('unsafe source filenames are excluded and missing generated artifacts fail explicitly', async () => {
  const { box } = await fixture()
  await box.project.write('Resources/unsafe:name.md', 'NEVER_INDEX')
  const result = await box.run('ki kb index --kb alpha')
  expect(result.exitCode, result.output).toBe(0)
  const mapping = JSON.parse(result.stdout)
  expect(Object.keys(mapping.documents)).toHaveLength(1)
  await rm(mapping.config)
  expect((await box.run('ki kb search Budget --kb alpha --mode search')).output).toContain('derived state missing')
})

test('ownership privacy changed during embedding refuses publication', async () => {
  const f = await fixture()
  f.publicState()
  const result = await f.box.run('ki kb index --kb alpha')
  expect(result.exitCode, result.output).toBe(1)
  expect(result.output).toContain('search state must remain private')
})
