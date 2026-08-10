import { lstat, readlink, realpath, symlink } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

const repositoryConfiguration = `
[repo]
harnesses = ["example/harness"]

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
    expect(repair.output).toContain('link ')
    expect((await lstat(projection)).isSymbolicLink()).toBe(true)
    expect(await box.state.read('ki/registry.toml')).toContain(box.project.path)
  })

  test('reports but does not change a dry-run repository repair or its registry', async () => {
    const box = await preparedRepository()
    const projection = `${box.project.path}/.agents/skills/ki-example`

    const repair = await box.run('ki repo repair --dry-run')

    expect(repair.exitCode).toBe(0)
    expect(repair.output).toContain('would register')
    expect(repair.output).toContain('would link')
    await expect(lstat(projection)).rejects.toThrow()
    await expect(box.state.read('ki/registry.toml')).rejects.toThrow()
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
    await box.project.write(
      '.ki-config.toml',
      repositoryConfiguration.replace('[skills.ki-example]', '[skills."missing/harness:ki-missing"]')
    )
    const unresolved = await box.run('ki repo repair')

    expect(repaired.exitCode).toBe(0)
    expect(await readlink(projection)).not.toBe(`${box.root.path}/old-skill`)
    expect(unresolved.exitCode).toBe(1)
    expect(unresolved.output).toContain('declared harness missing/harness is not installed')
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
    expect(unsafe).toEqual({
      exitCode: 2,
      output: 'ki: error: no KI repository found from the current working directory\n'
    })
  })

  test('uses repository discovery by default and accepts explicit repository selectors', async () => {
    const box = await preparedRepository()
    await box.project.mkdir('child')
    box.cd('child')

    const nested = await box.run('ki repo repair')
    const selected = await box.run(['ki', 'repo', '--repo', box.project.path, 'repair'])

    expect(nested.exitCode).toBe(0)
    expect(nested.output).toContain('╭─ KI REPO REPAIR')
    expect(selected.exitCode).toBe(0)
    expect(selected.output).toContain('├─ repositories (1)')
  })

  test('renders every explicitly selected repository repair', async () => {
    const box = await preparedRepository()
    await box.root.write(
      'second/.ki-config.toml',
      repositoryConfiguration.replace('https://github.com/example/project', 'https://github.com/example/second')
    )
    const [project, second] = await Promise.all([realpath(box.project.path), realpath(`${box.root.path}/second`)])

    const repair = await box.run([
      'ki',
      'repo',
      '--repo',
      box.project.path,
      '--repo',
      `${box.root.path}/second`,
      'repair'
    ])

    expect(repair.exitCode).toBe(0)
    expect(repair.output).toContain('├─ repositories (2)')
    expect(repair.output).toContain(`│  ├─ ${project}`)
    expect(repair.output).toContain(`│  ╰─ ${second}`)
  })

  test('reports an unbootstrapped global environment as unrepairable', async () => {
    const box = await sandbox()

    const repair = await box.run('ki repo repair')

    expect(repair).toEqual({
      exitCode: 1,
      output: 'ki: error: local KI configuration is missing; run ki bootstrap first\n'
    })
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
    await box.state.write('ki/registry.toml', 'schema = 1\nrepositories = {}\nextra = true\n')

    const repair = await box.run('ki repo repair')

    expect(repair.exitCode).toBe(1)
    expect(repair.output).toContain('Registry: local KI repository registry is invalid: unrecognised key extra')
  })

  test('rejects an invalid sources registry before repairing a Knowledge Base', async () => {
    const box = await preparedRepository()
    await box.project.write(
      '.ki-config.toml',
      repositoryConfiguration.replace(
        'repository = "https://github.com/example/project"',
        'repository = "https://github.com/example/project"\nrepo_type = "kb"\nstore_roles = ["notes", "sources"]'
      )
    )
    await box.state.write('ki/registry.toml', 'schema = 1\nrepositories = {}\nextra = true\n')

    const repair = await box.run('ki repo repair')

    expect(repair.exitCode).toBe(1)
    expect(repair.output).toContain('Registry: local KI repository registry is invalid: unrecognised key extra')
  })

  test('requires an explicit complete sources binding before repairing a Knowledge Base', async () => {
    const box = await preparedRepository()
    const root = await realpath(box.project.path)
    const sources = await box.root.mkdir('sources')
    await box.project.write(
      '.ki-config.toml',
      repositoryConfiguration.replace(
        'repository = "https://github.com/example/project"',
        'repository = "https://github.com/example/project"\nrepo_type = "kb"\nstore_roles = ["notes", "sources"]'
      )
    )

    const missing = await box.run('ki repo repair')
    await box.state.write(
      'ki/registry.toml',
      `schema = 1\n\n[repositories."project"]\nrepository = "https://github.com/example/project"\npath = ${JSON.stringify(root)}\n\n[repositories."project".stores]\nsources = ${JSON.stringify(sources)}\n`
    )
    const complete = await box.run('ki repo repair')

    expect(missing.exitCode).toBe(1)
    expect(missing.output).toContain(`run ki registry add --repo ${root} --sources <absolute-path>`)
    expect(complete.exitCode).toBe(0)
    expect(complete.output).toContain(`Registry: complete ${root}`)
  })

  // Health inspects the projection path itself, and lstat resolves the components above it, so a
  // symlinked skills *directory* is invisible to classification: the projection reads as an
  // ordinary missing one, and the refusal only arrives once linking validates the container.
  test('reports a repair failure when the containing skills directory is a symbolic link', async () => {
    const box = await preparedRepository()
    await box.root.mkdir('outside-skills')
    await box.project.mkdir('.agents')
    await symlink(`${box.root.path}/outside-skills`, `${box.project.path}/.agents/skills`, 'dir')

    const repair = await box.run('ki repo repair')

    expect(repair.exitCode).toBe(1)
    expect(repair.output).toContain('✗ Repair: chatgpt-codex skills directory must be a directory')
    await expect(lstat(`${box.root.path}/outside-skills/ki-example`)).rejects.toThrow()
  })
})
