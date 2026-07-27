import { symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

describe('[ki diag]', () => {
  test('reports the executable path and the resolved data directory', async () => {
    const box = await sandbox()
    const missingHome = join(box.root.path, 'missing-home')
    box.setEnv({
      XDG_DATA_HOME: join(missingHome, 'data'),
      XDG_CONFIG_HOME: join(missingHome, 'config'),
      XDG_CACHE_HOME: join(missingHome, 'cache'),
      XDG_STATE_HOME: join(missingHome, 'state')
    })

    const diag = await box.run('ki diag')

    expect(diag.output).toContain(`Executable    ${box.executable}`)
    expect(diag.output).toContain(`Data          ${missingHome}/data/ki`)
  })

  test('resolves the user home from USERPROFILE when HOME is unset', async () => {
    const box = await sandbox()
    box.setEnv({ HOME: undefined, USERPROFILE: box.home.path })

    const diag = await box.run('ki diag')

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

    const human = await box.run('ki diag')

    expect(human.output).toContain('Warnings\n  - unrecognised key unexpected')
    expect(human.output).toContain('Errors\n  - schema must equal 1')
  })

  test('resolves the ancestor KI repository from a nested working directory', async () => {
    const box = await sandbox()
    await box.project.mkdir('repo/src/nested')
    await box.project.write('repo/.ki-config.toml', '# repo\n')

    box.cd('repo/src/nested')
    const diag = await box.run('ki diag')

    expect(diag.output).toMatch(/Repository\s+.+repo/)
  })

  test('reports no repository outside a KI repository', async () => {
    const box = await sandbox()
    await box.project.mkdir('scratch')

    box.cd('scratch')
    const diag = await box.run('ki diag')

    expect(diag.output).toContain('Repository    none')
  })

  test('rejects a configuration file that is a symlink rather than a regular file', async () => {
    const box = await sandbox()
    await box.config.write('ki/real-config.toml', 'schema = 1\n')
    await symlink(join(box.config.path, 'ki/real-config.toml'), join(box.config.path, 'ki/config.toml'))

    const diag = await box.run('ki diag')

    expect(diag.output).toContain('Errors\n  - configuration must be a regular file')
  })

  test('rejects a configuration file that is not valid TOML', async () => {
    const box = await sandbox()
    await box.config.write('ki/config.toml', 'schema = 1\n[agents\n')

    const diag = await box.run('ki diag')

    expect(diag.output).toContain('Errors\n  - configuration must be valid TOML')
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

    const diag = await box.run('ki diag')

    expect(diag.output).toContain('Errors\n  - agents.ids must be an array of non-empty strings')
    expect(diag.output).toContain('- skills.foo must declare a harness string')
    expect(diag.output).toContain('- harnesses[0] must be a table')
    expect(diag.output).toContain('Warnings\n  - local has unrecognised key extra')
  })

  test('displays configuration with no warnings or errors', async () => {
    const box = await sandbox()
    await box.setupAgentHome('claude-code')
    await box.run('ki bootstrap')

    const diag = await box.run('ki diag')

    expect(diag.output).toContain('Status        valid')
    expect(diag.output).not.toContain('Warnings')
    expect(diag.output).not.toContain('Errors')
    expect(diag.output).toContain('Agents')
    expect(diag.output).toContain('Harnesses')
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

    const diag = await box.run('ki diag')

    expect(diag.output).toContain('- agents must be a TOML table')
    expect(diag.output).toContain('- skills must be a TOML table')
    expect(diag.output).toContain('- harnesses must be a TOML table')
    expect(diag.output).toContain('- harnesses must declare an ids array')
    expect(diag.output).toContain('- local must be a TOML table')
    expect(diag.output).toContain('- local.path must be a non-empty path string')
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

    const diag = await box.run('ki diag')

    expect(diag.output).toContain('- agents.ids repeats a value')
    expect(diag.output).toContain('- unrecognised agent unrecognised')
    expect(diag.output).toContain('- agents has unrecognised key extra')
    expect(diag.output).toContain('- harnesses has unrecognised key section_extra')
    expect(diag.output).toContain('- harnesses[0] has unrecognised key extra')
    expect(diag.output).toContain('- harnesses[0] id must be a non-empty string')
    expect(diag.output).toContain('- harnesses[0] url must be an HTTPS URL')
    expect(diag.output).toContain('- harnesses[0] sha256 must be lowercase SHA-256')
    expect(diag.output).toContain('- skills.scalar must be a TOML table')
    expect(diag.output).toContain('- skills.empty must declare a harness string')
    expect(diag.output).toContain('- local.path must be a non-empty path string')
  })
})
