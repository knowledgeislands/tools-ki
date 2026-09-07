import { lstat, readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

type Box = Awaited<ReturnType<typeof sandbox>>

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
  box.setRunner(async (command, arguments_) => {
    if (command !== 'chezmoi') return { exitCode: 2, output: 'unexpected command' }
    if (arguments_[0] === 'source-path') return { exitCode: 0, output: `${sourceRoot}\n` }
    if (arguments_[0] === 'execute-template') return { exitCode: 0, output: '{"trustedFolders":[]}\n' }
    return { exitCode: 2, output: 'unexpected chezmoi arguments' }
  })
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
})
