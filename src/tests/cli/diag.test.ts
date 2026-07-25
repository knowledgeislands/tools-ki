import { describe, expect, test } from 'vitest'
import { sandbox } from './_helper.ts'

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

    expect(diag.output).toContain(`Repository    ${await box.project.realpath('repo')}`)
  })

  test('reports no repository outside a KI repository', async () => {
    const box = await sandbox()
    await box.project.mkdir('scratch')

    box.cd('scratch')
    const diag = await box.run('ki diag')

    expect(diag.output).toContain('Repository    none')
  })
})
