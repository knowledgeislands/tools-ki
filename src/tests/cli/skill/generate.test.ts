import { chmod, rm, stat, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from '../_cli_helper.ts'

const installed = 'ki/harnesses/example/harness'
const generatorPath = 'skills/ki-example/scripts/generate/index.ts'

// A generator that renders two surfaces below the Harness root from one source file there.
const generator = (body = 'surfaces(root)', name = 'ki-example', contract = 1): string => `
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const surfaces = (root) => {
  const source = readFileSync(join(root, 'source.txt'), 'utf8')
  return [
    { path: 'hooks/rendered.sh', content: \`line='\${source.trim()}'\\n\` },
    { path: 'styles/rendered.md', content: \`# \${source}\` }
  ]
}
export default { contract: ${contract}, name: '${name}', generate: (root) => ${body} }
`

const installedHarness = async (box: Sandbox, source = generator()): Promise<void> => {
  await box.setupExampleHarness()
  await box.data.write(`${installed}/source.txt`, 'rendered\n')
  await box.data.write(`${installed}/${generatorPath}`, source)
}

// A dev-linked Harness whose installed root is a symlink to a real Git checkout, as `ki dev local on` leaves it.
const devLinkedHarness = async (box: Sandbox, source = generator()): Promise<string> => {
  await box.setupExampleHarness()
  await box.root.write('local/.ki.toml', '[skills.ki-repo-harness]\nprefix = "ki"\n')
  await box.root.write('local/skills/ki-example/SKILL.md', '---\nname: ki-example\nki-depends-on: []\n---\n')
  await box.root.write('local/source.txt', 'rendered\n')
  await box.root.write(`local/${generatorPath}`, source)
  await Promise.all(['subagents', 'hooks'].map((payload) => box.root.mkdir(`local/${payload}`)))
  const target = join(box.data.path, installed)
  await rm(target, { recursive: true, force: true })
  await symlink(join(box.root.path, 'local'), target)
  await box.root.git(['init'], 'local')
  box.cd('../local')
  return box.root.mkdir('local')
}

describe('[ki dev skill generate]', () => {
  test('still generates from a subdirectory of the primary development checkout', async () => {
    const box = await sandbox()
    await devLinkedHarness(box)
    box.cd('../local/skills')
    const result = await box.run('ki dev skill generate ki-example --write', { runner: 'default' })
    expect(result.exitCode).toBe(0)
    expect(await box.root.read('local/hooks/rendered.sh')).toBe("line='rendered'\n")
  })

  test('generates from and publishes only into the caller linked worktree', async () => {
    const box = await sandbox()
    const primary = await devLinkedHarness(box)
    await box.root.git(['add', '.'], 'local')
    await box.root.git(['commit', '-q', '-m', 'base'], 'local')
    await box.root.git(['worktree', 'add', '-q', '-b', 'delivery', '../linked'], 'local')
    await box.root.write('linked/source.txt', 'worktree source\n')
    box.cd('../linked')
    const result = await box.run('ki dev skill generate ki-example --write', { runner: 'default' })
    expect(result.exitCode).toBe(0)
    expect(await box.root.read('linked/hooks/rendered.sh')).toBe("line='worktree source'\n")
    await expect(box.root.read('local/hooks/rendered.sh')).rejects.toThrow()
    expect(await box.root.git(['status', '--porcelain'], 'local')).toBe('')
    expect(result.output).not.toContain(primary + '/hooks/rendered.sh')
  })

  test('reports each missing and stale surface and fails until they are written', async () => {
    const box = await sandbox()
    await installedHarness(box)
    await box.data.write(`${installed}/styles/rendered.md`, 'hand edited\n')

    const result = await box.run('ki dev skill generate ki-example')

    expect(result.exitCode).toBe(1)
    expect(result.output).toMatch(
      /hooks\/rendered\.sh is missing in .*harness; run with --write from a dev-linked harness/
    )
    expect(result.output).toMatch(/styles\/rendered\.md is stale in /)
    expect(result.output).toContain('has 2 generated surface(s) out of step')
  })

  test('writes only the surfaces out of step, keeps an existing mode and then reports in sync', async () => {
    const box = await sandbox()
    const root = await devLinkedHarness(box)
    await box.root.write('local/hooks/rendered.sh', "line='old'\n")
    await chmod(join(root, 'hooks/rendered.sh'), 0o755)

    const written = await box.run('ki dev skill generate ki-example --write', { runner: 'default' })

    expect(written).toEqual({
      exitCode: 0,
      output: `write ${root}/hooks/rendered.sh\nwrite ${root}/styles/rendered.md\n`
    })
    expect(await box.root.read('local/hooks/rendered.sh')).toBe("line='rendered'\n")
    expect(await box.root.read('local/styles/rendered.md')).toBe('# rendered\n')
    expect((await stat(join(root, 'hooks/rendered.sh'))).mode & 0o777).toBe(0o755)

    const again = await box.run('ki dev skill generate ki-example --write', { runner: 'default' })
    expect(again.output).toBe(
      `ki dev skill generate: example/harness:ki-example 2 generated surface(s) are in sync in ${root}\n`
    )
    const checked = await box.run('ki dev skill generate ki-example')
    expect(checked).toEqual({ exitCode: 0, output: again.output })
  })

  test('refuses --write against an installed, non-dev-linked payload', async () => {
    const box = await sandbox()
    await installedHarness(box)

    const result = await box.run('ki dev skill generate ki-example --write')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('run ki dev local on before writing its generated surface set')
    await expect(box.data.read(`${installed}/hooks/rendered.sh`)).rejects.toThrow()
  })

  test('refuses --write from a working tree other than the Harness checkout', async () => {
    const box = await sandbox()
    const root = await devLinkedHarness(box)
    await box.root.git(['init'], 'other')
    box.cd('../other')

    const result = await box.run('ki dev skill generate ki-example --write', { runner: 'default' })

    expect(result.exitCode).toBe(2)
    expect(result.output).toContain(`generated surface set belongs to ${root}`)
    await expect(box.root.read('local/hooks/rendered.sh')).rejects.toThrow()
  })

  test('refuses a skill with no generator module', async () => {
    const box = await sandbox()
    await box.setupExampleHarness()

    const result = await box.run('ki dev skill generate ki-example')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('ki-example does not provide generated surfaces')
  })

  test.each([
    ['an unimportable module', 'export default {', 'generator could not be imported'],
    ['a default export that is not a table', 'export default 1\n', 'generator default export is not a table'],
    ['an unsupported contract', generator('surfaces(root)', 'ki-example', 2), 'unsupported contract version'],
    ['a mismatched name', generator('surfaces(root)', 'ki-other'), 'generator name does not match'],
    ['no generate function', "export default { contract: 1, name: 'ki-example' }\n", 'must have a generate function'],
    ['a generator that throws', generator("{ throw new Error('no source') }"), 'generator failed: no source'],
    ['a generator that throws a non-error', generator("{ throw 'bare' }"), 'generator failed: bare'],
    ['a result that is not an array', generator('({})'), 'must return an array of surfaces'],
    ['a surface that is not a table', generator('[null]'), 'surfaces must each have a path and content'],
    ['a surface without content', generator("[{ path: 'a.md' }]"), 'surfaces must each have a path and content'],
    ['an empty path', generator("[{ path: '', content: '' }]"), 'generated surface path  is unsafe'],
    ['an absolute path', generator("[{ path: '/tmp/x', content: '' }]"), 'path /tmp/x is unsafe'],
    ['a parent segment', generator("[{ path: 'a/../b', content: '' }]"), 'path a/../b is unsafe'],
    [
      'a repeated path',
      generator("[{ path: 'a.md', content: '' }, { path: 'a.md', content: '' }]"),
      'generates a.md more than once'
    ],
    ['a directory in place of a file', generator("[{ path: 'skills', content: '' }]"), 'must be a regular file']
  ])('refuses %s', async (_, source, message) => {
    const box = await sandbox()
    await installedHarness(box, source)

    const result = await box.run('ki dev skill generate ki-example')

    expect(result.exitCode).toBe(1)
    expect(result.output).toContain(message)
  })
})
