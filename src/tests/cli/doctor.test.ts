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
})
