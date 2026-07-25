import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { cleanupTemporaryDirectories, installHarness, runKi, temporaryDirectory } from './testkit.ts'

afterEach(cleanupTemporaryDirectories)

describe('ki harness', () => {
  describe('harness list', () => {
    test('lists installed compatible harnesses', async () => {
      const root = await temporaryDirectory()
      const data = join(root, 'data')
      await installHarness(data)
      const listed = await runKi(['harness', 'list'], { XDG_DATA_HOME: data })

      expect(listed).toEqual({ exitCode: 0, output: 'example/harness\t1 capabilities\n' })
    })
  })

  describe('harness info & uninstall', () => {
    test('inspects and removes one non-base harness', async () => {
      const root = await temporaryDirectory()
      const data = join(root, 'data')
      await installHarness(data)
      const environment = { XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: data }
      const info = await runKi(['harness', 'info', 'example/harness'], environment)
      const json = await runKi(['harness', 'info', 'example/harness', '--json'], environment)
      const dryRun = await runKi(['harness', 'uninstall', 'example/harness', '--dry-run'], environment)
      const removed = await runKi(['harness', 'uninstall', 'example/harness'], environment)

      expect(info.output).toContain('capabilities: 1')
      expect(info.output).toContain('  skill ki-example\n')
      expect(json.output).toContain('"depends_on":[]')
      expect(dryRun.output).toContain('would uninstall example/harness')
      expect(removed.output).toContain('uninstalled example/harness')
      await expect(lstat(join(data, 'ki', 'harnesses', 'example', 'harness'))).rejects.toThrow()
    })
  })

  describe('harness install', () => {
    test('reports an already-installed configured harness and records it', async () => {
      const root = await temporaryDirectory()
      const configuration = join(root, 'config', 'ki')
      const data = join(root, 'data')
      await mkdir(configuration, { recursive: true })
      const sha256 = 'a'.repeat(64)
      await writeFile(
        join(configuration, 'config.toml'),
        [
          '[harnesses]',
          'releases = [',
          `  { id = "example/harness", url = "https://releases.example.test/harness.tar.gz", sha256 = "${sha256}" },`,
          ']',
          ''
        ].join('\n')
      )
      await installHarness(data)

      const installed = await runKi(['harness', 'install', 'example/harness'], {
        XDG_CONFIG_HOME: join(root, 'config'),
        XDG_DATA_HOME: data
      })

      expect(installed).toEqual({ exitCode: 0, output: `example/harness is already installed\tarchive ${sha256}\n` })
      expect(await readFile(join(configuration, 'config.toml'), 'utf8')).toContain('ids = [\n  "example/harness",\n]')
    })
  })
})
