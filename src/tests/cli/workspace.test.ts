import { realpath, symlink } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

describe('[ki workspace]', () => {
  test('initialises, manages, and displays groups without requiring a KI repository', async () => {
    const box = await sandbox()
    const workspace = await realpath(box.project.path)

    const initialised = await box.run('ki workspace init')
    const addedDefault = await box.run('ki workspace add default repos/*')
    const addedPlatform = await box.run('ki workspace add platform ../platform')
    const listed = await box.run('ki workspace list')
    const shown = await box.run('ki workspace show platform')
    const removed = await box.run('ki workspace remove platform ../platform')

    expect(initialised).toEqual({ exitCode: 0, output: `ki workspace init: created ${workspace}/.ki-workspace.toml\n` })
    expect(addedDefault).toEqual({ exitCode: 0, output: 'ki workspace add: added repos/* to default\n' })
    expect(addedPlatform).toEqual({ exitCode: 0, output: 'ki workspace add: added ../platform to platform\n' })
    expect(listed).toEqual({ exitCode: 0, output: 'ki workspace list\n  default (default): 1\n  platform: 1\n' })
    expect(shown).toEqual({ exitCode: 0, output: 'ki workspace show platform\n  ../platform\n' })
    expect(removed).toEqual({ exitCode: 0, output: 'ki workspace remove: removed ../platform from platform\n' })
    expect(await box.project.read('.ki-workspace.toml')).toBe(
      'schema = 1\ndefault = "default"\n\n[groups.default]\nrepositories = ["repos/*"]\n\n[groups.platform]\nrepositories = []\n'
    )
  })

  test('uses the direct-CWD workspace default before .mgit-config.toml and resolves groups relative to it', async () => {
    const box = await sandbox()
    await box.project.write('.mgit-config.toml', 'version = 1\n')
    await box.project.write(
      '.ki-workspace.toml',
      'schema = 1\ndefault = "platform"\n\n[groups.platform]\nrepositories = ["repos/*"]\n\n[groups.release]\nrepositories = ["release"]\n'
    )
    await box.project.write('repos/one/.ki-config.toml', '# one\n')
    await box.project.write('repos/two/.ki-config.toml', '# two\n')
    await box.project.write('release/.ki-config.toml', '# release\n')
    const one = await realpath(`${box.project.path}/repos/one`)
    const two = await realpath(`${box.project.path}/repos/two`)
    const release = await realpath(`${box.project.path}/release`)

    const defaultGroup = await box.run('ki repo diag')
    const explicitGroup = await box.run('ki repo --workspace release diag')

    expect(defaultGroup.exitCode).toBe(0)
    expect(defaultGroup.output).toContain(`Repository: ${one}`)
    expect(defaultGroup.output).toContain(`Repository: ${two}`)
    expect(defaultGroup.output).not.toContain('ignored')
    expect(explicitGroup).toEqual({
      exitCode: 0,
      output: `ki repo diag\nRepository: ${release}\nConfiguration: ${release}/.ki-config.toml\nSource: workspace group release\n`
    })
  })

  test('rejects conflicting selectors, invalid workspace configurations, and ancestor workspaces', async () => {
    const box = await sandbox()
    await box.project.write('.ki-workspace.toml', 'schema = 1\ndefault = "all"\n\n[groups.all]\nrepositories = ["repo"]\n')
    await box.project.write('repo/.ki-config.toml', '# repo\n')

    const conflict = await box.run('ki repo --repo repo --workspace all diag')
    const missing = await box.run('ki repo --workspace absent diag')
    await box.project.write('.ki-workspace.toml', 'schema = 2\n')
    const malformed = await box.run('ki repo diag')
    await box.project.write('.ki-workspace.toml', 'schema = 1\ndefault = "all"\n\n[groups.all]\nrepositories = ["repo"]\n')
    await box.project.mkdir('child/nested')
    box.cd('child/nested')
    const ancestor = await box.run('ki repo diag')

    expect(conflict).toEqual({ exitCode: 2, output: 'ki: error: --repo and --workspace cannot be used together\n' })
    expect(missing).toEqual({ exitCode: 2, output: 'ki: error: workspace group absent is not declared\n' })
    expect(malformed).toEqual({ exitCode: 2, output: 'ki: error: .ki-workspace.toml schema must equal 1\n' })
    expect(ancestor).toEqual({ exitCode: 2, output: 'ki: error: no KI repository found from the current working directory\n' })
  })

  test('rejects malformed groups and invalid workspace mutations', async () => {
    const box = await sandbox()

    const missing = await box.run('ki workspace list')
    await box.project.write('.ki-workspace.toml', 'not valid = [\n')
    const invalidToml = await box.run('ki workspace list')
    await box.project.write('.ki-workspace.toml', 'schema = 1\ndefault = "all"\n')
    const missingGroups = await box.run('ki workspace list')
    await box.project.write('.ki-workspace.toml', 'schema = 1\n\n[groups.all]\nrepositories = []\n')
    const missingDefaultName = await box.run('ki workspace list')
    await box.project.write('.ki-workspace.toml', 'schema = 1\ndefault = "all"\n\n[groups.all]\nrepositories = [1]\n')
    const invalidRepositories = await box.run('ki workspace list')
    await box.project.write('.ki-workspace.toml', 'schema = 1\ndefault = "missing"\n\n[groups.all]\nrepositories = []\n')
    const missingDefault = await box.run('ki workspace list')
    await box.project.write('.ki-workspace.toml', 'schema = 1\ndefault = "all"\n\n[groups.all]\nrepositories = ["repo"]\n')
    const duplicate = await box.run('ki workspace add all repo')
    const absentGroup = await box.run('ki workspace remove missing repo')
    const absentRepository = await box.run('ki workspace remove all absent')
    const invalidGroup = await box.run('ki workspace add invalid.group repo')
    const repeatedInit = await box.run('ki workspace init')

    expect(missing).toEqual({ exitCode: 2, output: `ki: error: no .ki-workspace.toml in ${await realpath(box.project.path)}\n` })
    expect(invalidToml).toEqual({ exitCode: 2, output: 'ki: error: .ki-workspace.toml must be valid TOML\n' })
    expect(missingGroups).toEqual({ exitCode: 2, output: 'ki: error: .ki-workspace.toml must declare named groups\n' })
    expect(missingDefaultName).toEqual({ exitCode: 2, output: 'ki: error: .ki-workspace.toml must declare a default group\n' })
    expect(invalidRepositories).toEqual({
      exitCode: 2,
      output: 'ki: error: .ki-workspace.toml group all must declare a repositories string array\n'
    })
    expect(missingDefault).toEqual({ exitCode: 2, output: 'ki: error: .ki-workspace.toml default group missing is not declared\n' })
    expect(duplicate).toEqual({ exitCode: 2, output: 'ki: error: workspace group all already contains repo\n' })
    expect(absentGroup).toEqual({ exitCode: 2, output: 'ki: error: workspace group missing is not declared\n' })
    expect(absentRepository).toEqual({ exitCode: 2, output: 'ki: error: workspace group all does not contain absent\n' })
    expect(invalidGroup).toEqual({
      exitCode: 2,
      output: 'ki: error: .ki-workspace.toml group name invalid.group must use letters, numbers, hyphens, or underscores\n'
    })
    expect(repeatedInit).toEqual({
      exitCode: 2,
      output: `ki: error: .ki-workspace.toml already exists in ${await realpath(box.project.path)}\n`
    })
  })

  test('refuses a workspace configuration that is not a regular file', async () => {
    const box = await sandbox()
    await box.project.write('workspace.toml', 'schema = 1\ndefault = "all"\n\n[groups.all]\nrepositories = []\n')
    await symlink(`${box.project.path}/workspace.toml`, `${box.project.path}/.ki-workspace.toml`)

    const list = await box.run('ki workspace list')
    const repo = await box.run('ki repo diag')

    expect(list).toEqual({ exitCode: 2, output: 'ki: error: .ki-workspace.toml must be a regular file\n' })
    expect(repo).toEqual({ exitCode: 2, output: 'ki: error: .ki-workspace.toml must be a regular file\n' })
  })

  test('rejects unmatched and non-repository workspace patterns', async () => {
    const box = await sandbox()
    await box.project.write(
      '.ki-workspace.toml',
      'schema = 1\ndefault = "empty"\n\n[groups.empty]\nrepositories = ["missing/*"]\n\n[groups.unmatched]\nrepositories = ["entries/none*"]\n\n[groups.mixed]\nrepositories = ["entries/*"]\n'
    )
    await box.project.mkdir('entries/not-a-repository')

    const unmatched = await box.run('ki repo diag')
    const noMatches = await box.run('ki repo --workspace unmatched diag')
    const nonRepository = await box.run('ki repo --workspace mixed diag')

    expect(unmatched).toEqual({ exitCode: 2, output: 'ki: error: workspace group empty pattern missing/* has no existing directory\n' })
    expect(noMatches).toEqual({
      exitCode: 2,
      output: 'ki: error: workspace group unmatched pattern entries/none* matched no repositories\n'
    })
    expect(nonRepository).toEqual({
      exitCode: 2,
      output: 'ki: error: workspace group mixed pattern entries/* matched a non-KI directory\n'
    })
  })
})
