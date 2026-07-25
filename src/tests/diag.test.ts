import { mkdir, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
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
    const repository = join(box.home.path, 'repo')
    const nested = join(repository, 'src', 'nested')
    await mkdir(nested, { recursive: true })
    await writeFile(join(repository, '.ki-config.toml'), '# repo\n')

    const diag = await box.run(['diag'], {}, nested)

    expect(diag.output).toContain(`Repository    ${await realpath(repository)}`)
  })

  test('reports no repository outside a KI repository', async () => {
    const box = await sandbox()
    const workingDirectory = join(box.home.path, 'scratch')
    await mkdir(workingDirectory, { recursive: true })

    const diag = await box.run(['diag'], {}, workingDirectory)

    expect(diag.output).toContain('Repository    none')
  })
})
