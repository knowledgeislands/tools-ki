import { chmod, lstat, readFile, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'
import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from '../_cli_helper.ts'

const repository = (identity: string, agora = ''): string =>
  `[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = ${JSON.stringify(identity)}\n${agora}`

const home = (id: string, members: Record<string, string>): string =>
  `[skills.ki-agora.homes.${id}]\nowner = "https://github.com/example/home"\npurpose = "Shared delivery"\nmembers = { ${Object.entries(
    members
  )
    .map(([identity, role]) => `${JSON.stringify(identity)} = ${JSON.stringify(role)}`)
    .join(', ')} }\n`

const membership = (id: string, homeIdentity: string, role: string): string =>
  `[skills.ki-agora.memberships.${id}]\nhome = ${JSON.stringify(homeIdentity)}\nrole = ${JSON.stringify(role)}\n`

const localRegistry = (
  entries: readonly { readonly key: string; readonly identity: string; readonly root: string }[]
): string =>
  [
    'schema = 1',
    ...entries.flatMap((entry) => [
      '',
      `[repositories.${JSON.stringify(entry.key)}]`,
      `repository = ${JSON.stringify(entry.identity)}`,
      `path = ${JSON.stringify(entry.root)}`
    ])
  ].join('\n')

const configuredAgora = async (box: Sandbox): Promise<Record<'home' | 'member' | 'extra', string>> => {
  const homeIdentity = 'https://github.com/example/home'
  const memberIdentity = 'https://github.com/example/member'
  const extraIdentity = 'https://github.com/example/extra'
  const homeRoot = await box.project.mkdir('home')
  const memberRoot = await box.project.mkdir('member with space')
  const extraRoot = await box.project.mkdir('extra')
  const unavailableRoot = join(box.project.path, 'unavailable')
  const registryTarget = await box.project.mkdir('registry target')
  const registryLink = join(box.project.path, 'registry-link')
  await symlink(registryTarget, registryLink)
  await box.project.write('home/.ki.toml', repository(homeIdentity, home('team', { [memberIdentity]: 'reviewer' })))
  await box.project.write(
    'member with space/.ki.toml',
    repository(memberIdentity, membership('team', homeIdentity, 'reviewer'))
  )
  await box.project.write('extra/.ki.toml', repository(extraIdentity))
  await box.state.write(
    'ki/registry.toml',
    localRegistry([
      { key: 'home', identity: homeIdentity, root: homeRoot },
      { key: 'member', identity: memberIdentity, root: memberRoot },
      { key: 'extra', identity: extraIdentity, root: extraRoot },
      { key: 'unavailable', identity: 'https://github.com/example/unavailable', root: unavailableRoot },
      { key: 'linked', identity: 'https://github.com/example/linked', root: registryLink }
    ])
  )
  return { home: homeRoot, member: memberRoot, extra: extraRoot }
}

interface ZedRow {
  readonly id: number
  readonly paths: string | null
  readonly remote?: number | null
}

const zedDatabase = async (
  box: Sandbox,
  relativeDirectory: string,
  rows: readonly ZedRow[],
  supported = true
): Promise<string> => {
  const directory = await box.home.mkdir(relativeDirectory)
  const path = join(directory, 'db.sqlite')
  const database = new DatabaseSync(path)
  if (supported) {
    database.exec(
      'CREATE TABLE workspaces (workspace_id INTEGER PRIMARY KEY, paths TEXT, local_paths TEXT, remote_connection_id INTEGER)'
    )
    const insert = database.prepare(
      'INSERT INTO workspaces (workspace_id, paths, local_paths, remote_connection_id) VALUES (?1, ?2, ?3, ?4)'
    )
    for (const row of rows) insert.run(row.id, row.paths, row.paths, row.remote ?? null)
  } else database.exec('CREATE TABLE workspaces (workspace_id TEXT PRIMARY KEY, payload BLOB)')
  database.close()
  return path
}

const inspect = (box: Sandbox, target: 'vscode' | 'zed', workspace: string, platform: NodeJS.Platform = 'darwin') =>
  box.run(['ki', 'agora', 'inspect', 'team', '--target', target, '--workspace', workspace], { platform })

describe('[ki agora inspect]', () => {
  test('classifies VS Code JSONC projection drift and exact state without mutation', async () => {
    const box = await sandbox()
    const roots = await configuredAgora(box)
    const unregisteredRoot = await box.project.mkdir('unregistered')
    const malformedRoot = await box.project.mkdir('malformed')
    const externalRoot = await box.project.mkdir('external')
    const linkedRoot = join(box.project.path, 'linked-root')
    const missingRoot = join(box.project.path, 'missing-root')
    await box.project.write('unregistered/.ki.toml', repository('https://github.com/example/unregistered'))
    await box.project.write('malformed/.ki.toml', 'not TOML')
    await symlink(externalRoot, linkedRoot)
    const relativeWorkspace = 'workspaces/team with space.code-workspace'
    await box.project.write(
      relativeWorkspace,
      `{ // JSONC is supported.\n  /* Block comments are supported\n     without changing line boundaries. */\n  "folders": [\n    { "path": "../home" },\n    { "path": ${JSON.stringify(
        roots.extra
      )} },\n    { "path": "../unregistered" },\n    { "path": "../malformed" },\n    { "path": "../external" },\n    { "path": ${JSON.stringify(
        linkedRoot
      )} },\n    { "path": ${JSON.stringify(
        missingRoot
      )} },\n    { "uri": "vscode-remote://ssh-remote+example/\\u0077orkspace" },\n  ],\n}`
    )
    const workspace = join(box.project.path, relativeWorkspace)
    const before = await readFile(workspace)
    const result = await inspect(box, 'vscode', workspace)
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('status: drift')
    expect(result.output).toContain(`home: ${roots.home}`)
    expect(result.output).toContain(`member: ${roots.member}`)
    expect(result.output).toContain(`extra: ${roots.extra}`)
    expect(result.output).toContain(`https://github.com/example/unregistered: ${unregisteredRoot}`)
    expect(result.output).toContain(externalRoot)
    expect(result.output).toContain(malformedRoot)
    expect(result.output).toContain(linkedRoot)
    expect(result.output).toContain(missingRoot)
    expect(result.output).toContain('vscode-remote://ssh-remote+example/workspace')
    expect(result.output).toContain(
      'EXPECTED=2 OBSERVED=8 MATCHED=1 MISSING=1 EXTRA_REGISTERED=1 UNREGISTERED_KI=1 EXTERNAL=5'
    )
    expect(await readFile(workspace)).toEqual(before)

    await box.project.write(
      'workspaces/exact.code-workspace',
      JSON.stringify({ folders: [{ path: '../home' }, { uri: pathToFileURL(roots.member).href }] })
    )
    const exact = await inspect(box, 'vscode', join(box.project.path, 'workspaces/exact.code-workspace'))
    expect(exact.exitCode).toBe(0)
    expect(exact.output).toContain('status: exact')
    expect(exact.output).toContain('matched (2)')
    expect(exact.output).toContain('MISSING=0 EXTRA_REGISTERED=0 UNREGISTERED_KI=0 EXTERNAL=0')
  })

  test('fails closed for invalid VS Code selectors and sources', async () => {
    const box = await sandbox()
    await configuredAgora(box)
    expect((await inspect(box, 'vscode', 'relative.code-workspace')).exitCode).toBe(2)
    expect((await inspect(box, 'vscode', join(box.project.path, 'missing.code-workspace'))).exitCode).toBe(2)

    const cases = [
      ['malformed.code-workspace', '{', 'valid JSON with comments'],
      ['comma.code-workspace', ',', 'valid JSON with comments'],
      ['comment.code-workspace', '{"folders":[]} /*', 'valid JSON with comments'],
      ['no-folders.code-workspace', '{}', 'folders array'],
      ['bad-folder.code-workspace', '{"folders":[null]}', 'path or URI records'],
      ['both.code-workspace', '{"folders":[{"path":".","uri":"file:///tmp"}]}', 'exactly one'],
      ['bad-uri.code-workspace', '{"folders":[{"uri":"not a uri"}]}', 'invalid folder URI'],
      [
        'bad-file-uri.code-workspace',
        '{"folders":[{"uri":"file://remote.example/workspace"}]}',
        'invalid physical folder URI'
      ]
    ] as const
    for (const [name, source, message] of cases) {
      await box.project.write(name, source)
      const result = await inspect(box, 'vscode', join(box.project.path, name))
      expect(result.exitCode).toBe(1)
      expect(result.output).toContain(message)
    }
    const source = join(box.project.path, 'no-folders.code-workspace')
    const linked = join(box.project.path, 'linked.code-workspace')
    await symlink(source, linked)
    expect((await inspect(box, 'vscode', linked)).exitCode).toBe(2)
    expect((await box.run('ki agora inspect team --target terminal --workspace anything')).exitCode).toBe(2)
    expect((await box.run('ki agora inspect unknown --target vscode --workspace anything')).exitCode).toBe(2)
    expect((await box.run('ki agora audit')).exitCode).toBe(1)
  })

  test('observes explicit stable and preview Zed workspaces read-only', async () => {
    const box = await sandbox()
    const roots = await configuredAgora(box)
    const stable = await zedDatabase(box, 'Library/Application Support/Zed/db/0-stable', [
      { id: 17, paths: `${roots.home}\n${roots.member}\n` }
    ])
    await chmod(stable, 0o444)
    const before = await readFile(stable)
    const exact = await inspect(box, 'zed', '17')
    expect(exact.exitCode).toBe(0)
    expect(exact.output).toContain('workspace: stable:')
    expect(exact.output).toContain('#17')
    expect(exact.output).toContain('status: exact')
    expect(await readFile(stable)).toEqual(before)
    expect(await lstat(`${stable}-wal`).catch(() => undefined)).toBeUndefined()
    expect(await lstat(`${stable}-shm`).catch(() => undefined)).toBeUndefined()

    await zedDatabase(box, 'Library/Application Support/Zed/db/0-preview', [{ id: 23, paths: roots.home }])
    const drift = await inspect(box, 'zed', '23')
    expect(drift.exitCode).toBe(1)
    expect(drift.output).toContain('workspace: preview:')
    expect(drift.output).toContain('missing (1)')
  })

  test('fails closed for unavailable, malformed, remote, absent, and ambiguous Zed observations', async () => {
    const unavailable = await sandbox()
    await configuredAgora(unavailable)
    expect((await inspect(unavailable, 'zed', '1')).exitCode).toBe(1)
    expect((await inspect(unavailable, 'zed', 'invalid')).exitCode).toBe(2)
    expect((await inspect(unavailable, 'zed', '999999999999999999999999')).exitCode).toBe(2)
    expect((await inspect(unavailable, 'zed', '1', 'aix')).exitCode).toBe(1)

    const schema = await sandbox()
    await configuredAgora(schema)
    await zedDatabase(schema, 'Library/Application Support/Zed/db/0-stable', [], false)
    expect((await inspect(schema, 'zed', '1')).output).toContain('unsupported schema')

    const corrupt = await sandbox()
    await configuredAgora(corrupt)
    await corrupt.home.write('Library/Application Support/Zed/db/0-stable/db.sqlite', 'not sqlite')
    expect((await inspect(corrupt, 'zed', '1')).output).toContain('could not be observed')

    const unreadable = await sandbox()
    await configuredAgora(unreadable)
    const unreadableDirectory = await unreadable.home.mkdir('Library/Application Support/Zed/db/0-stable')
    const unreadablePath = join(unreadableDirectory, 'db.sqlite')
    await unreadable.home.write('Library/Application Support/Zed/db/0-stable/db.sqlite', '')
    await chmod(unreadablePath, 0o000)
    expect((await inspect(unreadable, 'zed', '1')).output).toMatch(/unavailable|unsupported/u)

    const remote = await sandbox()
    const remoteRoots = await configuredAgora(remote)
    await zedDatabase(remote, 'Library/Application Support/Zed/db/0-stable', [
      { id: 2, paths: remoteRoots.home, remote: 7 },
      { id: 3, paths: null }
    ])
    expect((await inspect(remote, 'zed', '2')).output).toContain('is remote')
    expect((await inspect(remote, 'zed', '3')).exitCode).toBe(1)
    expect((await inspect(remote, 'zed', '4')).exitCode).toBe(2)

    const ambiguous = await sandbox()
    const ambiguousRoots = await configuredAgora(ambiguous)
    await zedDatabase(ambiguous, 'Library/Application Support/Zed/db/0-stable', [{ id: 5, paths: ambiguousRoots.home }])
    await zedDatabase(ambiguous, 'Library/Application Support/Zed/db/0-preview', [
      { id: 5, paths: ambiguousRoots.home }
    ])
    expect((await inspect(ambiguous, 'zed', '5')).output).toContain('ambiguous')
  })

  test('locates Zed databases on Linux and Windows variants', async () => {
    const linux = await sandbox()
    const linuxRoots = await configuredAgora(linux)
    await zedDatabase(linux, '../data/zed/db/0-stable', [{ id: 10, paths: `${linuxRoots.home}\n${linuxRoots.member}` }])
    expect((await inspect(linux, 'zed', '10', 'linux')).exitCode).toBe(0)

    const fallbackLinux = await sandbox()
    const fallbackLinuxRoots = await configuredAgora(fallbackLinux)
    fallbackLinux.setEnv({ XDG_DATA_HOME: undefined })
    await zedDatabase(fallbackLinux, '.local/share/zed/db/0-stable', [
      { id: 11, paths: `${fallbackLinuxRoots.home}\n${fallbackLinuxRoots.member}` }
    ])
    expect((await inspect(fallbackLinux, 'zed', '11', 'freebsd')).exitCode).toBe(0)

    const windows = await sandbox()
    const windowsRoots = await configuredAgora(windows)
    const localAppData = await windows.home.mkdir('LocalAppData')
    windows.setEnv({ LOCALAPPDATA: localAppData })
    await zedDatabase(windows, 'LocalAppData/Zed/db/0-stable', [
      { id: 12, paths: `${windowsRoots.home}\n${windowsRoots.member}` }
    ])
    expect((await inspect(windows, 'zed', '12', 'win32')).exitCode).toBe(0)

    const fallbackWindows = await sandbox()
    const fallbackWindowsRoots = await configuredAgora(fallbackWindows)
    fallbackWindows.setEnv({ LOCALAPPDATA: undefined })
    await zedDatabase(fallbackWindows, 'AppData/Local/Zed/db/0-stable', [
      { id: 13, paths: `${fallbackWindowsRoots.home}\n${fallbackWindowsRoots.member}` }
    ])
    expect((await inspect(fallbackWindows, 'zed', '13', 'win32')).exitCode).toBe(0)
  })
})
