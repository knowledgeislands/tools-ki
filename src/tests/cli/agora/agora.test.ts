import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from '../_cli_helper.ts'

const repository = (identity: string, agora = ''): string =>
  `[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = ${JSON.stringify(identity)}\n${agora}`

const home = (
  id: string,
  purpose: string,
  members: Record<string, string>,
  owner = 'https://github.com/example/home',
  order?: readonly string[]
): string =>
  `[skills.ki-agora.homes.${id}]\nowner = ${JSON.stringify(owner)}\npurpose = ${JSON.stringify(purpose)}\n${order ? `order = ${JSON.stringify(order)}\n` : ''}members = { ${Object.entries(
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
    ...(entries.length ? [] : ['repositories = {}']),
    ...entries.flatMap((entry) => [
      '',
      `[repositories.${JSON.stringify(entry.key)}]`,
      `repository = ${JSON.stringify(entry.identity)}`,
      `path = ${JSON.stringify(entry.root)}`
    ]),
    ''
  ].join('\n')

const registered = async (
  box: Sandbox,
  declarations: readonly {
    readonly path: string
    readonly key?: string
    readonly identity: string
    readonly agora?: string
  }[]
): Promise<Record<string, string>> => {
  const roots: Record<string, string> = {}
  for (const declaration of declarations) {
    await box.project.write(`${declaration.path}/.ki.toml`, repository(declaration.identity, declaration.agora))
    roots[declaration.path] = await box.project.mkdir(declaration.path)
  }
  await box.state.write(
    'ki/registry.toml',
    localRegistry(
      declarations.map((declaration) => ({
        key: declaration.key ?? declaration.path,
        identity: declaration.identity,
        root: roots[declaration.path] as string
      }))
    )
  )
  return roots
}

describe('[ki agora]', () => {
  test('writes deterministic machine-readable roots for named Agoras and the estate', async () => {
    const box = await sandbox()
    const homeIdentity = 'https://github.com/example/home'
    const memberIdentity = 'https://github.com/example/member'
    const otherIdentity = 'https://github.com/example/other'
    const memberPath = 'member with space\nand line feed'
    const roots = await registered(box, [
      {
        path: 'home',
        identity: homeIdentity,
        agora: home('team', 'Shared delivery', { [memberIdentity]: 'maintainer' })
      },
      {
        path: memberPath,
        key: 'member',
        identity: memberIdentity,
        agora: membership('team', homeIdentity, 'maintainer')
      },
      { path: 'other', identity: otherIdentity }
    ])

    const named = `${roots['home']}\n${roots[memberPath]}\n`
    const estate = `${roots['home']}\n${roots[memberPath]}\n${roots['other']}\n`

    expect(await box.run('ki agora roots team')).toEqual({ exitCode: 0, output: named })
    expect(await box.run('ki agora roots estate')).toEqual({ exitCode: 0, output: estate })
    expect(await box.run('ki agora roots team --null')).toEqual({
      exitCode: 0,
      output: `${roots['home']}\0${roots[memberPath]}\0`
    })
    expect(await box.run('ki agora roots team -0')).toEqual({
      exitCode: 0,
      output: `${roots['home']}\0${roots[memberPath]}\0`
    })
  })

  test('fails without roots for unknown, empty, missing, or non-reciprocal Agora selectors', async () => {
    const box = await sandbox()
    const capture = async (
      command: string
    ): Promise<{
      readonly result: Awaited<ReturnType<typeof box.run>>
      readonly stdout: string
      readonly stderr: string
    }> => {
      let stdout = ''
      let stderr = ''
      const result = await box.run(command, {
        captureOutput: (stream, chunk) => {
          if (stream === 'stdout') stdout += chunk
          else stderr += chunk
        }
      })
      return { result, stdout, stderr }
    }

    await box.state.write('ki/registry.toml', localRegistry([]))
    const empty = await capture('ki agora roots estate')
    expect(empty).toMatchObject({ result: { exitCode: 2 }, stdout: '' })
    expect(empty.stderr).toContain('Agora estate has no members')

    const unknown = await capture('ki agora roots unknown')
    expect(unknown).toMatchObject({ result: { exitCode: 2 }, stdout: '' })
    expect(unknown.stderr).toContain('is not declared by a registered Agora home')

    const homeIdentity = 'https://github.com/example/home'
    const memberIdentity = 'https://github.com/example/member'
    await registered(box, [
      {
        path: 'home',
        identity: homeIdentity,
        agora: home('team', 'Shared delivery', { [memberIdentity]: 'maintainer' })
      }
    ])
    const missing = await capture('ki agora roots team')
    expect(missing).toMatchObject({ result: { exitCode: 2 }, stdout: '' })
    expect(missing.stderr).toContain('is not registered locally')

    await registered(box, [
      {
        path: 'home',
        identity: homeIdentity,
        agora: home('team', 'Shared delivery', { [memberIdentity]: 'maintainer' })
      },
      { path: 'member', identity: memberIdentity }
    ])
    const nonReciprocal = await capture('ki agora roots team')
    expect(nonReciprocal).toMatchObject({ result: { exitCode: 2 }, stdout: '' })
    expect(nonReciprocal.stderr).toContain('does not declare matching consent')
  })

  test('lists, shows, selects, and opens the registered estate and a reciprocal declared Agora', async () => {
    const box = await sandbox()
    const homeIdentity = 'https://github.com/example/home'
    const memberIdentity = 'https://github.com/example/member'
    const otherIdentity = 'https://github.com/example/other'
    const roots = await registered(box, [
      {
        path: 'home',
        identity: homeIdentity,
        agora: home('team', 'Shared delivery', { [otherIdentity]: 'reviewer', [memberIdentity]: 'maintainer' })
      },
      { path: 'member', identity: memberIdentity, agora: membership('team', homeIdentity, 'maintainer') },
      { path: 'other', identity: otherIdentity, agora: membership('team', homeIdentity, 'reviewer') }
    ])
    const calls: string[] = []
    box.setRunner(async (command, arguments_) => {
      calls.push(`${command} ${arguments_.join(' ')}`)
      return { exitCode: 0, output: '' }
    })

    expect(await box.run('ki agora list')).toEqual({
      exitCode: 0,
      output:
        '╭─ KI AGORAS\n├─ agoras (2)\n│  ├─ estate [system] Registered estate (3 members)\n│  ╰─ team [declared] team (3 members)\n╰─ summary: AGORAS=2 MEMBERS=3\n'
    })
    expect(await box.run('ki agora show team')).toEqual({
      exitCode: 0,
      output: `╭─ KI AGORA\n├─ team\n│  ├─ name: team\n│  ├─ purpose: Shared delivery\n│  ╰─ home: ${homeIdentity}\n├─ members (3)\n│  ├─ home\n│  ├─ member\n│  ╰─ other\n╰─ summary: MEMBERS=3\n`
    })
    expect(await box.run('ki agora show team --verbose')).toEqual({
      exitCode: 0,
      output: `╭─ KI AGORA\n├─ team\n│  ├─ name: team\n│  ├─ purpose: Shared delivery\n│  ╰─ home: ${homeIdentity}\n├─ members (3)\n│  ├─ home\n│  │  ├─ repository: ${homeIdentity}\n│  │  ╰─ path: ${roots['home']}\n│  ├─ member\n│  │  ├─ repository: ${memberIdentity}\n│  │  ╰─ path: ${roots['member']}\n│  ╰─ other\n│     ├─ repository: ${otherIdentity}\n│     ╰─ path: ${roots['other']}\n╰─ summary: MEMBERS=3\n`
    })
    expect(await box.run('ki repo --agora team roadmap list')).toMatchObject({ exitCode: 0 })
    expect(await box.run('ki agora open team --target zed')).toEqual({
      exitCode: 0,
      output: 'ki agora open team --target zed: opened 3 repositories\n'
    })
    expect(calls).toEqual([
      'zed -n',
      `zed -e ${roots['other']}`,
      `zed -e ${roots['member']}`,
      `zed -e ${roots['home']}`
    ])
  })

  test('honors a declared participant prefix through every named Agora consumer', async () => {
    const box = await sandbox()
    const homeIdentity = 'https://github.com/example/home'
    const memberIdentity = 'https://github.com/example/member'
    const otherIdentity = 'https://github.com/example/other'
    const roots = await registered(box, [
      {
        path: 'home',
        identity: homeIdentity,
        agora: home(
          'team',
          'Shared delivery',
          { [otherIdentity]: 'reviewer', [memberIdentity]: 'maintainer' },
          homeIdentity,
          [otherIdentity, homeIdentity]
        )
      },
      { path: 'member', identity: memberIdentity, agora: membership('team', homeIdentity, 'maintainer') },
      { path: 'other', identity: otherIdentity, agora: membership('team', homeIdentity, 'reviewer') }
    ])
    const calls: string[] = []
    box.setRunner(async (command, arguments_) => {
      calls.push(`${command} ${arguments_.join(' ')}`)
      return { exitCode: 0, output: '' }
    })

    const shown = await box.run('ki agora show team --verbose')
    expect(shown.exitCode).toBe(0)
    expect(shown.output.indexOf(`path: ${roots['other']}`)).toBeLessThan(shown.output.indexOf(`path: ${roots['home']}`))
    expect(shown.output.indexOf(`path: ${roots['home']}`)).toBeLessThan(
      shown.output.indexOf(`path: ${roots['member']}`)
    )
    expect(await box.run('ki agora roots team')).toEqual({
      exitCode: 0,
      output: `${roots['other']}\n${roots['home']}\n${roots['member']}\n`
    })
    const selected = await box.run('ki repo --agora team roadmap list')
    expect(selected.exitCode).toBe(0)
    expect(selected.output.indexOf('📁 other')).toBeLessThan(selected.output.indexOf('📁 home'))
    expect(selected.output.indexOf('📁 home')).toBeLessThan(selected.output.indexOf('📁 member'))
    expect(await box.run('ki agora open team --target zed')).toEqual({
      exitCode: 0,
      output: 'ki agora open team --target zed: opened 3 repositories\n'
    })
    expect(calls).toEqual([
      'zed -n',
      `zed -e ${roots['member']}`,
      `zed -e ${roots['home']}`,
      `zed -e ${roots['other']}`
    ])
  })

  test('resolves estate only from registered repositories and requires an explicit permitted target', async () => {
    const box = await sandbox()
    const roots = await registered(box, [
      { path: 'first', identity: 'https://github.com/example/first' },
      { path: 'second', identity: 'https://github.com/example/second' }
    ])
    const calls: string[] = []
    box.setRunner(async (command, arguments_) => {
      calls.push(`${command} ${arguments_.join(' ')}`)
      return { exitCode: 0, output: '' }
    })

    expect(await box.run('ki agora show estate')).toEqual({
      exitCode: 0,
      output: `╭─ KI AGORA\n├─ estate\n│  ├─ name: Registered estate\n│  ╰─ purpose: Every locally registered canonical KI repository.\n├─ members (2)\n│  ├─ first\n│  ╰─ second\n╰─ summary: MEMBERS=2\n`
    })
    expect(await box.run('ki agora open estate')).toMatchObject({ exitCode: 2 })
    expect(await box.run('ki agora open estate --target vscode')).toEqual({
      exitCode: 0,
      output: 'ki agora open estate --target vscode: opened 2 repositories\n'
    })
    expect(await box.run('ki agora open estate --target zed')).toEqual({
      exitCode: 0,
      output: 'ki agora open estate --target zed: opened 2 repositories\n'
    })
    expect(calls).toEqual([
      `code --new-window ${roots['first']} ${roots['second']}`,
      'zed -n',
      `zed -e ${roots['second']}`,
      `zed -e ${roots['first']}`
    ])
    box.setRunner(async () => ({ exitCode: 9, output: 'code failed\n' }))
    expect(await box.run('ki agora open estate --target vscode')).toEqual({
      exitCode: 9,
      output: 'ki: error: could not open Agora estate: code failed\n'
    })
    box.setRunner(async () => ({ exitCode: 10, output: '' }))
    expect(await box.run('ki agora open estate --target vscode')).toEqual({
      exitCode: 10,
      output: 'ki: error: could not open Agora estate: code failed\n'
    })
    const invalidTarget = await box.run('ki agora open estate --target terminal')
    expect(invalidTarget.exitCode).toBe(2)
    expect(invalidTarget.output).toContain('Allowed choices are zed, vscode.')
  })

  test('sorts multiple declared Agoras by identifier', async () => {
    const box = await sandbox()
    await registered(box, [
      {
        path: 'zeta',
        identity: 'https://github.com/example/zeta',
        agora: home('zeta', 'Zeta', {}, 'https://github.com/example/zeta')
      },
      {
        path: 'alpha',
        identity: 'https://github.com/example/alpha',
        agora: home('alpha', 'Alpha', {}, 'https://github.com/example/alpha')
      }
    ])

    const listed = await box.run('ki agora list')

    expect(listed.exitCode).toBe(0)
    expect(listed.output).toContain('├─ alpha [declared] alpha (1 members)')
    expect(listed.output).toContain('zeta [declared] zeta (1 members)')
    expect(listed.output.indexOf('alpha [declared]')).toBeLessThan(listed.output.indexOf('zeta [declared]'))
  })

  test('lists resolvable Agoras before reporting broken declarations', async () => {
    const box = await sandbox()
    const homeIdentity = 'https://github.com/example/home'
    const missingIdentity = 'https://github.com/example/missing'
    const roots = await registered(box, [
      {
        path: 'home',
        identity: homeIdentity,
        agora: `${home('healthy', 'Healthy', {})}\n${home('broken', 'Broken', { [missingIdentity]: 'member' })}\n${home('also-broken', 'Also broken', { [missingIdentity]: 'member' })}`
      }
    ])

    expect(await box.run('ki agora list')).toEqual({
      exitCode: 1,
      output: `╭─ KI AGORAS\n├─ agoras (2)\n│  ├─ estate [system] Registered estate (1 members)\n│  ╰─ healthy [declared] healthy (1 members)\n├─ broken (2)\n│  ├─ Agora also-broken member ${missingIdentity} is not registered locally\n│  ╰─ Agora broken member ${missingIdentity} is not registered locally\n╰─ summary: AGORAS=2 MEMBERS=1 BROKEN=2\n`
    })
    expect((await box.run('ki agora show healthy')).exitCode).toBe(0)
    expect(await box.run('ki agora roots healthy')).toEqual({ exitCode: 0, output: `${roots['home']}\n` })
    expect((await box.run('ki repo --agora healthy roadmap list')).exitCode).toBe(0)
    box.setRunner(async () => ({ exitCode: 0, output: '' }))
    expect(await box.run('ki agora open healthy --target zed')).toEqual({
      exitCode: 0,
      output: 'ki agora open healthy --target zed: opened 1 repositories\n'
    })
    expect(await box.run('ki agora show broken')).toEqual({
      exitCode: 2,
      output: `ki: error: Agora broken member ${missingIdentity} is not registered locally\n`
    })
  })

  test('rejects a local registry identity that disagrees with its repository declaration', async () => {
    const box = await sandbox()
    const root = await box.project.mkdir('repository')
    await box.project.write('repository/.ki.toml', repository('https://github.com/example/declared'))
    await box.state.write(
      'ki/registry.toml',
      localRegistry([{ key: 'repository', identity: 'https://github.com/example/registered', root }])
    )

    expect(await box.run('ki agora list')).toEqual({
      exitCode: 2,
      output: `ki: error: registered repository ${root} declares https://github.com/example/declared, but its local registry identity is https://github.com/example/registered\n`
    })
  })

  test('opens owner-only Agoras and reports Zed launch failures', async () => {
    const box = await sandbox()
    const homeIdentity = 'https://github.com/example/home'
    const memberIdentity = 'https://github.com/example/member'
    await registered(box, [
      {
        path: 'home',
        identity: homeIdentity,
        agora: home('empty', 'No members', {})
      },
      { path: 'member', identity: memberIdentity, agora: membership('team', homeIdentity, 'maintainer') }
    ])

    box.setRunner(async () => ({ exitCode: 0, output: '' }))
    expect((await box.run('ki agora open empty --target zed')).output).toContain('opened 1 repositories')

    await box.project.write(
      'home/.ki.toml',
      repository(homeIdentity, home('team', 'Shared delivery', { [memberIdentity]: 'maintainer' }))
    )
    box.setRunner(async () => ({ exitCode: 7, output: 'window failed\n' }))
    expect(await box.run('ki agora open team --target zed')).toEqual({
      exitCode: 7,
      output: 'ki: error: could not open Agora team: window failed\n'
    })
    box.setRunner(async () => ({ exitCode: 8, output: '' }))
    expect(await box.run('ki agora open team --target zed')).toEqual({
      exitCode: 8,
      output: 'ki: error: could not open Agora team: zed failed\n'
    })
    box.setRunner(async (_command, arguments_) =>
      arguments_[0] === '-n' ? { exitCode: 0, output: '' } : { exitCode: 9, output: 'member failed\n' }
    )
    expect(await box.run('ki agora open team --target zed')).toEqual({
      exitCode: 9,
      output: 'ki: error: could not open Agora team: member failed\n'
    })
    box.setRunner(async (_command, arguments_) =>
      arguments_[0] === '-n' ? { exitCode: 0, output: '' } : { exitCode: 10, output: '' }
    )
    expect(await box.run('ki agora open team --target zed')).toEqual({
      exitCode: 10,
      output: 'ki: error: could not open Agora team: zed failed\n'
    })
  })

  test('rejects a one-sided home declaration before selecting or opening it', async () => {
    const box = await sandbox()
    const homeIdentity = 'https://github.com/example/home'
    const memberIdentity = 'https://github.com/example/member'
    await registered(box, [
      {
        path: 'home',
        identity: homeIdentity,
        agora: home('team', 'Shared delivery', { [memberIdentity]: 'maintainer' })
      },
      { path: 'member', identity: memberIdentity, agora: '[skills.ki-agora]\n' }
    ])

    const shown = await box.run('ki agora show team')
    const selected = await box.run('ki repo --agora team roadmap list')
    const estate = await box.run('ki repo --agora estate roadmap list')
    const estateAlias = await box.run('ki repo --estate roadmap list')
    expect(shown).toEqual({
      exitCode: 2,
      output: 'ki: error: Agora team member https://github.com/example/member does not declare matching consent\n'
    })
    expect(selected).toEqual(shown)
    expect(estateAlias).toEqual(estate)
    expect(estate.exitCode).toBe(0)
    expect(estate.output).toContain('📁 home')
    expect(estate.output).toContain('📁 member')
  })

  test('rejects a duplicated declared Agora id with the declaring homes', async () => {
    const box = await sandbox()
    await registered(box, [
      {
        path: 'first',
        identity: 'https://github.com/example/first',
        agora: home('team', 'First', {}, 'https://github.com/example/first')
      },
      {
        path: 'second',
        identity: 'https://github.com/example/second',
        agora: home('team', 'Second', {}, 'https://github.com/example/second')
      }
    ])

    expect(await box.run('ki agora list')).toEqual({
      exitCode: 1,
      output:
        '╭─ KI AGORAS\n├─ agoras (1)\n│  ╰─ estate [system] Registered estate (2 members)\n├─ broken (1)\n│  ╰─ Agora team is declared by multiple owners: https://github.com/example/first, https://github.com/example/second\n╰─ summary: AGORAS=1 MEMBERS=2 BROKEN=1\n'
    })
    expect(await box.run('ki agora show team')).toEqual({
      exitCode: 2,
      output:
        'ki: error: Agora team is declared by multiple owners: https://github.com/example/first, https://github.com/example/second\n'
    })
  })

  test('rejects unbootstrapped, invalid, and undeclared selectors', async () => {
    const box = await sandbox()
    expect(await box.run('ki agora list')).toEqual({
      exitCode: 0,
      output:
        '╭─ KI AGORAS\n├─ agoras (1)\n│  ╰─ estate [system] Registered estate (0 members)\n╰─ summary: AGORAS=1 MEMBERS=0\n'
    })
    expect(await box.run('ki agora open estate --target zed')).toEqual({
      exitCode: 2,
      output: 'ki: error: Agora estate has no members\n'
    })
    expect((await box.run('ki agora show estate')).output).toContain('├─ members (0)\n│  ╰─ none\n')
    await box.state.write(
      'ki/registry.toml',
      'schema = 1\n[repositories."relative"]\nrepository = "https://github.com/example/relative"\npath = "relative"\n'
    )
    expect((await box.run('ki agora list')).output).toContain('repositories.relative path must be an absolute path')
    await box.state.write('ki/registry.toml', localRegistry([]))
    expect(await box.run('ki agora show unknown')).toEqual({
      exitCode: 2,
      output: 'ki: error: Agora unknown is not declared by a registered Agora home\n'
    })
    expect((await box.run('ki repo --agora estate roadmap list')).output).toContain('Agora estate has no members')
    expect((await box.run('ki agora show UPPER')).output).toContain('Agora name must use lower-case letters')
  })

  test('rejects malformed registered repository and Agora declarations', async () => {
    const box = await sandbox()
    const identity = 'https://github.com/example/home'
    const homeRoot = await box.project.mkdir('home')
    const configure = async (document: string, message: string): Promise<void> => {
      await box.project.write('home/.ki.toml', document)
      await box.state.write('ki/registry.toml', localRegistry([{ key: 'home', identity, root: homeRoot }]))
      expect((await box.run('ki agora list')).output).toContain(message)
    }

    await box.state.write(
      'ki/registry.toml',
      localRegistry([{ key: 'missing', identity, root: `${box.project.path}/missing` }])
    )
    expect((await box.run('ki agora list')).output).toContain('must be an existing physical directory')
    const emptyRoot = await box.project.mkdir('empty')
    await box.state.write('ki/registry.toml', localRegistry([{ key: 'empty', identity, root: emptyRoot }]))
    expect((await box.run('ki agora list')).output).toContain('must contain a physical .ki.toml')
    await configure('[repo]\nharnesses = [\n', 'has invalid .ki.toml')
    await configure(
      '[repo]\nharnesses = ["example/harness"]\n',
      'repository must be a canonical HTTPS GitHub repository'
    )

    await configure(
      repository(identity, '[skills.ki-agora.homes.team]\npurpose = "x"\nmembers = {}\n'),
      'owner must be a canonical HTTPS'
    )
    await configure(
      repository(
        identity,
        '[skills.ki-agora.homes.team]\nowner = "https://github.com/example/other"\npurpose = "x"\nmembers = {}\n'
      ),
      'owner must match its declaring registered repository'
    )
    const ownedHome = (agora: string): string =>
      agora.replace(/^(\[skills\.ki-agora\.homes\.[^\]]+\]\n)/m, `$1owner = ${JSON.stringify(identity)}\n`)
    const cases = [
      ['[skills.ki-agora]\nhomes = []\n', 'homes must be a table'],
      ['[skills.ki-agora.homes."Bad"]\npurpose = "x"\nmembers = {}\n', 'must use a stable lower-case'],
      ['[skills.ki-agora]\nhomes = { team = [] }\n', 'home declaration must be a table'],
      ['[skills.ki-agora.homes.team]\npurpose = ""\nmembers = {}\n', 'requires a non-empty purpose'],
      ['[skills.ki-agora.homes.team]\npurpose = "x"\nmembers = []\n', 'members must be a repository-to-role table'],
      [
        '[skills.ki-agora.homes.team]\npurpose = "x"\nmembers = { "https://example.com/nope" = "member" }\n',
        'must be a canonical HTTPS'
      ],
      [
        `[skills.ki-agora.homes.team]\npurpose = "x"\nmembers = { ${JSON.stringify(identity)} = "member" }\n`,
        'must not list its home'
      ],
      [
        '[skills.ki-agora.homes.team]\npurpose = "x"\nmembers = { "https://github.com/example/member" = "Bad" }\n',
        'has an invalid role'
      ],
      ['[skills.ki-agora.homes.team]\npurpose = "x"\norder = "bad"\nmembers = {}\n', 'order must be an array'],
      [
        '[skills.ki-agora.homes.team]\npurpose = "x"\norder = ["https://example.com/nope"]\nmembers = {}\n',
        'order entries must be canonical HTTPS'
      ],
      [
        `[skills.ki-agora.homes.team]\npurpose = "x"\norder = [${JSON.stringify(identity)}, ${JSON.stringify(identity)}]\nmembers = {}\n`,
        'order repeats participant'
      ],
      [
        '[skills.ki-agora.homes.team]\npurpose = "x"\norder = ["https://github.com/example/unknown"]\nmembers = {}\n',
        'is not the owner or a member'
      ]
    ] as const
    for (const [agora, message] of cases) await configure(repository(identity, ownedHome(agora)), message)
  })

  test('rejects duplicate registry identities and malformed or non-reciprocal memberships', async () => {
    const box = await sandbox()
    const homeIdentity = 'https://github.com/example/home'
    const memberIdentity = 'https://github.com/example/member'
    const first = await box.project.mkdir('first')
    const second = await box.project.mkdir('second')
    await box.project.write('first/.ki.toml', repository(homeIdentity))
    await box.project.write('second/.ki.toml', repository(homeIdentity))
    await box.state.write(
      'ki/registry.toml',
      localRegistry([
        { key: 'first', identity: homeIdentity, root: first },
        { key: 'second', identity: homeIdentity, root: second }
      ])
    )
    expect((await box.run('ki agora list')).output).toContain('repositories repeats a repository')

    const roots = await registered(box, [
      {
        path: 'home',
        identity: homeIdentity,
        agora: home('team', 'Team', { [memberIdentity]: 'member' })
      },
      { path: 'member', identity: memberIdentity, agora: '[skills.ki-agora]\nmemberships = []\n' }
    ])
    expect((await box.run('ki agora show team')).output).toContain('memberships must be a table')
    await box.project.write('member/.ki.toml', repository(memberIdentity, '[skills.ki-agora.memberships]\n'))
    expect((await box.run('ki agora show team')).output).toContain('does not declare matching consent')
    await box.project.write(
      'member/.ki.toml',
      repository(memberIdentity, '[skills.ki-agora]\nmemberships = { team = [] }\n')
    )
    expect((await box.run('ki agora show team')).output).toContain(
      'membership in https://github.com/example/member must be a table'
    )
    await box.project.write('member/.ki.toml', repository(memberIdentity, membership('team', 'invalid', 'member')))
    expect((await box.run('ki agora show team')).output).toContain('has an invalid home')
    await box.project.write(
      'member/.ki.toml',
      repository(memberIdentity, membership('team', 'https://github.com/example/other', 'member'))
    )
    expect((await box.run('ki agora show team')).output).toContain('does not declare matching consent')
    await box.project.write('member/.ki.toml', repository(memberIdentity, membership('team', homeIdentity, 'Bad')))
    expect((await box.run('ki agora show team')).output).toContain('has an invalid role')
    await box.project.write('member/.ki.toml', repository(memberIdentity, membership('team', homeIdentity, 'member')))
    await box.project.write(
      'home/.ki.toml',
      repository(homeIdentity, home('missing', 'Missing member', { 'https://github.com/example/missing': 'member' }))
    )
    expect((await box.run('ki agora list')).output).toContain('is not registered locally')
    expect(roots['home']).toContain('/home')
  })
})
