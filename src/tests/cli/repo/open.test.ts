import { realpath, symlink } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

const repositoryConfiguration = (identity: string, sources = false): string =>
  `[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = ${JSON.stringify(identity)}${
    sources ? '\nrepo_type = "kb"\nstore_roles = ["notes", "sources"]' : ''
  }\n`

const localRegistry = (
  entries: readonly {
    readonly key: string
    readonly repository: string
    readonly path: string
    readonly sources?: string
  }[]
): string =>
  [
    'schema = 1',
    ...(entries.length ? [] : ['repositories = {}']),
    ...entries.flatMap((entry) => [
      '',
      `[repositories.${JSON.stringify(entry.key)}]`,
      `repository = ${JSON.stringify(entry.repository)}`,
      `path = ${JSON.stringify(entry.path)}`,
      ...(entry.sources
        ? ['', `[repositories.${JSON.stringify(entry.key)}.stores]`, `sources = ${JSON.stringify(entry.sources)}`]
        : [])
    ]),
    ''
  ].join('\n')

describe('[ki repo open]', () => {
  test('opens notes followed by a declared registered sources store by default', async () => {
    const box = await sandbox()
    const notes = await realpath(box.project.path)
    const sources = await box.root.mkdir('sources')
    await box.project.write('.ki-config.toml', repositoryConfiguration('https://github.com/example/knowledge', true))
    await box.state.write(
      'ki/registry.toml',
      localRegistry([{ key: 'knowledge', repository: 'https://github.com/example/knowledge', path: notes, sources }])
    )
    const calls: string[] = []
    box.setRunner(async (command, arguments_) => {
      calls.push(`${command} ${arguments_.join(' ')}`)
      return { exitCode: 0, output: '' }
    })

    expect(await box.run('ki repo open --target zed')).toEqual({
      exitCode: 0,
      output: 'ki repo open --target zed: opened 1 repositories\n'
    })
    expect(calls).toEqual(['zed -n', `zed -e ${notes}`, `zed -e ${sources}`])
  })

  test('opens only canonical notes roots with --no-stores and requires a complete binding otherwise', async () => {
    const box = await sandbox()
    const notes = await realpath(box.project.path)
    await box.project.write('.ki-config.toml', repositoryConfiguration('https://github.com/example/knowledge', true))
    const calls: string[] = []
    box.setRunner(async (command, arguments_) => {
      calls.push(`${command} ${arguments_.join(' ')}`)
      return { exitCode: 0, output: '' }
    })

    expect(await box.run('ki repo open --target vscode --no-stores')).toEqual({
      exitCode: 0,
      output: 'ki repo open --target vscode: opened 1 repositories\n'
    })
    expect(calls).toEqual([`code --new-window ${notes}`])
    expect(await box.run('ki repo open --target vscode')).toEqual({
      exitCode: 1,
      output: `ki: error: Knowledge Base ${notes} declares sources; run ki registry add --repo ${notes} --sources <absolute-path>\n`
    })
  })

  test('preserves notes-then-sources ordering across selected repositories and rejects unsafe source bindings', async () => {
    const box = await sandbox()
    const first = await realpath(box.project.path)
    const second = await box.root.mkdir('second')
    const firstSources = await box.root.mkdir('first-sources')
    const secondSources = await box.root.mkdir('second-sources')
    await box.project.write('.ki-config.toml', repositoryConfiguration('https://github.com/example/first', true))
    await box.root.write('second/.ki-config.toml', repositoryConfiguration('https://github.com/example/second', true))
    await box.state.write(
      'ki/registry.toml',
      localRegistry([
        { key: 'second', repository: 'https://github.com/example/second', path: second, sources: secondSources },
        { key: 'project', repository: 'https://github.com/example/first', path: first, sources: firstSources }
      ])
    )
    const calls: string[] = []
    box.setRunner(async (command, arguments_) => {
      calls.push(`${command} ${arguments_.join(' ')}`)
      return { exitCode: 0, output: '' }
    })

    expect(
      await box.run(['ki', 'repo', '--repo', first, '--repo', second, 'open', '--target', 'vscode', '--stores'])
    ).toEqual({ exitCode: 0, output: 'ki repo open --target vscode: opened 2 repositories\n' })
    expect(calls).toEqual([`code --new-window ${first} ${firstSources} ${second} ${secondSources}`])
    await symlink(secondSources, `${box.root.path}/linked-sources`)
    await box.state.write(
      'ki/registry.toml',
      localRegistry([
        {
          key: 'second',
          repository: 'https://github.com/example/second',
          path: second,
          sources: `${box.root.path}/linked-sources`
        },
        { key: 'project', repository: 'https://github.com/example/first', path: first, sources: firstSources }
      ])
    )
    expect(await box.run(['ki', 'repo', '--repo', second, 'open', '--target', 'vscode'])).toEqual({
      exitCode: 1,
      output: `ki: error: Knowledge Base ${second} declares sources; run ki registry add --repo ${second} --sources <absolute-path>\n`
    })
  })

  test('rejects conflicting store switches and unsupported targets', async () => {
    const box = await sandbox()
    await box.project.write('.ki-config.toml', repositoryConfiguration('https://github.com/example/project'))

    expect(await box.run('ki repo open --target terminal')).toEqual({
      exitCode: 2,
      output: 'ki: error: ki repo open --target supports zed or vscode\n'
    })
    expect(await box.run('ki repo open --target zed --stores --no-stores')).toEqual({
      exitCode: 2,
      output: 'ki: error: ki repo open --stores and --no-stores are mutually exclusive\n'
    })
  })
})
