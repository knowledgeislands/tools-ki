import { lstat, readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { runCommand, sandbox } from '../_cli_helper.ts'

const exists = async (path: string): Promise<boolean> => Boolean(await lstat(path).catch(() => undefined))

/** A sandbox holding registered checkouts, each a KI repository with a tracked pre-commit unless told otherwise. */
const estate = async () => {
  const box = await sandbox()
  const home = await realpath(box.home.path)
  box.setRunner(runCommand)
  const checkout = async (path: string, options: { readonly ki?: boolean; readonly hook?: boolean } = {}) => {
    await box.home.git(['init', '-q', '-b', 'main'], path)
    await box.home.write(`${path}/README.md`, `# ${path}\n`)
    if (options.ki ?? true) await box.home.write(`${path}/.ki.toml`, 'schema = 1\n')
    if (options.hook ?? true) await box.home.write(`${path}/.githooks/pre-commit`, '#!/bin/sh\n')
    await box.home.git(['add', '.'], path)
    await box.home.git(['commit', '-qm', 'init'], path)
  }
  const registry = (entries: Readonly<Record<string, string>>) =>
    box.state.write(
      'ki/registry.toml',
      [
        'schema = 1',
        ...Object.entries(entries).flatMap(([key, path]) => [
          '',
          `[repositories.${JSON.stringify(key)}]`,
          `repository = ${JSON.stringify(`https://github.com/acme/${key}`)}`,
          `path = ${JSON.stringify(join(home, path))}`
        ]),
        ''
      ].join('\n')
    )
  const hooksPath = async (path: string): Promise<string> =>
    (await box.home.git(['config', '--get', 'core.hooksPath'], path).catch(() => '')).trim()
  return { box, home, checkout, registry, hooksPath }
}

describe('ki estate converge --hooks', () => {
  test('previews, applies and rolls back the hook binding sweep', async () => {
    const { box, home, checkout, registry, hooksPath } = await estate()
    await checkout('w/alpha')
    await box.home.write('w/alpha/.husky/_/pre-commit', '#!/bin/sh\n')
    await checkout('w/beta')
    await box.home.git(['config', 'core.hooksPath', '.husky/_'], 'w/beta')
    await checkout('w/gamma')
    await box.home.git(['config', 'core.hooksPath', '.githooks'], 'w/gamma')
    await box.home.write('w/gamma/.husky/tracked', '\n')
    await box.home.git(['add', '.husky'], 'w/gamma')
    await box.home.git(['commit', '-qm', 'husky'], 'w/gamma')
    await box.home.git(['config', 'extensions.worktreeConfig', 'true'], 'w/gamma')
    await box.home.git(['worktree', 'add', '-q', join(home, 'w/gamma-wt')], 'w/gamma')
    await box.home.git(['config', '--worktree', 'core.hooksPath', 'custom'], 'w/gamma-wt')
    await box.home.git(['worktree', 'add', '-q', join(home, 'w/gamma-plain')], 'w/gamma')
    await checkout('w/delta')
    await box.home.git(['config', 'core.hooksPath', 'custom'], 'w/delta')
    await checkout('w/epsilon', { ki: false })
    await checkout('w/zeta', { hook: false })
    await registry({
      alpha: 'w/alpha',
      beta: 'w/beta',
      gamma: 'w/gamma',
      'gamma-wt': 'w/gamma-wt',
      delta: 'w/delta',
      epsilon: 'w/epsilon',
      zeta: 'w/zeta'
    })
    const registryPath = `${box.state.path}/ki/registry.toml`
    const aside = `${box.state.path}/ki/converge/set-aside/1970-01-01T00-00-00-000Z/${join(home, 'w/alpha').replace(/[^a-zA-Z0-9]/g, '-')}.husky`

    const preview = await box.run('ki estate converge --hooks', { now: () => 0 })
    expect(preview.exitCode).toBe(0)
    expect(preview.output).toBe(
      [
        `ki estate converge: hooks preview from ${registryPath}`,
        `bind ${home}/w/alpha`,
        `  core.hooksPath ${home}/w/alpha: unset -> .githooks`,
        `  set aside ${home}/w/alpha/.husky -> ${aside}`,
        `bind ${home}/w/beta`,
        `  core.hooksPath ${home}/w/beta: .husky/_ -> .githooks`,
        `keep ${home}/w/delta`,
        '  note: core.hooksPath=custom is not .githooks; left as it is',
        `bound ${home}/w/gamma`,
        `  note: worktree ${home}/w/gamma-wt sets core.hooksPath=custom; left as it is`,
        `skip ${home}/w/gamma-wt`,
        '  note: not a primary checkout',
        'summary: 2 bind, 1 bound, 1 keep, 1 skip',
        'preview only; rerun with --apply to execute',
        ''
      ].join('\n')
    )
    expect(await hooksPath('w/alpha')).toBe('')

    const applied = await box.run('ki estate converge --hooks --apply', { now: () => 0 })
    const log = `${box.state.path}/ki/converge/1970-01-01T00-00-00-000Z.json`
    expect(applied.output).toContain(`ki estate converge: hooks apply from ${registryPath}`)
    expect(applied.output).toContain(`log ${log}\n`)
    expect(await hooksPath('w/alpha')).toBe('.githooks')
    expect(await hooksPath('w/beta')).toBe('.githooks')
    expect(await hooksPath('w/delta')).toBe('custom')
    expect(await exists(join(home, 'w/alpha/.husky'))).toBe(false)
    expect(await readFile(join(aside, '_/pre-commit'), 'utf8')).toBe('#!/bin/sh\n')
    expect(JSON.parse(await readFile(log, 'utf8')).manifest).toBe(registryPath)

    const again = await box.run('ki estate converge --hooks --apply', { now: () => 1000 })
    expect(again.output).toContain('summary: 0 bind, 3 bound, 1 keep, 1 skip\nnothing to apply\n')

    const rollback = await box.run(['ki', 'estate', 'converge', '--rollback', log, '--apply'], { now: () => 2000 })
    expect(rollback.output).toContain(
      [
        `  core.hooksPath ${home}/w/beta: .githooks -> .husky/_`,
        `  set aside ${aside} -> ${home}/w/alpha/.husky`,
        `  core.hooksPath ${home}/w/alpha: .githooks -> unset`
      ].join('\n')
    )
    expect(await hooksPath('w/alpha')).toBe('')
    expect(await hooksPath('w/beta')).toBe('.husky/_')

    const reverse = `${box.state.path}/ki/converge/1970-01-01T00-00-02-000Z.rollback.json`
    const redo = await box.run(['ki', 'estate', 'converge', '--rollback', reverse], { now: () => 3000 })
    expect(redo.output).toContain(`  core.hooksPath ${home}/w/alpha: unset -> .githooks\n`)
    expect(await readFile(join(home, 'w/alpha/.husky/_/pre-commit'), 'utf8')).toBe('#!/bin/sh\n')
  })

  test('rejects a manifest, --rollback, --clone and --allow-busy alongside --hooks', async () => {
    const box = await sandbox()
    for (const command of ['ki estate converge targets.json --hooks', 'ki estate converge --hooks --rollback log.json'])
      expect((await box.run(command)).output).toContain(
        'ki: error: ki estate converge --hooks does not accept a manifest or --rollback'
      )
    for (const command of ['ki estate converge --hooks --clone', 'ki estate converge --hooks --allow-busy x']) {
      const result = await box.run(command)
      expect(result.exitCode).toBe(2)
      expect(result.output).toContain('ki: error: ki estate converge --hooks does not accept --clone or --allow-busy')
    }
  })
})
