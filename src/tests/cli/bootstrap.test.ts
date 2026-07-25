import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

describe('[ki bootstrap]', () => {
  test('bootstraps without replacement and refreshes the detected installed inventory on request', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')

    const bootstrapped = await box.run('ki bootstrap')
    const repeated = await box.run('ki bootstrap')
    const refreshed = await box.run('ki bootstrap --refresh')
    const checked = await box.run('ki doctor')

    expect(bootstrapped).toEqual({
      exitCode: 0,
      output: `created KI agent configuration for chatgpt-codex
canonical harness already installed\tarchive fff4d3f0b13b6efcde064c5f8278fc58289b6ed6ae8cbc5ae0b18c7fd0bec68c
ki-bootstrap for chatgpt-codex installed
ki-delegate for chatgpt-codex installed
ki-next for chatgpt-codex installed
ki-plan for chatgpt-codex installed
ki-recap for chatgpt-codex installed
`
    })
    expect(repeated).toEqual({
      exitCode: 0,
      output: `canonical harness already installed\tarchive fff4d3f0b13b6efcde064c5f8278fc58289b6ed6ae8cbc5ae0b18c7fd0bec68c
ki-bootstrap for chatgpt-codex already installed
ki-delegate for chatgpt-codex already installed
ki-next for chatgpt-codex already installed
ki-plan for chatgpt-codex already installed
ki-recap for chatgpt-codex already installed
`
    })
    expect(refreshed).toEqual({
      exitCode: 0,
      output: `refreshed KI agents: chatgpt-codex
canonical harness already installed\tarchive fff4d3f0b13b6efcde064c5f8278fc58289b6ed6ae8cbc5ae0b18c7fd0bec68c
refreshed ki configuration: 1 agents, 1 harnesses, 5 skills
ki-bootstrap for chatgpt-codex already installed
ki-delegate for chatgpt-codex already installed
ki-next for chatgpt-codex already installed
ki-plan for chatgpt-codex already installed
ki-recap for chatgpt-codex already installed
`
    })
    expect(checked.output).toContain('✓ Configuration:')
    expect(checked.output).toContain('✓ Harness inventory: 1 installed')
    expect(checked.output).toContain('✓ Agent chatgpt-codex: ready')
    expect(checked.output).not.toContain('✗')
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
`
    expect(config).toBe(expectedConfig)
  })

  test('replaces a legacy flat configuration with the current sectioned schema on refresh', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    const legacyConfig = `schema = 1
agents = ["chatgpt-codex"]
harnesses = []
skills = []
`
    await box.config.write('ki/config.toml', legacyConfig)
    await box.setupCanonicalHarness()

    const refreshed = await box.run('ki bootstrap --refresh')
    const config = await box.config.read('ki/config.toml')
    const expectedAgentsSection = `[agents]
ids = [
  "chatgpt-codex",
]`

    expect(refreshed.exitCode).toBe(0)
    expect(config).toContain(expectedAgentsSection)
  })
})
