import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

describe('[ki dev]', () => {
  describe('dev on', () => {
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
  })

  describe('dev off', () => {
    test('restores the verified canonical harness and re-projects skills', async () => {
      const box = await sandbox()
      await box.setupAgentHome('claude-code')
      await box.run('ki bootstrap')

      const off = await box.run('ki dev off')

      expect(off).toEqual({
        exitCode: 0,
        output: `development harness disabled; canonical harness already installed\tarchive fff4d3f0b13b6efcde064c5f8278fc58289b6ed6ae8cbc5ae0b18c7fd0bec68c
refreshed ki configuration: 1 agents, 1 harnesses, 5 skills
ki-bootstrap for claude-code already installed
ki-delegate for claude-code already installed
ki-next for claude-code already installed
ki-plan for claude-code already installed
ki-recap for claude-code already installed
`
      })
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
  })
})
