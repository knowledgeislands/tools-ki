import { readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

interface Mapping {
  registry_id: string
  trust_boundary: string
  index: string
  generation: string
  config: string
  database: string
  projection: string
  documents: Record<string, { path: string; sha256: string }>
}

const bodies = {
  alpha: '# Alpha canonical\n\nAlpha budget approval requires its own owner.\n',
  omega: '# Omega canonical\n\nOmega budget approval requires a different owner.\n'
} as const
const backendCanary = 'OMEGA_PRIVATE_BACKEND_CANARY'
const firstDocument = (mapping: Mapping) => {
  const entry = Object.entries(mapping.documents)[0]
  if (!entry) throw new Error('Missing synthetic mapping document')
  return entry
}
const declaration = (id: keyof typeof bodies) => `[repo]
harnesses = ["example/harness"]
[skills.ki-repo]
repo_type = "kb"
primary_shape = "ki-repo-kb"
store_roles = ["notes"]
repository = "https://github.com/example/${id}"
title = "${id}"
description = "Independent synthetic boundary fixture"
repo_code = "${id.toUpperCase()}"
visibility = "private"
[skills.ki-repo-kb.zones]
Resources = "Library"
`

const isolatedBases = async () => {
  const box = await sandbox()
  await box.project.write('.ki.toml', declaration('alpha'))
  await box.project.write('Library/Shared.md', bodies.alpha)
  const omega = await box.root.mkdir('omega')
  await box.root.write('omega/.ki.toml', declaration('omega'))
  await box.root.write('omega/Library/Shared.md', bodies.omega)
  await box.state.write(
    'ki/registry.toml',
    `schema = 1
[repositories.alpha]
repository = "https://github.com/example/alpha"
path = ${JSON.stringify(await realpath(box.project.path))}
search_boundary = "alpha-island"
[repositories.omega]
repository = "https://github.com/example/omega"
path = ${JSON.stringify(omega)}
search_boundary = "omega-island"
`
  )
  box.setEnv({ KI_STATE_HOME: await box.state.mkdir('ki'), KI_CACHE_HOME: await box.root.mkdir('cache') })
  await box.root.write('cache/qmd/models/hf_ggml-org_embeddinggemma-300M-Q8_0.gguf', 'synthetic model')
  const calls: { index: string; args: readonly string[]; config: string; database: string }[] = []
  box.setRunner(async (_command, args, env) => {
    const index = args[1]
    const config = env['QMD_CONFIG_DIR']
    const database = env['INDEX_PATH']
    const id = index === 'ki-kb-alpha' ? 'alpha' : index === 'ki-kb-omega' ? 'omega' : undefined
    if (!id || !index || !config || !database) throw new Error('Unexpected synthetic engine scope')
    calls.push({ index, args: [...args], config, database })
    if (args.includes('--version')) return { exitCode: 0, output: 'qmd 2.8.3 (facd35e)\n' }
    if (args.includes('update') || args.includes('embed')) {
      await writeFile(database, `synthetic ${id} database`)
      return { exitCode: 0, output: '' }
    }
    const mapping = JSON.parse(await box.state.read(`ki/search/${id}/mapping.json`)) as Mapping
    const [key, document] = firstDocument(mapping)
    return {
      exitCode: 0,
      output: JSON.stringify([
        {
          file: `qmd://${index}/${key}?index=${index}`,
          docid: `#${document.sha256.slice(0, 6)}`,
          score: 0.8,
          title: backendCanary,
          snippet: backendCanary,
          context: backendCanary,
          line: 999999
        }
      ])
    }
  })
  const mappings = {} as Record<keyof typeof bodies, Mapping>
  for (const id of ['alpha', 'omega'] as const) {
    const result = await box.run(`ki kb index --kb ${id}`)
    expect(result.exitCode, result.output).toBe(0)
    mappings[id] = JSON.parse(result.stdout) as Mapping
  }
  return { box, calls, mappings }
}

test('independent CLI review isolates equal relative paths and ignores fingerprint-compatible hostile text', async () => {
  const { box, calls, mappings } = await isolatedBases()
  for (const property of ['index', 'generation', 'config', 'database', 'projection'] as const)
    expect(mappings.alpha[property]).not.toBe(mappings.omega[property])
  for (const id of ['alpha', 'omega'] as const) {
    const mapping = mappings[id]
    expect(mapping.registry_id).toBe(id)
    expect(mapping.trust_boundary).toBe(`${id}-island`)
    expect(mapping.index).toBe(`ki-kb-${id}`)
    const [key, document] = firstDocument(mapping)
    expect(document.path).toBe('Library/Shared.md')
    expect(await readFile(`${mapping.projection}/${key}`, 'utf8')).toBe(bodies[id])
    expect(await readFile(mapping.config, 'utf8')).toContain(`ki-kb-${id}:`)
    expect(
      calls.filter((call) => call.index === mapping.index).every((call) => call.database === mapping.database)
    ).toBe(true)
    expect(
      calls.filter((call) => call.index === mapping.index).every((call) => call.config === dirname(mapping.config))
    ).toBe(true)
    const result = await box.run(`ki kb search budget --kb ${id} --mode search --zone Resources`)
    expect(result.exitCode, result.output).toBe(0)
    expect(result.stdout).not.toContain(backendCanary)
    const response = JSON.parse(result.stdout)
    expect(response.registry_id).toBe(id)
    expect(response.results).toHaveLength(1)
    expect(response.results[0]).toMatchObject({
      path: 'Library/Shared.md',
      title: `${id === 'alpha' ? 'Alpha' : 'Omega'} canonical`
    })
    const note = response.results[0]
    expect(note.snippet).toContain(id === 'alpha' ? 'Alpha budget' : 'Omega budget')
    expect(note.snippet).not.toContain(id === 'alpha' ? 'Omega budget' : 'Alpha budget')
    expect(note.snippet).toBe(
      bodies[id]
        .split('\n')
        .slice(note.line_start - 1, note.line_end)
        .join('\n')
    )
  }
})

test('independent CLI review revokes unchanged notes inside a newly nested repository before engine access', async () => {
  const { box, calls } = await isolatedBases()
  const before = await box.project.read('Library/Shared.md')
  await box.project.write('Library/.git', 'gitdir: /synthetic/unread-worktree\n')
  const callCount = calls.length
  const result = await box.run('ki kb search budget --kb alpha --mode search')
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('nested repository source')
  expect(calls).toHaveLength(callCount)
  expect(await box.project.read('Library/Shared.md')).toBe(before)
  expect(result.stdout).not.toContain('Alpha budget')
})
