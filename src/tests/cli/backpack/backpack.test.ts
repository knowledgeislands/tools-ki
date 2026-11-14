import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { makeBackpackArchive } from '../_archive_helper.ts'
import { sandbox } from '../_cli_helper.ts'

describe('[ki backpack]', () => {
  describe('[ki backpack list]', () => {
    test('lists installed compatible backpacks', async () => {
      const box = await sandbox()
      await box.setupExampleBackpack()
      const listed = await box.run('ki backpack list')

      expect(listed).toEqual({
        exitCode: 0,
        output:
          '╭─ KI BACKPACKS\n├─ installed (1)\n│  ╰─ example/backpack (1)\n╰─ summary: BACKPACKS=1 CAPABILITIES=1\n'
      })
    })

    test('reports no installed backpacks when list is empty', async () => {
      const box = await sandbox()

      const listed = await box.run('ki backpack list')

      expect(listed).toEqual({
        exitCode: 0,
        output: '╭─ KI BACKPACKS\n├─ installed (0)\n│  ╰─ none\n╰─ summary: BACKPACKS=0 CAPABILITIES=0\n'
      })
    })

    test('renders every installed backpack in order', async () => {
      const box = await sandbox()
      await box.setupExampleBackpack()
      await box.data.write('ki/backpacks/other/backpack/.ki.toml', '[skills.ki-repo-backpack]\nprefix = "other"\n')
      await box.data.write(
        'ki/backpacks/other/backpack/skills/other-example/SKILL.md',
        '---\nname: other-example\nki-depends-on: []\n---\n'
      )

      const listed = await box.run('ki backpack list')

      expect(listed.output).toContain('│  ├─ example/backpack (1)\n│  ╰─ other/backpack (1)')
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

      const listed = await box.run('ki backpack list')

      expect(listed).toEqual({
        exitCode: 0,
        output: '╭─ KI BACKPACKS\n├─ installed (0)\n│  ╰─ none\n╰─ summary: BACKPACKS=0 CAPABILITIES=0\n'
      })
    })
  })

  describe('[ki backpack info]', () => {
    test('inspects one non-canonical backpack in human form', async () => {
      const box = await sandbox()
      await box.setupExampleBackpack()
      await box.data.write(
        'ki/backpacks/example/backpack/skills/ki-other/SKILL.md',
        '---\nname: ki-other\nki-depends-on: []\n---\n'
      )
      const info = await box.run('ki backpack info example/backpack')

      expect(info.exitCode).toBe(0)
      expect(info.output).toContain('├─ capabilities (2)')
      expect(info.output).toContain('│  ├─ skill ki-example\n│  ╰─ skill ki-other\n')
    })

    test('renders an installed backpack with no capabilities', async () => {
      const box = await sandbox()
      await box.data.mkdir('ki/backpacks/empty/backpack/skills')
      await box.data.write('ki/backpacks/empty/backpack/.ki.toml', '[skills.ki-repo-backpack]\nprefix = "empty"\n')

      const info = await box.run('ki backpack info empty/backpack')

      expect(info).toEqual({
        exitCode: 0,
        output: '╭─ KI BACKPACK\n├─ empty/backpack\n├─ capabilities (0)\n│  ╰─ none\n╰─ summary: CAPABILITIES=0\n'
      })
    })

    test('rejects the retired JSON output option', async () => {
      const box = await sandbox()
      await box.setupExampleBackpack()
      const result = await box.run('ki backpack info example/backpack --json')

      expect(result.exitCode).toBe(2)
      expect(result.output).toContain("ki: error: unknown option '--json' for 'ki backpack info'\n")
      expect(result.output).toContain('Usage: ki backpack info [options] <backpack-id>')
    })

    test('rejects an invalid installed backpack identifier before reading its path', async () => {
      const box = await sandbox()

      const result = await box.run('ki backpack info not-an-identifier')

      expect(result).toEqual({
        exitCode: 2,
        output: 'ki: error: backpack identifier must be an owner/name identifier\n'
      })
    })
  })

  describe('[ki backpack uninstall]', () => {
    test('rejects an invalid backpack identifier before inspecting installation state', async () => {
      const box = await sandbox()

      const result = await box.run('ki backpack uninstall invalid')

      expect(result).toEqual({
        exitCode: 2,
        output: 'ki: error: backpack identifier must be an owner/name identifier\n'
      })
    })

    test('removes one non-canonical backpack and un-records it', async () => {
      const box = await sandbox()
      await mkdir(`${box.config.path}/ki`, { recursive: true })
      await writeFile(
        `${box.config.path}/ki/config.toml`,
        ['schema = 1', '', '[backpacks]', 'ids = [', '  "example/backpack",', ']', 'releases = []', ''].join('\n')
      )
      await box.setupExampleBackpack()
      const removed = await box.run('ki backpack uninstall example/backpack')
      const config = await box.config.read('ki/config.toml')

      expect(removed.output).toContain('uninstalled example/backpack')
      await expect(lstat(`${box.data.path}/ki/backpacks/example/backpack`)).rejects.toThrow()
      expect(config).toContain('[backpacks]\nids = [\n]\nreleases = []')
    })

    test('un-records a backpack by editing only its ids, leaving an unrecorded one byte-identical', async () => {
      const box = await sandbox()
      const configuration = [
        '# Managed by chezmoi.',
        '[backpacks]',
        'ids = ["example/backpack", "other/backpack"] # installed here',
        '',
        '[territories]',
        'ranking = [',
        '  "alpha", # the capital',
        ']',
        ''
      ].join('\n')
      await box.config.write('ki/config.toml', configuration)
      await box.setupExampleBackpack()
      await box.setupExampleBackpack({ identifier: 'unrecorded/backpack', name: 'other-example' })

      const unrecorded = await box.run('ki backpack uninstall unrecorded/backpack')
      const untouched = await box.config.read('ki/config.toml')
      const removed = await box.run('ki backpack uninstall example/backpack')

      expect(unrecorded.output).toContain('uninstalled unrecorded/backpack')
      expect(untouched).toBe(configuration)
      expect(removed.output).toContain('uninstalled example/backpack')
      expect(await box.config.read('ki/config.toml')).toBe(
        configuration.replace(
          'ids = ["example/backpack", "other/backpack"] # installed here',
          'ids = ["other/backpack"]'
        )
      )
    })

    test('refuses to uninstall the canonical backpack', async () => {
      const box = await sandbox()
      await box.setupCanonicalBackpack()
      const result = await box.run('ki backpack uninstall knowledgeislands/ki-agent-backpack')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('cannot be uninstalled')
    })

    test('refuses to remove an installed backpack when its registry cannot be rewritten, preserving it', async () => {
      // Uninstall never calls installBackpack, so the strict read of config.toml that a record needs
      // happens on this path alone. It must happen before the removal: the rewrite is a substitution
      // over existing text and cannot proceed against a file it fails to parse, so a configuration
      // this malformed has to cost an error rather than a backpack deleted with its registry intact.
      const box = await sandbox()
      await box.setupExampleBackpack()
      const payload = `${box.data.path}/ki/backpacks/example/backpack`
      await box.config.write('ki/config.toml', 'backpacks = 5\n')

      const result = await box.run('ki backpack uninstall example/backpack')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('ki configuration backpacks must be a TOML table')
      await expect(lstat(payload)).resolves.toBeDefined()
    })

    test('refuses to remove an installed backpack when its registry is not a regular file, preserving it', async () => {
      const box = await sandbox()
      await box.setupExampleBackpack()
      const payload = `${box.data.path}/ki/backpacks/example/backpack`
      await box.config.write('ki/registry-source.toml', '[backpacks]\nids = ["example/backpack"]\n')
      await rm(`${box.config.path}/ki/config.toml`, { force: true })
      await symlink(`${box.config.path}/ki/registry-source.toml`, `${box.config.path}/ki/config.toml`)

      const result = await box.run('ki backpack uninstall example/backpack')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('ki configuration must be a regular file')
      await expect(lstat(payload)).resolves.toBeDefined()
    })

    test('refuses to remove an installed backpack with unrecognised state, preserving it', async () => {
      const box = await sandbox()
      await box.setupExampleBackpack()
      await box.data.write('ki/backpacks/example/backpack/notes.txt', 'preserve me\n')

      const result = await box.run('ki backpack uninstall example/backpack')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('has unrecognised state')
      await expect(readFile(`${box.data.path}/ki/backpacks/example/backpack/notes.txt`, 'utf8')).resolves.toBe(
        'preserve me\n'
      )
    })
  })

  describe('[ki backpack install]', () => {
    test.each([
      ['an invalid registry document', '[backpacks\n', 'ki configuration must be valid TOML'],
      [
        'a release without an HTTPS URL',
        `[backpacks]\nreleases = [{ id = "example/backpack", url = "not-a-url", sha256 = "${'a'.repeat(64)}" }]\n`,
        'backpacks[0] url must be an HTTPS URL'
      ],
      [
        'a release URL with credentials',
        `[backpacks]\nreleases = [{ id = "example/backpack", url = "https://user:secret@releases.example.test/archive.tar.gz", sha256 = "${'a'.repeat(64)}" }]\n`,
        'must be an HTTPS URL without credentials'
      ],
      [
        'an unsupported release authentication method',
        `[backpacks]\nreleases = [{ id = "example/backpack", url = "https://codeload.github.com/example/backpack/tar.gz/revision", sha256 = "${'a'.repeat(64)}", auth = "token" }]\n`,
        'auth must be github-cli'
      ],
      [
        'GitHub CLI authentication for a non-codeload URL',
        `[backpacks]\nreleases = [{ id = "example/backpack", url = "https://releases.example.test/archive.tar.gz", sha256 = "${'a'.repeat(64)}", auth = "github-cli" }]\n`,
        'github-cli authentication requires https://codeload.github.com/example/backpack/tar.gz/<revision>'
      ],
      [
        'a scalar backpacks configuration',
        'backpacks = "example/backpack"\n',
        'ki configuration backpacks must be a TOML table'
      ],
      [
        'an invalid release digest',
        `[backpacks]\nreleases = [{ id = "example/backpack", url = "https://releases.example.test/archive.tar.gz", sha256 = "UPPERCASE" }]\n`,
        'sha256 must be lowercase SHA-256'
      ],
      [
        'an override of the built-in canonical backpack',
        `[backpacks]\nreleases = [{ id = "knowledgeislands/ki-agent-backpack", url = "https://releases.example.test/archive.tar.gz", sha256 = "${'a'.repeat(64)}" }]\n`,
        'must not override the built-in canonical backpack'
      ],
      ['a release entry that is not a table', '[backpacks]\nreleases = [5]\n', 'backpacks[0] must be a table'],
      [
        'a release without an identifier',
        `[backpacks]\nreleases = [{ url = "https://releases.example.test/archive.tar.gz", sha256 = "${'a'.repeat(64)}" }]\n`,
        'backpacks[0] must declare id'
      ],
      [
        'a release with an invalid identifier',
        `[backpacks]\nreleases = [{ id = "not-an-identifier", url = "https://releases.example.test/archive.tar.gz", sha256 = "${'a'.repeat(64)}" }]\n`,
        'backpacks[0] id must be an owner/name identifier'
      ],
      [
        'a release without a URL',
        `[backpacks]\nreleases = [{ id = "example/backpack", sha256 = "${'a'.repeat(64)}" }]\n`,
        'backpacks[0] must declare url'
      ],
      [
        'a release using HTTP',
        `[backpacks]\nreleases = [{ id = "example/backpack", url = "http://releases.example.test/archive.tar.gz", sha256 = "${'a'.repeat(64)}" }]\n`,
        'must be an HTTPS URL without credentials'
      ],
      [
        'a release without a digest',
        '[backpacks]\nreleases = [{ id = "example/backpack", url = "https://releases.example.test/archive.tar.gz" }]\n',
        'backpacks[0] must declare sha256'
      ],
      [
        'a releases value that is not an array',
        '[backpacks]\nreleases = "example/backpack"\n',
        'must be an array of release entries'
      ],
      [
        'no configured release for the requested backpack',
        '[backpacks]\nreleases = []\n',
        'is not configured in the immutable release registry'
      ],
      [
        'repeated release identifiers',
        `[backpacks]\nreleases = [{ id = "example/backpack", url = "https://releases.example.test/one.tar.gz", sha256 = "${'a'.repeat(64)}" }, { id = "example/backpack", url = "https://releases.example.test/two.tar.gz", sha256 = "${'b'.repeat(64)}" }]\n`,
        'backpack registry repeats example/backpack'
      ]
    ])('rejects %s', async (_case, configuration, expected) => {
      const box = await sandbox()
      await box.config.write('ki/config.toml', configuration)

      const result = await box.run('ki backpack install example/backpack')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain(expected)
    })

    test('rejects malformed configured backpack ids even when the release entry is valid', async () => {
      const box = await sandbox()
      await box.setupExampleBackpack()
      await box.config.write(
        'ki/config.toml',
        `[backpacks]\nids = [5]\nreleases = [{ id = "example/backpack", url = "https://releases.example.test/archive.tar.gz", sha256 = "${'a'.repeat(64)}" }]\n`
      )

      const result = await box.run('ki backpack install example/backpack')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('backpacks.ids must be an array of backpack identifiers')
    })

    test('requires explicit configured identifiers when a backpack table has no release list', async () => {
      const box = await sandbox()
      await box.config.write('ki/config.toml', '[backpacks]\n')

      const result = await box.run('ki backpack install example/backpack')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('backpacks.ids must be an array of backpack identifiers')
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

      const result = await box.run('ki backpack install example/backpack')

      expect(result).toEqual({ exitCode: 1, output: 'ki: error: ki configuration must be a regular file\n' })
    })

    test('returns the canonical install result without recording when no user configuration exists', async () => {
      const box = await sandbox()
      await box.setupCanonicalBackpack()

      const result = await box.run('ki backpack install knowledgeislands/ki-agent-backpack')

      expect(result.exitCode).toBe(0)
      await expect(lstat(`${box.config.path}/ki/config.toml`)).rejects.toThrow()
    })

    test('rejects invalid backpack install identifiers before reading the registry', async () => {
      const box = await sandbox()

      const result = await box.run('ki backpack install not-an-identifier')

      expect(result).toEqual({
        exitCode: 2,
        output: 'ki: error: backpack identifier must be an owner/name identifier\n'
      })
    })

    test('adds the backpack section when recording an already-installed canonical backpack', async () => {
      const box = await sandbox()
      await box.setupCanonicalBackpack()
      await box.config.write('ki/config.toml', 'schema = 1\n')

      const result = await box.run('ki backpack install knowledgeislands/ki-agent-backpack')

      expect(result.exitCode).toBe(0)
      expect(await box.config.read('ki/config.toml')).toContain(
        '[backpacks]\nids = [\n  "knowledgeislands/ki-agent-backpack",\n]'
      )
    })

    test('reports an already-installed configured backpack and records it', async () => {
      const box = await sandbox()
      const sha256 = 'a'.repeat(64)
      await mkdir(`${box.config.path}/ki`, { recursive: true })
      const seedConfig = `[backpacks]
releases = [
  { id = "example/backpack", url = "https://releases.example.test/backpack.tar.gz", sha256 = "${sha256}" },
]
`
      await writeFile(`${box.config.path}/ki/config.toml`, seedConfig)
      await box.setupExampleBackpack()

      const installed = await box.run('ki backpack install example/backpack')
      const config = await box.config.read('ki/config.toml')
      const expectedBackpacksSection = `ids = [
  "example/backpack",
]`

      expect(installed).toEqual({ exitCode: 0, output: `example/backpack is already installed\tarchive ${sha256}\n` })
      expect(config).toContain(expectedBackpacksSection)
    })

    test('reports malformed configuration encountered while recording an uninstall', async () => {
      const box = await sandbox()
      await box.setupExampleBackpack()
      await box.config.write('ki/config.toml', '[backpacks\n')

      const removed = await box.run('ki backpack uninstall example/backpack')

      expect(removed).toEqual({ exitCode: 1, output: 'ki: error: ki configuration must be valid TOML\n' })
    })

    test('downloads, verifies, and extracts only the owner/repo payload of a configured backpack', async () => {
      const box = await sandbox()
      const skill = '---\nname: ki-example\nki-depends-on: []\n---\n'
      const { payload, sha256 } = makeBackpackArchive({
        'source-revision/docs/ignored.md': '# source documentation\n',
        'source-revision/package.json': '{"private":true}\n',
        'source-revision/skills/ki-example/SKILL.md': skill,
        'source-revision/subagents/example.md': '# agent\n',
        'source-revision/hooks/example.sh': '#!/bin/sh\n'
      })
      await box.config.write(
        'ki/config.toml',
        `[backpacks]
releases = [
  { id = "example/backpack", url = "https://releases.example.test/backpack.tar.gz", sha256 = "${sha256}" },
]
`
      )
      box.setFetcher(async () => new Response(payload))

      const installed = await box.run('ki backpack install example/backpack')

      expect(installed).toEqual({ exitCode: 0, output: `installed example/backpack\tarchive ${sha256}\n` })
      expect(await box.data.read('ki/backpacks/example/backpack/skills/ki-example/SKILL.md')).toBe(skill)
      expect(await readdir(`${box.state.path}/ki/managed-artifacts`)).toEqual(['locks'])
      expect(await readdir(`${box.state.path}/ki/managed-artifacts/locks`)).toEqual([])
      await expect(lstat(`${box.data.path}/ki/backpacks/example/backpack/docs`)).rejects.toThrow()
      await expect(lstat(`${box.data.path}/ki/backpacks/example/backpack/package.json`)).rejects.toThrow()
    })

    test('requires provider-authored backpack prefix metadata', async () => {
      const box = await sandbox()
      const skill = '---\nname: ki-example\nki-depends-on: []\n---\n'
      const { payload, sha256 } = makeBackpackArchive(
        { 'source/skills/ki-example/SKILL.md': skill },
        { backpackPrefix: null }
      )
      await box.config.write(
        'ki/config.toml',
        `[backpacks]\nreleases = [{ id = "example/backpack", url = "https://releases.example.test/example.tgz", sha256 = "${sha256}" }]\n`
      )
      box.setFetcher(async () => new Response(payload))

      const result = await box.run('ki backpack install example/backpack')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('backpack archive must contain .ki.toml')
      await expect(lstat(`${box.data.path}/ki/backpacks/example/backpack`)).rejects.toThrow()
    })

    test('rejects repeated backpack declarations in an archive', async () => {
      const box = await sandbox()
      const { payload, sha256 } = makeBackpackArchive(
        { 'skills/ki-example/SKILL.md': '---\nname: ki-example\nki-depends-on: []\n---\n' },
        { duplicateMetadata: true }
      )
      await box.config.write(
        'ki/config.toml',
        `[backpacks]\nreleases = [{ id = "example/backpack", url = "https://releases.example.test/example.tgz", sha256 = "${sha256}" }]\n`
      )
      box.setFetcher(async () => new Response(payload))

      const result = await box.run('ki backpack install example/backpack')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('backpack archive must contain .ki.toml exactly once')
    })

    test.each([
      ['invalid TOML', 'not = [toml', '.ki.toml must be valid TOML'],
      [
        'an invalid prefix',
        '[skills.ki-repo-backpack]\nprefix = "not-valid"\n',
        'must declare a lowercase alphanumeric [skills.ki-repo-backpack] prefix'
      ],
      [
        'a scalar skills declaration',
        'skills = "invalid"\n',
        'must declare a lowercase alphanumeric [skills.ki-repo-backpack] prefix'
      ],
      [
        'a scalar ki-repo-backpack declaration',
        '[skills]\nki-repo-backpack = "invalid"\n',
        'must declare a lowercase alphanumeric [skills.ki-repo-backpack] prefix'
      ]
    ])('refuses %s in backpack prefix metadata', async (_case, metadata, message) => {
      const box = await sandbox()
      const { payload, sha256 } = makeBackpackArchive({
        'source/.ki.toml': metadata,
        'source/skills/ki-example/SKILL.md': '---\nname: ki-example\nki-depends-on: []\n---\n'
      })
      await box.config.write(
        'ki/config.toml',
        `[backpacks]\nreleases = [{ id = "example/backpack", url = "https://releases.example.test/example.tgz", sha256 = "${sha256}" }]\n`
      )
      box.setFetcher(async () => new Response(payload))

      const result = await box.run('ki backpack install example/backpack')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain(message)
    })

    test('requires published skills to use the declared backpack prefix', async () => {
      const box = await sandbox()
      const { payload, sha256 } = makeBackpackArchive(
        { 'source/skills/ki-example/SKILL.md': '---\nname: ki-example\nki-depends-on: []\n---\n' },
        { backpackPrefix: 'hnr' }
      )
      await box.config.write(
        'ki/config.toml',
        `[backpacks]\nreleases = [{ id = "example/backpack", url = "https://releases.example.test/example.tgz", sha256 = "${sha256}" }]\n`
      )
      box.setFetcher(async () => new Response(payload))

      const result = await box.run('ki backpack install example/backpack')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('skill ki-example must begin with declared prefix hnr-')
    })

    test('refuses a second installed backpack claiming the same prefix', async () => {
      const box = await sandbox()
      const first = makeBackpackArchive({
        'source/skills/ki-first/SKILL.md': '---\nname: ki-first\nki-depends-on: []\n---\n'
      })
      const second = makeBackpackArchive({
        'source/skills/ki-second/SKILL.md': '---\nname: ki-second\nki-depends-on: []\n---\n'
      })
      await box.config.write(
        'ki/config.toml',
        `[backpacks]\nreleases = [\n  { id = "first/backpack", url = "https://releases.example.test/first.tgz", sha256 = "${first.sha256}" },\n  { id = "second/backpack", url = "https://releases.example.test/second.tgz", sha256 = "${second.sha256}" },\n]\n`
      )
      box.setFetcher(async (input) => new Response(String(input).includes('first') ? first.payload : second.payload))

      expect((await box.run('ki backpack install first/backpack')).exitCode).toBe(0)
      const result = await box.run('ki backpack install second/backpack')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('backpack prefix ki is already owned by installed backpack first/backpack')
      await expect(lstat(`${box.data.path}/ki/backpacks/second/backpack`)).rejects.toThrow()
    })

    test('refuses an unsafe managed-artifacts directory before creating install staging', async () => {
      const box = await sandbox()
      const { payload, sha256 } = makeBackpackArchive({
        'source-revision/skills/ki-example/SKILL.md': '---\nname: ki-example\nki-depends-on: []\n---\n'
      })
      await box.config.write(
        'ki/config.toml',
        `[backpacks]\nreleases = [{ id = "example/backpack", url = "https://releases.example.test/backpack.tar.gz", sha256 = "${sha256}" }]\n`
      )
      await box.state.write('ki/managed-artifacts-target', 'not a directory\n')
      await symlink(`${box.state.path}/ki/managed-artifacts-target`, `${box.state.path}/ki/managed-artifacts`)
      box.setFetcher(async () => new Response(payload))

      const installed = await box.run('ki backpack install example/backpack')

      expect(installed).toEqual({
        exitCode: 1,
        output: 'ki: error: managed artifacts directory must be a directory\n'
      })
      expect(await readdir(`${box.data.path}/ki/backpacks/example`)).toEqual([])
    })

    test('installs a private GitHub backpack through the authenticated GitHub CLI', async () => {
      const box = await sandbox()
      const { payload, sha256 } = makeBackpackArchive({
        'source-revision/skills/ki-example/SKILL.md': '---\nname: ki-example\nki-depends-on: []\n---\n'
      })
      const url = 'https://codeload.github.com/example/backpack/tar.gz/0123456789abcdef'
      await box.config.write(
        'ki/config.toml',
        `[backpacks]\nreleases = [{ id = "example/backpack", url = "${url}", sha256 = "${sha256}", auth = "github-cli" }]\n`
      )
      box.setRunner(async (command, arguments_, environment) => {
        expect(command).toBe('gh')
        expect(arguments_).toEqual(['auth', 'token'])
        expect(environment).toMatchObject(box.env)
        return { exitCode: 0, output: 'test-token\n' }
      })
      box.setFetcher(async (input, options) => {
        expect(input).toBe(url)
        expect(options).toEqual({ redirect: 'error', headers: { Authorization: 'Bearer test-token' } })
        return new Response(payload)
      })

      const result = await box.run('ki backpack install example/backpack')

      expect(result).toEqual({ exitCode: 0, output: `installed example/backpack\tarchive ${sha256}\n` })
    })

    test('does not expose GitHub CLI output when private-backpack authentication fails', async () => {
      const box = await sandbox()
      await box.config.write(
        'ki/config.toml',
        `[backpacks]\nreleases = [{ id = "example/backpack", url = "https://codeload.github.com/example/backpack/tar.gz/revision", sha256 = "${'a'.repeat(64)}", auth = "github-cli" }]\n`
      )
      box.setRunner(async () => ({ exitCode: 1, output: 'sensitive credential diagnostic\n' }))

      const result = await box.run('ki backpack install example/backpack')

      expect(result).toEqual({
        exitCode: 1,
        output: 'ki: error: could not obtain GitHub authentication; install gh and run gh auth login\n'
      })
    })

    test('reports a missing GitHub CLI without exposing its startup error', async () => {
      const box = await sandbox()
      await box.config.write(
        'ki/config.toml',
        `[backpacks]\nreleases = [{ id = "example/backpack", url = "https://codeload.github.com/example/backpack/tar.gz/revision", sha256 = "${'a'.repeat(64)}", auth = "github-cli" }]\n`
      )
      box.setRunner(async () => {
        throw new Error('sensitive local command diagnostic')
      })

      const result = await box.run('ki backpack install example/backpack')

      expect(result).toEqual({
        exitCode: 1,
        output: 'ki: error: could not obtain GitHub authentication; install gh and run gh auth login\n'
      })
    })

    test('extracts a payload whose tar path uses the header prefix field', async () => {
      const box = await sandbox()
      const skill = '---\nname: ki-prefixed\nki-depends-on: []\n---\n'
      const { payload, sha256 } = makeBackpackArchive({
        'SKILL.md': { contents: skill, prefix: 'source-revision/skills/ki-prefixed', type: '0' }
      })
      await box.config.write(
        'ki/config.toml',
        `[backpacks]
releases = [
  { id = "example/backpack", url = "https://releases.example.test/backpack.tar.gz", sha256 = "${sha256}" },
]
`
      )
      box.setFetcher(async () => new Response(payload))

      const installed = await box.run('ki backpack install example/backpack')

      expect(installed.exitCode).toBe(0)
      expect(await box.data.read('ki/backpacks/example/backpack/skills/ki-prefixed/SKILL.md')).toBe(skill)
    })

    test('accepts empty directory entries in an otherwise valid archive', async () => {
      const box = await sandbox()
      const skill = '---\nname: ki-directory\nki-depends-on: []\n---\n'
      const { payload, sha256 } = makeBackpackArchive({
        skills: { type: '5' },
        'skills/ki-directory/SKILL.md': skill
      })
      await box.config.write(
        'ki/config.toml',
        `[backpacks]
releases = [
  { id = "example/backpack", url = "https://releases.example.test/backpack.tar.gz", sha256 = "${sha256}" },
]
`
      )
      box.setFetcher(async () => new Response(payload))

      const installed = await box.run('ki backpack install example/backpack')

      expect(installed.exitCode).toBe(0)
      expect(await box.data.read('ki/backpacks/example/backpack/skills/ki-directory/SKILL.md')).toBe(skill)
    })

    test('treats a blank tar size field as an empty regular file', async () => {
      const box = await sandbox()
      const { payload, sha256 } = makeBackpackArchive({ 'skills/ki-empty/SKILL.md': { size: '', type: '0' } })
      await box.config.write(
        'ki/config.toml',
        `[backpacks]
releases = [
  { id = "example/backpack", url = "https://releases.example.test/backpack.tar.gz", sha256 = "${sha256}" },
]
`
      )
      box.setFetcher(async () => new Response(payload))

      const installed = await box.run('ki backpack install example/backpack')

      expect(installed).toEqual({
        exitCode: 1,
        output: 'ki: error: skills/ki-empty/SKILL.md must declare frontmatter\n'
      })
    })

    test('resolves the immutable canonical backpack from the registry without user configuration', async () => {
      const box = await sandbox()
      const { payload } = makeBackpackArchive({
        'skills/ki-example/SKILL.md': '---\nname: ki-example\nki-depends-on: []\n---\n'
      })
      box.setFetcher(async () => new Response(payload))

      const result = await box.run('ki backpack install knowledgeislands/ki-agent-backpack')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('does not match its SHA-256')
      await expect(lstat(`${box.data.path}/ki/backpacks/knowledgeislands/ki-agent-backpack`)).rejects.toThrow()
    })

    test('refuses symbolic links in a backpack archive', async () => {
      const box = await sandbox()
      const { payload, sha256 } = makeBackpackArchive({ 'skills/ki-example/SKILL.md': { type: '2' } })
      await box.config.write(
        'ki/config.toml',
        `[backpacks]
releases = [
  { id = "example/backpack", url = "https://releases.example.test/backpack.tar.gz", sha256 = "${sha256}" },
]
`
      )
      box.setFetcher(async () => new Response(payload))

      const result = await box.run('ki backpack install example/backpack')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('may contain only regular files and directories')
    })

    test('ignores runtime projection links outside the backpack payload', async () => {
      const box = await sandbox()
      const { payload, sha256 } = makeBackpackArchive({
        '.agents/skills/ki-example': { type: '2' },
        'source/skills/ki-example/SKILL.md': '---\nname: ki-example\nki-depends-on: []\n---\n'
      })
      await box.config.write(
        'ki/config.toml',
        `[backpacks]
releases = [
  { id = "example/backpack", url = "https://releases.example.test/backpack.tar.gz", sha256 = "${sha256}" },
]
`
      )
      box.setFetcher(async () => new Response(payload))

      const result = await box.run('ki backpack install example/backpack')

      expect(result.exitCode).toBe(0)
      await expect(box.data.read('ki/backpacks/example/backpack/skills/ki-example/SKILL.md')).resolves.toContain(
        'name: ki-example'
      )
    })

    test('refuses a non-ok download response', async () => {
      const box = await sandbox()
      await box.config.write(
        'ki/config.toml',
        `[backpacks]
releases = [
  { id = "example/backpack", url = "https://releases.example.test/backpack.tar.gz", sha256 = "${'a'.repeat(64)}" },
]
`
      )
      box.setFetcher(async () => new Response(null, { status: 500 }))

      const result = await box.run('ki backpack install example/backpack')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('could not download configured backpack example/backpack: HTTP 500')
    })

    test('refuses a failed or redirected download', async () => {
      const box = await sandbox()
      await box.config.write(
        'ki/config.toml',
        `[backpacks]
releases = [
  { id = "example/backpack", url = "https://releases.example.test/backpack.tar.gz", sha256 = "${'a'.repeat(64)}" },
]
`
      )
      box.setFetcher(async () => {
        throw new Error('redirected')
      })

      const result = await box.run('ki backpack install example/backpack')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('could not download configured backpack example/backpack')
    })

    test('refuses a non-gzip archive', async () => {
      const box = await sandbox()
      const payload = new TextEncoder().encode('not a gzip archive')
      const sha256 = createHash('sha256').update(payload).digest('hex')
      await box.config.write(
        'ki/config.toml',
        `[backpacks]
releases = [
  { id = "example/backpack", url = "https://releases.example.test/backpack.tar.gz", sha256 = "${sha256}" },
]
`
      )
      box.setFetcher(async () => new Response(payload))

      const result = await box.run('ki backpack install example/backpack')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('must be a gzip-compressed tar archive')
    })

    test.each([
      [
        'an archive without its terminating tar block',
        () => makeBackpackArchive({ 'skills/ki-example/SKILL.md': 'skill\n' }, { terminatingBlocks: false }),
        'backpack archive is missing its terminating tar block'
      ],
      [
        'an archive entry with an invalid tar size',
        () => makeBackpackArchive({ 'skills/ki-example/SKILL.md': { size: 'not-octal', type: '0' } }),
        'backpack archive has an invalid tar entry size'
      ],
      [
        'an archive entry whose declared contents exceed the archive',
        () => makeBackpackArchive({ 'skills/ki-example/SKILL.md': { contents: 'x', size: 4096, type: '0' } }),
        'backpack archive contains an unsafe entry'
      ],
      [
        'an archive that mixes source payload prefixes',
        () =>
          makeBackpackArchive({
            'first-revision/skills/ki-first/SKILL.md': 'first\n',
            'second-revision/skills/ki-second/SKILL.md': 'second\n'
          }),
        'backpack archive mixes payload roots'
      ],
      [
        'a directory entry with contents',
        () => makeBackpackArchive({ skills: { contents: 'unexpected\n', type: '5' } }),
        'backpack archive directory has contents'
      ],
      [
        'an archive without an installable payload',
        () => makeBackpackArchive({ 'README.md': 'source only\n' }),
        'backpack archive contains no skills, agents, or hooks payload'
      ]
    ])('refuses %s', async (_case, archive, expected) => {
      const box = await sandbox()
      const { payload, sha256 } = archive()
      await box.config.write(
        'ki/config.toml',
        `[backpacks]
releases = [
  { id = "example/backpack", url = "https://releases.example.test/backpack.tar.gz", sha256 = "${sha256}" },
]
`
      )
      box.setFetcher(async () => new Response(payload))

      const result = await box.run('ki backpack install example/backpack')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain(expected)
      await expect(lstat(`${box.data.path}/ki/backpacks/example/backpack`)).rejects.toThrow()
    })

    test('refuses an archive entry with an unsafe path', async () => {
      const box = await sandbox()
      const { payload, sha256 } = makeBackpackArchive({ 'skills/../secret': 'x' })
      await box.config.write(
        'ki/config.toml',
        `[backpacks]
releases = [
  { id = "example/backpack", url = "https://releases.example.test/backpack.tar.gz", sha256 = "${sha256}" },
]
`
      )
      box.setFetcher(async () => new Response(payload))

      const result = await box.run('ki backpack install example/backpack')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('backpack archive contains an unsafe entry')
    })

    test('refuses an archive that does not match configured immutable evidence without creating an installation', async () => {
      const box = await sandbox()
      const { payload } = makeBackpackArchive({
        'skills/ki-example/SKILL.md': '---\nname: ki-example\nki-depends-on: []\n---\n'
      })
      await box.config.write(
        'ki/config.toml',
        `[backpacks]
releases = [
  { id = "example/backpack", url = "https://releases.example.test/backpack.tar.gz", sha256 = "${'0'.repeat(64)}" },
]
`
      )
      box.setFetcher(async () => new Response(payload))

      const result = await box.run('ki backpack install example/backpack')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('does not match its SHA-256')
      const info = await box.run('ki backpack info example/backpack')
      expect(info.exitCode).toBe(1)
    })
  })

  describe('installed backpack integrity', () => {
    test('rejects an installed backpack with malformed skill contents', async () => {
      const box = await sandbox()
      await box.setupExampleBackpack()
      await box.data.write('ki/backpacks/example/backpack/skills/ki-example/SKILL.md', 'no frontmatter here\n')

      const info = await box.run('ki backpack info example/backpack')

      expect(info.exitCode).toBe(1)
      expect(info.output).toContain('must declare frontmatter')
    })

    test('rejects an installed backpack without its declaration', async () => {
      const box = await sandbox()
      await box.setupExampleBackpack()
      await rm(`${box.data.path}/ki/backpacks/example/backpack/.ki.toml`)

      const info = await box.run('ki backpack info example/backpack')

      expect(info.exitCode).toBe(1)
      expect(info.output).toContain('.ki.toml must be a regular file')
    })

    test('rejects an installed backpack whose payload contains a symlink', async () => {
      const box = await sandbox()
      await box.setupExampleBackpack()
      const skillDirectory = `${box.data.path}/ki/backpacks/example/backpack/skills/ki-example`
      await symlink(`${skillDirectory}/SKILL.md`, `${skillDirectory}/ALIAS.md`)

      const listed = await box.run('ki backpack list')

      expect(listed.exitCode).toBe(1)
      expect(listed.output).toContain('must not be a symlink')
    })

    test('rejects a nested directory symlink in an installed payload', async () => {
      const box = await sandbox()
      await box.setupExampleBackpack()
      const directory = `${box.data.path}/ki/backpacks/example/backpack/skills/ki-example/linked`
      await box.root.mkdir('external-payload')
      await symlink(`${box.root.path}/external-payload`, directory)

      const info = await box.run('ki backpack info example/backpack')

      expect(info.exitCode).toBe(1)
      expect(info.output).toContain('installed backpack payload skills/ki-example/linked must not be a symlink')
    })

    test('rejects an external payload-root link', async () => {
      const box = await sandbox()
      await box.setupExampleBackpack()
      const payload = `${box.data.path}/ki/backpacks/example/backpack/skills`
      const external = await box.root.mkdir('external-skills')
      await box.root.write('external-skills/ki-external/SKILL.md', '---\nname: ki-external\nki-depends-on: []\n---\n')
      await rm(payload, { recursive: true })
      await symlink(external, payload)

      const info = await box.run('ki backpack info example/backpack')

      expect(info.exitCode).toBe(1)
      expect(info.output).toContain('installed backpack payload skills must not be a symlink')
    })

    test('rejects a broken local backpack root link', async () => {
      const box = await sandbox()
      await box.setupExampleBackpack()
      const root = `${box.data.path}/ki/backpacks/example/backpack`
      await rm(root, { recursive: true })
      await symlink(`${box.root.path}/missing-backpack`, root, 'dir')

      const info = await box.run('ki backpack info example/backpack')

      expect(info.exitCode).toBe(1)
      expect(info.output).toContain('installed backpack example/backpack local development link is broken')
    })

    test('rejects a local backpack root link resolving to a regular file', async () => {
      const box = await sandbox()
      await box.setupExampleBackpack()
      const root = `${box.data.path}/ki/backpacks/example/backpack`
      await box.root.write('not-a-backpack', 'unsafe\n')
      await rm(root, { recursive: true })
      await symlink(`${box.root.path}/not-a-backpack`, root, 'dir')

      const info = await box.run('ki backpack info example/backpack')

      expect(info.exitCode).toBe(1)
      expect(info.output).toContain('installed backpack example/backpack must be a directory')
    })

    test.each([
      ['a missing skill name', '---\nki-depends-on: []\n---\n', 'must declare name'],
      ['an ignored frontmatter line', '---\nnot metadata\nki-depends-on: []\n---\n', 'must declare name'],
      [
        'a repeated frontmatter field',
        '---\nname: ki-example\nname: ki-example\nki-depends-on: []\n---\n',
        'repeats frontmatter field name'
      ],
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
      await box.setupExampleBackpack()
      await box.data.write('ki/backpacks/example/backpack/skills/ki-example/SKILL.md', skill)

      const info = await box.run('ki backpack info example/backpack')

      expect(info.exitCode).toBe(1)
      expect(info.output).toContain(expected)
    })

    test('rejects repeated installed skill capabilities', async () => {
      const box = await sandbox()
      await box.setupExampleBackpack()
      await box.data.write(
        'ki/backpacks/example/backpack/skills/ki-copy/SKILL.md',
        '---\nname: ki-example\nki-depends-on: []\n---\n'
      )

      const info = await box.run('ki backpack info example/backpack')

      expect(info.exitCode).toBe(1)
      expect(info.output).toContain('repeats skill ki-example')
    })

    test('rejects a payload root symlink that resolves to a regular file', async () => {
      const box = await sandbox()
      await box.setupExampleBackpack()
      const payload = `${box.data.path}/ki/backpacks/example/backpack/skills`
      await rm(payload, { recursive: true })
      await box.root.write('not-a-payload', 'not a directory\n')
      await symlink(`${box.root.path}/not-a-payload`, payload)

      const info = await box.run('ki backpack info example/backpack')

      expect(info.exitCode).toBe(1)
      expect(info.output).toContain('installed backpack payload skills must not be a symlink')
    })

    test('rejects unsafe owner and backpack-name entries in the installed inventory', async () => {
      const owner = await sandbox()
      await owner.setupExampleBackpack()
      await owner.data.write('ki/backpacks/unexpected', 'not a backpack owner\n')

      const unsafeOwner = await owner.run('ki backpack list')

      expect(unsafeOwner.exitCode).toBe(1)
      expect(unsafeOwner.output).toContain('installed backpacks directory contains an unsafe owner entry')

      const name = await sandbox()
      await name.setupExampleBackpack()
      await name.data.write('ki/backpacks/example/unexpected', 'not a backpack\n')

      const unsafeName = await name.run('ki backpack list')

      expect(unsafeName.exitCode).toBe(1)
      expect(unsafeName.output).toContain('installed backpack example contains an unsafe name entry')
    })

    test('rejects owner and backpack-name directories outside the identifier grammar', async () => {
      const owner = await sandbox()
      await owner.setupExampleBackpack()
      await owner.data.mkdir('ki/backpacks/Invalid')

      const unsafeOwner = await owner.run('ki backpack list')

      expect(unsafeOwner.exitCode).toBe(1)
      expect(unsafeOwner.output).toContain('installed backpacks directory contains an unsafe owner entry')

      const name = await sandbox()
      await name.setupExampleBackpack()
      await name.data.mkdir('ki/backpacks/example/Invalid')

      const unsafeName = await name.run('ki backpack list')

      expect(unsafeName.exitCode).toBe(1)
      expect(unsafeName.output).toContain('installed backpack example contains an unsafe name entry')
    })

    test('rejects a special file in an installed backpack payload', async () => {
      const box = await sandbox()
      await box.setupExampleBackpack()
      const pipe = `${box.data.path}/ki/backpacks/example/backpack/skills/pipe`
      execFileSync('mkfifo', [pipe])

      const info = await box.run('ki backpack info example/backpack')

      expect(info.exitCode).toBe(1)
      expect(info.output).toContain('installed backpack payload skills/pipe must be a regular file or directory')
    })
  })
})
