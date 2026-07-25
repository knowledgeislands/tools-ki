import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

describe('[ki diag]', () => {
  test('reports the executable path and the resolved data directory', async () => {
    const box = await sandbox()
    const missingHome = join(box.root.path, 'missing-home')
    box.setEnv({
      XDG_DATA_HOME: join(missingHome, 'data'),
      XDG_CONFIG_HOME: join(missingHome, 'config'),
      XDG_CACHE_HOME: join(missingHome, 'cache'),
      XDG_STATE_HOME: join(missingHome, 'state')
    })

    const diag = await box.run('ki diag')

    expect(diag.output).toContain(`Executable    ${box.executable}`)
    expect(diag.output).toContain(`Data          ${missingHome}/data/ki`)
  })

  test('reports user configuration values, unknown keys, and invalid entries', async () => {
    const box = await sandbox()
    await box.config.write(
      'ki/config.toml',
      [
        'schema = 2',
        'unexpected = true',
        '',
        '[agents]',
        'ids = ["claude-code", "unknown-agent"]',
        '',
        '[harnesses]',
        'releases = [{ id = "example/harness", url = "http://example.test/archive.tar.gz", sha256 = "invalid", extra = true }]',
        '',
        '[skills]',
        'ids = ["example:skill", "example:skill"]',
        ''
      ].join('\n')
    )

    const human = await box.run('ki diag')

    expect(human.output).toContain('Warnings\n  - unrecognised key unexpected')
    expect(human.output).toContain('Errors\n  - schema must equal 1')
  })

  test('resolves the ancestor KI repository from a nested working directory', async () => {
    const box = await sandbox()
    await box.project.mkdir('repo/src/nested')
    await box.project.write('repo/.ki-config.toml', '# repo\n')

    box.cd('repo/src/nested')
    const diag = await box.run('ki diag')

    expect(diag.output).toMatch(/Repository\s+.+repo/)
  })

  test('reports no repository outside a KI repository', async () => {
    const box = await sandbox()
    await box.project.mkdir('scratch')

    box.cd('scratch')
    const diag = await box.run('ki diag')

    expect(diag.output).toContain('Repository    none')
  })
})
