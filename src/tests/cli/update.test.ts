import { lstat, symlink } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { makeHarnessArchive } from './_archive_helper.ts'
import { sandbox } from './_cli_helper.ts'

const skill = '---\nname: ki-example\nki-depends-on: []\n---\n'

const configuration = (sha256: string): string =>
  `schema = 1

[agents]
ids = []

[harnesses]
ids = []
releases = [{ id = "example/harness", url = "https://releases.example.test/harness.tgz", sha256 = "${sha256}" }]

[skills]
`

const archive = () => makeHarnessArchive({ 'source/skills/example/SKILL.md': skill })

const receipt = (box: Awaited<ReturnType<typeof sandbox>>, installer: string, manual: string): string =>
  `schema = 1
distribution = "installer"
version = "v1.0.0"
executable = "${box.executable}"
manual = "${manual}"
installer = "${installer}"
`

describe('[ki update and upgrade]', () => {
  test('reports unavailable external executable ownership while leaving an empty harness inventory unchanged', async () => {
    const box = await sandbox()

    const result = await box.run('ki update')

    expect(result).toEqual({
      exitCode: 0,
      output:
        'ki update\nCLI executable: unavailable (CLI executable is not installer-managed; update it with its distribution manager)\nNo installed harnesses.\n'
    })
  })

  test('updates only an installer-managed executable through its persisted verified installer', async () => {
    const box = await sandbox()
    await box.root.write('installer.sh', '#!/usr/bin/env bash\nprintf update\nprintf diagnostic >&2\nexit 0\n')
    await box.root.write('ki.1', '.TH KI 1\n')
    await box.home.write('.local/state/ki/installation.toml', receipt(box, `${box.root.path}/installer.sh`, `${box.root.path}/ki.1`))

    const updated = await box.run('ki update --cli', { runner: 'default' })

    expect(updated).toEqual({ exitCode: 0, output: 'ki update\nCLI executable: updated with the verified installer\n' })
  })

  test('rejects malformed, incompatible, mismatched, and incomplete installer receipts before invoking an update', async () => {
    const malformed = await sandbox()
    await malformed.home.write('.local/state/ki/installation.toml', '[broken\n')
    const malformedResult = await malformed.run('ki update --cli')

    const incompatible = await sandbox()
    await incompatible.home.write('.local/state/ki/installation.toml', 'schema = 2\ndistribution = "installer"\n')
    const incompatibleResult = await incompatible.run('ki update --cli')

    const mismatched = await sandbox()
    await mismatched.root.write('installer.sh', '')
    await mismatched.root.write('ki.1', '')
    await mismatched.home.write(
      '.local/state/ki/installation.toml',
      `schema = 1\ndistribution = "installer"\nexecutable = "${mismatched.root.path}/other-ki"\nmanual = "${mismatched.root.path}/ki.1"\ninstaller = "${mismatched.root.path}/installer.sh"\n`
    )
    const mismatchedResult = await mismatched.run('ki update --cli')

    const missingCurrent = await sandbox()
    await missingCurrent.root.write('installer.sh', '')
    await missingCurrent.root.write('ki.1', '')
    await missingCurrent.home.write(
      '.local/state/ki/installation.toml',
      receipt(missingCurrent, `${missingCurrent.root.path}/installer.sh`, `${missingCurrent.root.path}/ki.1`)
    )
    const missingCurrentResult = await missingCurrent.run('ki update --cli', { executable: `${missingCurrent.root.path}/missing-ki` })

    const incomplete = await sandbox()
    await incomplete.root.write('installer.sh', '')
    await incomplete.home.write(
      '.local/state/ki/installation.toml',
      receipt(incomplete, `${incomplete.root.path}/installer.sh`, `${incomplete.root.path}/missing.1`)
    )
    const incompleteResult = await incomplete.run('ki update --cli')

    const relativePath = await sandbox()
    await relativePath.root.write('installer.sh', '')
    await relativePath.home.write(
      '.local/state/ki/installation.toml',
      `schema = 1\ndistribution = "installer"\nexecutable = "${relativePath.executable}"\nmanual = "relative.1"\ninstaller = "${relativePath.root.path}/installer.sh"\n`
    )
    const relativePathResult = await relativePath.run('ki update --cli')

    const directory = await sandbox()
    await directory.home.mkdir('.local/state/ki/installation.toml')
    const directoryResult = await directory.run('ki update --cli')

    expect(malformedResult).toEqual({ exitCode: 1, output: 'ki: error: installer receipt must be valid TOML\n' })
    expect(incompatibleResult).toEqual({
      exitCode: 1,
      output: 'ki: error: installer receipt must use schema 1 for the installer distribution\n'
    })
    expect(mismatchedResult).toEqual({ exitCode: 1, output: 'ki: error: installer receipt does not own the running CLI executable\n' })
    expect(missingCurrentResult).toEqual({ exitCode: 1, output: 'ki: error: installer receipt does not own the running CLI executable\n' })
    expect(incompleteResult).toEqual({ exitCode: 1, output: 'ki: error: installer receipt manual must be a regular file\n' })
    expect(relativePathResult).toEqual({ exitCode: 1, output: 'ki: error: installer receipt manual must be an absolute path\n' })
    expect(directoryResult).toEqual({ exitCode: 1, output: 'ki: error: installer receipt must be a regular file\n' })
  })

  test('reports failed installer execution without mutating harness state', async () => {
    const box = await sandbox()
    await box.root.write('installer.sh', '')
    await box.root.write('ki.1', '')
    await box.home.write('.local/state/ki/installation.toml', receipt(box, `${box.root.path}/installer.sh`, `${box.root.path}/ki.1`))
    box.setRunner(async () => ({ exitCode: 1, output: 'installer failed' }))
    const detailed = await box.run('ki update --cli')
    box.setRunner(async () => ({ exitCode: 1, output: '' }))
    const silent = await box.run('ki update --cli')

    expect(detailed).toEqual({ exitCode: 1, output: 'ki: error: verified installer update failed: installer failed\n' })
    expect(silent).toEqual({ exitCode: 1, output: 'ki: error: verified installer update failed\n' })
  })

  test('reports an installer terminated by a signal as a failed update', async () => {
    const box = await sandbox()
    await box.root.write('installer.sh', 'kill -TERM $$\n')
    await box.root.write('ki.1', '')
    await box.home.write('.local/state/ki/installation.toml', receipt(box, `${box.root.path}/installer.sh`, `${box.root.path}/ki.1`))

    const result = await box.run('ki update --cli', { runner: 'default' })

    expect(result).toEqual({ exitCode: 1, output: 'ki: error: verified installer update failed\n' })
  })

  test('propagates a host failure to start the verified installer', async () => {
    const box = await sandbox()
    await box.root.write('installer.sh', '')
    await box.root.write('ki.1', '')
    await box.home.write('.local/state/ki/installation.toml', receipt(box, `${box.root.path}/installer.sh`, `${box.root.path}/ki.1`))
    box.setEnv({ PATH: '' })

    await expect(box.run('ki update', { runner: 'default' })).rejects.toThrow('spawn bash ENOENT')
  })

  test('refuses an explicit CLI update for a local development installation', async () => {
    const box = await sandbox()
    await symlink(box.executable, `${box.root.path}/linked-ki`)

    const result = await box.run('ki update --cli', { executable: `${box.root.path}/linked-ki` })

    expect(result).toEqual({
      exitCode: 1,
      output: 'ki: error: CLI executable is a local development installation; update its checkout directly\n'
    })
  })

  test('refreshes configured installed harnesses while preserving their capability inventory', async () => {
    const box = await sandbox()
    const payload = archive()
    await box.setupExampleHarness()
    await box.config.write('ki/config.toml', configuration(payload.sha256))
    box.setFetcher(async () => new Response(payload.payload))

    const updated = await box.run('ki update')

    expect(updated.output).toContain(`example/harness: refreshed archive ${payload.sha256}`)
    expect(await box.data.read('ki/harnesses/example/harness/skills/example/SKILL.md')).toBe(skill)
  })

  test('reports unconfigured harnesses without mutating them', async () => {
    const box = await sandbox()
    await box.setupExampleHarness()
    await box.data.write('ki/harnesses/other/harness/skills/ki-other/SKILL.md', '---\nname: ki-other\nki-depends-on: []\n---\n')

    const result = await box.run('ki update')

    expect(result.output).toContain('example/harness: unavailable (no configured immutable release)')
    expect(result.output).toContain('other/harness: unavailable (no configured immutable release)')
    expect(await box.data.read('ki/harnesses/example/harness/skills/ki-example/SKILL.md')).toBe(skill)
  })

  test('upgrades the uniquely resolved providers declared by the current repository', async () => {
    const box = await sandbox()
    const payload = archive()
    await box.setupExampleHarness()
    await box.config.write('ki/config.toml', configuration(payload.sha256))
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
    box.setFetcher(async () => new Response(payload.payload))

    const upgraded = await box.run('ki repo upgrade')

    expect(upgraded.output).toContain(`example/harness: refreshed archive ${payload.sha256}`)
    expect(await box.data.read('ki/harnesses/example/harness/skills/example/SKILL.md')).toBe(skill)
  })

  test('reports a repository with no declared capabilities as an update no-op', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', '')

    const result = await box.run('ki repo upgrade')

    expect(result).toEqual({ exitCode: 0, output: 'ki repo upgrade\nNo declared capabilities.\n' })
  })

  test('reports every explicitly selected repository during an upgrade', async () => {
    const box = await sandbox()
    await box.root.write('first/.ki-config.toml', '')
    await box.root.write('second/.ki-config.toml', '')

    const result = await box.run(['ki', 'repo', '--repo', `${box.root.path}/first`, '--repo', `${box.root.path}/second`, 'upgrade'])

    expect(result).toEqual({ exitCode: 0, output: 'ki repo upgrade\nNo declared capabilities.\nNo declared capabilities.\n' })
  })

  test('refuses upgrade outside a repository and uses the declared repository provider', async () => {
    const outside = await sandbox()
    const missingRepository = await outside.run('ki repo upgrade')

    const box = await sandbox()
    await box.setupExampleHarness()
    await box.data.write('ki/harnesses/other/harness/skills/example/SKILL.md', skill)
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
    const declared = await box.run('ki repo upgrade')

    expect(missingRepository).toEqual({ exitCode: 2, output: 'ki: error: no KI repository found from the current working directory\n' })
    expect(declared.output).toContain('example/harness: unavailable (no configured immutable release)')
  })

  test('keeps a provider intact when its upgrade archive drops an installed capability', async () => {
    const box = await sandbox()
    const payload = makeHarnessArchive({ 'source/skills/other/SKILL.md': '---\nname: ki-other\nki-depends-on: []\n---\n' })
    await box.setupExampleHarness()
    await box.config.write('ki/config.toml', configuration(payload.sha256))
    await box.project.write('.ki-config.toml', '["example/harness:ki-example"]\n')
    box.setFetcher(async () => new Response(payload.payload))

    const result = await box.run('ki repo upgrade')

    expect(result).toEqual({ exitCode: 1, output: 'ki: error: harness example/harness does not provide skill ki-example\n' })
    expect(await box.data.read('ki/harnesses/example/harness/skills/ki-example/SKILL.md')).toBe(skill)
    await expect(lstat(`${box.data.path}/ki/harnesses/example/harness/skills/other`)).rejects.toThrow()
  })
})
