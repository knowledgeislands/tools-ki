import { lstat, mkdir, symlink, writeFile } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

describe('[ki harness]', () => {
  describe('[ki harness list]', () => {
    test('lists installed compatible harnesses', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      const listed = await box.run('ki harness list')

      expect(listed).toEqual({ exitCode: 0, output: 'example/harness\t1 capabilities\n' })
    })
  })

  describe('[ki harness info]', () => {
    test('inspects one non-base harness in human form', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      const info = await box.run('ki harness info example/harness')

      expect(info.exitCode).toBe(0)
      expect(info.output).toContain('capabilities: 1')
      expect(info.output).toContain('  skill ki-example\n')
    })

    test('inspects one non-base harness in JSON form', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      const json = await box.run('ki harness info example/harness --json')

      expect(json.exitCode).toBe(0)
      expect(json.output).toContain('"depends_on":[]')
    })
  })

  describe('[ki harness uninstall]', () => {
    test('removes one non-base harness, honoring a dry run first', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      const dryRun = await box.run('ki harness uninstall example/harness --dry-run')
      const removed = await box.run('ki harness uninstall example/harness')

      expect(dryRun.output).toContain('would uninstall example/harness')
      expect(removed.output).toContain('uninstalled example/harness')
      await expect(lstat(`${box.data.path}/ki/harnesses/example/harness`)).rejects.toThrow()
    })
  })

  describe('[ki harness install]', () => {
    test('reports an already-installed configured harness and records it', async () => {
      const box = await sandbox()
      const sha256 = 'a'.repeat(64)
      await mkdir(`${box.config.path}/ki`, { recursive: true })
      const seedConfig = `[harnesses]
releases = [
  { id = "example/harness", url = "https://releases.example.test/harness.tar.gz", sha256 = "${sha256}" },
]
`
      await writeFile(`${box.config.path}/ki/config.toml`, seedConfig)
      await box.setupExampleHarness()

      const installed = await box.run('ki harness install example/harness')
      const config = await box.config.read('ki/config.toml')
      const expectedHarnessesSection = `ids = [
  "example/harness",
]`

      expect(installed).toEqual({ exitCode: 0, output: `example/harness is already installed\tarchive ${sha256}\n` })
      expect(config).toContain(expectedHarnessesSection)
    })
  })

  describe('installed harness integrity', () => {
    test('rejects an installed harness with malformed skill contents', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      await box.data.write('ki/harnesses/example/harness/skills/ki-example/SKILL.md', 'no frontmatter here\n')

      const info = await box.run('ki harness info example/harness')

      expect(info.exitCode).toBe(1)
      expect(info.output).toContain('must declare frontmatter')
    })

    test('rejects an installed harness whose payload contains a symlink', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      const skillDirectory = `${box.data.path}/ki/harnesses/example/harness/skills/ki-example`
      await symlink(`${skillDirectory}/SKILL.md`, `${skillDirectory}/ALIAS.md`)

      const listed = await box.run('ki harness list')

      expect(listed.exitCode).toBe(1)
      expect(listed.output).toContain('must not be a symlink')
    })
  })
})
