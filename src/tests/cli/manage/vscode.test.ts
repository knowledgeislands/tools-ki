import { readFile, rm, writeFile } from 'node:fs/promises'
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

interface RegisteredRepository {
  readonly key: string
  readonly path: string
  readonly sources?: string
  readonly legacy?: string
}

const registry = (repositories: readonly RegisteredRepository[]): string =>
  [
    'schema = 1',
    ...repositories.flatMap((repository) => [
      '',
      `[repositories.${JSON.stringify(repository.key)}]`,
      `repository = "https://github.com/example/${repository.key}"`,
      `path = ${JSON.stringify(repository.path)}`,
      ...(repository.sources || repository.legacy
        ? [
            '',
            `[repositories.${JSON.stringify(repository.key)}.stores]`,
            ...(repository.sources ? [`sources = ${JSON.stringify(repository.sources)}`] : []),
            ...(repository.legacy ? [`legacy = ${JSON.stringify(repository.legacy)}`] : [])
          ]
        : [])
    ]),
    ''
  ].join('\n')

const prepare = async (names: readonly string[]) => {
  const box = await sandbox()
  const sourceRoot = await box.root.mkdir('chezmoi-source')
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
  return { box, repositories, sourceRoot }
}

describe('ki manage vscode', () => {
  test('exposes only projection check and sync commands', async () => {
    const box = await sandbox()
    const help = await box.run('ki manage vscode --help')

    expect(help.exitCode).toBe(0)
    expect(help.output).toContain('check')
    expect(help.output).toContain('sync')
    expect((await box.run('ki manage vscode source create alpha')).exitCode).toBe(2)
  })

  test('synchronises repository roots and runtime-scoped trusted folders', async () => {
    const { box, repositories, sourceRoot } = await prepare(['er-research'])
    expect((await box.run('ki manage vscode check')).exitCode).toBe(1)
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

  test('consumes explicit sources bindings and ignores legacy and unbound directories', async () => {
    const { box, repositories, sourceRoot } = await prepare(['knowledge'])
    const sources = await box.root.mkdir('stores/sources')
    const legacy = await box.root.mkdir('stores/legacy')
    const unbound = await box.root.mkdir('stores/sources-unregistered')
    await box.state.write(
      'ki/registry.toml',
      registry([{ key: 'knowledge', path: repositories[0] as string, sources, legacy }])
    )
    await box.root.write(
      'chezmoi-source/workspaces/vscode/custom-a.code-workspace',
      JSON.stringify({ folders: [{ path: repositories[0] }, { path: unbound }] })
    )
    await box.root.write(
      'chezmoi-source/workspaces/vscode/custom-b.code-workspace',
      JSON.stringify({ folders: [{ path: repositories[0] }, { path: sources }] })
    )

    expect((await box.run('ki manage vscode sync --write')).exitCode).toBe(0)
    const first = JSON.parse(await readFile(`${sourceRoot}/workspaces/vscode/custom-a.code-workspace`, 'utf8'))
    const second = JSON.parse(await readFile(`${sourceRoot}/workspaces/vscode/custom-b.code-workspace`, 'utf8'))
    expect(first).toEqual({ folders: [{ path: repositories[0] }, { path: unbound }, { path: sources }] })
    expect(second).toEqual({ folders: [{ path: repositories[0] }, { path: sources }] })
    expect(JSON.stringify([first, second])).not.toContain(legacy)
    const trusted = await readFile(`${sourceRoot}/.chezmoidata/trusted-folders.yaml`, 'utf8')
    expect(trusted).toContain(`path: ${sources}\n    clients: [claude-code]`)
    expect(trusted).toContain(`path: ${unbound}\n    clients: [claude-desktop, chatgpt-codex, claude-code]`)
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
    await writeFile(
      join(sourceRoot, 'workspaces/vscode/alpha.code-workspace'),
      `${JSON.stringify({ folders: [{ path: repositories[0] }] })}\n`,
      'utf8'
    )
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

  test('fails closed for unsafe workspace names, collisions, and invalid bound sources', async () => {
    const invalid = await prepare(['bad_name'])
    expect((await invalid.box.run('ki manage vscode check')).output).toContain(
      'cannot derive a safe VS Code workspace name'
    )

    const collision = await prepare(['alpha'])
    await collision.box.root.write('chezmoi-source/workspaces/vscode/kis-alpha.code-workspace', '{"folders":[]}\n')
    expect((await collision.box.run('ki manage vscode check')).output).toContain(
      'workspace file exists but does not include its KI repository'
    )

    const missing = await prepare(['knowledge'])
    await missing.box.state.write(
      'ki/registry.toml',
      registry([
        {
          key: 'knowledge',
          path: missing.repositories[0] as string,
          sources: `${missing.box.root.path}/missing-sources`
        }
      ])
    )
    expect((await missing.box.run('ki manage vscode check')).output).toContain(
      'sources store must be an existing direct directory'
    )
  })
})
