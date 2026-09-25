import { lstat, realpath, symlink } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

const knowledgeBase = (identity: string, roles = ['notes', 'sources', 'legacy']): string =>
  `[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = ${JSON.stringify(identity)}\nrepo_type = "kb"\nstore_roles = ${JSON.stringify(roles)}\n`

describe('ki repo store', () => {
  test('lists declared roles with notes bound to the repository root', async () => {
    const box = await sandbox()
    const root = await realpath(box.project.path)
    await box.project.write('.ki.toml', knowledgeBase('https://github.com/example/knowledge'))

    const text = await box.run('ki repo store list')
    const json = await box.run('ki repo store list --format json')

    expect(text.exitCode).toBe(0)
    expect(text.output).toContain(`notes: bound ${root}`)
    expect(text.output).toContain('sources: unbound')
    expect(text.output).toContain('legacy: unbound')
    expect(JSON.parse(json.output)).toEqual({
      schema: 'ki/repository-stores/v1',
      repositories: [
        {
          repository: root,
          identity: 'https://github.com/example/knowledge',
          stores: [
            { role: 'notes', path: root, state: 'bound' },
            { role: 'sources', state: 'unbound' },
            { role: 'legacy', state: 'unbound' }
          ]
        }
      ]
    })

    const legacy = await box.root.mkdir('legacy-only')
    await box.state.write(
      'ki/registry.toml',
      `schema = 1\n\n[repositories.project]\nrepository = "https://github.com/example/knowledge"\npath = ${JSON.stringify(root)}\n\n[repositories.project.stores]\nlegacy = ${JSON.stringify(legacy)}\n`
    )
    expect((await box.run('ki repo store list')).output).toContain(`legacy: bound ${legacy}`)
    const sources = await box.root.mkdir('sources-after-legacy')
    expect((await box.run(['ki', 'repo', 'store', 'bind', 'sources', sources])).output).toContain('would bind')
  })

  test('previews, binds, replaces, and non-destructively unbinds external roles', async () => {
    const box = await sandbox()
    const root = await realpath(box.project.path)
    const sources = await box.root.mkdir('sources')
    const replacement = await box.root.mkdir('replacement-sources')
    const legacy = await box.root.mkdir('legacy')
    await box.project.write('.ki.toml', knowledgeBase('https://github.com/example/knowledge'))

    expect((await box.run(['ki', 'repo', 'store', 'bind', 'sources', sources])).output).toContain('would bind')
    await expect(box.state.read('ki/registry.toml')).rejects.toThrow()
    expect((await box.run(['ki', 'repo', 'store', 'bind', 'sources', sources, '--write'])).output).toContain('bound')
    expect((await box.run(['ki', 'repo', 'store', 'bind', 'legacy', legacy, '--write'])).exitCode).toBe(0)
    expect((await box.run(['ki', 'repo', 'store', 'bind', 'sources', replacement, '--write'])).exitCode).toBe(0)

    const registered = await box.state.read('ki/registry.toml')
    expect(registered).toContain(`path = ${JSON.stringify(root)}`)
    expect(registered).toContain(`sources = ${JSON.stringify(replacement)}`)
    expect(registered).toContain(`legacy = ${JSON.stringify(legacy)}`)
    expect((await box.run(['ki', 'repo', 'store', 'bind', 'sources', replacement, '--write'])).output).toContain(
      'already bound'
    )

    expect((await box.run('ki repo store unbind legacy')).output).toContain('would unbind')
    expect(await box.state.read('ki/registry.toml')).toBe(registered)
    expect((await box.run('ki repo store unbind legacy --write')).output).toContain('content is unchanged')
    expect((await lstat(legacy)).isDirectory()).toBe(true)
    expect(await box.state.read('ki/registry.toml')).not.toContain('legacy =')
    expect((await box.run('ki repo store unbind legacy --write')).output).toContain('already unbound')
    expect((await box.run('ki repo store unbind sources --write')).exitCode).toBe(0)
    expect(await box.state.read('ki/registry.toml')).not.toContain('.stores]')
  })

  test('previews and creates the conventional managed sources store without touching VS Code', async () => {
    const box = await sandbox()
    const root = await realpath(box.project.path)
    const oneDrive = await box.home.mkdir('Library/CloudStorage/OneDrive-Personal')
    const sources = `${oneDrive}/sources-${root.split('/').at(-1)}`
    await box.project.write('.ki.toml', knowledgeBase('https://github.com/example/knowledge'))

    const preview = await box.run('ki repo store create sources')
    expect(preview.exitCode).toBe(0)
    expect(preview.output).toContain(`would create ${sources}`)
    expect(await lstat(sources).catch(() => undefined)).toBeUndefined()

    const result = await box.run('ki repo store create sources --write')
    expect(result.exitCode).toBe(0)
    expect((await lstat(sources)).isDirectory()).toBe(true)
    expect(await box.state.read('ki/registry.toml')).toContain(`sources = ${JSON.stringify(sources)}`)
    expect((await box.run('ki repo store create sources --write')).output).toContain('store exists and already bound')
  })

  test('fails closed for unsupported roles, unsafe paths, selection, and registry state', async () => {
    const box = await sandbox()
    const root = await realpath(box.project.path)
    const other = await box.root.mkdir('other')
    const safe = await box.root.mkdir('safe')
    await box.project.write('.ki.toml', knowledgeBase('https://github.com/example/knowledge', ['notes', 'sources']))
    await box.root.write('other/.ki.toml', knowledgeBase('https://github.com/example/other', ['notes', 'sources']))
    await box.project.write('store-file', 'not a directory\n')
    await symlink(safe, `${box.root.path}/linked-store`)

    expect((await box.run(['ki', 'repo', 'store', 'bind', 'sources', 'relative'])).output).toContain(
      'sources store must be an absolute path'
    )
    for (const path of [`${box.root.path}/missing`, `${box.project.path}/store-file`, `${box.root.path}/linked-store`])
      expect((await box.run(['ki', 'repo', 'store', 'bind', 'sources', path])).output).toContain(
        'sources store must be an existing direct directory'
      )
    expect((await box.run(['ki', 'repo', 'store', 'bind', 'notes', safe])).output).toContain(
      'notes store is the repository root'
    )
    expect((await box.run(['ki', 'repo', 'store', 'bind', 'legacy', safe])).output).toContain(
      'does not declare legacy store'
    )
    expect((await box.run('ki repo store create legacy')).output).toContain('does not declare legacy store')
    expect(
      (await box.run(['ki', 'repo', '--repo', root, '--repo', other, 'store', 'unbind', 'sources'])).output
    ).toContain('requires exactly one repository')

    await box.state.write('ki/registry.toml', 'schema = 1\nrepositories = {}\nextra = true\n')
    expect((await box.run('ki repo store list')).output).toContain('local KI repository registry is invalid')
  })

  test('rejects automatic creation without its managed root or over a different binding', async () => {
    const box = await sandbox()
    const existing = await box.root.mkdir('existing')
    await box.project.write('.ki.toml', knowledgeBase('https://github.com/example/knowledge'))

    expect((await box.run('ki repo store create sources')).output).toContain(
      'OneDrive source-store root is unavailable'
    )
    await box.home.mkdir('Library/CloudStorage/OneDrive-Personal')
    expect((await box.run(['ki', 'repo', 'store', 'bind', 'sources', existing, '--write'])).exitCode).toBe(0)
    expect((await box.run('ki repo store create sources')).output).toContain('sources store is already bound')
    expect((await box.run('ki repo store create legacy')).output).toContain(
      'legacy store has no managed creation location'
    )
  })

  test('rejects an unsafe managed sources target', async () => {
    const box = await sandbox()
    await box.project.write('.ki.toml', knowledgeBase('https://github.com/example/knowledge'))
    await box.home.mkdir('Library/CloudStorage/OneDrive-Personal')
    await box.home.write('Library/CloudStorage/OneDrive-Personal/sources-project', 'not a directory\n')

    expect((await box.run('ki repo store create sources')).output).toContain(
      'sources store path must be absent or an existing direct directory'
    )
  })

  test('rejects store management for repositories without declared roles', async () => {
    const box = await sandbox()
    await box.project.write(
      '.ki.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "https://github.com/example/project"\n'
    )

    expect((await box.run('ki repo store list')).output).toContain('does not declare Knowledge Base store roles')
  })
})
