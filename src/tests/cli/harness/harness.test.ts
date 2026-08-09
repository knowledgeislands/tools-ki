import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { makeHarnessArchive } from '../_archive_helper.ts'
import { sandbox } from '../_cli_helper.ts'

describe('[ki harness]', () => {
  describe('[ki harness list]', () => {
    test('lists installed compatible harnesses', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      const listed = await box.run('ki harness list')

      expect(listed).toEqual({
        exitCode: 0,
        output: '╭─ KI HARNESSES\n├─ installed (1)\n│  ╰─ example/harness (1)\n╰─ summary: HARNESSES=1 CAPABILITIES=1\n'
      })
    })

    test('reports no installed harnesses when list is empty', async () => {
      const box = await sandbox()

      const listed = await box.run('ki harness list')

      expect(listed).toEqual({
        exitCode: 0,
        output: '╭─ KI HARNESSES\n├─ installed (0)\n│  ╰─ none\n╰─ summary: HARNESSES=0 CAPABILITIES=0\n'
      })
    })

    test('renders every installed harness in order', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      await box.data.write(
        'ki/harnesses/other/harness/skills/ki-other/SKILL.md',
        '---\nname: ki-other\nki-depends-on: []\n---\n'
      )

      const listed = await box.run('ki harness list')

      expect(listed.output).toContain('│  ├─ example/harness (1)\n│  ╰─ other/harness (1)')
    })

    test('resolves fallback paths without either user-home variable', async () => {
      const box = await sandbox()
      box.setEnv({
        HOME: undefined,
        USERPROFILE: undefined,
        XDG_CONFIG_HOME: undefined,
        XDG_DATA_HOME: undefined,
        XDG_CACHE_HOME: undefined,
        XDG_STATE_HOME: undefined,
        KI_DATA_HOME: box.data.path
      })

      const listed = await box.run('ki harness list')

      expect(listed).toEqual({
        exitCode: 0,
        output: '╭─ KI HARNESSES\n├─ installed (0)\n│  ╰─ none\n╰─ summary: HARNESSES=0 CAPABILITIES=0\n'
      })
    })
  })

  describe('[ki harness info]', () => {
    test('inspects one non-canonical harness in human form', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      await box.data.write(
        'ki/harnesses/example/harness/skills/ki-other/SKILL.md',
        '---\nname: ki-other\nki-depends-on: []\n---\n'
      )
      const info = await box.run('ki harness info example/harness')

      expect(info.exitCode).toBe(0)
      expect(info.output).toContain('├─ capabilities (2)')
      expect(info.output).toContain('│  ├─ skill ki-example\n│  ╰─ skill ki-other\n')
    })

    test('renders an installed harness with no capabilities', async () => {
      const box = await sandbox()
      await box.data.mkdir('ki/harnesses/empty/harness/skills')

      const info = await box.run('ki harness info empty/harness')

      expect(info).toEqual({
        exitCode: 0,
        output: '╭─ KI HARNESS\n├─ empty/harness\n├─ capabilities (0)\n│  ╰─ none\n╰─ summary: CAPABILITIES=0\n'
      })
    })

    test('rejects the retired JSON output option', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      const result = await box.run('ki harness info example/harness --json')

      expect(result.exitCode).toBe(2)
      expect(result.output).toContain("ki: error: unknown option '--json' for 'ki harness info'\n")
      expect(result.output).toContain('Usage: ki harness info [options] <harness-id>')
    })

    test('rejects an invalid installed harness identifier before reading its path', async () => {
      const box = await sandbox()

      const result = await box.run('ki harness info not-an-identifier')

      expect(result).toEqual({
        exitCode: 2,
        output: 'ki: error: harness identifier must be an owner/name identifier\n'
      })
    })
  })

  describe('[ki harness uninstall]', () => {
    test('rejects an invalid harness identifier before inspecting installation state', async () => {
      const box = await sandbox()

      const result = await box.run('ki harness uninstall invalid')

      expect(result).toEqual({
        exitCode: 2,
        output: 'ki: error: harness identifier must be an owner/name identifier\n'
      })
    })

    test('removes one non-canonical harness and un-records it', async () => {
      const box = await sandbox()
      await mkdir(`${box.config.path}/ki`, { recursive: true })
      await writeFile(
        `${box.config.path}/ki/config.toml`,
        ['schema = 1', '', '[harnesses]', 'ids = [', '  "example/harness",', ']', 'releases = []', ''].join('\n')
      )
      await box.setupExampleHarness()
      const removed = await box.run('ki harness uninstall example/harness')
      const config = await box.config.read('ki/config.toml')

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

    test('refuses to remove an installed harness when its registry cannot be rewritten, preserving it', async () => {
      // Uninstall never calls installHarness, so the strict read of config.toml that a record needs
      // happens on this path alone. It must happen before the removal: the rewrite is a substitution
      // over existing text and cannot proceed against a file it fails to parse, so a configuration
      // this malformed has to cost an error rather than a harness deleted with its registry intact.
      const box = await sandbox()
      await box.setupExampleHarness()
      const payload = `${box.data.path}/ki/harnesses/example/harness`
      await box.config.write('ki/config.toml', 'harnesses = 5\n')

      const result = await box.run('ki harness uninstall example/harness')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('ki configuration harnesses must be a TOML table')
      await expect(lstat(payload)).resolves.toBeDefined()
    })

    test('refuses to remove an installed harness when its registry is not a regular file, preserving it', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      const payload = `${box.data.path}/ki/harnesses/example/harness`
      await box.config.write('ki/registry-source.toml', '[harnesses]\nids = ["example/harness"]\n')
      await rm(`${box.config.path}/ki/config.toml`, { force: true })
      await symlink(`${box.config.path}/ki/registry-source.toml`, `${box.config.path}/ki/config.toml`)

      const result = await box.run('ki harness uninstall example/harness')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('ki configuration must be a regular file')
      await expect(lstat(payload)).resolves.toBeDefined()
    })

    test('refuses to remove an installed harness with unrecognised state, preserving it', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      await box.data.write('ki/harnesses/example/harness/notes.txt', 'preserve me\n')

      const result = await box.run('ki harness uninstall example/harness')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('has unrecognised state')
      await expect(readFile(`${box.data.path}/ki/harnesses/example/harness/notes.txt`, 'utf8')).resolves.toBe(
        'preserve me\n'
      )
    })
  })

  describe('[ki harness install]', () => {
    test.each([
      ['an invalid registry document', '[harnesses\n', 'ki configuration must be valid TOML'],
      [
        'a release without an HTTPS URL',
        `[harnesses]\nreleases = [{ id = "example/harness", url = "not-a-url", sha256 = "${'a'.repeat(64)}" }]\n`,
        'harnesses[0] url must be an HTTPS URL'
      ],
      [
        'a release URL with credentials',
        `[harnesses]\nreleases = [{ id = "example/harness", url = "https://user:secret@releases.example.test/archive.tar.gz", sha256 = "${'a'.repeat(64)}" }]\n`,
        'must be an HTTPS URL without credentials'
      ],
      [
        'a scalar harnesses configuration',
        'harnesses = "example/harness"\n',
        'ki configuration harnesses must be a TOML table'
      ],
      [
        'an invalid release digest',
        `[harnesses]\nreleases = [{ id = "example/harness", url = "https://releases.example.test/archive.tar.gz", sha256 = "UPPERCASE" }]\n`,
        'sha256 must be lowercase SHA-256'
      ],
      [
        'an override of the built-in canonical harness',
        `[harnesses]\nreleases = [{ id = "knowledgeislands/ki-agentic-harness", url = "https://releases.example.test/archive.tar.gz", sha256 = "${'a'.repeat(64)}" }]\n`,
        'must not override the built-in canonical harness'
      ],
      ['a release entry that is not a table', '[harnesses]\nreleases = [5]\n', 'harnesses[0] must be a table'],
      [
        'a release without an identifier',
        `[harnesses]\nreleases = [{ url = "https://releases.example.test/archive.tar.gz", sha256 = "${'a'.repeat(64)}" }]\n`,
        'harnesses[0] must declare id'
      ],
      [
        'a release with an invalid identifier',
        `[harnesses]\nreleases = [{ id = "not-an-identifier", url = "https://releases.example.test/archive.tar.gz", sha256 = "${'a'.repeat(64)}" }]\n`,
        'harnesses[0] id must be an owner/name identifier'
      ],
      [
        'a release without a URL',
        `[harnesses]\nreleases = [{ id = "example/harness", sha256 = "${'a'.repeat(64)}" }]\n`,
        'harnesses[0] must declare url'
      ],
      [
        'a release using HTTP',
        `[harnesses]\nreleases = [{ id = "example/harness", url = "http://releases.example.test/archive.tar.gz", sha256 = "${'a'.repeat(64)}" }]\n`,
        'must be an HTTPS URL without credentials'
      ],
      [
        'a release without a digest',
        '[harnesses]\nreleases = [{ id = "example/harness", url = "https://releases.example.test/archive.tar.gz" }]\n',
        'harnesses[0] must declare sha256'
      ],
      [
        'a releases value that is not an array',
        '[harnesses]\nreleases = "example/harness"\n',
        'must be an array of release entries'
      ],
      [
        'no configured release for the requested harness',
        '[harnesses]\nreleases = []\n',
        'is not configured in the immutable release registry'
      ],
      [
        'repeated release identifiers',
        `[harnesses]\nreleases = [{ id = "example/harness", url = "https://releases.example.test/one.tar.gz", sha256 = "${'a'.repeat(64)}" }, { id = "example/harness", url = "https://releases.example.test/two.tar.gz", sha256 = "${'b'.repeat(64)}" }]\n`,
        'harness registry repeats example/harness'
      ]
    ])('rejects %s', async (_case, configuration, expected) => {
      const box = await sandbox()
      await box.config.write('ki/config.toml', configuration)

      const result = await box.run('ki harness install example/harness')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain(expected)
    })

    test('rejects malformed configured harness ids even when the release entry is valid', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      await box.config.write(
        'ki/config.toml',
        `[harnesses]\nids = [5]\nreleases = [{ id = "example/harness", url = "https://releases.example.test/archive.tar.gz", sha256 = "${'a'.repeat(64)}" }]\n`
      )

      const result = await box.run('ki harness install example/harness')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('harnesses.ids must be an array of harness identifiers')
    })

    test('requires explicit configured identifiers when a harness table has no release list', async () => {
      const box = await sandbox()
      await box.config.write('ki/config.toml', '[harnesses]\n')

      const result = await box.run('ki harness install example/harness')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('harnesses.ids must be an array of harness identifiers')
    })

    test.each([
      ['a directory', async (box: Awaited<ReturnType<typeof sandbox>>) => box.config.mkdir('ki/config.toml')],
      [
        'a symbolic link',
        async (box: Awaited<ReturnType<typeof sandbox>>) => {
          await box.root.write('configuration-target.toml', '')
          await mkdir(`${box.config.path}/ki`, { recursive: true })
          await symlink(`${box.root.path}/configuration-target.toml`, `${box.config.path}/ki/config.toml`)
        }
      ]
    ])('rejects %s at the configuration file path', async (_case, prepare) => {
      const box = await sandbox()
      await prepare(box)

      const result = await box.run('ki harness install example/harness')

      expect(result).toEqual({ exitCode: 1, output: 'ki: error: ki configuration must be a regular file\n' })
    })

    test('returns the canonical install result without recording when no user configuration exists', async () => {
      const box = await sandbox()
      await box.setupCanonicalHarness()

      const result = await box.run('ki harness install knowledgeislands/ki-agentic-harness')

      expect(result.exitCode).toBe(0)
      await expect(lstat(`${box.config.path}/ki/config.toml`)).rejects.toThrow()
    })

    test('rejects invalid harness install identifiers before reading the registry', async () => {
      const box = await sandbox()

      const result = await box.run('ki harness install not-an-identifier')

      expect(result).toEqual({
        exitCode: 2,
        output: 'ki: error: harness identifier must be an owner/name identifier\n'
      })
    })

    test('adds the harness section when recording an already-installed canonical harness', async () => {
      const box = await sandbox()
      await box.setupCanonicalHarness()
      await box.config.write('ki/config.toml', 'schema = 1\n')

      const result = await box.run('ki harness install knowledgeislands/ki-agentic-harness')

      expect(result.exitCode).toBe(0)
      expect(await box.config.read('ki/config.toml')).toContain(
        '[harnesses]\nids = [\n  "knowledgeislands/ki-agentic-harness",\n]'
      )
    })

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

    test('reports malformed configuration encountered while recording an uninstall', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      await box.config.write('ki/config.toml', '[harnesses\n')

      const removed = await box.run('ki harness uninstall example/harness')

      expect(removed).toEqual({ exitCode: 1, output: 'ki: error: ki configuration must be valid TOML\n' })
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

    test('extracts a payload whose tar path uses the header prefix field', async () => {
      const box = await sandbox()
      const skill = '---\nname: ki-prefixed\nki-depends-on: []\n---\n'
      const { payload, sha256 } = makeHarnessArchive({
        'SKILL.md': { contents: skill, prefix: 'source-revision/skills/ki-prefixed', type: '0' }
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

      expect(installed.exitCode).toBe(0)
      expect(await box.data.read('ki/harnesses/example/harness/skills/ki-prefixed/SKILL.md')).toBe(skill)
    })

    test('accepts empty directory entries in an otherwise valid archive', async () => {
      const box = await sandbox()
      const skill = '---\nname: ki-directory\nki-depends-on: []\n---\n'
      const { payload, sha256 } = makeHarnessArchive({
        skills: { type: '5' },
        'skills/ki-directory/SKILL.md': skill
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

      expect(installed.exitCode).toBe(0)
      expect(await box.data.read('ki/harnesses/example/harness/skills/ki-directory/SKILL.md')).toBe(skill)
    })

    test('treats a blank tar size field as an empty regular file', async () => {
      const box = await sandbox()
      const { payload, sha256 } = makeHarnessArchive({ 'skills/ki-empty/SKILL.md': { size: '', type: '0' } })
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

      expect(installed).toEqual({
        exitCode: 1,
        output: 'ki: error: skills/ki-empty/SKILL.md must declare frontmatter\n'
      })
    })

    test('resolves the immutable canonical harness from the registry without user configuration', async () => {
      const box = await sandbox()
      const { payload } = makeHarnessArchive({
        'skills/ki-example/SKILL.md': '---\nname: ki-example\nki-depends-on: []\n---\n'
      })
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

    test('ignores runtime projection links outside the harness payload', async () => {
      const box = await sandbox()
      const { payload, sha256 } = makeHarnessArchive({
        '.agents/skills/ki-example': { type: '2' },
        'source/skills/ki-example/SKILL.md': '---\nname: ki-example\nki-depends-on: []\n---\n'
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

      const result = await box.run('ki harness install example/harness')

      expect(result.exitCode).toBe(0)
      await expect(box.data.read('ki/harnesses/example/harness/skills/ki-example/SKILL.md')).resolves.toContain(
        'name: ki-example'
      )
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

    test.each([
      [
        'an archive without its terminating tar block',
        () => makeHarnessArchive({ 'skills/ki-example/SKILL.md': 'skill\n' }, { terminatingBlocks: false }),
        'harness archive is missing its terminating tar block'
      ],
      [
        'an archive entry with an invalid tar size',
        () => makeHarnessArchive({ 'skills/ki-example/SKILL.md': { size: 'not-octal', type: '0' } }),
        'harness archive has an invalid tar entry size'
      ],
      [
        'an archive entry whose declared contents exceed the archive',
        () => makeHarnessArchive({ 'skills/ki-example/SKILL.md': { contents: 'x', size: 4096, type: '0' } }),
        'harness archive contains an unsafe entry'
      ],
      [
        'an archive that mixes source payload prefixes',
        () =>
          makeHarnessArchive({
            'first-revision/skills/ki-first/SKILL.md': 'first\n',
            'second-revision/skills/ki-second/SKILL.md': 'second\n'
          }),
        'harness archive mixes payload roots'
      ],
      [
        'a directory entry with contents',
        () => makeHarnessArchive({ skills: { contents: 'unexpected\n', type: '5' } }),
        'harness archive directory has contents'
      ],
      [
        'an archive without an installable payload',
        () => makeHarnessArchive({ 'README.md': 'source only\n' }),
        'harness archive contains no skills, agents, or hooks payload'
      ]
    ])('refuses %s', async (_case, archive, expected) => {
      const box = await sandbox()
      const { payload, sha256 } = archive()
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
      expect(result.output).toContain(expected)
      await expect(lstat(`${box.data.path}/ki/harnesses/example/harness`)).rejects.toThrow()
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
      const { payload } = makeHarnessArchive({
        'skills/ki-example/SKILL.md': '---\nname: ki-example\nki-depends-on: []\n---\n'
      })
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

    test('rejects a nested directory symlink in an installed payload', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      const directory = `${box.data.path}/ki/harnesses/example/harness/skills/ki-example/linked`
      await box.root.mkdir('external-payload')
      await symlink(`${box.root.path}/external-payload`, directory)

      const info = await box.run('ki harness info example/harness')

      expect(info.exitCode).toBe(1)
      expect(info.output).toContain('installed harness payload skills/ki-example/linked must not be a symlink')
    })

    test('accepts an external payload-root development link', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      const payload = `${box.data.path}/ki/harnesses/example/harness/skills`
      const external = await box.root.mkdir('external-skills')
      await box.root.write('external-skills/ki-external/SKILL.md', '---\nname: ki-external\nki-depends-on: []\n---\n')
      await rm(payload, { recursive: true })
      await symlink(external, payload)

      const info = await box.run('ki harness info example/harness')

      expect(info).toEqual({
        exitCode: 0,
        output:
          '╭─ KI HARNESS\n├─ example/harness\n├─ capabilities (1)\n│  ╰─ skill ki-external\n╰─ summary: CAPABILITIES=1\n'
      })
    })

    test.each([
      ['a missing skill name', '---\nki-depends-on: []\n---\n', 'must declare name'],
      ['an ignored frontmatter line', '---\nnot metadata\nki-depends-on: []\n---\n', 'must declare name'],
      [
        'an invalid dependency declaration',
        '---\nname: ki-example\nki-depends-on: ki-other\n---\n',
        'must declare ki-depends-on as a flow list'
      ],
      [
        'a repeated dependency',
        '---\nname: ki-example\nki-depends-on: [ki-other, ki-other]\n---\n',
        'repeats a dependency'
      ],
      [
        'a repeated optional dependency',
        '---\nname: ki-example\nki-depends-on: []\nki-optional-depends-on: [ki-other, ki-other]\n---\n',
        'repeats a optional dependency'
      ],
      [
        'an empty runtime list',
        '---\nname: ki-example\nki-depends-on: []\nki-supported-runtimes: []\n---\n',
        'must declare ki-supported-runtimes as a non-empty flow list'
      ],
      [
        'a retired runtime',
        '---\nname: ki-example\nki-depends-on: []\nki-supported-runtimes: [codex]\n---\n',
        'declares retired runtime codex; use chatgpt-codex'
      ],
      [
        'an unsupported runtime',
        '---\nname: ki-example\nki-depends-on: []\nki-supported-runtimes: [unknown-runtime]\n---\n',
        'must declare ki-supported-runtimes using only claude-code, claude-desktop, or chatgpt-codex'
      ],
      [
        'a repeated runtime',
        '---\nname: ki-example\nki-depends-on: []\nki-supported-runtimes: [chatgpt-codex, chatgpt-codex]\n---\n',
        'repeats a supported runtime'
      ]
    ])('rejects %s in installed skill frontmatter', async (_case, skill, expected) => {
      const box = await sandbox()
      await box.setupExampleHarness()
      await box.data.write('ki/harnesses/example/harness/skills/ki-example/SKILL.md', skill)

      const info = await box.run('ki harness info example/harness')

      expect(info.exitCode).toBe(1)
      expect(info.output).toContain(expected)
    })

    test('rejects repeated installed skill capabilities', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      await box.data.write(
        'ki/harnesses/example/harness/skills/ki-copy/SKILL.md',
        '---\nname: ki-example\nki-depends-on: []\n---\n'
      )

      const info = await box.run('ki harness info example/harness')

      expect(info.exitCode).toBe(1)
      expect(info.output).toContain('repeats skill ki-example')
    })

    test('rejects a payload root symlink that resolves to a regular file', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      const payload = `${box.data.path}/ki/harnesses/example/harness/skills`
      await rm(payload, { recursive: true })
      await box.root.write('not-a-payload', 'not a directory\n')
      await symlink(`${box.root.path}/not-a-payload`, payload)

      const info = await box.run('ki harness info example/harness')

      expect(info.exitCode).toBe(1)
      expect(info.output).toContain('installed harness payload skills must be a directory')
    })

    test('rejects unsafe owner and harness-name entries in the installed inventory', async () => {
      const owner = await sandbox()
      await owner.setupExampleHarness()
      await owner.data.write('ki/harnesses/unexpected', 'not a harness owner\n')

      const unsafeOwner = await owner.run('ki harness list')

      expect(unsafeOwner.exitCode).toBe(1)
      expect(unsafeOwner.output).toContain('installed harnesses directory contains an unsafe owner entry')

      const name = await sandbox()
      await name.setupExampleHarness()
      await name.data.write('ki/harnesses/example/unexpected', 'not a harness\n')

      const unsafeName = await name.run('ki harness list')

      expect(unsafeName.exitCode).toBe(1)
      expect(unsafeName.output).toContain('installed harness example contains an unsafe name entry')
    })

    test('rejects owner and harness-name directories outside the identifier grammar', async () => {
      const owner = await sandbox()
      await owner.setupExampleHarness()
      await owner.data.mkdir('ki/harnesses/Invalid')

      const unsafeOwner = await owner.run('ki harness list')

      expect(unsafeOwner.exitCode).toBe(1)
      expect(unsafeOwner.output).toContain('installed harnesses directory contains an unsafe owner entry')

      const name = await sandbox()
      await name.setupExampleHarness()
      await name.data.mkdir('ki/harnesses/example/Invalid')

      const unsafeName = await name.run('ki harness list')

      expect(unsafeName.exitCode).toBe(1)
      expect(unsafeName.output).toContain('installed harness example contains an unsafe name entry')
    })

    test('rejects a special file in an installed harness payload', async () => {
      const box = await sandbox()
      await box.setupExampleHarness()
      const pipe = `${box.data.path}/ki/harnesses/example/harness/skills/pipe`
      execFileSync('mkfifo', [pipe])

      const info = await box.run('ki harness info example/harness')

      expect(info.exitCode).toBe(1)
      expect(info.output).toContain('installed harness payload skills/pipe must be a regular file or directory')
    })
  })
})
