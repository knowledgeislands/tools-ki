import { lstat, realpath, symlink } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

const first = '11111111-1111-4111-8111-111111111111'
const second = '22222222-2222-4222-8222-222222222222'
const third = '33333333-3333-4333-8333-333333333333'

const manifest = (
  id: string,
  state: 'creating' | 'active' | 'recoverable' | 'retired',
  path: string,
  lock: string
): string =>
  [
    'schema = 1',
    `id = ${JSON.stringify(id)}`,
    'operation = "harness-install"',
    `state = ${JSON.stringify(state)}`,
    `paths = [${JSON.stringify(path)}]`,
    `lock = ${JSON.stringify(lock)}`,
    ''
  ].join('\n')

describe('[ki manage cleanup]', () => {
  test('retains legacy recovery reports for unrecorded install residue', async () => {
    const box = await sandbox()
    const orphan = await box.data.mkdir(`ki/harnesses/example/.install-${first}`)

    const cleanup = await box.run('ki manage cleanup')

    expect(cleanup).toEqual({
      exitCode: 0,
      output: `╭─ KI MANAGE CLEANUP\n├─ eligible (1)\n│  ╰─ ${orphan} [removable] unpromoted extraction from an interrupted install\n╰─ summary: ELIGIBLE=1\n`
    })
  })

  test('reports manifest records in lexical identifier order without mutating recoverable staging', async () => {
    const box = await sandbox()
    const firstPath = await box.data.mkdir(`ki/harnesses/example/.install-${first}`)
    const firstLock = `${box.state.path}/ki/managed-artifacts/locks/${first}`
    const secondPath = await box.data.mkdir(`ki/harnesses/example/.install-${second}`)
    const secondLock = `${box.state.path}/ki/managed-artifacts/locks/${second}`
    await box.state.mkdir('ki/managed-artifacts/locks')
    await box.state.write(`ki/managed-artifacts/${second}.toml`, manifest(second, 'retired', secondPath, secondLock))
    await box.state.write(`ki/managed-artifacts/${first}.toml`, manifest(first, 'recoverable', firstPath, firstLock))

    const cleanup = await box.run('ki manage cleanup')

    expect(cleanup.exitCode).toBe(0)
    expect(cleanup.output).toContain(`artifact ${first} [refused: interrupted-recoverable] use ki manage repair`)
    expect(cleanup.output).toContain(
      `artifact ${second} [candidate] retired harness-install · would remove ${secondPath}`
    )
    expect(cleanup.output.indexOf(first)).toBeLessThan(cleanup.output.indexOf(second))
    expect(cleanup.output).toContain(
      'summary: ELIGIBLE=0 CANDIDATES=1 LIVE=0 INTERRUPTED_RECOVERABLE=1 MANUALLY_ALTERED=0 FOREIGN=0 UNREADABLE_MANIFESTS=0'
    )
    expect(cleanup.output.split(secondPath)).toHaveLength(2)
    expect((await lstat(firstPath)).isDirectory()).toBe(true)
  })

  test('refuses live, foreign, manually altered, and unreadable records without breaking a lock', async () => {
    const box = await sandbox()
    const livePath = await box.data.mkdir(`ki/harnesses/example/.install-${first}`)
    const liveLock = `${box.state.path}/ki/managed-artifacts/locks/${first}`
    const owner = await box.data.mkdir('ki/harnesses/example')
    const alteredPath = `${owner}/.install-${second}`
    const alteredLock = `${box.state.path}/ki/managed-artifacts/locks/${second}`
    const foreign = `${box.root.path}/foreign-install`
    const foreignLock = `${box.state.path}/ki/managed-artifacts/locks/${third}`
    await box.root.mkdir('target')
    await symlink(`${box.root.path}/target`, alteredPath, 'dir')
    await box.state.write(`ki/managed-artifacts/${first}.toml`, manifest(first, 'creating', livePath, liveLock))
    await box.state.mkdir(`ki/managed-artifacts/locks/${first}`)
    await box.state.write(`ki/managed-artifacts/${second}.toml`, manifest(second, 'creating', alteredPath, alteredLock))
    await box.state.write(`ki/managed-artifacts/${third}.toml`, manifest(third, 'retired', foreign, foreignLock))
    await box.state.write('ki/managed-artifacts/not-a-manifest.toml', 'schema = 2\n')

    const cleanup = await box.run('ki manage cleanup')

    expect(cleanup.exitCode).toBe(0)
    expect(cleanup.output).toContain(`artifact ${first} [refused: live] operation lock is held or unverifiable`)
    expect(cleanup.output).toContain(
      `artifact ${second} [refused: manually-altered] declared staging path is not a physical directory`
    )
    expect(cleanup.output).toContain('[refused: foreign] declared path or lock is outside the harness-install boundary')
    expect(cleanup.output).toContain('[refused: unreadable-manifest] schema 1 is required')
    expect(cleanup.output).toContain(
      'summary: ELIGIBLE=0 CANDIDATES=0 LIVE=1 INTERRUPTED_RECOVERABLE=0 MANUALLY_ALTERED=1 FOREIGN=1 UNREADABLE_MANIFESTS=1'
    )
  })

  test('refuses malformed schema-one records and a mismatched manifest name', async () => {
    const box = await sandbox()
    const path = `${box.data.path}/ki/harnesses/example/.install-${first}`
    const lock = `${box.state.path}/ki/managed-artifacts/locks/${first}`
    const cases = [
      'this is not TOML',
      'schema = 2',
      manifest('not-a-uuid', 'retired', path, lock),
      manifest(first, 'retired', path, lock).replace('operation = "harness-install"', 'operation = "other"'),
      manifest(first, 'retired', path, lock).replace('state = "retired"', 'state = "other"'),
      manifest(first, 'retired', path, lock).replace(`paths = [${JSON.stringify(path)}]`, 'paths = "invalid"'),
      manifest(first, 'retired', path, lock).replace(`paths = [${JSON.stringify(path)}]`, 'paths = []'),
      manifest(first, 'retired', path, lock).replace(`paths = [${JSON.stringify(path)}]`, 'paths = [5]'),
      manifest(first, 'retired', path, lock).replace(`paths = [${JSON.stringify(path)}]`, 'paths = ["relative"]'),
      manifest(first, 'retired', path, lock).replace(`lock = ${JSON.stringify(lock)}`, 'lock = 5'),
      manifest(first, 'retired', path, lock).replace(`lock = ${JSON.stringify(lock)}`, 'lock = "relative"')
    ]
    await Promise.all(cases.map((contents, index) => box.state.write(`ki/managed-artifacts/${index}.toml`, contents)))
    await box.state.write(`ki/managed-artifacts/${first}.toml`, manifest(second, 'retired', path, lock))
    await box.state.write(
      `ki/managed-artifacts/${third}.toml`,
      manifest(third, 'retired', path, `${box.state.path}/ki/managed-artifacts/locks/not-${third}`)
    )

    const cleanup = await box.run('ki manage cleanup')

    expect(cleanup.exitCode).toBe(0)
    expect(cleanup.output).toContain(
      'ELIGIBLE=0 CANDIDATES=0 LIVE=0 INTERRUPTED_RECOVERABLE=0 MANUALLY_ALTERED=0 FOREIGN=1'
    )
    expect(cleanup.output).toContain('UNREADABLE_MANIFESTS=12')
  })

  test('refuses active lock-free records, unsafe manifest directories, and manifest files that are not regular', async () => {
    const active = await sandbox()
    const path = await active.data.mkdir(`ki/harnesses/example/.install-${first}`)
    const lock = `${active.state.path}/ki/managed-artifacts/locks/${first}`
    await active.state.mkdir('ki/managed-artifacts/locks')
    await active.state.write(`ki/managed-artifacts/${first}.toml`, manifest(first, 'active', path, lock))

    const activeCleanup = await active.run('ki manage cleanup')

    expect(activeCleanup.output).toContain(`artifact ${first} [refused: live] active record has no producer lock`)

    const unsafeDirectory = await sandbox()
    await unsafeDirectory.state.write('ki/artifact-target', 'not a directory\n')
    await symlink(
      `${unsafeDirectory.state.path}/ki/artifact-target`,
      `${unsafeDirectory.state.path}/ki/managed-artifacts`
    )

    const unsafeCleanup = await unsafeDirectory.run('ki manage cleanup')

    expect(unsafeCleanup.output).toContain(
      '[refused: unreadable-manifest] managed artifacts directory must be a physical directory'
    )

    const unsafeFile = await sandbox()
    await unsafeFile.state.mkdir('ki/managed-artifacts/locks')
    await unsafeFile.state.mkdir(`ki/managed-artifacts/${first}.toml`)

    const fileCleanup = await unsafeFile.run('ki manage cleanup')

    expect(fileCleanup.output).toContain('[refused: unreadable-manifest] manifest must be a regular file')
  })

  test('does not follow an unsafe locks directory while reporting a valid manifest as live', async () => {
    const box = await sandbox()
    const path = await box.data.mkdir(`ki/harnesses/example/.install-${first}`)
    const lock = `${box.state.path}/ki/managed-artifacts/locks/${first}`
    await box.state.write(`ki/managed-artifacts/${first}.toml`, manifest(first, 'creating', path, lock))
    await box.state.write('ki/managed-artifacts-lock-target', 'not a directory\n')
    await symlink(`${box.state.path}/ki/managed-artifacts-lock-target`, `${box.state.path}/ki/managed-artifacts/locks`)

    const cleanup = await box.run('ki manage cleanup')

    expect(cleanup.output).toContain(`artifact ${first} [refused: live] operation lock is held or unverifiable`)
    expect((await lstat(`${box.state.path}/ki/managed-artifacts/locks`)).isSymbolicLink()).toBe(true)
  })

  test('refuses paths that are inside harness storage but do not name install staging directories', async () => {
    const box = await sandbox()
    const harnesses = await box.data.mkdir('ki/harnesses')
    const firstLock = `${box.state.path}/ki/managed-artifacts/locks/${first}`
    const secondLock = `${box.state.path}/ki/managed-artifacts/locks/${second}`
    const thirdLock = `${box.state.path}/ki/managed-artifacts/locks/${third}`
    await box.state.write(
      `ki/managed-artifacts/${first}.toml`,
      manifest(first, 'retired', `${harnesses}/example/not-install-staging`, firstLock)
    )
    await box.state.write(
      `ki/managed-artifacts/${second}.toml`,
      manifest(second, 'retired', `${harnesses}/INVALID/.install-${second}`, secondLock)
    )
    await box.state.write(
      `ki/managed-artifacts/${third}.toml`,
      manifest(third, 'retired', `${harnesses}/example/nested/.install-${third}`, thirdLock)
    )

    const cleanup = await box.run('ki manage cleanup')

    expect(cleanup.output).toContain(
      'summary: ELIGIBLE=0 CANDIDATES=0 LIVE=0 INTERRUPTED_RECOVERABLE=0 MANUALLY_ALTERED=0 FOREIGN=3'
    )
  })

  test('refuses a manifest when its harness root no longer exists', async () => {
    const box = await sandbox()
    const path = `${box.data.path}/ki/harnesses/example/.install-${first}`
    const lock = `${box.state.path}/ki/managed-artifacts/locks/${first}`
    await box.state.write(`ki/managed-artifacts/${first}.toml`, manifest(first, 'retired', path, lock))

    const cleanup = await box.run('ki manage cleanup')

    expect(cleanup).toEqual({
      exitCode: 0,
      output: `╭─ KI MANAGE CLEANUP\n├─ eligible (0)\n│  ╰─ none\n├─ artifacts (1)\n│  ╰─ artifact ${first} [refused: foreign] declared path or lock is outside the harness-install boundary\n╰─ summary: ELIGIBLE=0 CANDIDATES=0 LIVE=0 INTERRUPTED_RECOVERABLE=0 MANUALLY_ALTERED=0 FOREIGN=1 UNREADABLE_MANIFESTS=0\n`
    })
  })

  test('reports a recorded install staging directory that has disappeared', async () => {
    const box = await sandbox()
    const owner = await realpath(await box.data.mkdir('ki/harnesses/example'))
    const path = `${owner}/.install-${first}`
    const lock = `${box.state.path}/ki/managed-artifacts/locks/${first}`
    await box.state.mkdir('ki/managed-artifacts/locks')
    await box.state.write(`ki/managed-artifacts/${first}.toml`, manifest(first, 'recoverable', path, lock))

    const cleanup = await box.run('ki manage cleanup')

    expect(cleanup.output).toContain(
      `artifact ${first} [refused: manually-altered] declared staging path is not a physical directory`
    )
  })
})
