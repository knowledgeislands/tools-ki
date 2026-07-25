import { describe, expect, test } from 'vitest'
import { sandbox } from './testkit.ts'

describe('ki diag', () => {
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

    const human = await box.run(['diag'])

    expect(human.output).toContain('Warnings\n  - unrecognised key unexpected')
    expect(human.output).toContain('Errors\n  - schema must equal 1')
  })

  test('resolves the ancestor KI repository from a nested working directory', async () => {
    const box = await sandbox()
    await box.home.mkdir('repo/src/nested')
    await box.home.write('repo/.ki-config.toml', '# repo\n')

    const diag = await box.run(['diag'], {}, box.home.resolve('repo/src/nested'))

    expect(diag.output).toContain(`Repository    ${await box.home.realpath('repo')}`)
  })

  test('reports no repository outside a KI repository', async () => {
    const box = await sandbox()
    await box.home.mkdir('scratch')

    const diag = await box.run(['diag'], {}, box.home.resolve('scratch'))

    expect(diag.output).toContain('Repository    none')
  })
})
