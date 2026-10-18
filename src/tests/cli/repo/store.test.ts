import { lstat, realpath, rm, symlink } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

const knowledgeBase = (identity: string, roles = ['notes', 'sources', 'legacy']): string =>
  `[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-kb]\n\n[skills.ki-repo]\nprimary_shape = "ki-repo-kb"\nrepository = ${JSON.stringify(identity)}\nrepo_type = "kb"\nstore_roles = ${JSON.stringify(roles)}\n`

describe('ki repo store', () => {
  test('lists declared roles with notes bound to the repository root', async () => {
    const box = await sandbox()
    const root = await realpath(box.project.path)
    await box.project.write('.ki.toml', knowledgeBase('https://github.com/example/knowledge'))

    const text = await box.run('ki repo store list')
    const json = await box.run('ki repo store list --format json')
    expect(await box.run('ki repo store list --format yaml')).toEqual({
      exitCode: 2,
      output: 'ki: error: repo store list --format must be text or json\n'
    })

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
            { role: 'notes', path: root, state: 'bound', availability: 'available' },
            { role: 'sources', state: 'unbound', availability: 'missing' },
            { role: 'legacy', state: 'unbound', availability: 'missing' }
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

    expect((await box.run(['ki', 'repo', 'store', 'bind', 'sources', sources])).output).toBe(
      `would write ${box.state.path}/ki/registry.toml\nki repo store bind sources: would bind ${sources}\n`
    )
    await expect(box.state.read('ki/registry.toml')).rejects.toThrow()
    expect((await box.run(['ki', 'repo', 'store', 'bind', 'sources', sources, '--write'])).output).toContain(
      `bound ${sources}\nundo: ki repo --repo ${root} store unbind sources --write\n`
    )
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

  test('records, refuses, and clears a store absent on this host', async () => {
    const box = await sandbox()
    const root = await realpath(box.project.path)
    const sources = await box.root.mkdir('sources')
    await box.project.write('.ki.toml', knowledgeBase('https://github.com/example/knowledge'))

    expect((await box.run('ki repo store absent sources')).output).toContain(
      'ki repo store absent sources: would mark absent on this host\n'
    )
    await expect(box.state.read('ki/registry.toml')).rejects.toThrow()
    expect((await box.run('ki repo store absent sources --write')).output).toContain(
      'ki repo store absent sources: marked absent on this host\n'
    )
    expect((await box.run('ki repo store absent legacy --write')).exitCode).toBe(0)
    const marked = await box.state.read('ki/registry.toml')
    expect(marked).toContain('absent_stores = ["legacy", "sources"]')
    expect((await box.run('ki repo store absent sources --write')).output).toContain('already absent on this host')
    expect((await box.run('ki repo store list')).output).toContain('sources: unbound (absent by choice)')
    expect((await box.run('ki repo store absent notes')).output).toContain('notes store is the repository root')

    expect((await box.run('ki repo store absent legacy --clear')).output).toContain('would clear on this host')
    expect(await box.state.read('ki/registry.toml')).toBe(marked)
    expect((await box.run('ki repo store absent legacy --clear --write')).output).toContain('cleared on this host')
    expect((await box.run('ki repo store absent legacy --clear --write')).output).toContain(
      'not marked absent on this host'
    )
    expect(await box.state.read('ki/registry.toml')).toContain('absent_stores = ["sources"]')

    expect((await box.run(['ki', 'repo', 'store', 'bind', 'sources', sources, '--write'])).exitCode).toBe(0)
    expect(await box.state.read('ki/registry.toml')).not.toContain('absent_stores')
    expect(await box.run('ki repo store absent sources --write')).toEqual({
      exitCode: 2,
      output: `ki: error: sources store is bound to ${sources}; unbind it first\nnext: ki repo --repo ${root} store unbind sources --write\n`
    })
  })

  test('validates the absence marker in the local registry', async () => {
    const box = await sandbox()
    const root = await realpath(box.project.path)
    const sources = await box.root.mkdir('sources')
    await box.project.write('.ki.toml', knowledgeBase('https://github.com/example/knowledge'))
    const registry = (absent: string, stores = '') =>
      `schema = 1\n\n[repositories.project]\nrepository = "https://github.com/example/knowledge"\npath = ${JSON.stringify(root)}\nabsent_stores = ${absent}\n${stores}`

    await box.state.write('ki/registry.toml', registry('["sources"]'))
    expect((await box.run('ki repo store absent legacy --write')).exitCode).toBe(0)
    expect(await box.state.read('ki/registry.toml')).toContain('absent_stores = ["legacy", "sources"]')

    for (const [absent, stores, error] of [
      [
        '["sources"]',
        `\n[repositories.project.stores]\nsources = ${JSON.stringify(sources)}\n`,
        'repositories.project sources store cannot be both bound and absent'
      ],
      ['["archive"]', '', 'absent_stores has unknown role archive'],
      ['["sources", "sources"]', '', 'absent_stores repeats a role'],
      ['[]', '', 'must be a non-empty array of store roles'],
      ['"sources"', '', 'must be a non-empty array of store roles']
    ] as const) {
      await box.state.write('ki/registry.toml', registry(absent, stores))
      const listed = await box.run('ki repo store list')
      expect(listed.exitCode).toBe(1)
      expect(listed.output).toContain('local KI repository registry is invalid')
      expect(listed.output).toContain(error)
    }
  })

  test('reports each availability with its fix and keeps the v1 store fields', async () => {
    const box = await sandbox()
    const root = await realpath(box.project.path)
    const identity = 'https://github.com/example/knowledge'
    const gone = await box.root.mkdir('gone')
    await box.project.write(
      '.ki.toml',
      knowledgeBase(identity, ['notes', 'sources', 'legacy']).replace(
        'repo_type = "kb"',
        `repo_type = "kb"\ncapital = ${JSON.stringify(identity)}\nterritory_name = "Knowledge"\nterritory_members = [${JSON.stringify(identity)}]`
      )
    )
    const registry = (stores: string, absent = '') =>
      `schema = 1\n\n[repositories.kb]\nrepository = ${JSON.stringify(identity)}\npath = ${JSON.stringify(root)}\n${absent}${stores}`
    await box.state.write(
      'ki/registry.toml',
      registry(`\n[repositories.kb.stores]\nlegacy = ${JSON.stringify(gone)}\n`)
    )
    await rm(gone, { recursive: true })
    const placeholder = `fix: ki repo --repo ${root} store bind sources <absolute-path> --write, or ki repo --repo ${root} store absent sources --write`

    const none = await box.run('ki repo store list')
    expect(none.exitCode).toBe(0)
    expect(none.output).toContain(
      `legacy: bound ${gone} (unavailable: legacy store must be an existing direct directory)`
    )
    expect(none.output).toContain(
      `fix: ki repo --repo ${root} store bind legacy <absolute-path> --write, or ki repo --repo ${root} store unbind legacy --write then ki repo --repo ${root} store absent legacy --write`
    )
    expect(none.output).toContain('sources: unbound (missing)')
    expect(none.output).toContain(placeholder)
    expect(none.output).toContain('notes: bound')
    expect(none.output).toContain('(available)')
    expect(none.output).toContain('summary: REPOSITORIES=1 STORES=3 BOUND=2 ABSENT=0 UNAVAILABLE=2')

    const single = await box.home.mkdir('Library/CloudStorage/OneDrive-Personal/sources-kb')
    expect((await box.run('ki repo store list')).output).toContain(
      `fix: ki repo --repo ${root} store bind sources ${single} --write, or ki repo --repo ${root} store absent sources --write`
    )
    await box.home.mkdir('Library/CloudStorage/OneDrive-Personal/sources-project')
    expect((await box.run('ki repo store list')).output).toContain(placeholder)

    const json = JSON.parse((await box.run('ki repo store list --format json')).output)
    expect(json.schema).toBe('ki/repository-stores/v1')
    expect(json.repositories[0].stores).toEqual([
      { role: 'notes', path: root, state: 'bound', availability: 'available' },
      { role: 'sources', state: 'unbound', availability: 'missing' },
      {
        role: 'legacy',
        path: gone,
        state: 'bound',
        availability: 'unavailable',
        reason: 'legacy store must be an existing direct directory'
      }
    ])
    // The bound role's absent route works as offered, unbinding first.
    for (const command of [`store unbind legacy --write`, `store absent legacy --write`])
      expect((await box.run(`ki repo --repo ${root} ${command}`)).exitCode).toBe(0)
    expect((await box.run('ki repo store list')).output).toContain('legacy: unbound (absent by choice)')
    await box.state.write('ki/registry.toml', registry('', 'absent_stores = ["legacy", "sources"]\n'))
    const absent = JSON.parse((await box.run('ki repo store list --format json')).output)
    expect(absent.repositories[0].stores.map((store: { availability: string }) => store.availability)).toEqual([
      'available',
      'absent',
      'absent'
    ])
    expect((await box.run('ki repo store list')).output).toContain('ABSENT=2 UNAVAILABLE=0')

    // The Observatory's v1 parser needs role and state on every store, and path exactly when bound.
    for (const store of [...json.repositories[0].stores, ...absent.repositories[0].stores]) {
      expect(typeof store.role).toBe('string')
      expect(['bound', 'unbound']).toContain(store.state)
      expect('path' in store).toBe(store.state === 'bound')
    }
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
    ).toContain(
      'requires exactly one repository\nnext: name it with --repo: ki repo --repo <checkout> store unbind ...\n'
    )

    await box.state.write('ki/registry.toml', 'schema = 1\nrepositories = {}\nextra = true\n')
    expect((await box.run('ki repo store list')).output).toContain('local KI repository registry is invalid')
  })

  test('rejects automatic creation without its managed root or over a different binding', async () => {
    const box = await sandbox()
    const existing = await box.root.mkdir('existing')
    await box.project.write('.ki.toml', knowledgeBase('https://github.com/example/knowledge'))

    const root = await realpath(box.project.path)
    expect((await box.run('ki repo store create sources')).output).toContain(
      `OneDrive source-store root is unavailable: ${await realpath(box.home.path)}/Library/CloudStorage/OneDrive-Personal\nnext: ki repo --repo ${root} store bind sources <absolute-path> --write, or ki repo --repo ${root} store absent sources --write`
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
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\nrepository = "https://github.com/example/project"\n'
    )

    expect((await box.run('ki repo store list')).output).toContain('does not declare Knowledge Base store roles')
    expect((await box.run('ki repo store list')).output).toContain(
      '\nnext: select a Knowledge Base: ki repo --repo <knowledge-base-checkout> store list\n'
    )
  })

  test('tells each store command where repository selection goes', async () => {
    const box = await sandbox()
    for (const command of ['ki repo store --help', 'ki repo store list --help', 'ki repo store bind --help'])
      expect((await box.run(command)).output).toContain(
        'Repository selection (--repo, --territory, --principals) is given to ki repo,\nbefore store, as in: ki repo --repo <checkout> store list\n'
      )
  })
})
