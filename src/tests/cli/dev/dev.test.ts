import { lstat, readlink, realpath, rename, rm, symlink, unlink } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { makeHarnessArchive } from '../_archive_helper.ts'
import { type Sandbox, sandbox } from '../_cli_helper.ts'

const enableLocal = async (box: Sandbox, harnessPath: string) => {
  expect(await box.run(`ki dev local set knowledgeislands/ki-agentic-harness ${harnessPath}`)).toEqual({
    exitCode: 0,
    output: `development harness set knowledgeislands/ki-agentic-harness\t${harnessPath}\nconfigured 1 agents\n`
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
    test('requires the selected harness to exist in the installed estate', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')
      await rm(`${box.data.path}/ki/harnesses/knowledgeislands/ki-agentic-harness`, { recursive: true })

      const result = await box.run(`ki dev local set knowledgeislands/ki-agentic-harness ${harnessPath}`)

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('installed harness knowledgeislands/ki-agentic-harness must be a directory')
    })

    test('switches the canonical harness to a local development checkout', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('chatgpt-codex')

      await box.run('ki bootstrap')
      const result = await enableLocal(box, harnessPath)

      expect(result).toEqual({
        exitCode: 0,
        output: `development harness enabled knowledgeislands/ki-agentic-harness\t${harnessPath}
refreshed ki configuration: 1 agents, 1 harnesses, 7 skills
ki-bootstrap for chatgpt-codex installed
ki-next for chatgpt-codex installed
ki-plan for chatgpt-codex installed
ki-implement for chatgpt-codex installed
ki-accept for chatgpt-codex installed
ki-batch for chatgpt-codex installed
ki-recap for chatgpt-codex installed
`
      })
      const dataIsSymlink = await box.data.isSymlink('ki/harnesses/knowledgeislands/ki-agentic-harness/skills')
      const homeIsSymlink = await box.home.isSymlink('.agents/skills/ki-bootstrap')
      const config = await box.config.read('ki/config.toml')
      const expectedConfig = `schema = 1

[agents]
ids = [
  "chatgpt-codex",
]

[harnesses]
ids = [
  "knowledgeislands/ki-agentic-harness",
]

[skills]

[skills.ki-accept]
harness = "knowledgeislands/ki-agentic-harness"

[skills.ki-batch]
harness = "knowledgeislands/ki-agentic-harness"

[skills.ki-bootstrap]
harness = "knowledgeislands/ki-agentic-harness"

[skills.ki-implement]
harness = "knowledgeislands/ki-agentic-harness"

[skills.ki-next]
harness = "knowledgeislands/ki-agentic-harness"

[skills.ki-plan]
harness = "knowledgeislands/ki-agentic-harness"

[skills.ki-recap]
harness = "knowledgeislands/ki-agentic-harness"

[local]
harness = "knowledgeislands/ki-agentic-harness"
path = ${JSON.stringify(harnessPath)}
`
      expect(dataIsSymlink).toBe(true)
      expect(homeIsSymlink).toBe(true)
      expect(await readlink(`${box.home.path}/.agents/skills/ki-bootstrap`)).toBe(
        `${harnessPath}/skills/keystone/ki-bootstrap`
      )
      expect(await realpath(`${box.home.path}/.agents/skills/ki-bootstrap`)).toBe(
        `${harnessPath}/skills/keystone/ki-bootstrap`
      )
      expect(config).toBe(expectedConfig)
    })

    test('remembers a local source without activating it', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')

      const set = await box.run(`ki dev local set knowledgeislands/ki-agentic-harness ${harnessPath}`)

      expect(set.exitCode).toBe(0)
      expect(await box.data.isSymlink('ki/harnesses/knowledgeislands/ki-agentic-harness/skills')).toBe(false)
      expect(await realpath(`${box.home.path}/.claude/skills/ki-bootstrap`)).toBe(
        await realpath(`${box.data.path}/ki/harnesses/knowledgeislands/ki-agentic-harness/skills/keystone/ki-bootstrap`)
      )
      expect(await box.config.read('ki/config.toml')).toContain(
        `[local]\nharness = "knowledgeislands/ki-agentic-harness"\npath = ${JSON.stringify(harnessPath)}\n`
      )
    })

    test('migrates the recognised retired agents payload while switching to a local checkout', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      const canonical = `${box.data.path}/ki/harnesses/knowledgeislands/ki-agentic-harness`
      await rename(`${canonical}/subagents`, `${canonical}/agents`)

      const result = await enableLocal(box, harnessPath)

      expect(result.exitCode).toBe(0)
      expect(await box.data.isSymlink('ki/harnesses/knowledgeislands/ki-agentic-harness/subagents')).toBe(true)
      await expect(lstat(`${canonical}/agents`)).rejects.toThrow()
    })

    test('switches one non-canonical installed harness without changing its neighbours', async () => {
      const box = await sandbox()
      const skill = '---\nname: hnr-example\nki-depends-on: []\n---\n'
      const installed = 'ki/harnesses/humansnotrobots/hnr-agentic-harness'
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await box.data.write(`${installed}/skills/hnr-example/SKILL.md`, skill)
      await Promise.all(['subagents', 'hooks'].map((payload) => box.data.mkdir(`${installed}/${payload}`)))
      await box.run('ki bootstrap --refresh')
      await box.run('ki skill add hnr-example')
      const local = await box.root.mkdir('dev/humansnotrobots/hnr-agentic-harness')
      await box.root.write('dev/humansnotrobots/hnr-agentic-harness/skills/hnr-example/SKILL.md', skill)
      await Promise.all(
        ['subagents', 'hooks'].map((payload) => box.root.mkdir(`dev/humansnotrobots/hnr-agentic-harness/${payload}`))
      )

      const set = await box.run(`ki dev local set humansnotrobots/hnr-agentic-harness ${local}`)
      const on = await box.run('ki dev local on')

      expect(set.exitCode).toBe(0)
      expect(on.exitCode).toBe(0)
      expect(await box.data.isSymlink(`${installed}/skills`)).toBe(true)
      expect(await box.data.isSymlink('ki/harnesses/knowledgeislands/ki-agentic-harness/skills')).toBe(false)
      expect(await realpath(`${box.home.path}/.agents/skills/hnr-example`)).toBe(`${local}/skills/hnr-example`)

      const archive = makeHarnessArchive({ 'source/skills/hnr-example/SKILL.md': skill })
      const configuration = await box.config.read('ki/config.toml')
      await box.config.write(
        'ki/config.toml',
        configuration.replace(
          '[harnesses]\n',
          `[harnesses]\nreleases = [{ id = "humansnotrobots/hnr-agentic-harness", url = "https://releases.example.test/hnr.tgz", sha256 = "${archive.sha256}" }]\n`
        )
      )
      box.setFetcher(async () => new Response(archive.payload))

      const update = await box.run('ki manage update')
      const uninstall = await box.run('ki harness uninstall humansnotrobots/hnr-agentic-harness')

      expect(update.exitCode).toBe(1)
      expect(update.output).toContain(
        'harness humansnotrobots/hnr-agentic-harness is development-linked; run ki dev local off before replacing it'
      )
      expect(uninstall.exitCode).toBe(1)
      expect(uninstall.output).toContain(
        'harness humansnotrobots/hnr-agentic-harness is development-linked; run ki dev local off before uninstalling'
      )

      const off = await box.run('ki dev local off')

      expect(off.exitCode).toBe(0)
      expect(await box.data.isSymlink(`${installed}/skills`)).toBe(false)
      expect(await realpath(`${box.home.path}/.agents/skills/hnr-example`)).toBe(
        await realpath(`${box.data.path}/${installed}/skills/hnr-example`)
      )
    })
  })

  describe('dev local off', () => {
    test('requires verified canonical archive bytes before restoring local development', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')
      await enableLocal(box, harnessPath)

      const off = await box.run('ki dev local off')

      expect(off.exitCode).toBe(1)
      expect(off.output).toContain('could not download configured harness knowledgeislands/ki-agentic-harness')
    })

    test('preserves a recognised development projection when canonical restoration fails', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')
      await enableLocal(box, harnessPath)
      box.setFetcher(async () => {
        throw new Error('offline')
      })

      const off = await box.run('ki dev local off')

      expect(off.exitCode).toBe(1)
      expect(off.output).toContain('could not download configured harness knowledgeislands/ki-agentic-harness')
      expect(
        (await lstat(`${box.data.path}/ki/harnesses/knowledgeislands/ki-agentic-harness/skills`)).isSymbolicLink()
      ).toBe(true)
    })

    test('keeps repeated local on and failed off transitions coherent', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')
      await enableLocal(box, harnessPath)
      box.setFetcher(async () => {
        throw new Error('offline')
      })

      const firstOff = await box.run('ki dev local off')
      const secondOn = await box.run('ki dev local on')
      const secondOff = await box.run('ki dev local off')
      const doctor = await box.run('ki manage doctor')

      expect(firstOff.exitCode).toBe(1)
      expect(secondOn.exitCode).toBe(0)
      expect(secondOff.exitCode).toBe(1)
      expect(await realpath(`${box.home.path}/.claude/skills/ki-recap`)).toBe(
        `${harnessPath}/skills/change-management/ki-recap`
      )
      expect(doctor.exitCode).toBe(0)
      expect(doctor.output).not.toContain('✗')
    })

    test('attempts canonical restoration when its development destination is already absent', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')
      await enableLocal(box, harnessPath)
      await rm(`${box.data.path}/ki/harnesses/knowledgeislands/ki-agentic-harness`, { recursive: true })
      box.setFetcher(async () => {
        throw new Error('offline')
      })

      const off = await box.run('ki dev local off')

      expect(off.exitCode).toBe(1)
      expect(off.output).toContain('could not download configured harness knowledgeislands/ki-agentic-harness')
    })
  })

  describe('guards', () => {
    test('refuses to switch before the environment is bootstrapped', async () => {
      const box = await sandbox()

      const off = await box.run('ki dev local off')

      expect(off.exitCode).toBe(1)
      expect(off.output).toContain('run `ki bootstrap` first')
    })

    test('requires the local harness to contain the canonical bootstrap skill', async () => {
      const box = await sandbox()
      const path = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await rm(`${path}/skills/keystone/ki-bootstrap`, { recursive: true })
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')

      const result = await box.run(`ki dev local set knowledgeislands/ki-agentic-harness ${path}`)

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('local harness knowledgeislands/ki-agentic-harness does not provide ki-bootstrap')
    })

    test('refuses to replace an unfamiliar canonical development link', async () => {
      const box = await sandbox()
      const first = await box.setupLocalCanonicalHarness('dev/first/knowledgeislands/ki-agentic-harness')
      const second = await box.setupLocalCanonicalHarness('dev/second/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await enableLocal(box, first)

      const result = await box.run(`ki dev local set knowledgeislands/ki-agentic-harness ${second}`)

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('local development is active')
    })

    test('refuses a dangling canonical development link', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await enableLocal(box, harnessPath)
      const link = `${box.data.path}/ki/harnesses/knowledgeislands/ki-agentic-harness/hooks`
      await unlink(link)
      await symlink(`${box.root.path}/missing-hooks`, link, 'dir')

      const result = await box.run('ki dev local on')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('hooks link is unfamiliar')
    })

    test('refuses a canonical payload link that targets another local checkout', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/current/knowledgeislands/ki-agentic-harness')
      const otherHarnessPath = await box.setupLocalCanonicalHarness('dev/other/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await enableLocal(box, harnessPath)
      const link = `${box.data.path}/ki/harnesses/knowledgeislands/ki-agentic-harness/hooks`
      await unlink(link)
      await symlink(`${otherHarnessPath}/hooks`, link, 'dir')

      const result = await box.run('ki dev local on')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('hooks link is unfamiliar')
    })

    test('refuses a local checkout missing one of the required payload directories', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await rm(`${harnessPath}/hooks`, { recursive: true })

      await box.run(`ki dev local set knowledgeislands/ki-agentic-harness ${harnessPath}`)
      const result = await box.run('ki dev local on')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('local harness hooks directory must be a directory')
    })

    test('refuses an installed canonical directory with unrecognised state', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await box.data.write('ki/harnesses/knowledgeislands/ki-agentic-harness/notes.txt', 'preserve me\n')
      await box.run(`ki dev local set knowledgeislands/ki-agentic-harness ${harnessPath}`)

      const result = await box.run('ki dev local on')

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('has unrecognised state')
    })
  })

  describe('reporting', () => {
    test('requires a configured source before enabling local development', async () => {
      const box = await sandbox()

      const result = await box.run('ki dev local on')

      expect(result).toEqual({
        exitCode: 1,
        output: 'ki: error: no local development source is configured; run ki dev local set <harness-id> <path>\n'
      })
    })

    test('requires a configured source before disabling a bootstrapped environment', async () => {
      const box = await sandbox()
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')

      const result = await box.run('ki dev local off')

      expect(result).toEqual({
        exitCode: 1,
        output: 'ki: error: no local development source is configured; run ki dev local set <harness-id> <path>\n'
      })
    })

    test('dev on reports already-enabled when projections are already installed', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')

      const result = await enableLocal(box, harnessPath)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('development harness enabled')
      expect(result.output).toContain('installed')
    })

    test('preserves recognised local payload links when development is already enabled', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await enableLocal(box, harnessPath)

      const result = await box.run('ki dev local on')

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('development harness enabled')
      expect(await box.data.isSymlink('ki/harnesses/knowledgeislands/ki-agentic-harness/skills')).toBe(true)
    })

    test('reconciles a stale managed user-skill link on repeated activation', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/current/knowledgeislands/ki-agentic-harness')
      const stalePath = await box.setupLocalCanonicalHarness('dev/stale/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await enableLocal(box, harnessPath)
      const link = `${box.home.path}/.agents/skills/ki-recap`
      await unlink(link)
      await symlink(`${stalePath}/skills/change-management/ki-recap`, link, 'dir')

      const result = await box.run('ki dev local on')

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('ki-recap for chatgpt-codex installed')
      expect(await realpath(link)).toBe(`${harnessPath}/skills/change-management/ki-recap`)
    })
  })
})
