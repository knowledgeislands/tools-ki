import { lstat, realpath, symlink } from 'node:fs/promises'
import { afterEach, expect, test, vi } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

const statFailure = vi.hoisted(() => ({ path: undefined as string | undefined }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...original,
    lstat: (...arguments_: Parameters<typeof original.lstat>) =>
      String(arguments_[0]) === statFailure.path
        ? Promise.reject(Object.assign(new Error('source-store stat denied'), { code: 'EACCES' }))
        : original.lstat(...arguments_)
  }
})

afterEach(() => {
  statFailure.path = undefined
})

const declaration = (name: string, kind: 'project' | 'kb', roles = ['notes']): string =>
  `[repo]\nharnesses = ["example/harness"]\n\n[skills.${kind === 'kb' ? 'ki-repo-kb' : 'ki-repo-project'}]\n\n[skills.ki-repo]\nrepo_type = "${kind}"\nprimary_shape = "${kind === 'kb' ? 'ki-repo-kb' : 'ki-repo-project'}"\nrepository = "https://github.com/example/${name}"\n${kind === 'kb' ? `store_roles = ${JSON.stringify(roles)}\n` : ''}`

const registry = (entries: readonly { name: string; path: string }[]): string =>
  `schema = 1\n${entries
    .map(
      ({ name, path }) =>
        `\n[repositories.${name}]\nrepository = "https://github.com/example/${name}"\npath = ${JSON.stringify(path)}\n`
    )
    .join('')}`

test('warns about undeclared direct source stores without changing the registry or directories', async () => {
  const box = await sandbox()
  const entries = []
  for (const [name, kind, roles] of [
    ['project', 'project', ['notes']],
    ['knowledge', 'kb', ['notes']],
    ['declared', 'kb', ['notes', 'sources']],
    ['absent', 'project', ['notes']]
  ] as const) {
    const path = await box.project.mkdir(name)
    entries.push({ name, path })
    await box.project.write(`${name}/.ki.toml`, declaration(name, kind, [...roles]))
    if (name !== 'absent') await box.home.mkdir(`Library/CloudStorage/OneDrive-Personal/sources-${name}`)
  }
  const source = registry(entries)
  await box.state.write('ki/registry.toml', source)

  const result = await box.run('ki registry source-stores')

  expect(result.exitCode).toBe(0)
  expect(result.output).toContain('KI REGISTRY SOURCE STORES')
  expect(result.output).toContain('undeclared (2)')
  expect(result.output).toContain('example/project [project]')
  expect(result.output).toContain('migrate to a Knowledge Base, or retire')
  expect(result.output).toContain('example/knowledge [kb]')
  expect(result.output).toContain('declare and bind sources, or retire')
  expect(result.output).not.toContain('example/declared')
  expect(result.output).not.toContain('example/absent')
  expect(result.output).toContain('summary: UNDECLARED=2 DIAGNOSTICS=0')
  expect(await box.state.read('ki/registry.toml')).toBe(source)
  await expect(lstat(`${box.home.path}/Library/CloudStorage/OneDrive-Personal/sources-project`)).resolves.toBeDefined()
  expect(await box.run('ki registry --estate source-stores')).toEqual({
    exitCode: 2,
    output: 'ki: error: ki registry source-stores inspects the entire registry and does not accept selectors\n'
  })
})

test('reports unsafe and unavailable conventional source-store evidence separately', async () => {
  const box = await sandbox()
  const entries = []
  for (const name of ['file', 'symlink', 'missing-declaration', 'wrong-identity', 'stat-denied']) {
    const path = await box.project.mkdir(name)
    entries.push({ name, path })
    if (name !== 'missing-declaration')
      await box.project.write(
        `${name}/.ki.toml`,
        declaration(name === 'wrong-identity' ? 'different' : name, 'project')
      )
  }
  const parent = 'Library/CloudStorage/OneDrive-Personal'
  await box.home.write(`${parent}/sources-file`, 'not a directory')
  const target = await box.root.mkdir('linked-source-store')
  await symlink(target, `${box.home.path}/${parent}/sources-symlink`)
  for (const name of ['missing-declaration', 'wrong-identity', 'stat-denied'])
    await box.home.mkdir(`${parent}/sources-${name}`)
  await box.state.write('ki/registry.toml', registry(entries))
  statFailure.path = await realpath(`${box.home.path}/${parent}/sources-stat-denied`)

  const result = await box.run('ki registry source-stores')

  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('undeclared (0)')
  expect(result.output).toContain('diagnostics (5)')
  expect(result.output).toContain('conventional sources path is not a direct directory')
  expect(result.output).toContain('repository declaration is not a direct file')
  expect(result.output).toContain('repository declaration does not match its registered identity')
  expect(result.output).toContain('source-store stat denied')
})

test('rejects a linked OneDrive root even when its conventional source directory exists', async () => {
  const box = await sandbox()
  const path = await box.project.mkdir('linked-parent')
  await box.project.write('linked-parent/.ki.toml', declaration('linked-parent', 'project'))
  const target = await box.root.mkdir('external-onedrive')
  await box.root.mkdir('external-onedrive/sources-linked-parent')
  await box.home.mkdir('Library/CloudStorage')
  await symlink(target, `${box.home.path}/Library/CloudStorage/OneDrive-Personal`)
  await box.state.write('ki/registry.toml', registry([{ name: 'linked-parent', path }]))

  const result = await box.run('ki registry source-stores')

  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('OneDrive source-store root is not a direct directory')
})

test('rejects a linked registered repository root', async () => {
  const box = await sandbox()
  const target = await box.project.mkdir('actual')
  await box.project.write('actual/.ki.toml', declaration('linked-root', 'project'))
  const path = `${box.project.path}/linked-root`
  await symlink(target, path)
  await box.home.mkdir('Library/CloudStorage/OneDrive-Personal/sources-linked-root')
  await box.state.write('ki/registry.toml', registry([{ name: 'linked-root', path }]))

  const result = await box.run('ki registry source-stores')

  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('registered repository root is not a direct directory')
})
