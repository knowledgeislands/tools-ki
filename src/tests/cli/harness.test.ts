import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { makeHarnessArchive } from './_archive_helper.ts'
import { sandbox } from './_cli_helper.ts'

describe('[ki harness]', () => {
  describe('[ki harness list]', () => {
    test('lists installed compatible harnesses', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      const listed = await box.run('ki harness list')

      expect(listed).toEqual({ exitCode: 0, output: 'example/harness\t1 capabilities\n' })
    })

    test('reports no installed harnesses when list is empty', async () => {
      const box = await sandbox()

      const listed = await box.run('ki harness list')

      expect(listed).toEqual({ exitCode: 0, output: 'No installed compatible harnesses.\n' })
    })
  })

  describe('[ki harness info]', () => {
    test('inspects one non-canonical harness in human form', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      const info = await box.run('ki harness info example/harness')

      expect(info.exitCode).toBe(0)
      expect(info.output).toContain('capabilities: 1')
      expect(info.output).toContain('  skill ki-example\n')
    })

    test('inspects one non-canonical harness in JSON form', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      const json = await box.run('ki harness info example/harness --json')

      expect(json.exitCode).toBe(0)
      expect(json.output).toContain('"depends_on":[]')
    })
  })

  describe('[ki harness uninstall]', () => {
    test('removes one non-canonical harness, honoring a dry run first, and un-records it', async () => {
      const box = await sandbox()
      await mkdir(`${box.config.path}/ki`, { recursive: true })
      await writeFile(
        `${box.config.path}/ki/config.toml`,
        ['schema = 1', '', '[harnesses]', 'ids = [', '  "example/harness",', ']', 'releases = []', ''].join('\n')
      )
      await box.setupExampleHarness()
      const dryRun = await box.run('ki harness uninstall example/harness --dry-run')
      const removed = await box.run('ki harness uninstall example/harness')
      const config = await box.config.read('ki/config.toml')

      expect(dryRun.output).toContain('would uninstall example/harness')
      expect(removed.output).toContain('uninstalled example/harness')
      await expect(lstat(`${box.data.path}/ki/harnesses/example/harness`)).rejects.toThrow()
      expect(config).toContain('[harnesses]\nids = [\n]\nreleases = []')
    })

    test('refuses to uninstall the canonical harness', async () => {
      const box = await sandbox()
      await box.setupCanonicalHarness()
      const result = await box.run('ki harness uninstall knowledgeislands/ki-agentic-harness')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('cannot be uninstalled')
    })

    test('refuses to remove an installed harness with unrecognised state, preserving it', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      await box.data.write('ki/harnesses/example/harness/notes.txt', 'preserve me\n')

      const result = await box.run('ki harness uninstall example/harness')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('has unrecognised state')
      await expect(readFile(`${box.data.path}/ki/harnesses/example/harness/notes.txt`, 'utf8')).resolves.toBe('preserve me\n')
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

    test('downloads, verifies, and extracts only the owner/repo payload of a configured harness', async () => {
      const box = await sandbox()
      const skill = '---\nname: ki-example\nki-depends-on: []\n---\n'
      const { payload, sha256 } = makeHarnessArchive({
        'source-revision/docs/ignored.md': '# source documentation\n',
        'source-revision/package.json': '{"private":true}\n',
        'source-revision/skills/ki-example/SKILL.md': skill,
        'source-revision/subagents/example.md': '# agent\n',
        'source-revision/hooks/example.sh': '#!/bin/sh\n'
      })
      await box.config.write(
        'ki/config.toml',
        `[harnesses]
releases = [
  { id = "example/harness", url = "https://releases.example.test/harness.tar.gz", sha256 = "${sha256}" },
]
`
      )
      box.setFetcher(async () => new Response(payload))

      const installed = await box.run('ki harness install example/harness')

      expect(installed).toEqual({ exitCode: 0, output: `installed example/harness\tarchive ${sha256}\n` })
      expect(await box.data.read('ki/harnesses/example/harness/skills/ki-example/SKILL.md')).toBe(skill)
      await expect(lstat(`${box.data.path}/ki/harnesses/example/harness/docs`)).rejects.toThrow()
      await expect(lstat(`${box.data.path}/ki/harnesses/example/harness/package.json`)).rejects.toThrow()
    })

    test('resolves the immutable canonical harness from the registry without user configuration', async () => {
      const box = await sandbox()
      const { payload } = makeHarnessArchive({ 'skills/ki-example/SKILL.md': '---\nname: ki-example\nki-depends-on: []\n---\n' })
      box.setFetcher(async () => new Response(payload))

      const result = await box.run('ki harness install knowledgeislands/ki-agentic-harness')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('does not match its SHA-256')
      await expect(lstat(`${box.data.path}/ki/harnesses/knowledgeislands/ki-agentic-harness`)).rejects.toThrow()
    })

    test('refuses symbolic links in a harness archive', async () => {
      const box = await sandbox()
      const { payload, sha256 } = makeHarnessArchive({ 'skills/ki-example/SKILL.md': { type: '2' } })
      await box.config.write(
        'ki/config.toml',
        `[harnesses]
releases = [
  { id = "example/harness", url = "https://releases.example.test/harness.tar.gz", sha256 = "${sha256}" },
]
`
      )
      box.setFetcher(async () => new Response(payload))

      const result = await box.run('ki harness install example/harness')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('may contain only regular files and directories')
    })

    test('refuses a non-ok download response', async () => {
      const box = await sandbox()
      await box.config.write(
        'ki/config.toml',
        `[harnesses]
releases = [
  { id = "example/harness", url = "https://releases.example.test/harness.tar.gz", sha256 = "${'a'.repeat(64)}" },
]
`
      )
      box.setFetcher(async () => new Response(null, { status: 500 }))

      const result = await box.run('ki harness install example/harness')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('could not download configured harness example/harness: HTTP 500')
    })

    test('refuses a failed or redirected download', async () => {
      const box = await sandbox()
      await box.config.write(
        'ki/config.toml',
        `[harnesses]
releases = [
  { id = "example/harness", url = "https://releases.example.test/harness.tar.gz", sha256 = "${'a'.repeat(64)}" },
]
`
      )
      box.setFetcher(async () => {
        throw new Error('redirected')
      })

      const result = await box.run('ki harness install example/harness')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('could not download configured harness example/harness')
    })

    test('refuses a non-gzip archive', async () => {
      const box = await sandbox()
      const payload = new TextEncoder().encode('not a gzip archive')
      const sha256 = createHash('sha256').update(payload).digest('hex')
      await box.config.write(
        'ki/config.toml',
        `[harnesses]
releases = [
  { id = "example/harness", url = "https://releases.example.test/harness.tar.gz", sha256 = "${sha256}" },
]
`
      )
      box.setFetcher(async () => new Response(payload))

      const result = await box.run('ki harness install example/harness')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('must be a gzip-compressed tar archive')
    })

    test('refuses an archive entry with an unsafe path', async () => {
      const box = await sandbox()
      const { payload, sha256 } = makeHarnessArchive({ 'skills/../secret': 'x' })
      await box.config.write(
        'ki/config.toml',
        `[harnesses]
releases = [
  { id = "example/harness", url = "https://releases.example.test/harness.tar.gz", sha256 = "${sha256}" },
]
`
      )
      box.setFetcher(async () => new Response(payload))

      const result = await box.run('ki harness install example/harness')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('harness archive contains an unsafe entry')
    })

    test('refuses an archive that does not match configured immutable evidence without creating an installation', async () => {
      const box = await sandbox()
      const { payload } = makeHarnessArchive({ 'skills/ki-example/SKILL.md': '---\nname: ki-example\nki-depends-on: []\n---\n' })
      await box.config.write(
        'ki/config.toml',
        `[harnesses]
releases = [
  { id = "example/harness", url = "https://releases.example.test/harness.tar.gz", sha256 = "${'0'.repeat(64)}" },
]
`
      )
      box.setFetcher(async () => new Response(payload))

      const result = await box.run('ki harness install example/harness')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('does not match its SHA-256')
      const info = await box.run('ki harness info example/harness')
      expect(info.exitCode).toBe(1)
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
