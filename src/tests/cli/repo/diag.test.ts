import { realpath } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

const repositoryConfiguration = `
[repo]
harnesses = ["knowledgeislands/ki-agentic-harness"]

[skills.ki-repo]
repository = "https://github.com/example/project"
title = "Example"
description = "Example repository."
repo_code = "EXAMPLE"
supported_runtimes = ["chatgpt-codex"]
visibility = "private"

[skills.ki-example]
`

const preparedRepository = async () => {
  const box = await sandbox()
  await box.setupAgentHome('chatgpt-codex')
  await box.run('ki bootstrap')
  await box.setupExampleHarness({ name: 'ki-repo' })
  await box.setupExampleHarness()
  await box.project.write('.ki-config.toml', repositoryConfiguration)
  return box
}

describe('[ki repo diag]', () => {
  test('reports selected repository projection health without changing it', async () => {
    const box = await preparedRepository()
    const root = await realpath(box.project.path)

    const diag = await box.run('ki repo diag')

    expect(diag.exitCode).toBe(0)
    expect(diag.output).toContain('╭─ KI REPO DIAG')
    expect(diag.output).toContain(`╰─ ${root} (repairable)`)
    expect(diag.output).toContain(`Configuration: ${root}/.ki-config.toml`)
    expect(diag.output).toContain('chatgpt-codex ki-example: projection is missing')
    expect(diag.output).toContain('summary: REPOSITORIES=1 HEALTHY=0 REPAIRABLE=1 UNREPAIRABLE=0')
  })

  test('reports an unresolved declared provider as unrepairable', async () => {
    const box = await preparedRepository()
    await box.project.write(
      '.ki-config.toml',
      repositoryConfiguration
        .replace('knowledgeislands/ki-agentic-harness', 'missing/harness')
        .replace('[skills.ki-example]', '[skills.ki-missing]')
    )

    const diag = await box.run('ki repo diag')

    expect(diag.exitCode).toBe(1)
    expect(diag.output).toContain('missing/harness is not installed')
    expect(diag.output).toContain('summary: REPOSITORIES=1 HEALTHY=0 REPAIRABLE=0 UNREPAIRABLE=1')
  })
})
