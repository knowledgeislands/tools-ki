import { lstat, readlink, realpath, rename, rm, symlink, unlink } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from '../_cli_helper.ts'

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
path = ${JSON.stringify(harnessPath)}
`
      expect(dataIsSymlink).toBe(true)
      expect(homeIsSymlink).toBe(true)
      expect(await readlink(`${box.home.path}/.agents/skills/ki-bootstrap`)).toBe(`${harnessPath}/skills/keystone/ki-bootstrap`)
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
        output: `development harness disabled; canonical harness already installed\tarchive 72d000a750d6cb505928d08704868e5b5852c03b86a997dc9a05039603997793
refreshed ki configuration: 1 agents, 1 harnesses, 7 skills
ki-bootstrap for claude-code already installed
ki-next for claude-code already installed
ki-plan for claude-code already installed
ki-implement for claude-code already installed
ki-accept for claude-code already installed
ki-batch for claude-code already installed
ki-recap for claude-code already installed
`
      })
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
      expect((await lstat(`${box.data.path}/ki/harnesses/knowledgeislands/ki-agentic-harness/skills`)).isSymbolicLink()).toBe(true)
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
      expect(await realpath(`${box.home.path}/.claude/skills/ki-recap`)).toBe(`${harnessPath}/skills/change-management/ki-recap`)
      expect(doctor.exitCode).toBe(0)
      expect(doctor.output).not.toContain('✗')
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
      expect(result.output).toContain('local harness does not provide ki-bootstrap')
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
      await symlink(`${stalePath}/skills/change-management/ki-recap`, link, 'dir')

      const result = await box.run('ki dev local on')

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('ki-recap for chatgpt-codex installed')
      expect(await realpath(link)).toBe(`${harnessPath}/skills/change-management/ki-recap`)
    })
  })
})
