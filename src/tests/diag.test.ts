import { mkdir, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { cleanupTemporaryDirectories, runKi, runKiAt, temporaryDirectory } from './testkit.ts'

afterEach(cleanupTemporaryDirectories)

describe('ki diag', () => {
  test('reports user configuration values, unknown keys, and invalid entries', async () => {
    const root = await temporaryDirectory()
    const configuration = join(root, 'config', 'ki')
    await mkdir(configuration, { recursive: true })
    await writeFile(
      join(configuration, 'config.toml'),
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

    const human = await runKi(['diag'], { XDG_CONFIG_HOME: join(root, 'config') })

    expect(human.output).toContain('Warnings\n  - unrecognised key unexpected')
    expect(human.output).toContain('Errors\n  - schema must equal 1')
  })

  test('resolves the ancestor KI repository from a nested working directory', async () => {
    const root = await temporaryDirectory()
    const home = join(root, 'home')
    const repository = join(home, 'repo')
    const nested = join(repository, 'src', 'nested')
    await mkdir(nested, { recursive: true })
    await writeFile(join(repository, '.ki-config.toml'), '# repo\n')

    const diag = await runKiAt(['diag'], nested, { HOME: home })

    expect(diag.output).toContain(`Repository    ${await realpath(repository)}`)
  })

  test('reports no repository outside a KI repository', async () => {
    const root = await temporaryDirectory()
    const home = join(root, 'home')
    const workingDirectory = join(home, 'scratch')
    await mkdir(workingDirectory, { recursive: true })

    const diag = await runKiAt(['diag'], workingDirectory, { HOME: home })

    expect(diag.output).toContain('Repository    none')
  })
})
