import { lstat, mkdir, symlink, writeFile } from 'node:fs/promises'
import { afterEach, describe, expect, test } from 'vitest'
import { sandbox } from './testkit.ts'

afterEach(sandbox.cleanupAll)

describe('ki harness', () => {
  describe('harness list', () => {
    test('lists installed compatible harnesses', async () => {
      const box = await sandbox()
      await box.installExampleHarness()
      const listed = await box.run(['harness', 'list'])

      expect(listed).toEqual({ exitCode: 0, output: 'example/harness\t1 capabilities\n' })
    })
  })

  describe('harness info & uninstall', () => {
    test('inspects and removes one non-base harness', async () => {
      const box = await sandbox()
      await box.installExampleHarness()
      const info = await box.run(['harness', 'info', 'example/harness'])
      const json = await box.run(['harness', 'info', 'example/harness', '--json'])
      const dryRun = await box.run(['harness', 'uninstall', 'example/harness', '--dry-run'])
      const removed = await box.run(['harness', 'uninstall', 'example/harness'])

      expect(info.output).toContain('capabilities: 1')
      expect(info.output).toContain('  skill ki-example\n')
      expect(json.output).toContain('"depends_on":[]')
      expect(dryRun.output).toContain('would uninstall example/harness')
      expect(removed.output).toContain('uninstalled example/harness')
      await expect(lstat(`${box.data.path}/ki/harnesses/example/harness`)).rejects.toThrow()
    })
  })

  describe('harness install', () => {
    test('reports an already-installed configured harness and records it', async () => {
      const box = await sandbox()
      const sha256 = 'a'.repeat(64)
      await mkdir(`${box.config.path}/ki`, { recursive: true })
      await writeFile(
        `${box.config.path}/ki/config.toml`,
        [
          '[harnesses]',
          'releases = [',
          `  { id = "example/harness", url = "https://releases.example.test/harness.tar.gz", sha256 = "${sha256}" },`,
          ']',
          ''
        ].join('\n')
      )
      await box.installExampleHarness()

      const installed = await box.run(['harness', 'install', 'example/harness'])

      expect(installed).toEqual({ exitCode: 0, output: `example/harness is already installed\tarchive ${sha256}\n` })
      expect(await box.config.read('ki/config.toml')).toContain('ids = [\n  "example/harness",\n]')
    })
  })

  describe('installed harness integrity', () => {
    test('rejects an installed harness with malformed skill contents', async () => {
      const box = await sandbox()
      await box.installExampleHarness()
      await box.data.write('ki/harnesses/example/harness/skills/ki-example/SKILL.md', 'no frontmatter here\n')

      const info = await box.run(['harness', 'info', 'example/harness'])

      expect(info.exitCode).toBe(1)
      expect(info.output).toContain('must declare frontmatter')
    })

    test('rejects an installed harness whose payload contains a symlink', async () => {
      const box = await sandbox()
      await box.installExampleHarness()
      const skillDirectory = `${box.data.path}/ki/harnesses/example/harness/skills/ki-example`
      await symlink(`${skillDirectory}/SKILL.md`, `${skillDirectory}/ALIAS.md`)

      const listed = await box.run(['harness', 'list'])

      expect(listed.exitCode).toBe(1)
      expect(listed.output).toContain('must not be a symlink')
    })
  })
})
