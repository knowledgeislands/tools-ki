import { lstat, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

type Box = Awaited<ReturnType<typeof sandbox>>

const setChezmoiRunner = (
  box: Box,
  sourceRoot: string,
  options: {
    readonly sourceExit?: number
    readonly sourceOutput?: string
    readonly templateExit?: number
    readonly templateOutput?: string
  } = {}
): void => {
  box.setRunner(async (command, arguments_) => {
    if (command !== 'chezmoi') return { exitCode: 2, output: 'unexpected command' }
    if (arguments_[0] === 'source-path')
      return { exitCode: options.sourceExit ?? 0, output: options.sourceOutput ?? `${sourceRoot}\n` }
    if (arguments_[0] === 'execute-template')
      return { exitCode: options.templateExit ?? 0, output: options.templateOutput ?? '{"trustedFolders":[]}\n' }
    return { exitCode: 2, output: 'unexpected chezmoi arguments' }
  })
}

const repositoryDeclaration = (name: string): string => `[repo]
harnesses = ["knowledgeislands/ki-agentic-harness"]

[skills.ki-repo]
repository = "https://github.com/example/${name}"
title = "${name}"
description = "Test repository."
repo_code = "TEST"
supported_runtimes = ["claude-code"]
visibility = "private"
`

const registry = (repositories: readonly { readonly key: string; readonly path: string }[]): string =>
  [
    'schema = 1',
    ...repositories.flatMap((repository) => [
      '',
      `[repositories.${JSON.stringify(repository.key)}]`,
      `repository = "https://github.com/example/${repository.key}"`,
      `path = ${JSON.stringify(repository.path)}`
    ]),
    ''
  ].join('\n')

const prepare = async (
  names: readonly string[]
): Promise<{
  readonly box: Box
  readonly repositories: readonly string[]
  readonly sourceRoot: string
  readonly oneDriveRoot: string
}> => {
  const box = await sandbox()
  const sourceRoot = await box.root.mkdir('chezmoi-source')
  const oneDriveRoot = await box.home.mkdir('Library/CloudStorage/OneDrive-Personal')
  const repositories: string[] = []
  for (const name of names) {
    const path = await box.root.mkdir(`repositories/${name}`)
    await box.root.write(`repositories/${name}/.ki.toml`, repositoryDeclaration(name))
    repositories.push(path)
  }
  await box.state.write('ki/registry.toml', registry(repositories.map((path) => ({ key: basename(path), path }))))
  await box.root.mkdir('chezmoi-source/workspaces/vscode')
  await box.root.write('chezmoi-source/.chezmoidata/trusted-folders.yaml', '# Test inventory\ntrustedFolders:\n')
  setChezmoiRunner(box, sourceRoot)
  return { box, repositories, sourceRoot, oneDriveRoot }
}

describe('ki manage vscode', () => {
  test('exposes explicit check, sync and source-store commands', async () => {
    const box = await sandbox()
    const help = await box.run('ki manage vscode --help')
    const source = await box.run('ki manage vscode source create --help')

    expect(help.exitCode).toBe(0)
    expect(help.output).toContain('check')
    expect(help.output).toContain('sync')
    expect(help.output).toContain('source')
    expect(source.output).toContain('<repository>')
    expect(source.output).toContain('--write')
  })

  test('synchronises missing workspaces and runtime-scoped trusted folders', async () => {
    const { box, repositories, sourceRoot } = await prepare(['er-research'])
    const preview = await box.run('ki manage vscode check')
    expect(preview.exitCode).toBe(1)
    expect(preview.output).toContain('drift: rerun as ki manage vscode sync --write')
    expect((await box.run('ki manage vscode sync')).exitCode).toBe(1)

    const result = await box.run('ki manage vscode sync --write')
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('synchronised 2 source file(s)')
    expect(
      JSON.parse(await readFile(`${sourceRoot}/workspaces/vscode/kis-er-research.code-workspace`, 'utf8'))
    ).toEqual({ folders: [{ path: repositories[0] }] })
    expect(await readFile(`${sourceRoot}/.chezmoidata/trusted-folders.yaml`, 'utf8')).toContain(
      `path: ${repositories[0]}\n    clients: [claude-code]`
    )
    expect((await box.run('ki manage vscode check')).exitCode).toBe(0)
  })

  test('previews then creates and associates an opt-in source store', async () => {
    const { box, repositories, sourceRoot, oneDriveRoot } = await prepare(['mcp-acquire-whatsapp'])
    const source = `${oneDriveRoot}/sources-mcp-acquire-whatsapp`

    const preview = await box.run('ki manage vscode source create mcp-acquire-whatsapp')
    expect(preview.exitCode).toBe(1)
    expect(preview.output).toContain(`would create source store: ${source}`)
    expect(await lstat(source).catch(() => undefined)).toBeUndefined()

    const result = await box.run('ki manage vscode source create mcp-acquire-whatsapp --write')
    expect(result.exitCode).toBe(0)
    expect((await lstat(source)).isDirectory()).toBe(true)
    expect(
      JSON.parse(await readFile(`${sourceRoot}/workspaces/vscode/kis-mcp-acquire-whatsapp.code-workspace`, 'utf8'))
    ).toEqual({ folders: [{ path: repositories[0] }, { path: source }] })
    expect((await box.run('ki manage vscode source create mcp-acquire-whatsapp')).exitCode).toBe(0)
    expect(
      (await box.run(['ki', 'manage', 'vscode', 'source', 'create', repositories[0] as string, '--write'])).exitCode
    ).toBe(0)
  })

  test('fails closed when a legacy source suffix matches multiple repositories', async () => {
    const { box, sourceRoot, oneDriveRoot } = await prepare(['mcp-acquire-whatsapp', 'tools-acquire-whatsapp'])
    await box.home.mkdir('Library/CloudStorage/OneDrive-Personal/sources-acquire-whatsapp')

    const result = await box.run('ki manage vscode sync --write')
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('ambiguous matches')
    expect(await readFile(`${sourceRoot}/.chezmoidata/trusted-folders.yaml`, 'utf8')).toBe(
      '# Test inventory\ntrustedFolders:\n'
    )
    expect(oneDriveRoot).toContain('OneDrive-Personal')
  })

  test('rejects unavailable chezmoi, malformed repositories, workspaces, and trusted-folder state', async () => {
    const { box, repositories, sourceRoot } = await prepare(['alpha'])

    setChezmoiRunner(box, sourceRoot, { sourceExit: 1, sourceOutput: 'not configured\n' })
    expect((await box.run('ki manage vscode check')).output).toContain('chezmoi source path unavailable')
    setChezmoiRunner(box, sourceRoot, { sourceOutput: 'relative\n' })
    expect((await box.run('ki manage vscode check')).output).toContain('chezmoi source path must be one absolute path')
    setChezmoiRunner(box, sourceRoot, { sourceOutput: `${sourceRoot}\n${sourceRoot}\n` })
    expect((await box.run('ki manage vscode check')).output).toContain('chezmoi source path must be one absolute path')
    setChezmoiRunner(box, sourceRoot)

    await writeFile(join(repositories[0] as string, '.ki.toml'), '[', 'utf8')
    expect((await box.run('ki manage vscode check')).output).toContain('registered repository has invalid .ki.toml')
    await writeFile(
      join(repositories[0] as string, '.ki.toml'),
      repositoryDeclaration('alpha').replace('supported_runtimes = ["claude-code"]', 'supported_runtimes = "bad"'),
      'utf8'
    )
    expect((await box.run('ki manage vscode check')).output).toContain('invalid supported_runtimes declaration')
    await writeFile(
      join(repositories[0] as string, '.ki.toml'),
      repositoryDeclaration('alpha').replace('supported_runtimes = ["claude-code"]', 'supported_runtimes = [1]'),
      'utf8'
    )
    expect((await box.run('ki manage vscode check')).output).toContain('invalid supported_runtimes declaration')
    await writeFile(join(repositories[0] as string, '.ki.toml'), '[repo]\nharnesses = []\n', 'utf8')
    expect((await box.run('ki manage vscode check')).output).toContain('invalid supported_runtimes declaration')
    await writeFile(join(repositories[0] as string, '.ki.toml'), '[skills]\nother = true\n', 'utf8')
    expect((await box.run('ki manage vscode check')).output).toContain('invalid supported_runtimes declaration')
    await writeFile(join(repositories[0] as string, '.ki.toml'), '[skills]\nki-repo = "bad"\n', 'utf8')
    expect((await box.run('ki manage vscode check')).output).toContain('invalid supported_runtimes declaration')
    await writeFile(
      join(repositories[0] as string, '.ki.toml'),
      repositoryDeclaration('alpha').replace(
        'supported_runtimes = ["claude-code"]',
        'supported_runtimes = ["unknown"]'
      ),
      'utf8'
    )
    expect((await box.run('ki manage vscode check')).output).toContain('no supported trusted runtime')
    await writeFile(
      join(repositories[0] as string, '.ki.toml'),
      repositoryDeclaration('alpha').replace(
        'supported_runtimes = ["claude-code"]',
        'supported_runtimes = ["unknown", "chatgpt-codex", "claude-desktop"]'
      ),
      'utf8'
    )

    const workspace = join(sourceRoot, 'workspaces/vscode/broken.code-workspace')
    await writeFile(workspace, '{', 'utf8')
    expect((await box.run('ki manage vscode check')).output).toContain('invalid VS Code workspace')
    await writeFile(workspace, '{}', 'utf8')
    expect((await box.run('ki manage vscode check')).output).toContain('has no folders array')
    await writeFile(workspace, '{"folders":[{}]}', 'utf8')
    expect((await box.run('ki manage vscode check')).output).toContain('workspace folder must be an absolute path')
    await writeFile(workspace, '{"folders":[{"path":"relative"}]}', 'utf8')
    expect((await box.run('ki manage vscode check')).output).toContain('workspace folder must be an absolute path')
    await rm(workspace)

    setChezmoiRunner(box, sourceRoot, { templateExit: 1, templateOutput: 'template failed\n' })
    expect((await box.run('ki manage vscode check')).output).toContain('invalid trusted-folder inventory')
    setChezmoiRunner(box, sourceRoot, { templateOutput: 'not JSON' })
    expect((await box.run('ki manage vscode check')).output).toContain('template did not produce JSON')
    setChezmoiRunner(box, sourceRoot, { templateOutput: '{}' })
    expect((await box.run('ki manage vscode check')).output).toContain('has no trustedFolders array')
    setChezmoiRunner(box, sourceRoot)
    await writeFile(join(sourceRoot, '.chezmoidata/trusted-folders.yaml'), '# missing root key\n', 'utf8')
    expect((await box.run('ki manage vscode check')).output).toContain('has no trustedFolders root key')
  })

  test('fails closed for unsafe workspace names and unavailable or unassociated source stores', async () => {
    const invalid = await prepare(['bad_name'])
    expect((await invalid.box.run('ki manage vscode check')).output).toContain(
      'cannot derive a safe VS Code workspace name'
    )

    const missingStore = await prepare(['alpha'])
    await rm(missingStore.oneDriveRoot, { recursive: true })
    expect((await missingStore.box.run('ki manage vscode source create alpha')).output).toContain(
      'OneDrive source-store root is unavailable'
    )
    expect((await missingStore.box.run('ki manage vscode check')).exitCode).toBe(1)
    await writeFile(missingStore.oneDriveRoot, 'not a directory', 'utf8')
    expect((await missingStore.box.run('ki manage vscode check')).output).toContain(
      'OneDrive source-store root is not a directory'
    )

    const unassociated = await prepare(['alpha'])
    await unassociated.box.home.mkdir('Library/CloudStorage/OneDrive-Personal/sources-missing')
    expect((await unassociated.box.run('ki manage vscode check')).output).toContain('no registered repository')
    expect((await unassociated.box.run('ki manage vscode source create unknown')).output).toContain(
      'repository is not registered'
    )

    const ambiguous = await prepare(['seed'])
    const first = await ambiguous.box.root.mkdir('one/shared')
    const second = await ambiguous.box.root.mkdir('two/shared')
    await ambiguous.box.root.write('one/shared/.ki.toml', repositoryDeclaration('first'))
    await ambiguous.box.root.write('two/shared/.ki.toml', repositoryDeclaration('second'))
    await ambiguous.box.state.write(
      'ki/registry.toml',
      registry([
        { key: 'first', path: first },
        { key: 'second', path: second }
      ])
    )
    expect((await ambiguous.box.run('ki manage vscode source create shared')).output).toContain(
      'repository basename is ambiguous'
    )

    const collision = await prepare(['alpha'])
    await collision.box.root.write('chezmoi-source/workspaces/vscode/kis-alpha.code-workspace', '{"folders":[]}\n')
    expect((await collision.box.run('ki manage vscode check')).output).toContain(
      'workspace file exists but does not include its KI repository'
    )

    const legacy = await prepare(['tools-alpha'])
    const source = await legacy.box.home.mkdir('Library/CloudStorage/OneDrive-Personal/sources-alpha')
    await legacy.box.root.write(
      'chezmoi-source/workspaces/vscode/custom.code-workspace',
      JSON.stringify({ folders: [{ path: legacy.repositories[0] }, { path: source }] })
    )
    expect((await legacy.box.run('ki manage vscode source create tools-alpha')).exitCode).toBe(1)
    await legacy.box.root.write(
      'chezmoi-source/workspaces/vscode/other.code-workspace',
      `${JSON.stringify({ folders: [{ path: `${legacy.box.root.path}/alpha` }] })}\n`
    )
    await symlink(source, join(legacy.oneDriveRoot, 'sources-ignored-link'))
    expect((await legacy.box.run('ki manage vscode sync --write')).exitCode).toBe(0)
    expect((await legacy.box.run('ki manage vscode source create tools-alpha')).exitCode).toBe(0)

    const multiple = await prepare(['mcp-acquire-whatsapp'])
    await multiple.box.home.mkdir('Library/CloudStorage/OneDrive-Personal/sources-whatsapp')
    await multiple.box.home.mkdir('Library/CloudStorage/OneDrive-Personal/sources-acquire-whatsapp')
    expect((await multiple.box.run('ki manage vscode source create mcp-acquire-whatsapp')).output).toContain(
      'repository already has multiple source stores'
    )

    const sorted = await prepare(['alpha', 'beta'])
    await sorted.box.home.mkdir('Library/CloudStorage/OneDrive-Personal/sources-beta')
    expect((await sorted.box.run('ki manage vscode source create alpha --write')).exitCode).toBe(0)
  })
})
