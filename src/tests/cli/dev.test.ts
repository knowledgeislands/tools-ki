import { lstat, realpath, rename, rm, symlink, unlink } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from './_cli_helper.ts'

const enableLocal = async (box: Sandbox, harnessPath: string) => {
  expect(await box.run(`ki dev local set ${harnessPath}`)).toEqual({
    exitCode: 0,
    output: `development harness set ${harnessPath}\nconfigured 1 agents\n`
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
    test('initialises a development projection when its canonical harness directory is absent', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')
      await rm(`${box.data.path}/ki/harnesses/knowledgeislands/ki-agentic-harness`, { recursive: true })

      const result = await enableLocal(box, harnessPath)

      expect(result.exitCode).toBe(0)
      expect(await box.data.isSymlink('ki/harnesses/knowledgeislands/ki-agentic-harness/skills')).toBe(true)
    })

    test('switches the canonical harness to a local development checkout', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('chatgpt-codex')

      await box.run('ki bootstrap')
      const result = await enableLocal(box, harnessPath)

      expect(result).toEqual({
        exitCode: 0,
        output: `development harness enabled ${harnessPath}
refreshed ki configuration: 1 agents, 1 harnesses, 8 skills
ki-bootstrap for chatgpt-codex already installed
ki-delegate for chatgpt-codex already installed
ki-next for chatgpt-codex already installed
ki-plan for chatgpt-codex already installed
ki-implement for chatgpt-codex already installed
ki-accept for chatgpt-codex already installed
ki-batch for chatgpt-codex already installed
ki-recap for chatgpt-codex already installed
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

[skills.ki-delegate]
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
path = ${JSON.stringify(harnessPath)}
`
      expect(dataIsSymlink).toBe(true)
      expect(homeIsSymlink).toBe(true)
      expect(await realpath(`${box.home.path}/.agents/skills/ki-bootstrap`)).toBe(`${harnessPath}/skills/keystone/ki-bootstrap`)
      expect(config).toBe(expectedConfig)
    })

    test('remembers a local source without activating it', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')

      const set = await box.run(`ki dev local set ${harnessPath}`)

      expect(set.exitCode).toBe(0)
      expect(await box.data.isSymlink('ki/harnesses/knowledgeislands/ki-agentic-harness/skills')).toBe(false)
      expect(await realpath(`${box.home.path}/.claude/skills/ki-bootstrap`)).toBe(
        await realpath(`${box.data.path}/ki/harnesses/knowledgeislands/ki-agentic-harness/skills/keystone/ki-bootstrap`)
      )
      expect(await box.config.read('ki/config.toml')).toContain(`[local]\npath = ${JSON.stringify(harnessPath)}\n`)
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
  })

  describe('dev local off', () => {
    test('restores the verified canonical harness and re-projects skills', async () => {
      const box = await sandbox()
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')

      const off = await box.run('ki dev local off')

      expect(off).toEqual({
        exitCode: 0,
        output: `development harness disabled; canonical harness already installed\tarchive 021060d6ab1dc17300d1b54bfd7a504d5f80c117b9b670669e450c12ccebddf0
refreshed ki configuration: 1 agents, 1 harnesses, 8 skills
ki-bootstrap for claude-code already installed
ki-delegate for claude-code already installed
ki-next for claude-code already installed
ki-plan for claude-code already installed
ki-implement for claude-code already installed
ki-accept for claude-code already installed
ki-batch for claude-code already installed
ki-recap for claude-code already installed
`
      })
    })

    test('removes a recognised development projection before attempting canonical restoration', async () => {
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
      await expect(lstat(`${box.data.path}/ki/harnesses/knowledgeislands/ki-agentic-harness`)).rejects.toThrow()
    })

    test('attempts canonical restoration when its development destination is already absent', async () => {
      const box = await sandbox()
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')
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
      const path = await box.root.mkdir('dev/knowledgeislands/ki-agentic-harness/skills/process/ki-other')

      const result = await box.run(`ki dev local set ${path}`)

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('skills/keystone/ki-bootstrap/SKILL.md')
    })

    test('refuses to replace an unfamiliar canonical development link', async () => {
      const box = await sandbox()
      const first = await box.setupLocalCanonicalHarness('dev/first/knowledgeislands/ki-agentic-harness')
      const second = await box.setupLocalCanonicalHarness('dev/second/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await enableLocal(box, first)

      const result = await box.run(`ki dev local set ${second}`)

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

    test('refuses a local checkout missing one of the required payload directories', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await rm(`${harnessPath}/hooks`, { recursive: true })

      await box.run(`ki dev local set ${harnessPath}`)
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
      await box.run(`ki dev local set ${harnessPath}`)

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
        output: 'ki: error: no local development source is configured; run ki dev local set <path>\n'
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
      await symlink(`${stalePath}/skills/process/ki-recap`, link, 'dir')

      const result = await box.run('ki dev local on')

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('ki-recap for chatgpt-codex installed')
      expect(await realpath(link)).toBe(`${harnessPath}/skills/process/ki-recap`)
    })
  })
})
