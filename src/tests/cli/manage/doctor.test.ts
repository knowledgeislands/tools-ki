import { rm, symlink, unlink } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

describe('[ki manage doctor]', () => {
  test('reports missing configuration in human form', async () => {
    const box = await sandbox()
    const doctor = await box.run('ki manage doctor')

    expect(doctor.output).toContain(
      '╭─ KI MANAGE DOCTOR\n├─ checks (4)\n│  ├─ ✗ Configuration: missing; run ki bootstrap'
    )
    expect(doctor.output).not.toContain('ki: error:')
    expect(doctor.exitCode).toBe(1)
  })

  test('reports direct-CWD legacy .ki-meta and .ki structures without repository discovery', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')
    await box.project.mkdir('.ki-meta')
    await box.project.mkdir('.ki')

    const doctor = await box.run('ki manage doctor')

    expect(doctor.output).toContain(
      '✗ Legacy repository state: .ki-meta/, .ki/ detected; remove after migrating to .ki.toml'
    )
    expect(doctor.exitCode).toBe(1)
  })

  test('validates a direct-CWD repository configuration without resolving skills or repositories', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')
    await box.project.write('.ki.toml', '[repo]\nharnesses = ["example/harness"]\n')

    const valid = await box.run('ki manage doctor')
    await box.project.write('.ki.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.repository]\n')
    const legacyDeclaration = await box.run('ki manage doctor')
    await rm(`${box.project.path}/.ki.toml`)
    await box.project.mkdir('.ki.toml')
    const directory = await box.run('ki manage doctor')
    await rm(`${box.project.path}/.ki.toml`, { recursive: true })
    await box.root.write('linked-config.toml', '# config\n')
    await symlink(`${box.root.path}/linked-config.toml`, `${box.project.path}/.ki.toml`)
    const symbolic = await box.run('ki manage doctor')

    expect(valid).toEqual({
      exitCode: 0,
      output: expect.stringContaining('✓ Repository declaration: 0 declared skills')
    })
    expect(legacyDeclaration.output).toContain(
      '✗ Repository declaration: declared skill repository must be [skills.<prefix>-<name>]'
    )
    expect(directory.output).toContain('✗ Repository declaration: .ki.toml must be a regular file')
    expect(symbolic.output).toContain('✗ Repository declaration: .ki.toml must be a regular file')
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

    const doctor = await box.run('ki manage doctor')

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

    const doctor = await box.run('ki manage doctor')

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

    const doctor = await box.run('ki manage doctor')

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

    const doctor = await box.run('ki manage doctor')

    expect(doctor.output).toContain('✗ Agents: unknown agent unknown-agent; use claude-code or chatgpt-codex')
    expect(doctor.output).toContain('○ User skills: agents are unavailable')
    expect(doctor.exitCode).toBe(1)
  })

  test('reports a configured skill whose active source cannot be resolved', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    const linked = await box.root.mkdir('linked-but-unresolved')
    await box.home.mkdir('.claude/skills')
    await symlink(linked, `${box.home.path}/.claude/skills/ki-example`, 'dir')
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

    const doctor = await box.run('ki manage doctor')

    expect(doctor.output).toContain(
      '✗ User skill ki-example: configured skill cannot be resolved from the active source example/harness'
    )
    expect(doctor.exitCode).toBe(1)
  })

  test('reports a configured skill whose resolved link is absent', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')
    await unlink(`${box.home.path}/.claude/skills/ki-recap`)

    const doctor = await box.run('ki manage doctor')

    expect(doctor.output).toContain('✗ User skill ki-recap: not linked for every compatible configured agent')
    expect(doctor.exitCode).toBe(1)
  })

  test('accepts a runtime-bound user skill linked only into compatible agents', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.setupAgentHome('chatgpt-codex')
    await box.setupExampleHarness({ name: 'example-skill', prefix: 'example' })
    await box.data.write(
      'ki/harnesses/example/harness/skills/example-skill/SKILL.md',
      '---\nname: example-skill\nki-depends-on: []\nki-supported-runtimes: [chatgpt-codex]\n---\n'
    )
    await box.run('ki bootstrap')
    await box.run('ki skill add example-skill')

    const doctor = await box.run('ki manage doctor')

    expect(doctor.output).toContain('✓ User skill example-skill: linked')
    expect(doctor.exitCode).toBe(0)
  })

  test('reports a runtime-bound user skill with no compatible configured agent', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.setupExampleHarness({ name: 'example-skill', prefix: 'example' })
    await box.data.write(
      'ki/harnesses/example/harness/skills/example-skill/SKILL.md',
      '---\nname: example-skill\nki-depends-on: []\nki-supported-runtimes: [chatgpt-codex]\n---\n'
    )
    await box.config.write(
      'ki/config.toml',
      `schema = 1

[agents]
ids = ["claude-code"]

[harnesses]
ids = ["example/harness"]

[skills.example-skill]
harness = "example/harness"
`
    )

    const doctor = await box.run('ki manage doctor')

    expect(doctor.output).toContain('✗ User skill example-skill: no compatible configured agent')
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

    const doctor = await box.run('ki manage doctor')

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

    const doctor = await box.run('ki manage doctor')

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
    await box.run(`ki dev local set knowledgeislands/ki-agentic-harness ${harnessPath}`)
    await box.run('ki dev local on')
    const link = `${box.home.path}/.claude/skills/ki-recap`
    await unlink(link)
    await symlink(`${box.root.path}/missing-ki-recap`, link, 'dir')

    const doctor = await box.run('ki manage doctor')

    expect(doctor.output).toContain(`✓ Local development knowledgeislands/ki-agentic-harness: active ${harnessPath}`)
    expect(doctor.output).toContain('✗ User skill ki-recap: link target does not match local development source')
    expect(doctor.exitCode).toBe(1)
  })

  test('reports a canonical Harness root that points away from the configured local source', async () => {
    const box = await sandbox()
    const harnessPath = await box.setupLocalCanonicalHarness('dev/current/knowledgeislands/ki-agentic-harness')
    const otherHarnessPath = await box.setupLocalCanonicalHarness('dev/other/knowledgeislands/ki-agentic-harness')
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')
    await box.run(`ki dev local set knowledgeislands/ki-agentic-harness ${harnessPath}`)
    await box.run('ki dev local on')
    const link = `${box.data.path}/ki/harnesses/knowledgeislands/ki-agentic-harness`
    await unlink(link)
    await symlink(otherHarnessPath, link, 'dir')

    const doctor = await box.run('ki manage doctor')

    expect(doctor.output).toContain(
      '✗ Local development knowledgeislands/ki-agentic-harness: active root does not match the configured local source'
    )
    expect(doctor.exitCode).toBe(1)
  })

  test('reports a broken remembered source while local development is active', async () => {
    const box = await sandbox()
    const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')
    await box.run(`ki dev local set knowledgeislands/ki-agentic-harness ${harnessPath}`)
    await box.run('ki dev local on')
    await rm(`${harnessPath}/skills/change-management/ki-recap/SKILL.md`)

    const doctor = await box.run('ki manage doctor')

    expect(doctor.output).toContain(
      '✗ Local development knowledgeislands/ki-agentic-harness: local harness knowledgeislands/ki-agentic-harness does not provide ki-recap'
    )
    expect(doctor.exitCode).toBe(1)
  })

  test('reports unresolved skills when the unified active harness inventory is unavailable', async () => {
    const box = await sandbox()
    const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')
    await box.run(`ki dev local set knowledgeislands/ki-agentic-harness ${harnessPath}`)
    await box.run('ki dev local on')
    await box.data.write('ki/harnesses/not-a-directory', 'x')

    const doctor = await box.run('ki manage doctor')

    expect(doctor.output).toContain('✗ Harness inventory: installed harnesses directory contains an unsafe owner entry')
    expect(doctor.output).toContain(
      '✗ User skill ki-recap: configured skill cannot be resolved from the active source knowledgeislands/ki-agentic-harness'
    )
    expect(doctor.exitCode).toBe(1)
  })

  test('checks installed sources when a remembered local source is off', async () => {
    const box = await sandbox()
    const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')
    await box.run(`ki dev local set knowledgeislands/ki-agentic-harness ${harnessPath}`)
    const link = `${box.home.path}/.claude/skills/ki-recap`
    await unlink(link)
    await symlink(`${harnessPath}/skills/change-management/ki-recap`, link, 'dir')

    const doctor = await box.run('ki manage doctor')

    expect(doctor.output).not.toContain('Local development')
    expect(doctor.output).toContain('✗ User skill ki-recap: link target does not match installed harness source')
    expect(doctor.exitCode).toBe(1)
  })
})
