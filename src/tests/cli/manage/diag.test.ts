import { realpath, rm, symlink, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

const repositoryConfiguration = `
[repo]
harnesses = ["knowledgeislands/ki-agentic-harness"]

[skills.ki-repo]
title = "Example"
description = "Example repository."
repo_code = "EXAMPLE"
supported_runtimes = ["chatgpt-codex"]
visibility = "private"

[skills.ki-example]
`

describe('[ki manage diag]', () => {
  test('reports the executable path and the resolved data directory', async () => {
    const box = await sandbox()
    const missingHome = join(box.root.path, 'missing-home')
    box.setEnv({
      XDG_DATA_HOME: join(missingHome, 'data'),
      XDG_CONFIG_HOME: join(missingHome, 'config'),
      XDG_CACHE_HOME: join(missingHome, 'cache'),
      XDG_STATE_HOME: join(missingHome, 'state')
    })

    const diag = await box.run('ki manage diag')

    expect(diag.output).toContain(`Executable: ${box.executable}`)
    expect(diag.output).toContain(`Data: ${missingHome}/data/ki`)
  })

  test('reports the entrypoint-proven installation mode', async () => {
    const box = await sandbox()

    const regular = await box.run('ki manage diag')
    const local = await box.run('ki manage diag', { installation: 'local' })

    expect(regular.output).toContain('Installation: regular')
    expect(local.output).toContain('Installation: local')
  })

  test('resolves the user home from USERPROFILE when HOME is unset', async () => {
    const box = await sandbox()
    box.setEnv({ HOME: undefined, USERPROFILE: box.home.path })

    const diag = await box.run('ki manage diag')

    expect(diag.exitCode).toBe(0)
  })

  test('reports user configuration values, unknown keys, and invalid entries', async () => {
    const box = await sandbox()
    const invalidConfig = `schema = 2
unexpected = true

[agents]
ids = ["claude-code", "unknown-agent"]

[harnesses]
releases = [{ id = "example/harness", url = "http://example.test/archive.tar.gz", sha256 = "invalid", extra = true }]

[skills]
ids = ["example:skill", "example:skill"]
`
    await box.config.write('ki/config.toml', invalidConfig)

    const human = await box.run('ki manage diag')

    expect(human.exitCode).toBe(1)
    expect(human.output).toContain('├─ warnings (3)')
    expect(human.output).toContain('! unrecognised key unexpected')
    expect(human.output).toContain('├─ errors (4)')
    expect(human.output).toContain('× schema must equal 1')
  })

  test('reports local registry entries and state registry errors', async () => {
    const box = await sandbox()
    const repository = await box.root.mkdir('repository')
    await box.state.write(
      'ki/registry.toml',
      `schema = 1\n\n[repositories."repository"]\nrepository = "https://github.com/example/repository"\npath = ${JSON.stringify(repository)}\n`
    )

    const valid = await box.run('ki manage diag')
    await box.state.write('ki/registry.toml', 'schema = 1\nrepositories = {}\nextra = true\n')
    const invalid = await box.run('ki manage diag')

    expect(valid.output).toContain(`╰─ repository: ${repository}`)
    expect(invalid.exitCode).toBe(1)
    expect(invalid.output).toContain('errors (1)')
    expect(invalid.output).toContain('unrecognised key extra')
  })

  test('does not inspect repository state for user diagnostics', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '# repo\n')

    const diag = await box.run('ki manage diag')

    expect(diag.output).not.toContain('Repository')
  })

  test('does not expand a direct mGit container for diagnostics', async () => {
    const box = await sandbox()
    await box.project.write('.mgit-config.toml', 'version = 1\n')

    const diag = await box.run('ki manage diag')

    expect(diag.exitCode).toBe(0)
    expect(diag.output).not.toContain('\n├─ repository (')
  })

  test('leaves direct repository projection health to ki repo diag', async () => {
    const box = await sandbox()
    await box.setupAgentHome('chatgpt-codex')
    await box.run('ki bootstrap')
    await box.setupExampleHarness({
      name: 'ki-repo',
      identifier: 'knowledgeislands/ki-agentic-harness'
    })
    await box.setupExampleHarness({ identifier: 'knowledgeislands/ki-agentic-harness' })
    await box.project.write('.ki-config.toml', repositoryConfiguration)
    const managed = await box.run('ki manage diag')
    const repository = await box.run('ki repo diag')
    const root = await realpath(box.project.path)

    expect(managed.exitCode).toBe(0)
    expect(managed.output).not.toContain('Repository')
    expect(repository.exitCode).toBe(0)
    expect(repository.output).toContain(`╰─ ${root} (repairable)`)
    expect(repository.output).toContain(`Configuration: ${root}/.ki-config.toml`)
    expect(repository.output).toContain('chatgpt-codex ki-example: projection is missing')
  })

  test('does not inspect an unsafe direct repository declaration', async () => {
    const box = await sandbox()
    await box.project.write('actual.toml', repositoryConfiguration)
    await symlink(`${box.project.path}/actual.toml`, `${box.project.path}/.ki-config.toml`)

    const diag = await box.run('ki manage diag')

    expect(diag.exitCode).toBe(0)
    expect(diag.output).not.toContain('Repository')
  })

  test('rejects selectors on the direct diagnostic command before rendering help', async () => {
    const box = await sandbox()

    const diag = await box.run('ki manage diag --repo elsewhere')

    expect(diag.exitCode).toBe(2)
    expect(diag.output).toContain("ki: error: unknown option '--repo' for 'ki manage diag'")
    expect(diag.output).toContain('Usage: ki manage diag [options]')
  })

  test('rejects a configuration file that is a symlink rather than a regular file', async () => {
    const box = await sandbox()
    await box.config.write('ki/real-config.toml', 'schema = 1\n')
    await symlink(join(box.config.path, 'ki/real-config.toml'), join(box.config.path, 'ki/config.toml'))

    const diag = await box.run('ki manage diag')

    expect(diag.output).toContain('× configuration must be a regular file')
  })

  test('rejects a configuration file that is not valid TOML', async () => {
    const box = await sandbox()
    await box.config.write('ki/config.toml', 'schema = 1\n[agents\n')

    const diag = await box.run('ki manage diag')

    expect(diag.output).toContain('× configuration must be valid TOML')
  })

  test('reports non-array agents.ids, a skill missing its harness, a non-table harness release, and an unrecognised local key', async () => {
    const box = await sandbox()
    const invalidConfig = `schema = 1

[agents]
ids = "not-an-array"

[harnesses]
releases = [42]

[skills.foo]

[local]
path = "/somewhere"
extra = true
`
    await box.config.write('ki/config.toml', invalidConfig)

    const diag = await box.run('ki manage diag')

    expect(diag.output).toContain('× agents.ids must be an array of non-empty strings')
    expect(diag.output).toContain('× skills.foo must declare a harness string')
    expect(diag.output).toContain('× harnesses[0] must be a table')
    expect(diag.output).toContain('! local has unrecognised key extra')
  })

  test('reports invalid legacy repository migration input without using it as the active registry', async () => {
    const box = await sandbox()
    await box.config.write(
      'ki/config.toml',
      'schema = 1\n\n[agents]\nids = []\n\n[harnesses]\nids = []\n\n[skills]\n\n[repositories]\npaths = ["relative"]\nextra = true\n'
    )

    const diag = await box.run('ki manage diag')

    expect(diag.output).toContain('! repositories has unrecognised key extra')
    expect(diag.output).toContain('× repositories.paths must contain absolute paths')
  })

  test('displays configuration with no warnings or errors', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')

    const diag = await box.run('ki manage diag')

    expect(diag.output).toContain('Status: valid')
    expect(diag.output).not.toContain('Warnings')
    expect(diag.output).not.toContain('Errors')
    expect(diag.output).toContain('├─ agents (1)\n│  │  ╰─ claude-code')
    expect(diag.output).toContain('├─ harnesses (0)\n│  │  ╰─ none')
    expect(diag.output).toContain('├─ skills (7)')
    expect(diag.output).toContain('│  │  ╰─ knowledgeislands/ki-agentic-harness:ki-recap')
    expect(diag.output).toContain('├─ registry\n│  ├─ Status: missing')
    expect(diag.output).toContain('│  ╰─ repositories (0)\n│     ╰─ none')
    expect(diag.output).toContain('source: none')
    expect(diag.output).toContain('mode: not configured')
  })

  test('reports a remembered local source as off, then on when its projection is active', async () => {
    const box = await sandbox()
    const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')
    await box.run(`ki dev local set knowledgeislands/ki-agentic-harness ${harnessPath}`)

    const off = await box.run('ki manage diag')
    await box.run('ki dev local on')
    const on = await box.run('ki manage diag')

    expect(off.output).toContain(`source: ${harnessPath}`)
    expect(off.output).toContain('mode: off')
    expect(on.output).toContain(`source: ${harnessPath}`)
    expect(on.output).toContain('mode: on')
  })

  test('does not report local mode as active when a canonical payload is not linked', async () => {
    const box = await sandbox()
    const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')
    await box.run(`ki dev local set knowledgeislands/ki-agentic-harness ${harnessPath}`)
    await box.run('ki dev local on')
    const hooks = 'ki/harnesses/knowledgeislands/ki-agentic-harness/hooks'
    await unlink(`${box.data.path}/${hooks}`)
    await box.data.mkdir(hooks)

    const diag = await box.run('ki manage diag')

    expect(diag.output).toContain('mode: off')
  })

  test('does not report local mode as active when a canonical payload points at another checkout', async () => {
    const box = await sandbox()
    const harnessPath = await box.setupLocalCanonicalHarness('dev/current/knowledgeislands/ki-agentic-harness')
    const otherHarnessPath = await box.setupLocalCanonicalHarness('dev/other/knowledgeislands/ki-agentic-harness')
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')
    await box.run(`ki dev local set knowledgeislands/ki-agentic-harness ${harnessPath}`)
    await box.run('ki dev local on')
    const hooks = `${box.data.path}/ki/harnesses/knowledgeislands/ki-agentic-harness/hooks`
    await unlink(hooks)
    await symlink(`${otherHarnessPath}/hooks`, hooks, 'dir')

    const diag = await box.run('ki manage diag')

    expect(diag.output).toContain('mode: off')
  })

  test('does not report local mode as active when its source payload disappears', async () => {
    const box = await sandbox()
    const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')
    await box.run(`ki dev local set knowledgeislands/ki-agentic-harness ${harnessPath}`)
    await box.run('ki dev local on')
    await rm(`${harnessPath}/hooks`, { recursive: true })

    const diag = await box.run('ki manage diag')

    expect(diag.output).toContain('mode: off')
  })

  test('does not report local mode as active when its configured source disappears', async () => {
    const box = await sandbox()
    const harnessPath = await box.setupLocalCanonicalHarness('dev/knowledgeislands/ki-agentic-harness')
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')
    await box.run(`ki dev local set knowledgeislands/ki-agentic-harness ${harnessPath}`)
    await box.run('ki dev local on')
    await rm(harnessPath, { recursive: true })

    const diag = await box.run('ki manage diag')

    expect(diag.output).toContain('mode: off')
  })

  test('reports scalar sections and an invalid local section as configuration errors', async () => {
    const box = await sandbox()
    await box.config.write(
      'ki/config.toml',
      `schema = 1
agents = "not-a-table"
harnesses = "not-a-table"
skills = "not-a-table"
local = "not-a-table"
`
    )

    const diag = await box.run('ki manage diag')

    expect(diag.output).toContain('× agents must be a TOML table')
    expect(diag.output).toContain('× skills must be a TOML table')
    expect(diag.output).toContain('× harnesses must be a TOML table')
    expect(diag.output).toContain('× harnesses must declare an ids array')
    expect(diag.output).toContain('× local must be a TOML table')
    expect(diag.output).toContain('× local must declare non-empty harness and path strings')
  })

  test('reports duplicate, unrecognised, and malformed entries throughout a sectioned configuration', async () => {
    const box = await sandbox()
    await box.config.write(
      'ki/config.toml',
      `schema = 1

[agents]
ids = ["claude-code", "claude-code", "unrecognised"]
extra = true

[harnesses]
section_extra = true
releases = [
  { id = 3, url = 3, sha256 = 3, extra = true },
  { id = "example/harness", url = "https://example.test/archive.tar.gz", sha256 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
]

[skills]
scalar = 3

[skills.empty]
harness = ""

[local]
path = ""
`
    )

    const diag = await box.run('ki manage diag')

    expect(diag.output).toContain('× agents.ids repeats a value')
    expect(diag.output).toContain('! unrecognised agent unrecognised')
    expect(diag.output).toContain('! agents has unrecognised key extra')
    expect(diag.output).toContain('! harnesses has unrecognised key section_extra')
    expect(diag.output).toContain('! harnesses[0] has unrecognised key extra')
    expect(diag.output).toContain('× harnesses[0] id must be a non-empty string')
    expect(diag.output).toContain('× harnesses[0] url must be an HTTPS URL')
    expect(diag.output).toContain('× harnesses[0] sha256 must be lowercase SHA-256')
    expect(diag.output).toContain('× skills.scalar must be a TOML table')
    expect(diag.output).toContain('× skills.empty must declare a harness string')
    expect(diag.output).toContain('× local must declare non-empty harness and path strings')
  })
})
