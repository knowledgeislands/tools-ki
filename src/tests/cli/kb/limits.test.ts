import { createHash } from 'node:crypto'
import { realpath, writeFile } from 'node:fs/promises'
import { afterEach, expect, test, vi } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

const fault = vi.hoisted(() => ({
  mode: 'none',
  root: '',
  reference: '',
  realpathCalls: 0,
  declarationCalls: 0,
  publicationModes: [] as { operation: string; mode: number }[]
}))
vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  const virtual = (path: unknown) => String(path).startsWith(`${fault.root}/Resources/Virtual`)
  return {
    ...original,
    link: async (source: unknown, target: unknown) => {
      if (String(target).endsWith('/mapping.json'))
        fault.publicationModes.push({ operation: 'create', mode: (await original.lstat(String(source))).mode & 0o777 })
      return Reflect.apply(original.link, null, [source, target])
    },
    rename: async (source: unknown, target: unknown) => {
      if (String(target).endsWith('/mapping.json'))
        fault.publicationModes.push({ operation: 'replace', mode: (await original.lstat(String(source))).mode & 0o777 })
      return Reflect.apply(original.rename, null, [source, target])
    },
    readdir: async (path: unknown, ...args: unknown[]) => {
      const text = String(path)
      if (text === `${fault.root}/Resources` && fault.mode === 'vanished-entry') return ['Missing.md']
      if (text === `${fault.root}/Resources` && ['documents', 'corpus', 'walk'].includes(fault.mode))
        return Array.from(
          { length: fault.mode === 'documents' ? 10001 : fault.mode === 'walk' ? 20001 : 101 },
          (_, i) => `Virtual${i}${fault.mode === 'walk' ? '' : '.md'}`
        )
      if (virtual(path) && fault.mode === 'walk') return []
      return Reflect.apply(original.readdir, null, [path, ...args])
    },
    lstat: async (path: unknown, ...args: unknown[]) => {
      if (
        fault.mode === 'declaration-drift' &&
        String(path) === `${fault.root}/.ki.toml` &&
        ++fault.declarationCalls === 2
      ) {
        const stat = await original.lstat(String(path))
        return { ...stat, isFile: () => true, isSymbolicLink: () => true }
      }
      if (virtual(path) && /\/Virtual\d+(?:\.md)?$/.test(String(path))) {
        return {
          size: 1,
          isFile: () => fault.mode !== 'walk',
          isDirectory: () => fault.mode === 'walk',
          isSymbolicLink: () => false
        }
      }
      return Reflect.apply(original.lstat, null, [path, ...args])
    },
    realpath: async (path: unknown, ...args: unknown[]) => {
      if (fault.mode === 'source-escape' && String(path) === fault.reference) return '/foreign/note.md'
      if (fault.mode === 'root-drift' && String(path) === fault.root && ++fault.realpathCalls === 2)
        return '/foreign/root'
      return virtual(path) ? String(path) : Reflect.apply(original.realpath, null, [path, ...args])
    },
    readFile: async (path: unknown, ...args: unknown[]) => {
      if (fault.mode === 'post-read' && String(path) === fault.reference) return Buffer.alloc(1048577, 65)
      if (fault.mode === 'manifest' && String(path).includes('/projection/documents/')) return Buffer.alloc(1048576, 65)
      if (virtual(path)) return Buffer.alloc(['corpus', 'manifest'].includes(fault.mode) ? 1024 * 1024 : 1, 65)
      return Reflect.apply(original.readFile, null, [path, ...args])
    },
    writeFile: async (path: unknown, ...args: unknown[]) => {
      if (['documents', 'corpus', 'walk'].includes(fault.mode) && String(path).includes('/projection/documents/'))
        return
      return Reflect.apply(original.writeFile, null, [path, ...args])
    }
  }
})
afterEach(() => {
  fault.mode = 'none'
  fault.root = ''
  fault.reference = ''
  fault.realpathCalls = 0
  fault.declarationCalls = 0
  fault.publicationModes = []
})
const fixture = async () => {
  const box = await sandbox()
  await box.project.write(
    '.ki.toml',
    '[repo]\nharnesses = ["example/harness"]\n[skills.ki-repo-kb]\n[skills.ki-repo]\nrepo_type = "kb"\nprimary_shape = "ki-repo-kb"\nstore_roles = ["notes"]\nrepository = "https://github.com/example/alpha"\ntitle = "Alpha"\ndescription = "Synthetic resource limits"\nrepo_code = "ALPHA"\nvisibility = "private"\n'
  )
  await box.project.write('Resources/Note.md', 'safe fixture')
  fault.root = await realpath(box.project.path)
  fault.reference = `${fault.root}/Resources/Note.md`
  await box.state.write(
    'ki/registry.toml',
    `schema = 1\n[repositories.alpha]\nrepository = "https://github.com/example/alpha"\npath = ${JSON.stringify(fault.root)}\nsearch_boundary = "alpha-owner"\n`
  )
  const cache = await box.root.mkdir('cache')
  await box.root.write('cache/qmd/models/hf_ggml-org_embeddinggemma-300M-Q8_0.gguf', 'synthetic model')
  box.setEnv({ KI_CACHE_HOME: cache, KI_STATE_HOME: await box.state.mkdir('ki') })
  box.setRunner(async (_cmd, args, env) => {
    if (args.includes('--version')) return { exitCode: 0, output: 'qmd 2.8.3\n' }
    await writeFile(env['INDEX_PATH']!, 'synthetic db')
    return { exitCode: 0, output: '' }
  })
  return box
}
test.each([
  ['documents', 'too many source documents'],
  ['corpus', 'corpus exceeds'],
  ['walk', 'projection walk exceeds']
])('refuses %s resource exhaustion before engine ingestion', async (mode, error) => {
  const box = await fixture()
  fault.mode = mode
  const result = await box.run('ki kb index --kb alpha')
  expect(result.exitCode, result.output).toBe(1)
  expect(result.output).toContain(error)
})
test('binary, oversized and invalid UTF8 Markdown never enters the engine', async () => {
  const box = await fixture()
  for (const bytes of [Buffer.from([0]), Buffer.from([255]), Buffer.alloc(1048577, 65)]) {
    await writeFile(fault.reference, bytes)
    const result = await box.run('ki kb index --kb alpha')
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('unsafe or oversized source')
  }
})

test('an entry deleted after directory enumeration is omitted before engine ingestion', async () => {
  const box = await fixture()
  fault.mode = 'vanished-entry'
  const result = await box.run('ki kb index --kb alpha')
  expect(result.exitCode, result.output).toBe(0)
  expect(JSON.parse(result.stdout).documents).toEqual({})
})

test.each([
  ['root-drift', 'root identity changed'],
  ['declaration-drift', 'declaration changed'],
  ['source-escape', 'source escaped'],
  ['post-read', 'unsafe or oversized source bytes']
])('refuses %s source mutation at the filesystem boundary', async (mode, error) => {
  const box = await fixture()
  fault.mode = mode
  const result = await box.run('ki kb index --kb alpha')
  expect(result.exitCode, result.output).toBe(1)
  expect(result.output).toContain(error)
})

test('a forged oversized manifest is rejected before retrieval even when each authorized hash matches', async () => {
  const box = await fixture()
  expect((await box.run('ki kb index --kb alpha')).exitCode).toBe(0)
  const mapping = JSON.parse(await box.state.read('ki/search/alpha/mapping.json'))
  const docs: Record<string, { path: string; sha256: string }> = {}
  const checksum = createHash('sha256').update(Buffer.alloc(1048576, 65)).digest('hex')
  for (let i = 0; i < 101; i++) {
    const path = `Resources/Virtual${i}.md`
    const key = `documents/${createHash('sha256').update(path).digest('hex')}.md`
    docs[key] = { path, sha256: checksum }
    await box.project.write(path, 'A')
    await writeFile(mapping.projection + '/' + key, 'A')
  }
  const original = Object.keys(mapping.documents)[0]!
  const { rm } = await import('node:fs/promises')
  await rm(mapping.projection + '/' + original)
  mapping.documents = docs
  await box.state.write('ki/search/alpha/mapping.json', JSON.stringify(mapping))
  fault.mode = 'manifest'
  const result = await box.run('ki kb search Grant --kb alpha --mode search')
  expect(result.exitCode, result.output).toBe(1)
  expect(result.output).toContain('corpus exceeds')
})

test('initial and refreshed mappings are private before atomic publication', async () => {
  const box = await fixture()
  expect((await box.run('ki kb index --kb alpha')).exitCode).toBe(0)
  expect((await box.run('ki kb index --kb alpha')).exitCode).toBe(0)
  expect(fault.publicationModes).toEqual([
    { operation: 'create', mode: 0o600 },
    { operation: 'replace', mode: 0o600 }
  ])
  const { lstat } = await import('node:fs/promises')
  expect((await lstat(box.state.path + '/ki/search/alpha/mapping.json')).mode & 0o777).toBe(0o600)
})
