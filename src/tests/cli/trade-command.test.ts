import { realpath } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { sandbox } from './_cli_helper.ts'

const tradesTable = 'knowledgeislands/ki-agentic-harness:ki-trades'
const home = (identity: string): string => `https://github.com/${identity}`
const sourceHome = home('example/source')
const receiverHome = home('example/receiver')

const routeArray = (routes: readonly string[]): string => `[${routes.map((route) => JSON.stringify(route)).join(', ')}]`

const repositoryConfiguration = (
  identity: string,
  exportsTo: Partial<Record<'work' | 'knowledge', readonly string[]>> = {},
  importsFrom: Partial<Record<'work' | 'knowledge', readonly string[]>> = {}
): string =>
  [
    '"knowledgeislands/ki-agentic-harness:ki-repo"',
    `repository = ${JSON.stringify(home(identity))}`,
    'title = "Test repository"',
    'description = "Trade fixture."',
    'repo_code = "TEST"',
    '',
    `["${tradesTable}".exports_to]`,
    `work = ${routeArray(exportsTo.work ?? [])}`,
    `knowledge = ${routeArray(exportsTo.knowledge ?? [])}`,
    '',
    `["${tradesTable}".imports_from]`,
    `work = ${routeArray(importsFrom.work ?? [])}`,
    `knowledge = ${routeArray(importsFrom.knowledge ?? [])}`,
    ''
  ]
    .join('\n')
    .replace('"knowledgeislands/ki-agentic-harness:ki-repo"\n', '["knowledgeislands/ki-agentic-harness:ki-repo"]\n')

const localConfiguration = (repositories: readonly string[]): string =>
  [
    'schema = 1',
    '',
    '[agents]',
    'ids = []',
    '',
    '[harnesses]',
    'ids = []',
    '',
    '[skills]',
    '',
    '[repositories]',
    'paths = [',
    ...repositories.map((path) => `  ${JSON.stringify(path)},`),
    ']',
    ''
  ].join('\n')

const configuredPair = async () => {
  const box = await sandbox()
  const source = await realpath(box.project.path)
  const receiver = await box.project.mkdir('receiver')
  await box.project.write('.ki-config.toml', repositoryConfiguration('example/source', { work: [receiverHome], knowledge: [receiverHome] }))
  await box.project.write('receiver/.ki-config.toml', repositoryConfiguration('example/receiver', {}, { work: [sourceHome], knowledge: [sourceHome] }))
  await box.config.write('ki/config.toml', localConfiguration([source, receiver]))
  return { box, source, receiver }
}

const newTrade = (kind: 'work' | 'knowledge'): readonly string[] => [
  'ki',
  'trade',
  'new',
  '--to',
  receiverHome,
  '--kind',
  kind,
  '--title',
  'Route contract',
  '--source-ref',
  'KI-TOOL-CLI-012',
  '--context',
  'The host needs an executable contract.',
  '--submission',
  'Apply the typed trade route contract.',
  '--constraints',
  'The receiver retains local authority.'
]

describe('[ki trade]', () => {
  test('adds, lists, checks, and removes one typed directional route without changing repository identity', async () => {
    const box = await sandbox()
    const source = await realpath(box.project.path)
    const receiver = await box.project.mkdir('receiver')
    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source'))
    await box.project.write('receiver/.ki-config.toml', repositoryConfiguration('example/receiver', {}, { work: [sourceHome] }))
    await box.config.write('ki/config.toml', localConfiguration([source, receiver]))

    const added = await box.run(['ki', 'trade', 'routes', 'add', receiverHome, '--direction', 'export', '--kind', 'work'])
    const listed = await box.run('ki trade routes list')
    const checked = await box.run(['ki', 'trade', 'routes', 'check', receiverHome, '--direction', 'export', '--kind', 'work'])
    const removed = await box.run(['ki', 'trade', 'routes', 'remove', receiverHome, '--direction', 'export', '--kind', 'work'])

    expect(added).toEqual({ exitCode: 0, output: `ki trade routes add: export work ${sourceHome} -> ${receiverHome}\n` })
    expect(listed).toEqual({
      exitCode: 0,
      output: `╭─ KI TRADE ROUTES\n│  📁 example/source\n│     ${sourceHome}\n│  ✦ 1 route\n├─ results\n│  ╰─ export\n│     ╰─ work ${receiverHome} [active]\n╰─ summary: ROUTES=1\n`
    })
    expect(checked).toEqual({ exitCode: 0, output: `ki trade routes check\n  export work ${receiverHome}: active\n` })
    expect(removed).toEqual({ exitCode: 0, output: `ki trade routes remove: export work ${sourceHome} -> ${receiverHome}\n` })
    expect(await box.project.read('.ki-config.toml')).toContain(`repository = "${sourceHome}"`)
    expect(await box.project.read('receiver/.ki-config.toml')).toContain(`work = ["${sourceHome}"]`)
  })

  test('creates, receives, displays, releases, and prunes a work trade while each command writes only its local repository', async () => {
    const { box } = await configuredPair()
    const created = await box.run(newTrade('work'), { now: () => Date.UTC(2026, 7, 3, 12, 0, 0) })
    const id = /TRD-[0-9a-f-]+/u.exec(created.output)?.[0] as string
    const outboundPath = `-/_TRADES/example/receiver/${id}.md`
    const outbound = await box.project.read(outboundPath)
    expect(outbound).toContain('kind: work')

    box.cd('receiver')
    const received = await box.run(['ki', 'trade', 'receive', '--from', sourceHome, '--kind', 'work', '--id', id])
    await box.project.write(
      `receiver/+/_TRADES/example/source/${id}.md`,
      (await box.project.read(`receiver/+/_TRADES/example/source/${id}.md`)).replace('status: received', 'status: adopted\nadopted_as: "KI-RECEIVER-FND-001"')
    )
    box.cd('..')
    const listed = await box.run(['ki', 'trade', 'list', '--repo', receiverHome, '--direction', 'inbound', '--status', 'adopted', '--kind', 'work'])
    const shown = await box.run(['ki', 'trade', 'show', id])
    const released = await box.run(['ki', 'trade', 'release', id])
    box.cd('receiver')
    const pruned = await box.run(['ki', 'trade', 'prune', id])

    expect(created.output).toBe(`ki trade new: created ${id} for example/receiver\n`)
    expect(received).toEqual({ exitCode: 0, output: `ki trade receive\n  received ${id}\n` })
    expect(listed).toEqual({
      exitCode: 0,
      output: `╭─ KI TRADES\n│  ✦ 1 trade\n├─ results\n│  ╰─ inbound\n│     ╰─ ${receiverHome} ${id} [work, adopted] Route contract\n╰─ summary: TRADES=1 INBOUND=1 OUTBOUND=0\n`
    })
    expect(shown.output).toContain(`Repository: ${sourceHome} [outbound]\n${outbound.trimEnd()}`)
    expect(released).toEqual({ exitCode: 0, output: `ki trade release: released ${id}\n` })
    expect(pruned).toEqual({ exitCode: 0, output: `ki trade prune: pruned ${id}\n` })
    await expect(box.project.read(`receiver/+/_TRADES/example/source/${id}.md`)).rejects.toThrow()
  })

  test('permits retained knowledge to release and prune, but refuses retained work', async () => {
    const { box } = await configuredPair()
    const created = await box.run(newTrade('knowledge'))
    const id = /TRD-[0-9a-f-]+/u.exec(created.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', '--from', sourceHome, '--kind', 'knowledge', '--id', id])
    const path = `receiver/+/_TRADES/example/source/${id}.md`
    await box.project.write(path, (await box.project.read(path)).replace('status: received', 'status: retained\nretained_as: "Knowledge/Local/Note"'))
    box.cd('..')
    const released = await box.run(['ki', 'trade', 'release', id])
    box.cd('receiver')
    const pruned = await box.run(['ki', 'trade', 'prune', id])

    expect(released.exitCode).toBe(0)
    expect(pruned.exitCode).toBe(0)

    box.cd('..')
    const invalid = await box.run(newTrade('work'))
    const invalidId = /TRD-[0-9a-f-]+/u.exec(invalid.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', '--from', sourceHome, '--kind', 'work', '--id', invalidId])
    const invalidPath = `receiver/+/_TRADES/example/source/${invalidId}.md`
    await box.project.write(
      invalidPath,
      (await box.project.read(invalidPath)).replace('status: received', 'status: retained\nretained_as: "Knowledge/Local/Note"')
    )
    box.cd('..')
    expect((await box.run(['ki', 'trade', 'release', invalidId])).output).toContain('permits retained only for knowledge trades')
  })

  test('reports inactive, malformed, and retired command inputs without making a peer write', async () => {
    const { box } = await configuredPair()
    await box.project.write('receiver/.ki-config.toml', repositoryConfiguration('example/receiver'))

    const nonreciprocal = await box.run(newTrade('work'))
    const missingKind = await box.run(['ki', 'trade', 'new', '--to', receiverHome])
    const missingDirection = await box.run(['ki', 'trade', 'routes', 'add', receiverHome, '--kind', 'work'])
    const malformedRepository = await box.run('ki trade routes add example/receiver --direction export --kind work')
    const malformedKind = await box.run(`ki trade routes add ${receiverHome} --direction export --kind other`)
    const emptyTitle = await box.run([...newTrade('work').slice(0, 8), '   ', ...newTrade('work').slice(9)])
    const retired = await box.run('ki handoffs list')
    const plural = await box.run('ki trades list')

    expect(nonreciprocal).toEqual({ exitCode: 2, output: `ki: error: export work trade route ${receiverHome} is nonreciprocal\n` })
    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source'))
    expect((await box.run(newTrade('work'))).output).toContain('is not declared locally')
    expect(missingKind.exitCode).toBe(2)
    expect(missingDirection.exitCode).toBe(2)
    expect(malformedRepository).toEqual({ exitCode: 2, output: 'ki: error: trade route repository must use canonical HTTPS GitHub repository form\n' })
    expect(malformedKind).toEqual({ exitCode: 2, output: 'ki: error: --kind accepts work or knowledge\n' })
    expect(emptyTitle.output).toContain('--title is required and must be non-empty')
    expect(retired.exitCode).toBe(2)
    expect(plural.exitCode).toBe(2)
  })

  test('reports malformed route declarations and every registered-estate route state', async () => {
    const box = await sandbox()
    const source = await realpath(box.project.path)
    const receiver = await box.project.mkdir('receiver')
    const duplicate = await box.project.mkdir('duplicate')
    await box.config.write('ki/config.toml', localConfiguration([source, receiver, duplicate]))

    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source'))
    expect(await box.run('ki trade routes list')).toEqual({
      exitCode: 0,
      output: `╭─ KI TRADE ROUTES\n│  📁 example/source\n│     ${sourceHome}\n│  ✦ 0 routes\n├─ results\n│  ╰─ routes: none\n╰─ summary: ROUTES=0\n`
    })
    expect(await box.run('ki trade routes check')).toEqual({ exitCode: 0, output: 'ki trade routes check\n  none\n' })

    await box.project.write('.ki-config.toml', '[not valid TOML\n')
    expect((await box.run('ki trade routes list')).output).toContain('must be valid TOML')

    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source').replace(`repository = "${sourceHome}"\n`, ''))
    expect((await box.run('ki trade routes list')).output).toContain('.repository must use canonical HTTPS GitHub repository form')

    await box.project.write(
      '.ki-config.toml',
      repositoryConfiguration('example/source').replace(`["${tradesTable}".exports_to]`, `["${tradesTable}"]\nunknown = true\n\n["${tradesTable}".exports_to]`)
    )
    expect((await box.run('ki trade routes list')).output).toContain('has unrecognised key unknown')

    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source').replace('work = []', 'other = []\nwork = []'))
    expect((await box.run('ki trade routes list')).output).toContain('has unrecognised trade kind other')

    for (const routes of [[sourceHome], [receiverHome, receiverHome], [receiverHome, 'https://github.com/aaa/first']]) {
      await box.project.write('.ki-config.toml', repositoryConfiguration('example/source', { work: routes }))
      expect((await box.run('ki trade routes list')).exitCode).toBe(2)
    }

    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source').replace('work = []', 'work = [1]'))
    expect((await box.run('ki trade routes list')).output).toContain('must be a canonical HTTPS GitHub repository URL array')

    const repositoryOnly = repositoryConfiguration('example/source').split(`["${tradesTable}".exports_to]`)[0] as string
    await box.project.write('.ki-config.toml', repositoryOnly)
    expect((await box.run('ki trade routes list')).output).toContain(`does not declare [${tradesTable}]`)
    await box.project.write('.ki-config.toml', `${repositoryOnly}["${tradesTable}"]\n`)
    expect((await box.run('ki trade routes list')).output).toContain('.exports_to must be a table')
    await box.project.write('.ki-config.toml', `${repositoryOnly}["${tradesTable}"]\n\n[after]\nvalue = true\n`)
    expect((await box.run(`ki trade routes add ${receiverHome} --direction export --kind work`)).exitCode).toBe(0)
    expect(await box.project.read('.ki-config.toml')).toContain('[after]\nvalue = true')
    await box.project.write(
      '.ki-config.toml',
      `"${tradesTable}" = { exports_to = { work = [], knowledge = [] }, imports_from = { work = [], knowledge = [] } }\n${repositoryOnly}`
    )
    expect((await box.run(`ki trade routes add ${receiverHome} --direction export --kind work`)).output).toContain('does not declare')

    const missingHome = home('example/missing')
    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source', { work: [missingHome] }))
    expect((await box.run('ki trade routes check')).output).toContain(`${missingHome}: missing repository`)

    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source', { work: [receiverHome] }))
    await box.project.write('receiver/.ki-config.toml', repositoryConfiguration('example/receiver'))
    expect((await box.run('ki trade routes check')).output).toContain(`${receiverHome}: nonreciprocal`)

    await box.project.write('receiver/.ki-config.toml', repositoryConfiguration('example/receiver', {}, { work: [sourceHome] }))
    await box.project.write('duplicate/.ki-config.toml', repositoryConfiguration('example/receiver', {}, { work: [sourceHome] }))
    expect((await box.run('ki trade routes check')).output).toContain(`${receiverHome}: ambiguous repository`)

    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source'))
    expect((await box.run(`ki trade routes add ${sourceHome} --direction export --kind work`)).output).toContain('must differ from the local repository')
    expect((await box.run(`ki trade routes remove ${receiverHome} --direction export --kind work`)).output).toContain('is not declared locally')
    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source', { work: [home('example/zulu')] }))
    expect((await box.run(`ki trade routes add ${receiverHome} --direction export --kind work`)).exitCode).toBe(0)
  })

  test('covers import-route mutation and command filters without changing peer configuration', async () => {
    const { box } = await configuredPair()
    expect(await box.run('ki trade list')).toEqual({
      exitCode: 0,
      output: '╭─ KI TRADES\n│  ✦ 0 trades\n├─ results\n│  ╰─ trades: none\n╰─ summary: TRADES=0 INBOUND=0 OUTBOUND=0\n'
    })
    expect(await box.run('ki trade show TRD-00000000-0000-0000-0000-000000000000')).toEqual({
      exitCode: 2,
      output: 'ki: error: trade TRD-00000000-0000-0000-0000-000000000000 was not found in the registered repository estate\n'
    })
    box.cd('receiver')
    expect(await box.run(['ki', 'trade', 'receive', '--from', sourceHome, '--kind', 'work'])).toEqual({ exitCode: 0, output: 'ki trade receive\n' })
    const removed = await box.run(['ki', 'trade', 'routes', 'remove', sourceHome, '--direction', 'import', '--kind', 'knowledge'])
    const added = await box.run(['ki', 'trade', 'routes', 'add', sourceHome, '--direction', 'import', '--kind', 'knowledge'])
    const selected = await box.run(['ki', 'trade', 'routes', 'check', sourceHome, '--direction', 'import', '--kind', 'knowledge'])
    const absent = await box.run(['ki', 'trade', 'routes', 'check', home('example/absent')])
    const badDirection = await box.run(`ki trade routes check ${sourceHome} --direction sideways`)
    const badKind = await box.run(`ki trade routes check ${sourceHome} --kind other`)
    const badListDirection = await box.run('ki trade list --direction sideways')
    const badListRepository = await box.run('ki trade list --repo example/source')
    const badId = await box.run('ki trade show TRD-invalid')

    expect(removed.exitCode).toBe(0)
    expect(added.exitCode).toBe(0)
    expect(selected.output).toContain(`import knowledge ${sourceHome}: active`)
    expect(absent.output).toContain('is not declared locally')
    expect(badDirection.output).toContain('--direction accepts export or import')
    expect(badKind.output).toContain('--kind accepts work or knowledge')
    expect(badListDirection.output).toContain('--direction accepts inbound or outbound')
    expect(badListRepository.output).toContain('--repo must use canonical HTTPS GitHub repository form')
    expect(badId.output).toContain('trade id must use TRD-')
  })

  test('rejects malformed outbound envelopes observed by the receiver', async () => {
    const { box } = await configuredPair()
    const created = await box.run(newTrade('work'))
    const id = /TRD-[0-9a-f-]+/u.exec(created.output)?.[0] as string
    const path = `-/_TRADES/example/receiver/${id}.md`
    const outbound = await box.project.read(path)
    box.cd('receiver')

    const cases: readonly [string, string][] = [
      ['not a trade', 'must use YAML frontmatter'],
      [outbound.replace('title: "Route contract"', 'not valid frontmatter'), 'has invalid trade frontmatter'],
      [outbound.replace(`id: ${id}`, 'id: TRD-invalid'), 'trade id must use TRD-'],
      [outbound.replace('title: "Route contract"', 'title: "unterminated'), 'has invalid trade frontmatter'],
      [outbound.replace('title: "Route contract"', 'title: "Route contract"\ntitle: "Again"'), 'repeats trade field title'],
      [outbound.replace('source_ref: "KI-TOOL-CLI-012"', 'extra: value'), 'has unrecognised trade field extra'],
      [outbound.replace('created_at:', 'created_at: invalid #'), 'has invalid created_at timestamp'],
      [outbound.replace('sender: example/source', 'sender: Example/source'), 'trade record address must use canonical'],
      [outbound.replace('kind: work', 'kind: other'), 'has invalid trade kind'],
      [outbound.replace('source_ref: "KI-TOOL-CLI-012"\n', ''), 'must declare non-empty trade field source_ref'],
      [outbound.replace('## Constraints\n\nThe receiver retains local authority.', '## Constraints\n\n'), 'must carry non-empty Context']
    ]

    for (const [contents, message] of cases) {
      await box.project.write(path, contents)
      expect((await box.run(['ki', 'trade', 'receive', '--from', sourceHome, '--kind', 'work', '--id', id])).output).toContain(message)
    }

    await box.project.write(path, outbound.replace('receiver: example/receiver', 'receiver: example/other'))
    expect((await box.run(['ki', 'trade', 'receive', '--from', sourceHome, '--kind', 'work', '--id', id])).output).toContain(
      'does not match the active work trade route'
    )
    await box.project.write(path, outbound)
    const missing = await box.run(['ki', 'trade', 'receive', '--from', sourceHome, '--kind', 'work', '--id', 'TRD-00000000-0000-0000-0000-000000000000'])
    expect(missing.output).toContain('was not found')
    const wrongId = 'TRD-00000000-0000-0000-0000-000000000000'
    await box.project.write(`-/_TRADES/example/receiver/${wrongId}.md`, outbound)
    box.cd('..')
    expect((await box.run('ki trade list')).output).toContain(`filename must match trade id ${id}`)
    box.cd('receiver')
    expect((await box.run(['ki', 'trade', 'receive', '--from', sourceHome, '--kind', 'work', '--id', wrongId])).output).toContain(
      `filename must match trade id ${id}`
    )
  })

  test('receives all matching trades, reports existing copies, and filters distinct records', async () => {
    const { box } = await configuredPair()
    const first = await box.run(newTrade('work'))
    const second = await box.run([...newTrade('work').slice(0, 8), 'Second route', ...newTrade('work').slice(9)])
    const firstId = /TRD-[0-9a-f-]+/u.exec(first.output)?.[0] as string
    const secondId = /TRD-[0-9a-f-]+/u.exec(second.output)?.[0] as string
    await box.project.write('-/_TRADES/not-an-owner', 'not a directory')
    await box.project.write('-/_TRADES/example/not-a-repository', 'not a directory')
    const outboundList = await box.run('ki trade list --direction outbound')
    box.cd('receiver')
    const received = await box.run(['ki', 'trade', 'receive', '--from', sourceHome, '--kind', 'work'])
    const repeated = await box.run(['ki', 'trade', 'receive', '--from', sourceHome, '--kind', 'work'])
    box.cd('..')
    const shown = await box.run(['ki', 'trade', 'show', firstId])

    expect(outboundList.output).toContain(`[work] Route contract`)
    expect(received.output).toContain(`received ${firstId}`)
    expect(received.output).toContain(`received ${secondId}`)
    expect(repeated.output).toContain(`existing ${firstId}`)
    expect(repeated.output).toContain(`existing ${secondId}`)
    expect(shown.output).not.toContain(secondId)
  })

  test('reports missing, invalid, and unregistered user configuration before trade mutation', async () => {
    const unbootstrapped = await sandbox()
    await unbootstrapped.project.write('.ki-config.toml', repositoryConfiguration('example/source'))
    expect((await unbootstrapped.run('ki trade routes list')).output).toContain('ki environment is not bootstrapped')

    const box = await sandbox()
    const source = await realpath(box.project.path)
    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source'))
    await box.config.write('ki/config.toml', 'not valid TOML')
    expect((await box.run('ki trade routes list')).output).toContain('ki configuration is invalid')
    await box.config.write('ki/config.toml', localConfiguration([]))
    expect((await box.run('ki trade routes list')).output).toContain('current KI repository is not registered')
    await box.config.write('ki/config.toml', localConfiguration([source]))
    expect((await box.run('ki trade routes list')).exitCode).toBe(0)
  })

  test('ignores missing registered roots and missing trade paths without treating them as peer state', async () => {
    const { box, source, receiver } = await configuredPair()
    await box.config.write('ki/config.toml', localConfiguration([source, receiver, `${box.root.path}/missing`]))

    expect(await box.run('ki trade list')).toEqual({
      exitCode: 0,
      output: '╭─ KI TRADES\n│  ✦ 0 trades\n├─ results\n│  ╰─ trades: none\n╰─ summary: TRADES=0 INBOUND=0 OUTBOUND=0\n'
    })
    const created = await box.run(newTrade('work'))
    const id = /TRD-[0-9a-f-]+/u.exec(created.output)?.[0] as string

    expect((await box.run(['ki', 'trade', 'release', id])).output).toContain('receiver has not recorded an inbound trade')
  })

  test('validates receiver-only status fields, payload immutability, and lifecycle evidence', async () => {
    const { box } = await configuredPair()
    const created = await box.run(newTrade('work'))
    const id = /TRD-[0-9a-f-]+/u.exec(created.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', '--from', sourceHome, '--kind', 'work', '--id', id])
    const path = `receiver/+/_TRADES/example/source/${id}.md`
    const inbound = await box.project.read(path)
    const releaseWith = async (status: string) => {
      await box.project.write(path, inbound.replace('status: received', status))
      box.cd('..')
      const result = await box.run(['ki', 'trade', 'release', id])
      box.cd('receiver')
      return result
    }

    const cases: readonly [string, string][] = [
      ['status: unknown', 'invalid receiver status'],
      ['status: received\nreviewed_at: invalid', 'invalid reviewed_at timestamp'],
      ['status: parked', 'requires rationale for status parked'],
      ['status: adopted', 'requires adopted_as for status adopted'],
      ['status: received\nadopted_as: "KI-LOCAL-001"', 'permits adopted_as only for status adopted'],
      ['status: received\nretained_as: "Knowledge/Note"', 'permits retained_as only for status retained'],
      ['status: superseded\nrationale: "replaced"', 'requires superseded_by for status superseded'],
      ['status: received\nsuperseded_by: "TRD-other"', 'permits superseded_by only for status superseded']
    ]
    for (const [status, message] of cases) expect((await releaseWith(status)).output).toContain(message)

    expect((await releaseWith('status: received')).output).toContain('cannot be released while receiver status is received')
    expect((await releaseWith('status: adopted\nadopted_as: "KI-LOCAL-001"\nreviewed_at: 2026-08-03T12:30:00Z')).exitCode).toBe(0)

    box.cd('..')
    const changed = await box.run(newTrade('work'))
    const changedId = /TRD-[0-9a-f-]+/u.exec(changed.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', '--from', sourceHome, '--kind', 'work', '--id', changedId])
    const changedPath = `receiver/+/_TRADES/example/source/${changedId}.md`
    await box.project.write(
      changedPath,
      (await box.project.read(changedPath))
        .replace('status: received', 'status: declined\nrationale: "not local"')
        .replaceAll('Route contract', 'Changed title')
    )
    box.cd('..')
    expect((await box.run(['ki', 'trade', 'release', changedId])).output).toContain('does not preserve the sender payload')

    const knowledge = await box.run(newTrade('knowledge'))
    const knowledgeId = /TRD-[0-9a-f-]+/u.exec(knowledge.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', '--from', sourceHome, '--kind', 'knowledge', '--id', knowledgeId])
    const knowledgePath = `receiver/+/_TRADES/example/source/${knowledgeId}.md`
    const knowledgeInbound = await box.project.read(knowledgePath)
    await box.project.write(knowledgePath, knowledgeInbound.replace('status: received', 'status: adopted\nadopted_as: "KI-LOCAL-002"'))
    box.cd('..')
    expect((await box.run(['ki', 'trade', 'release', knowledgeId])).output).toContain('permits adopted only for work trades')
    box.cd('receiver')
    await box.project.write(knowledgePath, knowledgeInbound.replace('status: received', 'status: retained'))
    box.cd('..')
    expect((await box.run(['ki', 'trade', 'release', knowledgeId])).output).toContain('requires retained_as for status retained')

    const superseded = await box.run(newTrade('work'))
    const supersededId = /TRD-[0-9a-f-]+/u.exec(superseded.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', '--from', sourceHome, '--kind', 'work', '--id', supersededId])
    const supersededPath = `receiver/+/_TRADES/example/source/${supersededId}.md`
    await box.project.write(
      supersededPath,
      (await box.project.read(supersededPath)).replace(
        'status: received',
        'status: superseded\nrationale: "newer trade"\nsuperseded_by: "TRD-00000000-0000-0000-0000-000000000000"'
      )
    )
    box.cd('..')
    expect((await box.run(['ki', 'trade', 'release', supersededId])).exitCode).toBe(0)
  })

  test('rejects absent, premature, foreign, and ambiguous local lifecycle evidence', async () => {
    const { box, source, receiver } = await configuredPair()
    const created = await box.run(newTrade('work'))
    const id = /TRD-[0-9a-f-]+/u.exec(created.output)?.[0] as string
    expect((await box.run(['ki', 'trade', 'release', 'TRD-00000000-0000-0000-0000-000000000000'])).output).toContain('was not found in the current repository')
    expect((await box.run(['ki', 'trade', 'release', id])).output).toContain('receiver has not recorded an inbound trade')

    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', '--from', sourceHome, '--kind', 'work', '--id', id])
    expect((await box.run(['ki', 'trade', 'prune', id])).output).toContain('cannot be pruned while receiver status is received')
    const inboundPath = `receiver/+/_TRADES/example/source/${id}.md`
    await box.project.write(inboundPath, (await box.project.read(inboundPath)).replace('status: received', 'status: declined\nrationale: "not local"'))
    expect((await box.run(['ki', 'trade', 'prune', id])).output).toContain('before sender release is observable')

    box.cd('..')
    const duplicate = await box.project.mkdir('duplicate')
    await box.project.write('duplicate/.ki-config.toml', repositoryConfiguration('example/receiver', {}, { work: [sourceHome] }))
    await box.config.write('ki/config.toml', localConfiguration([source, receiver, duplicate]))
    expect((await box.run(['ki', 'trade', 'release', id])).output).toContain('unavailable or ambiguous')

    await box.config.write('ki/config.toml', localConfiguration([source, receiver]))
    await box.project.write('.ki-config.toml', repositoryConfiguration('example/other', { work: [receiverHome] }))
    expect((await box.run(['ki', 'trade', 'release', id])).output).toContain('not owned by the current repository')

    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source', { work: [receiverHome] }))
    box.cd('receiver')
    await box.project.write('receiver/.ki-config.toml', repositoryConfiguration('example/other-receiver', {}, { work: [sourceHome] }))
    expect((await box.run(['ki', 'trade', 'prune', id])).output).toContain('not addressed to the current repository')
  })
})
