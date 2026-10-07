import { lstat, realpath, symlink } from 'node:fs/promises'
import { afterEach, expect, test, vi } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

const statFailure = vi.hoisted(() => ({
  path: undefined as string | undefined,
  replacement: undefined as { trigger: string; target: string; substitute?: string } | undefined,
  activated: false
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...original,
    lstat: (...arguments_: Parameters<typeof original.lstat>) => {
      const path = String(arguments_[0])
      if (path === statFailure.replacement?.trigger) statFailure.activated = true
      if (statFailure.activated && path === statFailure.replacement?.target)
        return statFailure.replacement.substitute
          ? original.lstat(statFailure.replacement.substitute)
          : Promise.reject(Object.assign(new Error('declaration disappeared'), { code: 'ENOENT' }))
      return path === statFailure.path
        ? Promise.reject(Object.assign(new Error('source-store stat denied'), { code: 'EACCES' }))
        : original.lstat(...arguments_)
    }
  }
})

afterEach(() => {
  statFailure.path = undefined
  statFailure.replacement = undefined
  statFailure.activated = false
})

const declaration = (name: string, kind: 'project' | 'kb', roles = ['notes']): string =>
  `[repo]\nharnesses = ["example/harness"]\n\n[skills.${kind === 'kb' ? 'ki-repo-kb' : 'ki-repo-project'}]\n\n[skills.ki-repo]\nrepo_type = "${kind}"\nprimary_shape = "${kind === 'kb' ? 'ki-repo-kb' : 'ki-repo-project'}"\nrepository = "https://github.com/example/${name}"\ncapital = "https://github.com/example/capital"\n${kind === 'kb' ? `store_roles = ${JSON.stringify(roles)}\n` : ''}`

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

  const result = await box.run('ki repo --estate store scan')

  expect(result.exitCode).toBe(0)
  expect(result.output).toContain('KI REPO STORE SCAN')
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
  expect((await box.run('ki registry source-stores')).exitCode).toBe(2)
})

test('scans the current repository and explicit selection without requiring registration', async () => {
  const box = await sandbox()
  const project = await box.project.mkdir('unregistered')
  await box.project.write('unregistered/.ki.toml', declaration('unregistered', 'project'))
  await box.home.mkdir('Library/CloudStorage/OneDrive-Personal/sources-unregistered')
  box.cd('unregistered')

  const current = await box.run('ki repo store scan')
  const explicit = await box.run(['ki', 'repo', '--repo', project, 'store', 'scan'])

  expect(current.exitCode).toBe(0)
  expect(current.output).toContain('example/unregistered [project]')
  expect(explicit.output).toBe(current.output)

  await box.state.write('ki/registry.toml', 'not valid TOML =')
  expect((await box.run('ki repo store scan')).output).toBe(current.output)
})

test('reports unsafe and unavailable conventional source-store evidence separately', async () => {
  const box = await sandbox()
  const entries = []
  for (const name of ['file', 'symlink', 'stat-denied']) {
    const path = await box.project.mkdir(name)
    entries.push({ name, path })
    await box.project.write(`${name}/.ki.toml`, declaration(name, 'project'))
  }
  const parent = 'Library/CloudStorage/OneDrive-Personal'
  await box.home.write(`${parent}/sources-file`, 'not a directory')
  const target = await box.root.mkdir('linked-source-store')
  await symlink(target, `${box.home.path}/${parent}/sources-symlink`)
  await box.home.mkdir(`${parent}/sources-stat-denied`)
  await box.state.write('ki/registry.toml', registry(entries))
  statFailure.path = await realpath(`${box.home.path}/${parent}/sources-stat-denied`)

  const result = await box.run('ki repo --estate store scan')

  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('undeclared (0)')
  expect(result.output).toContain('diagnostics (3)')
  expect(result.output).toContain('conventional sources path is not a direct directory')
  expect(result.output).toContain('source-store stat denied')
})

test('diagnoses a selected repository whose declaration differs from its registry identity', async () => {
  const box = await sandbox()
  const path = await box.project.mkdir('wrong-identity')
  await box.project.write('wrong-identity/.ki.toml', declaration('different', 'project'))
  await box.home.mkdir('Library/CloudStorage/OneDrive-Personal/sources-wrong-identity')
  await box.state.write('ki/registry.toml', registry([{ name: 'wrong-identity', path }]))

  const result = await box.run(['ki', 'repo', '--repo', path, 'store', 'scan'])

  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('repository declaration does not match its registered identity')
})

test('rechecks repository and declaration paths after target selection', async () => {
  const box = await sandbox()
  const path = await box.project.mkdir('racing')
  await box.project.write('racing/.ki.toml', declaration('racing', 'project'))
  const source = await box.home.mkdir('Library/CloudStorage/OneDrive-Personal/sources-racing')
  const file = `${box.root.path}/unsafe-file`
  await box.root.write('unsafe-file', 'not a directory')
  statFailure.replacement = { trigger: source, target: path, substitute: file }

  const root = await box.run(['ki', 'repo', '--repo', path, 'store', 'scan'])
  expect(root.exitCode).toBe(1)
  expect(root.output).toContain('repository root is not a direct directory')

  statFailure.activated = false
  statFailure.replacement = { trigger: source, target: `${path}/.ki.toml`, substitute: path }
  const declarationResult = await box.run(['ki', 'repo', '--repo', path, 'store', 'scan'])
  expect(declarationResult.exitCode).toBe(1)
  expect(declarationResult.output).toContain('repository declaration is not a direct file')

  statFailure.activated = false
  statFailure.replacement = { trigger: source, target: `${path}/.ki.toml` }
  const missing = await box.run(['ki', 'repo', '--repo', path, 'store', 'scan'])
  expect(missing.exitCode).toBe(1)
  expect(missing.output).toContain('repository declaration is not a direct file')
})

test('labels an unregistered repository diagnostic with its root', async () => {
  const box = await sandbox()
  const path = await box.project.mkdir('unsafe')
  await box.project.write('unsafe/.ki.toml', declaration('unsafe', 'project'))
  const target = await box.root.mkdir('linked-source-store')
  await box.home.mkdir('Library/CloudStorage/OneDrive-Personal')
  await symlink(target, `${box.home.path}/Library/CloudStorage/OneDrive-Personal/sources-unsafe`)

  const result = await box.run(['ki', 'repo', '--repo', path, 'store', 'scan'])
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain(`${path}: conventional sources path is not a direct directory`)
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

  const result = await box.run('ki repo --estate store scan')

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

  const result = await box.run('ki repo --estate store scan')

  expect(result.exitCode).toBe(2)
  expect(result.output).toContain('must be an existing physical directory')
})
