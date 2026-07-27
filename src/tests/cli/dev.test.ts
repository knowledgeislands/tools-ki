import { lstat, rename, rm, symlink, unlink } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

describe('[ki dev]', () => {
  describe('dev on', () => {
    test('initialises a development projection when its canonical harness directory is absent', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')
      await rm(`${box.data.path}/ki/harnesses/knowledgeislands/ki-agentic-harness`, { recursive: true })

      const result = await box.run(`ki dev on ${harnessPath}`)

      expect(result.exitCode).toBe(0)
      expect(await box.data.isSymlink('ki/harnesses/knowledgeislands/ki-agentic-harness/skills')).toBe(true)
    })

    test('switches the canonical harness to a local development checkout', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('chatgpt-codex')

      await box.run('ki bootstrap')
      const result = await box.run(`ki dev on ${harnessPath}`)

      expect(result).toEqual({
        exitCode: 0,
        output: `development harness enabled ${harnessPath}
refreshed ki configuration: 1 agents, 1 harnesses, 5 skills
ki-bootstrap for chatgpt-codex already installed
ki-delegate for chatgpt-codex already installed
ki-next for chatgpt-codex already installed
ki-plan for chatgpt-codex already installed
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

[skills.ki-bootstrap]
harness = "knowledgeislands/ki-agentic-harness"

[skills.ki-delegate]
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
      expect(config).toBe(expectedConfig)
    })

    test('migrates the recognised retired agents payload while switching to a local checkout', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      const canonical = `${box.data.path}/ki/harnesses/knowledgeislands/ki-agentic-harness`
      await rename(`${canonical}/subagents`, `${canonical}/agents`)

      const result = await box.run(`ki dev on ${harnessPath}`)

      expect(result.exitCode).toBe(0)
      expect(await box.data.isSymlink('ki/harnesses/knowledgeislands/ki-agentic-harness/subagents')).toBe(true)
      await expect(lstat(`${canonical}/agents`)).rejects.toThrow()
    })
  })

  describe('dev off', () => {
    test('restores the verified canonical harness and re-projects skills', async () => {
      const box = await sandbox()
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')

      const off = await box.run('ki dev off')

      expect(off).toEqual({
        exitCode: 0,
        output: `development harness disabled; canonical harness already installed\tarchive 333f1711db0d57c26ec3566ca9cbc732d2478a05161c4fb8639ff6e2ffb75235
refreshed ki configuration: 1 agents, 1 harnesses, 5 skills
ki-bootstrap for claude-code already installed
ki-delegate for claude-code already installed
ki-next for claude-code already installed
ki-plan for claude-code already installed
ki-recap for claude-code already installed
`
      })
    })

    test('removes a recognised development projection before attempting canonical restoration', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')
      await box.run(`ki dev on ${harnessPath}`)
      box.setFetcher(async () => {
        throw new Error('offline')
      })

      const off = await box.run('ki dev off')

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

      const off = await box.run('ki dev off')

      expect(off.exitCode).toBe(1)
      expect(off.output).toContain('could not download configured harness knowledgeislands/ki-agentic-harness')
    })
  })

  describe('guards', () => {
    test('refuses to switch before the environment is bootstrapped', async () => {
      const box = await sandbox()

      const off = await box.run('ki dev off')

      expect(off.exitCode).toBe(1)
      expect(off.output).toContain('run `ki bootstrap` first')
    })

    test('requires the local harness to contain the canonical bootstrap skill', async () => {
      const box = await sandbox()
      const path = await box.root.mkdir('dev/knowledgeislands/ki-agentic-harness/skills/process/ki-other')

      const result = await box.run(`ki dev on ${path}`)

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('skills/keystone/ki-bootstrap/SKILL.md')
    })

    test('refuses to replace an unfamiliar canonical development link', async () => {
      const box = await sandbox()
      const first = await box.setupLocalCanonicalHarness('dev/first/knowledgeislands/ki-agentic-harness')
      const second = await box.setupLocalCanonicalHarness('dev/second/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await box.run(`ki dev on ${first}`)

      const result = await box.run(`ki dev on ${second}`)

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('skills link is unfamiliar')
    })

    test('refuses a dangling canonical development link', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await box.run(`ki dev on ${harnessPath}`)
      const link = `${box.data.path}/ki/harnesses/knowledgeislands/ki-agentic-harness/hooks`
      await unlink(link)
      await symlink(`${box.root.path}/missing-hooks`, link, 'dir')

      const result = await box.run(`ki dev on ${harnessPath}`)

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('hooks link is unfamiliar')
    })

    test('refuses a local checkout missing one of the required payload directories', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await rm(`${harnessPath}/hooks`, { recursive: true })

      const result = await box.run(`ki dev on ${harnessPath}`)

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('local harness hooks directory must be a directory')
    })

    test('refuses an installed canonical directory with unrecognised state', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await box.data.write('ki/harnesses/knowledgeislands/ki-agentic-harness/notes.txt', 'preserve me\n')

      const result = await box.run(`ki dev on ${harnessPath}`)

      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('has unrecognised state')
    })
  })

  describe('reporting', () => {
    test('dev on reports already-enabled when projections are already installed', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')

      const result = await box.run(`ki dev on ${harnessPath}`)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('development harness enabled')
      expect(result.output).toContain('already installed')
    })

    test('preserves recognised local payload links when development is already enabled', async () => {
      const box = await sandbox()
      const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
      await box.setupAgentHome('chatgpt-codex')
      await box.run('ki bootstrap')
      await box.run(`ki dev on ${harnessPath}`)

      const result = await box.run(`ki dev on ${harnessPath}`)

      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('development harness enabled')
      expect(await box.data.isSymlink('ki/harnesses/knowledgeislands/ki-agentic-harness/skills')).toBe(true)
    })
  })
})
