import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

describe('[ki doctor]', () => {
  test('reports missing configuration in human form', async () => {
    const box = await sandbox()
    const doctor = await box.run('ki doctor')

    expect(doctor.output).toContain('ki doctor\n  ✗ Configuration: missing; run ki bootstrap')
    expect(doctor.exitCode).toBe(0)
  })

  test('reports broken environment with invalid config and missing harness', async () => {
    const box = await sandbox()
    const invalidConfig = `schema = 2
[agents]
ids = ["claude-code"]

[harnesses]
ids = ["nonexistent/harness"]
`
    await box.config.write('ki/config.toml', invalidConfig)

    const doctor = await box.run('ki doctor')

    expect(doctor.output).toContain('✗ Configuration')
    expect(doctor.output).toContain('✗ Harness inventory')
    expect(doctor.exitCode).toBe(0)
  })

  test('reports missing user skills when agent home is not a physical directory', async () => {
    const box = await sandbox()
    // Write a valid config but don't create the agent home directory
    await box.config.write(
      'ki/config.toml',
      `schema = 1

[agents]
ids = [
  "claude-code",
]

[harnesses]
ids = [
  "knowledgeislands/ki-agentic-harness",
]

[skills]
`
    )

    const doctor = await box.run('ki doctor')

    expect(doctor.output).toContain('✓ Configuration')
    // Agent check should fail since home doesn't exist
    expect(doctor.output).toContain('✗ Agent')
  })

  test('reports a harness inventory failure when the installed harnesses directory is malformed', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')
    // A non-directory entry directly under ki/harnesses is an unsafe owner entry.
    await box.data.write('ki/harnesses/not-a-directory', 'x')

    const doctor = await box.run('ki doctor')

    expect(doctor.output).toContain('✗ Harness inventory: installed harnesses directory contains an unsafe owner entry')
  })

  test('reports an agents failure when configuration names an unknown agent', async () => {
    const box = await sandbox()
    await box.config.write(
      'ki/config.toml',
      `schema = 1

[agents]
ids = [
  "unknown-agent",
]

[harnesses]
ids = [
  "knowledgeislands/ki-agentic-harness",
]

[skills]
`
    )

    const doctor = await box.run('ki doctor')

    expect(doctor.output).toContain('✗ Agents: unknown agent unknown-agent; use claude-code or chatgpt-codex')
    expect(doctor.output).toContain('○ User skills: agents are unavailable')
  })

  test('reports a configured skill whose link is absent', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.config.write(
      'ki/config.toml',
      `schema = 1

[agents]
ids = ["claude-code"]

[harnesses]
ids = []

[skills.ki-example]
harness = "example/harness"
`
    )

    const doctor = await box.run('ki doctor')

    expect(doctor.output).toContain('✗ User skill ki-example: not linked for every configured agent')
  })

  test('reports an empty quoted skill key as an invalid managed user-skill identity', async () => {
    const box = await sandbox()
    await box.config.write(
      'ki/config.toml',
      `schema = 1

[agents]
ids = []

[harnesses]
ids = []

[skills.""]
harness = "example/harness"
`
    )

    const doctor = await box.run('ki doctor')

    expect(doctor).toEqual({
      exitCode: 0,
      output: expect.stringContaining('✓ Configuration:')
    })
    expect(doctor.output).toContain('✗ User skill example/harness:: invalid identity')
  })
})
