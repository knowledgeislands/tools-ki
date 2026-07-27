import { mkdir, rm, symlink, unlink } from 'node:fs/promises'
import { join } from 'node:path'
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
canonical harness already installed\tarchive 021060d6ab1dc17300d1b54bfd7a504d5f80c117b9b670669e450c12ccebddf0
ki-bootstrap for chatgpt-codex installed
ki-delegate for chatgpt-codex installed
ki-next for chatgpt-codex installed
ki-plan for chatgpt-codex installed
ki-recap for chatgpt-codex installed
`
    })
    expect(repeated).toEqual({
      exitCode: 0,
      output: `canonical harness already installed\tarchive 021060d6ab1dc17300d1b54bfd7a504d5f80c117b9b670669e450c12ccebddf0
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
canonical harness already installed\tarchive 021060d6ab1dc17300d1b54bfd7a504d5f80c117b9b670669e450c12ccebddf0
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

  test('rejects an existing configuration file that is not valid TOML', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    await box.config.write('ki/config.toml', 'schema = 1\n[agents\n')

    const bootstrapped = await box.run('ki bootstrap')

    expect(bootstrapped.exitCode).toBe(1)
    expect(bootstrapped.output).toContain('agent configuration must be valid TOML')
  })

  test('rejects an existing configuration whose agents.ids is not a string array', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    await box.config.write(
      'ki/config.toml',
      `schema = 1

[agents]
ids = ["chatgpt-codex", 5]
`
    )

    const bootstrapped = await box.run('ki bootstrap')

    expect(bootstrapped.exitCode).toBe(1)
    expect(bootstrapped.output).toContain('ki configuration must declare an agents.ids string array and an optional local.path')
  })

  test('rejects duplicate configured agents', async () => {
    const box = await sandbox()
    await box.config.write(
      'ki/config.toml',
      `schema = 1

[agents]
ids = ["claude-code", "claude-code"]
`
    )

    const bootstrapped = await box.run('ki bootstrap')

    expect(bootstrapped).toEqual({ exitCode: 1, output: 'ki: error: agent configuration repeats an agent\n' })
  })

  test('rejects a configuration file that is a directory', async () => {
    const box = await sandbox()
    await box.config.mkdir('ki/config.toml')

    const bootstrapped = await box.run('ki bootstrap')

    expect(bootstrapped).toEqual({ exitCode: 1, output: 'ki: error: agent configuration must be a regular file\n' })
  })

  test('rejects a non-table agents or local section', async () => {
    const agentSection = await sandbox()
    await agentSection.config.write(
      'ki/config.toml',
      `schema = 1
agents = "not-a-table"
`
    )
    const localSection = await sandbox()
    await localSection.config.write(
      'ki/config.toml',
      `schema = 1
local = "not-a-table"

[agents]
ids = ["claude-code"]
`
    )

    const rejectedAgents = await agentSection.run('ki bootstrap')
    const rejectedLocal = await localSection.run('ki bootstrap')

    expect(rejectedAgents).toEqual({
      exitCode: 1,
      output: 'ki: error: ki configuration must declare an agents.ids string array and an optional local.path\n'
    })
    expect(rejectedLocal).toEqual({
      exitCode: 1,
      output: 'ki: error: ki configuration must declare an agents.ids string array and an optional local.path\n'
    })
  })

  test('rejects a configuration location whose parent is not a directory', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.config.write('ki', 'not a directory')

    const bootstrapped = await box.run('ki bootstrap')

    expect(bootstrapped).toEqual({ exitCode: 1, output: 'ki: error: ki configuration directory must be a directory\n' })
  })

  test('detects both physical agent homes when creating configuration', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.setupAgentHome('chatgpt-codex')

    const bootstrapped = await box.run('ki bootstrap')

    expect(bootstrapped.exitCode).toBe(0)
    expect(bootstrapped.output).toContain('created KI agent configuration for claude-code, chatgpt-codex')
  })

  test('uses a configured agent’s repository skill path when linking a repository skill', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.setupExampleHarness()
    await box.project.write('.ki-config.toml', '[ki-repo]\nsupported_runtimes = ["claude-code"]\n')
    await box.run('ki bootstrap')

    const added = await box.run(`ki skill repo add ki-example --repo ${box.project.path}`)

    expect(added.exitCode).toBe(0)
    expect(added.output).toContain('ki skill repo add: linked ki-example into ')
    expect(added.output).toContain(' for claude-code\n')
    expect(await box.project.isSymlink('.claude/skills/ki-example')).toBe(true)
  })

  test('reports an empty detected inventory when creating and refreshing configuration', async () => {
    const box = await sandbox()
    await box.setupCanonicalHarness()

    const created = await box.run('ki bootstrap')
    const refreshed = await box.run('ki bootstrap --refresh')

    expect(created.output).toContain('created KI agent configuration for no detected agents')
    expect(refreshed.output).toContain('refreshed KI agents: none')
  })

  test('refuses an installed canonical harness missing a required bootstrap skill', async () => {
    const box = await sandbox()
    await box.setupCanonicalHarness()
    await rm(`${box.data.path}/ki/harnesses/knowledgeislands/ki-agentic-harness/skills/process/ki-recap`, { recursive: true })

    const bootstrapped = await box.run('ki bootstrap')

    expect(bootstrapped).toEqual({
      exitCode: 1,
      output:
        'created KI agent configuration for no detected agents\ncanonical harness already installed\tarchive 021060d6ab1dc17300d1b54bfd7a504d5f80c117b9b670669e450c12ccebddf0\nki: error: installed harness knowledgeislands/ki-agentic-harness does not provide ki-recap\n'
    })
  })

  test('refresh ignores a dangling managed link and a non-link skill entry', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.setupExampleHarness()
    await box.run('ki bootstrap')
    await box.run('ki skill user add ki-example')
    const skillDirectory = join(box.home.path, '.claude', 'skills')
    const target = join(skillDirectory, 'ki-example')
    await unlink(target)
    await symlink(join(box.root.path, 'missing-skill'), target, 'dir')
    await mkdir(join(skillDirectory, 'notes'))

    const refreshed = await box.run('ki bootstrap --refresh')
    const config = await box.config.read('ki/config.toml')

    expect(refreshed.exitCode).toBe(0)
    expect(refreshed.output).toContain('refreshed ki configuration: 1 agents, 2 harnesses, 5 skills')
    expect(config).not.toContain('[skills.ki-example]')
  })
})
