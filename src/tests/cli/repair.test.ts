import { lstat, readlink, symlink } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

const repositoryConfiguration = `
["example/harness:ki-repo"]
title = "Example"
description = "Example repository."
repo_code = "EXAMPLE"
supported_runtimes = ["chatgpt-codex"]
visibility = "private"

["example/harness:ki-example"]
`

const preparedRepository = async () => {
  const box = await sandbox()
  await box.setupAgentHome('chatgpt-codex')
  await box.setupExampleHarness({ name: 'ki-repo' })
  await box.setupExampleHarness()
  await box.run('ki bootstrap')
  await box.project.write('.ki-config.toml', repositoryConfiguration)
  return box
}

describe('[ki repo repair]', () => {
  test('registers the selected physical root before repairing a missing compatible projection', async () => {
    const box = await preparedRepository()
    const projection = `${box.project.path}/.agents/skills/ki-example`

    const repair = await box.run('ki repo repair')

    expect(repair.exitCode).toBe(0)
    expect(repair.output).toContain('Registry: registered')
    expect(repair.output).toContain('  link ')
    expect((await lstat(projection)).isSymbolicLink()).toBe(true)
    expect(await box.config.read('ki/config.toml')).toContain(box.project.path)
  })

  test('reports but does not change a dry-run repository repair or its registry', async () => {
    const box = await preparedRepository()
    const projection = `${box.project.path}/.agents/skills/ki-example`

    const repair = await box.run('ki repo repair --dry-run')

    expect(repair.exitCode).toBe(0)
    expect(repair.output).toContain('would register')
    expect(repair.output).toContain('would link')
    await expect(lstat(projection)).rejects.toThrow()
    expect(await box.config.read('ki/config.toml')).not.toContain(box.project.path)
  })

  test('never replaces a foreign repository skill entry', async () => {
    const box = await preparedRepository()
    const projection = `${box.project.path}/.agents/skills/ki-example`
    await box.project.write('.agents/skills/ki-example/file', 'foreign\n')

    const repair = await box.run('ki repo repair')

    expect(repair.exitCode).toBe(1)
    expect(repair.output).toContain('projection is not a KI-managed link')
    expect((await lstat(projection)).isDirectory()).toBe(true)
  })

  test('repoints a stale managed repository link and rejects an unresolved provider', async () => {
    const box = await preparedRepository()
    const projection = `${box.project.path}/.agents/skills/ki-example`
    await box.root.mkdir('old-skill')
    await box.project.mkdir('.agents/skills')
    await symlink(`${box.root.path}/old-skill`, projection, 'dir')

    const repaired = await box.run('ki repo repair')
    await box.project.write('.ki-config.toml', repositoryConfiguration.replace('example/harness:ki-example', 'missing/harness:ki-missing'))
    const unresolved = await box.run('ki repo repair')

    expect(repaired.exitCode).toBe(0)
    expect(await readlink(projection)).not.toBe(`${box.root.path}/old-skill`)
    expect(unresolved.exitCode).toBe(1)
    expect(unresolved.output).toContain('requires installed harness missing/harness')
  })

  test('recreates a dangling projection and refuses an unsafe declaration', async () => {
    const box = await preparedRepository()
    const projection = `${box.project.path}/.agents/skills/ki-example`
    await box.project.mkdir('.agents/skills')
    await symlink(`${box.root.path}/missing`, projection, 'dir')

    const dangling = await box.run('ki repo repair')
    const unsafeBox = await sandbox()
    await unsafeBox.project.write('actual.toml', repositoryConfiguration)
    await symlink(`${unsafeBox.project.path}/actual.toml`, `${unsafeBox.project.path}/.ki-config.toml`)
    await unsafeBox.run('ki bootstrap')
    const unsafe = await unsafeBox.run('ki repo repair')

    expect(dangling.exitCode).toBe(0)
    expect((await lstat(projection)).isSymbolicLink()).toBe(true)
    expect(unsafe).toEqual({ exitCode: 2, output: 'ki: error: no KI repository found from the current working directory\n' })
  })

  test('uses repository discovery by default and accepts explicit repository selectors', async () => {
    const box = await preparedRepository()
    await box.project.mkdir('child')
    box.cd('child')

    const nested = await box.run('ki repo repair')
    const selected = await box.run(['ki', 'repo', '--repo', box.project.path, 'repair'])

    expect(nested.exitCode).toBe(0)
    expect(nested.output).toContain('Repository: ')
    expect(selected.exitCode).toBe(0)
    expect(selected.output).toContain('Repository: ')
  })

  test('reports an unbootstrapped global environment as unrepairable', async () => {
    const box = await sandbox()

    const repair = await box.run('ki repo repair')

    expect(repair).toEqual({ exitCode: 1, output: 'ki: error: local KI configuration is missing; run ki bootstrap first\n' })
  })

  test('does not evaluate a direct repository when global configuration is invalid', async () => {
    const box = await preparedRepository()
    await box.config.write('ki/config.toml', 'schema = 1\n[agents\n')

    const repair = await box.run('ki repo repair')

    expect(repair.exitCode).toBe(1)
    expect(repair.output).toContain('local KI configuration is invalid: configuration must be valid TOML')
  })

  test('reports a registry configuration it cannot safely extend', async () => {
    const box = await preparedRepository()
    const existing = await box.config.read('ki/config.toml')
    await box.config.write('ki/config.toml', `${existing}\n[repositories]\npaths = []\nextra = true\n`)

    const repair = await box.run('ki repo repair')

    expect(repair.exitCode).toBe(1)
    expect(repair.output).toContain('Registry: ki configuration repositories section has unrecognised keys')
  })
})
