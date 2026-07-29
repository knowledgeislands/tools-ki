import { rm, symlink, unlink } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

describe('[ki doctor]', () => {
  test('reports missing configuration in human form', async () => {
    const box = await sandbox()
    const doctor = await box.run('ki doctor')

    expect(doctor.output).toContain('ki doctor\n  ✗ Configuration: missing; run ki bootstrap')
    expect(doctor.output).not.toContain('ki: error:')
    expect(doctor.exitCode).toBe(1)
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
    expect(doctor.exitCode).toBe(1)
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
    expect(doctor.exitCode).toBe(1)
  })

  test('reports a harness inventory failure when the installed harnesses directory is malformed', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')
    // A non-directory entry directly under ki/harnesses is an unsafe owner entry.
    await box.data.write('ki/harnesses/not-a-directory', 'x')

    const doctor = await box.run('ki doctor')

    expect(doctor.output).toContain('✗ Harness inventory: installed harnesses directory contains an unsafe owner entry')
    expect(doctor.exitCode).toBe(1)
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
    expect(doctor.exitCode).toBe(1)
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

    expect(doctor.output).toContain('✗ User skill ki-example: not linked for every compatible configured agent')
    expect(doctor.exitCode).toBe(1)
  })

  test('accepts a runtime-bound user skill linked only into compatible agents', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.setupAgentHome('chatgpt-codex')
    await box.setupExampleHarness()
    await box.data.write(
      'ki/harnesses/example/harness/skills/ki-example/SKILL.md',
      '---\nname: ki-example\nki-depends-on: []\nki-supported-runtimes: [codex]\n---\n'
    )
    await box.run('ki bootstrap')
    await box.run('ki skill add ki-example')

    const doctor = await box.run('ki doctor')

    expect(doctor.output).toContain('✓ User skill ki-example: linked')
    expect(doctor.exitCode).toBe(0)
  })

  test('reports a runtime-bound user skill with no compatible configured agent', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.setupExampleHarness()
    await box.data.write(
      'ki/harnesses/example/harness/skills/ki-example/SKILL.md',
      '---\nname: ki-example\nki-depends-on: []\nki-supported-runtimes: [codex]\n---\n'
    )
    await box.config.write(
      'ki/config.toml',
      `schema = 1

[agents]
ids = ["claude-code"]

[harnesses]
ids = ["example/harness"]

[skills.ki-example]
harness = "example/harness"
`
    )

    const doctor = await box.run('ki doctor')

    expect(doctor.output).toContain('✗ User skill ki-example: no compatible configured agent')
    expect(doctor.exitCode).toBe(1)
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
      exitCode: 1,
      output: expect.stringContaining('✓ Configuration:')
    })
    expect(doctor.output).toContain('✗ User skill example/harness:: invalid identity')
  })

  test('exits zero for a complete report with only passing checks', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')

    const doctor = await box.run('ki doctor')

    expect(doctor).toEqual({
      exitCode: 0,
      output: expect.not.stringContaining('✗')
    })
  })

  test('reports a wrong managed user-skill target while local development is active', async () => {
    const box = await sandbox()
    const harnessPath = await box.setupLocalCanonicalHarness('dev/current/knowledgeislands/ki-agentic-harness')
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')
    await box.run(`ki dev local set ${harnessPath}`)
    await box.run('ki dev local on')
    const link = `${box.home.path}/.claude/skills/ki-recap`
    await unlink(link)
    await symlink(`${box.root.path}/missing-ki-recap`, link, 'dir')

    const doctor = await box.run('ki doctor')

    expect(doctor.output).toContain(`✓ Local development: active ${harnessPath}`)
    expect(doctor.output).toContain('✗ User skill ki-recap: link target does not match local development source')
    expect(doctor.exitCode).toBe(1)
  })

  test('reports a broken remembered source while local development is active', async () => {
    const box = await sandbox()
    const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')
    await box.run(`ki dev local set ${harnessPath}`)
    await box.run('ki dev local on')
    await rm(`${harnessPath}/skills/process/ki-recap/SKILL.md`)

    const doctor = await box.run('ki doctor')

    expect(doctor.output).toContain('✗ Local development: local harness must contain skills/process/ki-recap/SKILL.md')
    expect(doctor.exitCode).toBe(1)
  })

  test('checks installed sources when a remembered local source is off', async () => {
    const box = await sandbox()
    const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')
    await box.run(`ki dev local set ${harnessPath}`)
    const link = `${box.home.path}/.claude/skills/ki-recap`
    await unlink(link)
    await symlink(`${harnessPath}/skills/process/ki-recap`, link, 'dir')

    const doctor = await box.run('ki doctor')

    expect(doctor.output).not.toContain('Local development')
    expect(doctor.output).toContain('✗ User skill ki-recap: link target does not match installed harness source')
    expect(doctor.exitCode).toBe(1)
  })
})
