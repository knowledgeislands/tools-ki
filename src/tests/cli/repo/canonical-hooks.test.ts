import { chmod, lstat, mkdir, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { type Sandbox, sandbox } from '../_cli_helper.ts'

const modulePath = 'ki/harnesses/example/harness/skills/ki-repo/scripts/rubric/contexts/canonical-hooks.ts'
const shape = 'ki-repo-project'
const hook = (name: string, selectedShape = shape, variant = 'no-package') =>
  `#!/bin/sh\n# ${selectedShape} ${variant} ${name}\nexit 0\n`
const data = `export const canonicalHooks = (shape, variant) => shape === 'ki-repo-dotfiles-chezmoi' ? null : ({
  'pre-commit': '#!/bin/sh\\n# ' + shape + ' ' + variant + ' pre-commit\\nexit 0\\n',
  'commit-msg': '#!/bin/sh\\n# ' + shape + ' ' + variant + ' commit-msg\\nexit 0\\n'
})\n`
const setup = async (selectedShape = shape, source = data): Promise<Sandbox> => {
  const box = await sandbox()
  await box.setupExampleHarness({
    name: 'ki-repo',
    rubric: `export default {
    contract: 1, name: 'ki-repo', concern: 'hooks', families: [],
    createSession: async () => ({ subjects: [], proposal: () => ({ writes: [] }) })
  }`
  })
  if (selectedShape !== shape)
    await box.data.write(
      `ki/harnesses/example/harness/skills/${selectedShape}/SKILL.md`,
      `---\nname: ${selectedShape}\nki-depends-on: []\n---\n`
    )
  await box.data.write(
    `ki/harnesses/example/harness/skills/${selectedShape}/scripts/rubric/items/index.ts`,
    `export default {
    contract: 1, name: '${selectedShape}', concern: 'shape', families: [],
    createSession: async () => ({ subjects: [], proposal: () => ({ writes: [] }) })
  }`
  )
  await box.data.write(modulePath, source)
  await box.config.write('ki/config.toml', 'schema = 1\n\n[agents]\nids = []\n\n[harnesses]\nids = []\n\n[skills]\n')
  await box.project.write(
    '.ki.toml',
    `[repo]\nharnesses = ["example/harness"]\n\n[skills.${selectedShape}]\n\n[skills.ki-repo]\nrepo_type = "${selectedShape === 'ki-repo-kb' ? 'kb' : 'project'}"\nprimary_shape = "${selectedShape}"\nrepository = "https://github.com/example/project"\n`
  )
  await box.project.git(['init', '-q'])
  return box
}
const conform = (box: Sandbox, flags = '') => box.run(`ki repo conform${flags}`, { runner: 'default' })
const binding = (box: Sandbox) => box.project.git(['config', '--get', 'core.hooksPath']).catch(() => '')
const exists = async (box: Sandbox, path: string) =>
  Boolean(await lstat(join(box.project.path, path)).catch(() => undefined))

test('previews first adoption without writes or binding, then publishes exact executable hooks idempotently', async () => {
  const box = await setup()
  const preview = await conform(box, ' --dry-run')
  expect(preview.exitCode, preview.output).toBe(0)
  expect(preview.output).toContain('would write .githooks/pre-commit')
  expect(preview.output).toContain('would write .githooks/commit-msg')
  expect(preview.output).toContain('would bind core.hooksPath .githooks')
  expect(await exists(box, '.githooks')).toBe(false)
  expect(await binding(box)).toBe('')
  expect((await conform(box)).exitCode).toBe(0)
  for (const name of ['pre-commit', 'commit-msg']) {
    expect(await box.project.read(`.githooks/${name}`)).toBe(hook(name))
    expect((await lstat(join(box.project.path, '.githooks', name))).mode & 0o777).toBe(0o755)
  }
  expect(await binding(box)).toBe('.githooks')
  const again = await conform(box)
  expect(again.exitCode).toBe(0)
  expect(again.output).not.toContain('write .githooks/')
  expect(again.output).not.toContain('bind core.hooksPath')
})

test('replaces local drift, repairs modes, and overrides a foreign binding without adding an extension', async () => {
  const box = await setup('ki-repo-kb')
  await box.project.write('.githooks/pre-commit', '#!/bin/sh\ncustom-check\n')
  await box.project.write('.githooks/commit-msg', hook('commit-msg', 'ki-repo-kb'))
  await chmod(join(box.project.path, '.githooks/commit-msg'), 0o644)
  await box.project.git(['config', 'core.hooksPath', 'custom-hooks'])
  const preview = await conform(box, ' --dry-run')
  expect(preview.exitCode, preview.output).toBe(0)
  expect(preview.output).toContain('would bind core.hooksPath .githooks (was custom-hooks)')
  expect(await box.project.read('.githooks/pre-commit')).toContain('custom-check')
  expect(await binding(box)).toBe('custom-hooks')
  expect((await conform(box)).exitCode).toBe(0)
  expect(await box.project.read('.githooks/pre-commit')).toBe(hook('pre-commit', 'ki-repo-kb'))
  expect((await lstat(join(box.project.path, '.githooks/commit-msg'))).mode & 0o777).toBe(0o755)
  expect(await binding(box)).toBe('.githooks')
  expect(await exists(box, '.githooks/pre-commit.local')).toBe(false)
})

test('uses package presence and normalises an absolute binding to the relative canonical path', async () => {
  const box = await setup()
  await box.project.write(
    'package.json',
    '{"name":"fixture","scripts":{"prepare":"git config core.hooksPath .githooks"}}\n'
  )
  await box.project.git(['config', 'core.hooksPath', join(box.project.path, '.githooks')])
  expect((await conform(box)).exitCode).toBe(0)
  expect(await box.project.read('.githooks/pre-commit')).toBe(hook('pre-commit', shape, 'package'))
  expect(await box.project.read('.githooks/commit-msg')).toBe(hook('commit-msg', shape, 'package'))
  expect(await binding(box)).toBe('.githooks')
})

test('a no-hook shape leaves existing hooks, Husky, package and binding untouched', async () => {
  const box = await setup('ki-repo-dotfiles-chezmoi')
  await box.project.write('.githooks/pre-commit', 'existing\n')
  await box.project.write('.husky/pre-commit', 'custom\n')
  await box.project.write('package.json', '{"scripts":{"prepare":"husky"},"devDependencies":{"husky":"9.0.0"}}\n')
  await box.project.git(['config', 'core.hooksPath', 'existing'])
  const result = await conform(box)
  expect(result.exitCode, result.output).toBe(0)
  expect(await box.project.read('.githooks/pre-commit')).toBe('existing\n')
  expect(await box.project.read('.husky/pre-commit')).toBe('custom\n')
  expect(await box.project.read('package.json')).toContain('"prepare":"husky"')
  expect(await exists(box, '.githooks/commit-msg')).toBe(false)
  expect(await binding(box)).toBe('existing')
})

test('a directory without .ki.toml receives no hooks or binding', async () => {
  const box = await sandbox()
  await box.project.git(['init', '-q'])
  const result = await conform(box, ' --dry-run')
  expect(result.exitCode).not.toBe(0)
  expect(await exists(box, '.githooks')).toBe(false)
  expect(await binding(box)).toBe('')
})

test.each(['directory', 'symlink', 'hook-directory'])(
  'refuses unsafe %s before publishing either hook or binding',
  async (kind) => {
    const box = await setup()
    if (kind === 'directory') await mkdir(join(box.project.path, '.githooks/pre-commit'), { recursive: true })
    if (kind === 'symlink') {
      await box.project.write('target', 'untouched')
      await mkdir(join(box.project.path, '.githooks'))
      await symlink('../target', join(box.project.path, '.githooks/pre-commit'))
    }
    if (kind === 'hook-directory') {
      await mkdir(join(box.project.path, 'elsewhere'))
      await symlink('elsewhere', join(box.project.path, '.githooks'))
    }
    const result = await conform(box)
    expect(result.exitCode).not.toBe(0)
    expect(await exists(box, '.githooks/commit-msg')).toBe(false)
    expect(await binding(box)).toBe('')
    if (kind === 'symlink') expect(await box.project.read('target')).toBe('untouched')
  }
)

test.each([
  ['bad-export', 'export const canonicalHooks = 1', 'must export canonicalHooks'],
  ['bad-value', 'export const canonicalHooks = () => 1', 'must return a hook pair or null'],
  ['missing-pre', 'export const canonicalHooks = () => ({})', 'must return a hook pair or null'],
  ['wrong-pre', 'export const canonicalHooks = () => ({"pre-commit": 1})', 'must return a hook pair or null'],
  ['missing-msg', 'export const canonicalHooks = () => ({"pre-commit": "text"})', 'must return a hook pair or null'],
  [
    'wrong-msg',
    'export const canonicalHooks = () => ({"pre-commit": "text", "commit-msg": 1})',
    'must return a hook pair or null'
  ],
  ['broken-module', 'this is invalid TypeScript !', 'could not be loaded']
])('refuses malformed canonical data: %s', async (_name, source, message) => {
  const box = await setup(shape, source)
  const result = await conform(box, ' --dry-run')
  expect(result.exitCode).not.toBe(0)
  expect(result.output).toContain(message)
  expect(await exists(box, '.githooks')).toBe(false)
  expect(await binding(box)).toBe('')
})

test.each(
  ['internal', 'external'].flatMap((location) => ['drift', 'binding-only', 'no-op'].map((state) => [location, state]))
)('refuses a %s symlinked hook parent during %s', async (location, state) => {
  const box = await setup()
  const target = location === 'internal' ? box.project : box.data
  const contents = Object.fromEntries(
    ['pre-commit', 'commit-msg'].map((name) => [name, state === 'drift' ? `Document ${name}\n` : hook(name)])
  )
  for (const [name, content] of Object.entries(contents)) {
    await target.write(`documents/${name}`, content)
    await chmod(join(target.path, 'documents', name), 0o755)
  }
  await symlink(
    location === 'internal' ? 'documents' : join(target.path, 'documents'),
    join(box.project.path, '.githooks')
  )
  const originalBinding = state === 'no-op' ? '.githooks' : ''
  if (originalBinding) await box.project.git(['config', 'core.hooksPath', originalBinding])
  for (const flags of [' --dry-run', '']) {
    const result = await conform(box, flags)
    expect(result.exitCode, result.output).toBe(1)
    expect(result.output).toContain('.githooks is not a physical directory')
    expect(result.output).not.toContain('would write .githooks/')
    expect(await binding(box)).toBe(originalBinding)
    expect(await box.project.isSymlink('.githooks')).toBe(true)
    for (const [name, content] of Object.entries(contents)) {
      expect(await target.read(`documents/${name}`)).toBe(content)
      expect((await lstat(join(target.path, 'documents', name))).mode & 0o777).toBe(0o755)
    }
  }
})
