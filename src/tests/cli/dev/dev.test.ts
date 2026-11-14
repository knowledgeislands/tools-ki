import { lstat, readlink, realpath, rename, rm, symlink, unlink } from 'node:fs/promises'
import { parse } from 'smol-toml'
import { describe, expect, test } from 'vitest'
import { makeBackpackArchive } from '../_archive_helper.ts'
import { type Sandbox, sandbox } from '../_cli_helper.ts'

const enableLocal = async (box: Sandbox, backpackPath: string) => {
  expect(await box.run(`ki dev local set knowledgeislands/ki-agent-backpack ${backpackPath}`)).toEqual({
    exitCode: 0,
    output: `development backpack set knowledgeislands/ki-agent-backpack\t${backpackPath}\nconfigured 1 agents\n`
  })
  return box.run('ki dev local on')
}

describe('[ki dev]', () => {
  test('rejects retired development command paths', async () => {
    const box = await sandbox()

    const local = await box.run('ki dev on nowhere')
    const off = await box.run('ki dev off')

    expect(local.exitCode).toBe(2)
    expect(off.exitCode).toBe(2)
  })

  describe('dev local set and on', () => {
    test('requires the selected backpack to exist in the installed estate', async () => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')
      await rm(`${box.data.path}/ki/backpacks/knowledgeislands/ki-agent-backpack`, { recursive: true })

      const result = await box.run(`ki dev local set knowledgeislands/ki-agent-backpack ${backpackPath}`)

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('installed backpack knowledgeislands/ki-agent-backpack must be a directory')
    })

    test('accepts a local source for a legacy installed slot without backpack metadata', async () => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')
      await rm(`${box.data.path}/ki/backpacks/knowledgeislands/ki-agent-backpack/.ki.toml`)

      const result = await box.run(`ki dev local set knowledgeislands/ki-agent-backpack ${backpackPath}`)

      expect(result.exitCode).toBe(0)
    })

    test('switches the canonical backpack to a local development checkout', async () => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('chatgpt-codex')

      await box.run('ki bootstrap')
      const result = await enableLocal(box, backpackPath)

      expect(result).toEqual({
        exitCode: 0,
        output: `development backpack enabled knowledgeislands/ki-agent-backpack\t${backpackPath}
refreshed ki configuration: 1 agents, 1 backpacks, 8 skills
ki-bootstrap for chatgpt-codex installed
ki-next for chatgpt-codex installed
ki-plan for chatgpt-codex installed
ki-implement for chatgpt-codex installed
ki-accept for chatgpt-codex installed
ki-batch for chatgpt-codex installed
ki-recap for chatgpt-codex installed
ki-work-design for chatgpt-codex installed
`
      })
      const dataIsSymlink = await box.data.isSymlink('ki/backpacks/knowledgeislands/ki-agent-backpack')
      const homeIsSymlink = await box.home.isSymlink('.agents/skills/ki-bootstrap')
      const config = await box.config.read('ki/config.toml')
      const expectedConfig = `[agents]
ids = [
  "chatgpt-codex",
]

[backpacks]
ids = [
  "knowledgeislands/ki-agent-backpack",
]

[skills]

[skills.ki-accept]
backpack = "knowledgeislands/ki-agent-backpack"

[skills.ki-batch]
backpack = "knowledgeislands/ki-agent-backpack"

[skills.ki-bootstrap]
backpack = "knowledgeislands/ki-agent-backpack"

[skills.ki-implement]
backpack = "knowledgeislands/ki-agent-backpack"

[skills.ki-next]
backpack = "knowledgeislands/ki-agent-backpack"

[skills.ki-plan]
backpack = "knowledgeislands/ki-agent-backpack"

[skills.ki-recap]
backpack = "knowledgeislands/ki-agent-backpack"

[skills.ki-work-design]
backpack = "knowledgeislands/ki-agent-backpack"
`
      expect(dataIsSymlink).toBe(true)
      expect(await realpath(`${box.data.path}/ki/backpacks/knowledgeislands/ki-agent-backpack`)).toBe(backpackPath)
      expect(await box.data.read('ki/backpacks/knowledgeislands/ki-agent-backpack/.ki.toml')).toBe(
        await box.root.read('dev/knowledgeislands/ki-agent-backpack/.ki.toml')
      )
      expect(homeIsSymlink).toBe(true)
      expect(await readlink(`${box.home.path}/.agents/skills/ki-bootstrap`)).toBe(
        `${backpackPath}/skills/keystone/ki-bootstrap`
      )
      expect(await realpath(`${box.home.path}/.agents/skills/ki-bootstrap`)).toBe(
        `${backpackPath}/skills/keystone/ki-bootstrap`
      )
      expect(config).toBe(expectedConfig)
      expect(await box.state.read('ki/locals.toml')).toBe(
        `[locals."knowledgeislands/ki-agent-backpack"]\npath = ${JSON.stringify(backpackPath)}\n`
      )
    })

    test('keeps the configuration tables it does not own when it rewrites the file', async () => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      const inventory = `${box.root.path}/mcp-servers.yaml`
      const kept = `[territories]\nranking = ["personal", "knowledge-islands"]\n\n[mcp]\ninventory = ${JSON.stringify(inventory)}\n`
      await box.config.write('ki/config.toml', `${await box.config.read('ki/config.toml')}\n${kept}`)

      expect((await enableLocal(box, backpackPath)).exitCode).toBe(0)
      expect((await box.run('ki bootstrap --refresh')).exitCode).toBe(0)

      const config = await box.config.read('ki/config.toml')
      expect(await box.state.read('ki/locals.toml')).toContain(`[locals."knowledgeislands/ki-agent-backpack"]`)
      const { territories, mcp } = parse(config)
      expect({ territories, mcp }).toEqual(parse(kept))
      expect((await box.run('ki diag')).output).not.toContain('unrecognised key')
    })

    test('keeps configured backpack releases when it rewrites the file', async () => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      const releases = [
        '[[backpacks.releases]]',
        'id = "example/plain"',
        'url = "https://example.com/plain.tar.gz"',
        `sha256 = "${'a'.repeat(64)}"`,
        '',
        '[[backpacks.releases]]',
        'id = "example/private"',
        'url = "https://codeload.github.com/example/private/tar.gz/0123456789abcdef0123456789abcdef01234567"',
        `sha256 = "${'b'.repeat(64)}"`,
        'auth = "github-cli"',
        ''
      ].join('\n')
      await box.config.write('ki/config.toml', `${await box.config.read('ki/config.toml')}\n${releases}`)

      expect((await enableLocal(box, backpackPath)).exitCode).toBe(0)
      expect((await box.run('ki bootstrap --refresh')).exitCode).toBe(0)

      const config = await box.config.read('ki/config.toml')
      expect(await box.state.read('ki/locals.toml')).toContain(`[locals."knowledgeislands/ki-agent-backpack"]`)
      expect(parse(config)['backpacks']).toMatchObject(parse(releases)['backpacks'] as object)
      expect((await box.run('ki diag')).output).not.toContain('unrecognised key')
    })

    test('keeps a malformed release list for validation to report', async () => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      const config = await box.config.read('ki/config.toml')
      await box.config.write(
        'ki/config.toml',
        config.replace('[backpacks]\n', '[backpacks]\nreleases = ["not-a-table"]\n')
      )

      await enableLocal(box, backpackPath)

      expect(parse(await box.config.read('ki/config.toml'))['backpacks']).toMatchObject({ releases: ['not-a-table'] })
    })

    test('remembers a local source without activating it', async () => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')

      const set = await box.run(`ki dev local set knowledgeislands/ki-agent-backpack ${backpackPath}`)

      expect(set.exitCode).toBe(0)
      expect(await box.data.isSymlink('ki/backpacks/knowledgeislands/ki-agent-backpack')).toBe(false)
      expect(await realpath(`${box.home.path}/.claude/skills/ki-bootstrap`)).toBe(
        await realpath(`${box.data.path}/ki/backpacks/knowledgeislands/ki-agent-backpack/skills/keystone/ki-bootstrap`)
      )
      expect(await box.state.read('ki/locals.toml')).toBe(
        `[locals."knowledgeislands/ki-agent-backpack"]\npath = ${JSON.stringify(backpackPath)}\n`
      )
      expect(await box.config.read('ki/config.toml')).not.toContain('[locals')
    })

    test('migrates the recognised retired agents payload while switching to a local checkout', async () => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      const canonical = `${box.data.path}/ki/backpacks/knowledgeislands/ki-agent-backpack`
      await rename(`${canonical}/subagents`, `${canonical}/agents`)

      const result = await enableLocal(box, backpackPath)

      expect(result.exitCode).toBe(0)
      expect(await box.data.isSymlink('ki/backpacks/knowledgeislands/ki-agent-backpack')).toBe(true)
      await expect(lstat(`${canonical}/agents`)).rejects.toThrow()
    })

    test('replaces a recognised legacy partial projection with one local backpack root', async () => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await box.run(`ki dev local set knowledgeislands/ki-agent-backpack ${backpackPath}`)
      const canonical = `${box.data.path}/ki/backpacks/knowledgeislands/ki-agent-backpack`
      for (const payload of ['skills', 'subagents', 'hooks']) {
        await rm(`${canonical}/${payload}`, { recursive: true })
        await symlink(`${backpackPath}/${payload}`, `${canonical}/${payload}`, 'dir')
      }

      const result = await box.run('ki dev local on')

      expect(result.exitCode).toBe(0)
      expect((await lstat(canonical)).isSymbolicLink()).toBe(true)
      expect(await realpath(canonical)).toBe(backpackPath)
    })

    test('switches every configured backpack together and can restore one by identifier', async () => {
      const box = await sandbox()
      const skill = '---\nname: hnr-example\nki-depends-on: []\n---\n'
      const installed = 'ki/backpacks/humansnotrobots/hnr-agent-backpack'
      const canonicalLocal = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await box.data.write(`${installed}/.ki.toml`, '[skills.ki-repo-backpack]\nprefix = "hnr"\n')
      await box.data.write(`${installed}/skills/hnr-example/SKILL.md`, skill)
      await Promise.all(['subagents', 'hooks'].map((payload) => box.data.mkdir(`${installed}/${payload}`)))
      await box.run('ki bootstrap --refresh')
      await box.run('ki skill add hnr-example')
      const local = await box.root.mkdir('dev/humansnotrobots/hnr-agent-backpack')
      await box.root.write(
        'dev/humansnotrobots/hnr-agent-backpack/.ki.toml',
        '[skills.ki-repo-backpack]\nprefix = "hnr"\n'
      )
      await box.root.write('dev/humansnotrobots/hnr-agent-backpack/skills/hnr-example/SKILL.md', skill)
      await Promise.all(
        ['subagents', 'hooks'].map((payload) => box.root.mkdir(`dev/humansnotrobots/hnr-agent-backpack/${payload}`))
      )

      await box.run(`ki dev local set knowledgeislands/ki-agent-backpack ${canonicalLocal}`)
      const set = await box.run(`ki dev local set humansnotrobots/hnr-agent-backpack ${local}`)
      const on = await box.run('ki dev local on')

      expect(set.exitCode).toBe(0)
      expect(on.exitCode).toBe(0)
      expect(await box.data.isSymlink(installed)).toBe(true)
      expect(await box.data.isSymlink('ki/backpacks/knowledgeislands/ki-agent-backpack')).toBe(true)
      expect(await realpath(`${box.home.path}/.agents/skills/hnr-example`)).toBe(`${local}/skills/hnr-example`)

      const archive = makeBackpackArchive({ 'source/skills/hnr-example/SKILL.md': skill }, { backpackPrefix: 'hnr' })
      const configuration = await box.config.read('ki/config.toml')
      await box.config.write(
        'ki/config.toml',
        configuration.replace(
          '[backpacks]\n',
          `[backpacks]\nreleases = [{ id = "humansnotrobots/hnr-agent-backpack", url = "https://releases.example.test/hnr.tgz", sha256 = "${archive.sha256}" }]\n`
        )
      )
      box.setFetcher(async () => new Response(archive.payload))

      const update = await box.run('ki update')
      const uninstall = await box.run('ki backpack uninstall humansnotrobots/hnr-agent-backpack')

      expect(update.exitCode).toBe(1)
      expect(update.output).toContain(
        'backpack humansnotrobots/hnr-agent-backpack is development-linked; run ki dev local off before replacing it'
      )
      expect(uninstall.exitCode).toBe(1)
      expect(uninstall.output).toContain(
        'backpack humansnotrobots/hnr-agent-backpack is development-linked; run ki dev local off before uninstalling'
      )

      const off = await box.run('ki dev local off humansnotrobots/hnr-agent-backpack')

      expect(off.exitCode).toBe(0)
      expect(await box.data.isSymlink(installed)).toBe(false)
      expect(await box.data.isSymlink('ki/backpacks/knowledgeislands/ki-agent-backpack')).toBe(true)
      expect(await realpath(`${box.home.path}/.agents/skills/hnr-example`)).toBe(
        await realpath(`${box.data.path}/${installed}/skills/hnr-example`)
      )
    })

    test('refuses a local checkout that changes the installed backpack prefix', async () => {
      const box = await sandbox()
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      const installed = 'ki/backpacks/humansnotrobots/hnr-agent-backpack'
      await box.data.write(`${installed}/.ki.toml`, '[skills.ki-repo-backpack]\nprefix = "hnr"\n')
      await box.data.write(
        `${installed}/skills/hnr-example/SKILL.md`,
        '---\nname: hnr-example\nki-depends-on: []\n---\n'
      )
      await Promise.all(['subagents', 'hooks'].map((payload) => box.data.mkdir(`${installed}/${payload}`)))
      await box.root.write(
        'dev/humansnotrobots/hnr-agent-backpack/.ki.toml',
        '[skills.ki-repo-backpack]\nprefix = "other"\n'
      )
      await box.root.write(
        'dev/humansnotrobots/hnr-agent-backpack/skills/other-example/SKILL.md',
        '---\nname: other-example\nki-depends-on: []\n---\n'
      )
      await Promise.all(
        ['subagents', 'hooks'].map((payload) => box.root.mkdir(`dev/humansnotrobots/hnr-agent-backpack/${payload}`))
      )

      const result = await box.run(
        `ki dev local set humansnotrobots/hnr-agent-backpack ${box.root.path}/dev/humansnotrobots/hnr-agent-backpack`
      )

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('declares prefix other; installed backpack declares hnr')
    })
  })

  describe('host-local sources', () => {
    const canonical = 'knowledgeislands/ki-agent-backpack'
    const sourceTable = (backpack: string, path: string) =>
      `[locals.${JSON.stringify(backpack)}]\npath = ${JSON.stringify(path)}\n`
    const withLegacyLocals = async (box: Sandbox, tables: string) =>
      box.config.write('ki/config.toml', `${await box.config.read('ki/config.toml')}\n${tables}`)

    test('lets two hosts sharing one configuration remember different checkouts without writing them into it', async () => {
      const terra = await sandbox()
      const sol = await sandbox()
      const terraPath = await terra.setupLocalCanonicalBackpack('dev/terra/knowledgeislands/ki-agent-backpack')
      const solPath = await sol.setupLocalCanonicalBackpack('dev/sol/knowledgeislands/ki-agent-backpack')
      for (const box of [terra, sol]) {
        await box.setupAgentHome('chatgpt-codex')
        await box.run('ki bootstrap')
      }
      const shared = await terra.config.read('ki/config.toml')
      await sol.config.write('ki/config.toml', shared)

      expect((await terra.run(`ki dev local set ${canonical} ${terraPath}`)).exitCode).toBe(0)
      expect((await sol.run(`ki dev local set ${canonical} ${solPath}`)).exitCode).toBe(0)

      expect(await terra.config.read('ki/config.toml')).toBe(shared)
      expect(await sol.config.read('ki/config.toml')).toBe(shared)
      expect(await terra.state.read('ki/locals.toml')).toBe(sourceTable(canonical, terraPath))
      expect(await sol.state.read('ki/locals.toml')).toBe(sourceTable(canonical, solPath))
    })

    test('keeps using configuration locals that still await their move', async () => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await withLegacyLocals(box, sourceTable(canonical, backpackPath))

      const diag = await box.run('ki diag --full')
      const on = await box.run('ki dev local on')

      expect(diag.output).toContain(
        `locals in ${box.config.path}/ki/config.toml await their move to ${box.state.path}/ki/locals.toml`
      )
      expect(diag.output).toContain(`source: ${backpackPath}`)
      expect(on.exitCode).toBe(0)
      expect(await realpath(`${box.data.path}/ki/backpacks/${canonical}`)).toBe(backpackPath)
      await expect(lstat(`${box.state.path}/ki/locals.toml`)).rejects.toThrow()
    })

    test('moves configuration locals once on bootstrap and then ignores them', async () => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/current/knowledgeislands/ki-agent-backpack')
      const otherPath = await box.setupLocalCanonicalBackpack('dev/other/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await withLegacyLocals(box, `${sourceTable(canonical, backpackPath)}\n${sourceTable('example/other', otherPath)}`)

      const moved = await box.run('ki bootstrap')
      await box.config.write(
        'ki/config.toml',
        (await box.config.read('ki/config.toml')).replace(JSON.stringify(backpackPath), JSON.stringify(otherPath))
      )
      const again = await box.run('ki bootstrap --refresh')
      const on = await box.run(`ki dev local on ${canonical}`)
      const diag = await box.run('ki diag --full')

      expect(moved.output).toContain(
        `moved remembered local backpack checkouts to ${box.state.path}/ki/locals.toml: 2 backpacks`
      )
      expect(again.output).not.toContain('moved remembered')
      expect(await box.state.read('ki/locals.toml')).toBe(
        `${sourceTable('example/other', otherPath)}\n${sourceTable(canonical, backpackPath)}`
      )
      expect(parse(await box.config.read('ki/config.toml'))['locals']).toEqual({
        [canonical]: { path: otherPath },
        'example/other': { path: otherPath }
      })
      expect(on.exitCode).toBe(0)
      expect(await realpath(`${box.data.path}/ki/backpacks/${canonical}`)).toBe(backpackPath)
      expect(diag.output).toContain(
        `locals in ${box.config.path}/ki/config.toml are ignored; ${box.state.path}/ki/locals.toml holds this host's checkouts`
      )
      expect(diag.output).not.toContain('unrecognised key locals')
    })

    test('moves the other configuration locals before remembering a new checkout', async () => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await withLegacyLocals(box, sourceTable('example/other', '/elsewhere/other'))

      expect((await box.run(`ki dev local set ${canonical} ${backpackPath}`)).exitCode).toBe(0)

      expect(await box.state.read('ki/locals.toml')).toBe(
        `${sourceTable('example/other', '/elsewhere/other')}\n${sourceTable(canonical, backpackPath)}`
      )
    })

    test('does not move configuration locals out of an invalid configuration', async () => {
      const box = await sandbox()
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await withLegacyLocals(
        box,
        `${sourceTable('example/other', '/elsewhere/other')}\n[repositories]\npaths = ["relative"]\n`
      )

      await box.run('ki bootstrap')

      await expect(lstat(`${box.state.path}/ki/locals.toml`)).rejects.toThrow()
    })

    test('refuses a remembered checkout that is missing on this host', async () => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await box.run(`ki dev local set ${canonical} ${backpackPath}`)
      await rm(backpackPath, { recursive: true })

      const on = await box.run('ki dev local on')

      expect(on.exitCode).toBe(1)
      expect(on.output).toContain(
        `remembered checkout for ${canonical} is missing at ${backpackPath}; remember another with ki dev local set ${canonical} <path>`
      )
      expect(await box.data.isSymlink(`ki/backpacks/${canonical}`)).toBe(false)
    })

    test.each([
      ['a scalar locals table', 'locals = 1\n', 'locals must be a TOML table'],
      ['a scalar source', 'locals."example/other" = "/x"\n', 'locals.example/other must be a TOML table'],
      ['invalid TOML', 'locals = [\n', 'locals.toml must be valid TOML'],
      [
        'an unrecognised key',
        'extra = 1\n[locals.bad]\npath = "/x"\n',
        'locals.bad must name a backpack owner/name identifier'
      ],
      [
        'one backpack under both spellings',
        '[locals."knowledgeislands/ki-agentic-harness"]\npath = "/x"\n[locals."knowledgeislands/ki-agent-backpack"]\npath = "/x"\n',
        'locals names knowledgeislands/ki-agent-backpack under both its backpack and its retired harness spelling'
      ]
    ])('refuses a host-local file with %s rather than falling back', async (_name, content, error) => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await withLegacyLocals(box, sourceTable(canonical, backpackPath))
      await box.state.write('ki/locals.toml', content)

      const on = await box.run('ki dev local on')
      const bootstrap = await box.run('ki bootstrap')
      const diag = await box.run('ki diag --full')
      const doctor = await box.run('ki doctor')

      expect(on.exitCode).toBe(1)
      expect(on.output).toContain(`local backpack sources are invalid: `)
      expect(on.output).toContain(error)
      expect(bootstrap.exitCode).toBe(1)
      expect(diag.output).toContain(error)
      expect(doctor.exitCode).toBe(1)
      expect(doctor.output).toContain(error)
    })

    test('refuses a host-local path that is not a regular file', async () => {
      const box = await sandbox()
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await box.state.mkdir('ki/locals.toml')

      const on = await box.run('ki dev local on')

      expect(on.exitCode).toBe(1)
      expect(on.output).toContain(`${box.state.path}/ki/locals.toml must be a regular file`)
    })
  })

  describe('dev local off', () => {
    test('requires verified canonical archive bytes before restoring local development', async () => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')
      await enableLocal(box, backpackPath)

      const off = await box.run('ki dev local off knowledgeislands/ki-agent-backpack')

      expect(off.exitCode).toBe(1)
      expect(off.output).toContain('could not download configured backpack knowledgeislands/ki-agent-backpack')
    })

    test('preserves a recognised development projection when canonical restoration fails', async () => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')
      await enableLocal(box, backpackPath)
      box.setFetcher(async () => {
        throw new Error('offline')
      })

      const off = await box.run('ki dev local off')

      expect(off.exitCode).toBe(1)
      expect(off.output).toContain('could not download configured backpack knowledgeislands/ki-agent-backpack')
      expect((await lstat(`${box.data.path}/ki/backpacks/knowledgeislands/ki-agent-backpack`)).isSymbolicLink()).toBe(
        true
      )
    })

    test('keeps repeated local on and failed off transitions coherent', async () => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')
      await enableLocal(box, backpackPath)
      box.setFetcher(async () => {
        throw new Error('offline')
      })

      const firstOff = await box.run('ki dev local off')
      const secondOn = await box.run('ki dev local on')
      const secondOff = await box.run('ki dev local off')
      const doctor = await box.run('ki doctor')

      expect(firstOff.exitCode).toBe(1)
      expect(secondOn.exitCode).toBe(0)
      expect(secondOff.exitCode).toBe(1)
      expect(await realpath(`${box.home.path}/.claude/skills/ki-recap`)).toBe(
        `${backpackPath}/skills/change-management/ki-recap`
      )
      expect(doctor.exitCode).toBe(0)
      expect(doctor.output).not.toContain('✗')
    })

    test('restores the verified archive over a development link whose checkout is missing', async () => {
      const box = await sandbox()
      const skill = '---\nname: hnr-example\nki-depends-on: []\n---\n'
      const installed = 'ki/backpacks/humansnotrobots/hnr-agent-backpack'
      const checkout = 'dev/humansnotrobots/hnr-agent-backpack'
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await box.data.write(`${installed}/.ki.toml`, '[skills.ki-repo-backpack]\nprefix = "hnr"\n')
      await box.data.write(`${installed}/skills/hnr-example/SKILL.md`, skill)
      await Promise.all(['subagents', 'hooks'].map((payload) => box.data.mkdir(`${installed}/${payload}`)))
      await box.root.write(`${checkout}/.ki.toml`, '[skills.ki-repo-backpack]\nprefix = "hnr"\n')
      await box.root.write(`${checkout}/skills/hnr-example/SKILL.md`, skill)
      await Promise.all(['subagents', 'hooks'].map((payload) => box.root.mkdir(`${checkout}/${payload}`)))
      const local = await realpath(`${box.root.path}/${checkout}`)
      await box.run(`ki dev local set humansnotrobots/hnr-agent-backpack ${local}`)
      expect((await box.run('ki dev local on humansnotrobots/hnr-agent-backpack')).exitCode).toBe(0)
      const archive = makeBackpackArchive({ 'source/skills/hnr-example/SKILL.md': skill }, { backpackPrefix: 'hnr' })
      const configuration = await box.config.read('ki/config.toml')
      await box.config.write(
        'ki/config.toml',
        configuration.replace(
          '[backpacks]\n',
          `[backpacks]\nreleases = [{ id = "humansnotrobots/hnr-agent-backpack", url = "https://releases.example.test/hnr.tgz", sha256 = "${archive.sha256}" }]\n`
        )
      )
      box.setFetcher(async () => new Response(archive.payload))
      await rm(local, { recursive: true })

      const off = await box.run('ki dev local off humansnotrobots/hnr-agent-backpack')

      expect(off.exitCode).toBe(0)
      expect(await box.data.isSymlink(installed)).toBe(false)
      expect(await box.data.read(`${installed}/skills/hnr-example/SKILL.md`)).toBe(skill)
    })

    test('attempts canonical restoration when its development destination is already absent', async () => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')
      await enableLocal(box, backpackPath)
      await rm(`${box.data.path}/ki/backpacks/knowledgeislands/ki-agent-backpack`, { recursive: true })
      box.setFetcher(async () => {
        throw new Error('offline')
      })

      const off = await box.run('ki dev local off')

      expect(off.exitCode).toBe(1)
      expect(off.output).toContain('could not download configured backpack knowledgeislands/ki-agent-backpack')
    })
  })

  describe('guards', () => {
    test('refuses to switch before the environment is bootstrapped', async () => {
      const box = await sandbox()

      const off = await box.run('ki dev local off knowledgeislands/ki-agent-backpack')

      expect(off.exitCode).toBe(1)
      expect(off.output).toContain('run `ki bootstrap` first')
    })

    test('requires the local backpack to contain the canonical bootstrap skill', async () => {
      const box = await sandbox()
      const path = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
      await rm(`${path}/skills/keystone/ki-bootstrap`, { recursive: true })
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')

      const result = await box.run(`ki dev local set knowledgeislands/ki-agent-backpack ${path}`)

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('local backpack knowledgeislands/ki-agent-backpack does not provide ki-keystone')
    })

    test('refuses to replace an unfamiliar canonical development link', async () => {
      const box = await sandbox()
      const first = await box.setupLocalCanonicalBackpack('dev/first/knowledgeislands/ki-agent-backpack')
      const second = await box.setupLocalCanonicalBackpack('dev/second/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await enableLocal(box, first)

      const result = await box.run(`ki dev local set knowledgeislands/ki-agent-backpack ${second}`)

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('local development is active')
    })

    test('refuses a dangling canonical development root', async () => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await enableLocal(box, backpackPath)
      const link = `${box.data.path}/ki/backpacks/knowledgeislands/ki-agent-backpack`
      await unlink(link)
      await symlink(`${box.root.path}/missing-backpack`, link, 'dir')

      const result = await box.run('ki dev local on')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('root link is unfamiliar')
    })

    test('refuses a canonical root link that targets another local checkout', async () => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/current/knowledgeislands/ki-agent-backpack')
      const otherBackpackPath = await box.setupLocalCanonicalBackpack('dev/other/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await enableLocal(box, backpackPath)
      const link = `${box.data.path}/ki/backpacks/knowledgeislands/ki-agent-backpack`
      await unlink(link)
      await symlink(otherBackpackPath, link, 'dir')

      const result = await box.run('ki dev local on')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('root link is unfamiliar')
    })

    test('refuses a local checkout missing one of the required payload directories', async () => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await rm(`${backpackPath}/hooks`, { recursive: true })

      await box.run(`ki dev local set knowledgeislands/ki-agent-backpack ${backpackPath}`)
      const result = await box.run('ki dev local on')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('local backpack hooks directory must be a directory')
    })

    test('refuses an installed canonical directory with unrecognised state', async () => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await box.data.write('ki/backpacks/knowledgeislands/ki-agent-backpack/notes.txt', 'preserve me\n')
      await box.run(`ki dev local set knowledgeislands/ki-agent-backpack ${backpackPath}`)

      const result = await box.run('ki dev local on')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('has unrecognised state')
    })

    test.each([
      'metadata directory',
      'retired payload file',
      'payload file',
      'unfamiliar legacy payload link',
      'dangling legacy payload link'
    ])('refuses a physical installed root containing an unsafe %s', async (variant) => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/current/knowledgeislands/ki-agent-backpack')
      const otherBackpackPath = await box.setupLocalCanonicalBackpack('dev/other/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await box.run(`ki dev local set knowledgeislands/ki-agent-backpack ${backpackPath}`)
      const canonical = `${box.data.path}/ki/backpacks/knowledgeislands/ki-agent-backpack`
      if (variant === 'metadata directory') {
        await rm(`${canonical}/.ki.toml`)
        await box.data.mkdir('ki/backpacks/knowledgeislands/ki-agent-backpack/.ki.toml')
      }
      if (variant === 'retired payload file') {
        await rm(`${canonical}/subagents`, { recursive: true })
        await box.data.write('ki/backpacks/knowledgeislands/ki-agent-backpack/agents', 'unsafe\n')
      }
      if (variant === 'payload file') {
        await rm(`${canonical}/hooks`, { recursive: true })
        await box.data.write('ki/backpacks/knowledgeislands/ki-agent-backpack/hooks', 'unsafe\n')
      }
      if (variant === 'unfamiliar legacy payload link') {
        await rm(`${canonical}/hooks`, { recursive: true })
        await symlink(`${otherBackpackPath}/hooks`, `${canonical}/hooks`, 'dir')
      }
      if (variant === 'dangling legacy payload link') {
        await rm(`${canonical}/hooks`, { recursive: true })
        await symlink(`${box.root.path}/missing-hooks`, `${canonical}/hooks`, 'dir')
      }

      const result = await box.run('ki dev local on')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain(
        variant.endsWith('legacy payload link') ? 'hooks link is unfamiliar' : 'has unrecognised state'
      )
    })

    test('refuses activation when the installed backpack disappears after source selection', async () => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await box.run(`ki dev local set knowledgeislands/ki-agent-backpack ${backpackPath}`)
      await rm(`${box.data.path}/ki/backpacks/knowledgeislands/ki-agent-backpack`, { recursive: true })

      const result = await box.run('ki dev local on')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('installed backpack knowledgeislands/ki-agent-backpack must be a directory')
    })
  })

  describe('reporting', () => {
    test('requires a configured source before enabling local development', async () => {
      const box = await sandbox()

      const result = await box.run('ki dev local on')

      expect(result).toEqual({
        exitCode: 1,
        output: 'ki: error: ki environment is not bootstrapped; run `ki bootstrap` first\n'
      })
    })

    test('requires a configured source before disabling a bootstrapped environment', async () => {
      const box = await sandbox()
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')

      const result = await box.run('ki dev local off')

      expect(result).toEqual({
        exitCode: 1,
        output: 'ki: error: no local development source is configured; run ki dev local set <backpack-id> <path>\n'
      })
    })

    test('requires an explicitly selected backpack to have a configured source', async () => {
      const box = await sandbox()
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')

      const on = await box.run('ki dev local on knowledgeislands/ki-agent-backpack')
      const off = await box.run('ki dev local off knowledgeislands/ki-agent-backpack')

      expect(on.output).toContain('no local development source is configured for knowledgeislands/ki-agent-backpack')
      expect(off.output).toContain('no local development source is configured for knowledgeislands/ki-agent-backpack')
    })

    test('refuses an invalid local-source configuration before applying it to all backpacks', async () => {
      const box = await sandbox()
      await box.config.write(
        'ki/config.toml',
        'schema = 1\n\n[agents]\nids = []\n\n[backpacks]\nids = []\n\n[skills]\n\n[locals.invalid]\npath = "/somewhere"\n'
      )

      const result = await box.run('ki dev local on')

      expect(result.output).toContain('locals.invalid must name a backpack owner/name identifier')
    })

    test('dev on reports already-enabled when projections are already installed', async () => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')

      const result = await enableLocal(box, backpackPath)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('development backpack enabled')
      expect(result.output).toContain('installed')
    })

    test('preserves a recognised local backpack root when development is already enabled', async () => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await enableLocal(box, backpackPath)

      const result = await box.run('ki dev local on')

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('development backpack enabled')
      expect(await box.data.isSymlink('ki/backpacks/knowledgeislands/ki-agent-backpack')).toBe(true)
    })

    test('reconciles a stale managed user-skill link on repeated activation', async () => {
      const box = await sandbox()
      const backpackPath = await box.setupLocalCanonicalBackpack('dev/current/knowledgeislands/ki-agent-backpack')
      const stalePath = await box.setupLocalCanonicalBackpack('dev/stale/knowledgeislands/ki-agent-backpack')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await enableLocal(box, backpackPath)
      const link = `${box.home.path}/.agents/skills/ki-recap`
      await unlink(link)
      await symlink(`${stalePath}/skills/change-management/ki-recap`, link, 'dir')

      const result = await box.run('ki dev local on')

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('ki-recap for chatgpt-codex installed')
      expect(await realpath(link)).toBe(`${backpackPath}/skills/change-management/ki-recap`)
    })
  })
})
