import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { run as runCli } from '../cli.ts'
import { createContext } from '../core/context.ts'
import { cleanupTemporaryDirectories, executable, runKi, temporaryDirectory } from './testkit.ts'

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

  test('reports a null repository outside a KI repository', async () => {
    const root = await temporaryDirectory()
    const home = join(root, 'home')
    const workingDirectory = join(home, 'scratch')
    let output = ''
    await mkdir(workingDirectory, { recursive: true })
    const context = await createContext({
      stdout: { write: (chunk) => (output += chunk) },
      stderr: { write: (chunk) => (output += chunk) },
      executable,
      workingDirectory,
      environment: { HOME: home }
    })

    expect(await runCli(['diag'], context)).toBe(0)
    expect(output).toContain('Repository    none')
  })
})
