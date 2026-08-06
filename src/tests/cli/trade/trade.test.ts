import { readFile, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

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
  box.setRunner(async (command, arguments_) => {
    if (command !== 'git') return { exitCode: 1, output: 'unsupported command' }
    const root = arguments_[1] as string
    const operation = arguments_[2]
    if (operation === 'rev-parse') return { exitCode: 0, output: `${'a'.repeat(40)}\n` }
    if (operation === 'show') {
      const record = (arguments_[3] as string).slice(41)
      return readFile(join(root, record), 'utf8')
        .then((output) => ({ exitCode: 0, output }))
        .catch(() => ({ exitCode: 1, output: 'missing' }))
    }
    if (operation === 'merge-base') return { exitCode: 1, output: '' }
    if (operation === 'diff') return { exitCode: 0, output: 'committed diff\n' }
    return { exitCode: 1, output: 'unsupported git operation' }
  })
  return { box, source, receiver }
}

const prepareTrade = (
  kind: 'work' | 'knowledge',
  overrides: { readonly receiver?: string; readonly title?: string; readonly observation?: string } = {}
): readonly string[] => [
  'ki',
  'trade',
  'prepare',
  overrides.receiver ?? receiverHome,
  '--kind',
  kind,
  '--observation',
  overrides.observation ?? 'decision',
  '--title',
  overrides.title ?? 'Route contract',
  '--source-ref',
  'KI-TOOL-CLI-012',
  '--context',
  'The host needs an executable contract.',
  '--submission',
  'Apply the typed trade route contract.',
  '--constraints',
  'The receiver retains local authority.'
]

const createTrade = async (
  box: Awaited<ReturnType<typeof sandbox>>,
  kind: 'work' | 'knowledge',
  overrides: { readonly receiver?: string; readonly title?: string; readonly observation?: string } = {},
  now?: () => number
) => {
  const prepared = await box.run(prepareTrade(kind, overrides), { now })
  const id = /TRD-[0-9a-f]{8}/u.exec(prepared.output)?.[0] as string
  if (!id) return prepared
  return box.run(['ki', 'trade', 'submit', id])
}

describe('[ki trade]', () => {
  test('adds, lists, checks, and removes one typed directional route without changing repository identity', async () => {
    const box = await sandbox()
    const source = await realpath(box.project.path)
    const receiver = await box.project.mkdir('receiver')
    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source'))
    await box.project.write('receiver/.ki-config.toml', repositoryConfiguration('example/receiver', {}, { work: [sourceHome] }))
    await box.config.write('ki/config.toml', localConfiguration([source, receiver]))

    const empty = await box.run('ki trade routes list')
    const added = await box.run(['ki', 'trade', 'routes', 'add', receiverHome, '--direction', 'export', '--kind', 'work'])
    const exportOnly = await box.run('ki trade routes list')
    const addedExportKnowledge = await box.run(['ki', 'trade', 'routes', 'add', receiverHome, '--direction', 'export', '--kind', 'knowledge'])
    const addedImport = await box.run(['ki', 'trade', 'routes', 'add', receiverHome, '--direction', 'import', '--kind', 'knowledge'])
    const listed = await box.run('ki trade routes list')
    const checkedAll = await box.run('ki trade routes check')
    const checked = await box.run(['ki', 'trade', 'routes', 'check', receiverHome, '--direction', 'export', '--kind', 'work'])
    const removed = await box.run(['ki', 'trade', 'routes', 'remove', receiverHome, '--direction', 'export', '--kind', 'work'])
    const removedExportKnowledge = await box.run(['ki', 'trade', 'routes', 'remove', receiverHome, '--direction', 'export', '--kind', 'knowledge'])
    const removedImport = await box.run(['ki', 'trade', 'routes', 'remove', receiverHome, '--direction', 'import', '--kind', 'knowledge'])

    expect(empty.output).toContain('│  ╰─ routes: none')
    expect(added).toEqual({ exitCode: 0, output: `ki trade routes add: export work ${sourceHome} -> ${receiverHome}\n` })
    expect(exportOnly.output).toContain('│  ╰─ export')
    expect(addedExportKnowledge).toEqual({ exitCode: 0, output: `ki trade routes add: export knowledge ${sourceHome} -> ${receiverHome}\n` })
    expect(addedImport).toEqual({ exitCode: 0, output: `ki trade routes add: import knowledge ${sourceHome} -> ${receiverHome}\n` })
    expect(listed.exitCode).toBe(0)
    expect(listed.output).toContain('│  ├─ export\n│  │  ├─ work')
    expect(listed.output).toContain('│  │  ╰─ knowledge')
    expect(listed.output).toContain('│  ╰─ import')
    expect(checkedAll.output).toContain(`│  ├─ export work ${receiverHome}: active`)
    expect(checkedAll.output).toContain(`│  ├─ export knowledge ${receiverHome}: awaiting receiver activation`)
    expect(checkedAll.output).toContain(`│  ╰─ import knowledge ${receiverHome}: awaiting sender activation`)
    expect(checked).toEqual({
      exitCode: 0,
      output: `╭─ KI TRADE ROUTE CHECK\n├─ routes (1)\n│  ╰─ export work ${receiverHome}: active\n╰─ summary: ROUTES=1 ACTIVE=1\n`
    })
    expect(removed).toEqual({ exitCode: 0, output: `ki trade routes remove: export work ${sourceHome} -> ${receiverHome}\n` })
    expect(removedExportKnowledge).toEqual({ exitCode: 0, output: `ki trade routes remove: export knowledge ${sourceHome} -> ${receiverHome}\n` })
    expect(removedImport).toEqual({ exitCode: 0, output: `ki trade routes remove: import knowledge ${sourceHome} -> ${receiverHome}\n` })
    expect(await box.project.read('.ki-config.toml')).toContain(`repository = "${sourceHome}"`)
    expect(await box.project.read('receiver/.ki-config.toml')).toContain(`work = ["${sourceHome}"]`)
  })

  test('lists incomplete route declarations across the registered estate', async () => {
    const { box } = await configuredPair()
    const estate = await box.run('ki trade routes list --estate')
    const incomplete = await box.run('ki trade routes list --estate --incomplete')

    expect(estate).toEqual({
      exitCode: 0,
      output:
        '╭─ KI TRADE ROUTES\n│  ◫ registered estate\n│  ✦ 4 routes\n├─ results\n│  ├─ ◇ example/source → example/receiver [active]\n│  ├─ ◇ example/source → example/receiver [active]\n│  ├─ ⚒ example/source → example/receiver [active]\n│  ╰─ ⚒ example/source → example/receiver [active]\n╰─ summary: ROUTES=4 ACTIVE=4 INCOMPLETE=0\n'
    })
    expect(incomplete).toEqual({
      exitCode: 0,
      output:
        '╭─ KI TRADE ROUTES\n│  ◫ registered estate\n│  ✦ 0 routes\n├─ results\n│  ╰─ incomplete routes: none\n╰─ summary: ROUTES=0 ACTIVE=0 INCOMPLETE=0\n'
    })

    await box.project.write('receiver/.ki-config.toml', repositoryConfiguration('example/receiver', {}, { work: [sourceHome] }))

    expect(await box.run('ki trade routes list --estate --incomplete')).toEqual({
      exitCode: 0,
      output:
        '╭─ KI TRADE ROUTES\n│  ◫ registered estate\n│  ✦ 1 route\n├─ results\n│  ╰─ ◇ example/source → example/receiver [awaiting receiver activation]\n╰─ summary: ROUTES=1 ACTIVE=0 INCOMPLETE=1\n'
    })
  })

  test('creates, receives, displays, releases, and prunes a work trade while each command writes only its local repository', async () => {
    const { box } = await configuredPair()
    const created = await createTrade(box, 'work', {}, () => Date.UTC(2026, 7, 3, 12, 0, 0))
    const id = /TRD-[0-9a-f-]+/u.exec(created.output)?.[0] as string
    expect(id).toMatch(/^TRD-[0-9a-f]{8}$/u)
    const outboundPath = `-/_TRADES/example/receiver/${id}.md`
    const outbound = await box.project.read(outboundPath)
    expect(outbound).toContain('kind: work')

    box.cd('receiver')
    const received = await box.run(['ki', 'trade', 'receive', id])
    const inboundPath = `receiver/+/_TRADES/example/source/${id}.md`
    const receivedInbound = await box.project.read(inboundPath)
    await box.project.write(
      inboundPath,
      receivedInbound.replace('decision_status: unconsidered', 'decision_status: adopted\nadopted_as: "KI-RECEIVER-FND-001"')
    )
    box.cd('..')
    const listed = await box.run(['ki', 'trade', 'list', '--repo', receiverHome, '--direction', 'import', '--status', 'adopted', '--kind', 'work'])
    const allListed = await box.run('ki trade list')
    const shown = await box.run(['ki', 'trade', 'show', id])
    const released = await box.run(['ki', 'trade', 'release', id])
    box.cd('receiver')
    const pruned = await box.run(['ki', 'trade', 'prune', id])

    expect(created.output).toBe(`ki trade submit: submitted ${id} for example/receiver [decision]\n`)
    expect(received).toEqual({ exitCode: 0, output: `ki trade receive: received ${id}\n` })
    expect(listed.output).toContain(`⚒ ${id} import ← source [submitted · received · adopted · release eligible] [decision] Route contract`)
    expect(allListed.output).toContain(`⚒ ${id} import ← source [submitted · received · adopted`)
    expect(allListed.output).toContain(`⚒ ${id} export → receiver [submitted · received · adopted`)
    expect(shown.output).toContain(`Repository: ${sourceHome} [export]\n${outbound.trimEnd()}`)
    expect(released).toEqual({ exitCode: 0, output: `ki trade release: released ${id}\n` })
    expect(pruned).toEqual({ exitCode: 0, output: `ki trade prune: pruned ${id}\n` })
    await expect(box.project.read(`receiver/+/_TRADES/example/source/${id}.md`)).rejects.toThrow()
  })

  test('permits retained knowledge to release and prune, but refuses retained work', async () => {
    const { box } = await configuredPair()
    const created = await createTrade(box, 'knowledge')
    const id = /TRD-[0-9a-f-]+/u.exec(created.output)?.[0] as string
    const listed = await box.run('ki trade list')
    expect(listed.output).toContain(`◇ ${id} export → receiver [submitted · awaiting-receipt] [decision] Route contract`)
    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', id])
    const path = `receiver/+/_TRADES/example/source/${id}.md`
    await box.project.write(
      path,
      (await box.project.read(path)).replace('decision_status: unconsidered', 'decision_status: retained\nretained_as: "Knowledge/Local/Note"')
    )
    box.cd('..')
    const released = await box.run(['ki', 'trade', 'release', id])
    box.cd('receiver')
    const pruned = await box.run(['ki', 'trade', 'prune', id])

    expect(released.exitCode).toBe(0)
    expect(pruned.exitCode).toBe(0)

    box.cd('..')
    const invalid = await createTrade(box, 'work')
    const invalidId = /TRD-[0-9a-f-]+/u.exec(invalid.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', invalidId])
    const invalidPath = `receiver/+/_TRADES/example/source/${invalidId}.md`
    await box.project.write(
      invalidPath,
      (await box.project.read(invalidPath)).replace('decision_status: unconsidered', 'decision_status: retained\nretained_as: "Knowledge/Local/Note"')
    )
    box.cd('..')
    expect((await box.run(['ki', 'trade', 'release', invalidId])).output).toContain('permits retained only for knowledge trades')
  })

  test('creates declared outbound trades before receiver activation and rejects malformed or retired inputs', async () => {
    const { box } = await configuredPair()
    await box.project.write('receiver/.ki-config.toml', repositoryConfiguration('example/receiver'))

    const nonreciprocal = await createTrade(box, 'work')
    const missingKind = await box.run(['ki', 'trade', 'prepare', receiverHome])
    const missingDirection = await box.run(['ki', 'trade', 'routes', 'add', receiverHome, '--kind', 'work'])
    const malformedRepository = await box.run('ki trade routes add example/receiver --direction export --kind work')
    const malformedKind = await box.run(`ki trade routes add ${receiverHome} --direction export --kind other`)
    const emptyTitle = await box.run(prepareTrade('work', { title: '   ' }))
    const retired = await box.run('ki handoffs list')
    const plural = await box.run('ki trades list')

    expect(nonreciprocal.exitCode).toBe(0)
    expect(nonreciprocal.output).toMatch(/^ki trade submit: submitted TRD-[0-9a-f]{8} for example\/receiver \[decision\]\n$/)
    const id = /TRD-[0-9a-f]{8}/u.exec(nonreciprocal.output)?.[0] as string
    expect(await box.project.read(`-/_TRADES/example/receiver/${id}.md`)).toContain(`receiver: example/receiver`)
    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source'))
    expect((await createTrade(box, 'work')).output).toContain('is not declared locally')
    expect(missingKind.exitCode).toBe(2)
    expect(missingDirection.exitCode).toBe(2)
    expect(malformedRepository).toEqual({ exitCode: 2, output: 'ki: error: trade route repository must use canonical HTTPS GitHub repository form\n' })
    expect(malformedKind).toEqual({ exitCode: 2, output: 'ki: error: --kind accepts work or knowledge\n' })
    expect(emptyTitle.output).toContain('--title is required and must be non-empty')
    expect(retired.exitCode).toBe(2)
    expect(plural.exitCode).toBe(2)
  })

  test('retains the owner when a trade peer belongs to another owner', async () => {
    const box = await sandbox()
    const source = await realpath(box.project.path)
    const receiver = await box.project.mkdir('receiver')
    const foreignReceiver = home('other/receiver')
    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source', { work: [foreignReceiver] }))
    await box.project.write('receiver/.ki-config.toml', repositoryConfiguration('other/receiver'))
    await box.config.write('ki/config.toml', localConfiguration([source, receiver]))

    const created = await createTrade(box, 'work', { receiver: foreignReceiver })
    const id = /TRD-[0-9a-f]{8}/u.exec(created.output)?.[0] as string
    const listed = await box.run('ki trade list')

    expect(listed.output).toContain(`⚒ ${id} export → other/receiver [submitted · awaiting-receipt] [decision] Route contract`)
  })

  test('reports malformed route declarations plus pending, active, and ambiguous registered-estate routes', async () => {
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
    expect(await box.run('ki trade routes check')).toEqual({
      exitCode: 0,
      output: '╭─ KI TRADE ROUTE CHECK\n├─ routes (0)\n│  ╰─ none\n╰─ summary: ROUTES=0 ACTIVE=0\n'
    })

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
    expect((await box.run('ki trade routes check')).output).toContain(`${missingHome}: awaiting receiver activation`)

    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source', { work: [receiverHome] }))
    await box.project.write('receiver/.ki-config.toml', '["knowledgeislands/ki-agentic-harness:ki-repo"]\n')
    expect((await box.run('ki trade routes check')).output).toContain(`${receiverHome}: awaiting receiver activation`)
    await box.project.write('receiver/.ki-config.toml', `["knowledgeislands/ki-agentic-harness:ki-repo"]\nrepository = 1\n`)
    expect((await box.run('ki trade routes check')).output).toContain(`${receiverHome}: awaiting receiver activation`)
    await box.project.write('receiver/.ki-config.toml', '["knowledgeislands/ki-agentic-harness:ki-repo"]\nrepository = "not-a-repository"\n')
    expect((await box.run('ki trade routes check')).output).toContain(`${receiverHome}: awaiting receiver activation`)
    await box.project.write('receiver/.ki-config.toml', `["knowledgeislands/ki-agentic-harness:ki-repo"]\nrepository = "${receiverHome}"\n`)
    expect((await box.run('ki trade routes check')).output).toContain(`${receiverHome}: awaiting receiver activation`)
    await box.project.write('receiver/.ki-config.toml', repositoryConfiguration('example/receiver'))
    expect((await box.run('ki trade routes check')).output).toContain(`${receiverHome}: awaiting receiver activation`)

    await box.project.write('receiver/.ki-config.toml', repositoryConfiguration('example/receiver', {}, { work: [sourceHome] }))
    await box.project.write('duplicate/.ki-config.toml', repositoryConfiguration('example/receiver', {}, { work: [sourceHome] }))
    expect((await box.run('ki trade routes check')).output).toContain(`${receiverHome}: ambiguous repository`)

    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source'))
    expect((await box.run(`ki trade routes add ${sourceHome} --direction export --kind work`)).output).toContain('must differ from the local repository')
    expect((await box.run(`ki trade routes remove ${receiverHome} --direction export --kind work`)).output).toContain('is not declared locally')
    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source'))
    await box.project.write('receiver/.ki-config.toml', repositoryConfiguration('example/receiver', {}, { work: [sourceHome] }))
    box.cd('receiver')
    expect((await box.run(['ki', 'trade', 'receive'])).output).toContain('requires one trade id or --all')
    await box.project.write('receiver/.ki-config.toml', repositoryConfiguration('example/receiver'))
    expect((await box.run(['ki', 'trade', 'receive', '--all'])).output).toContain('0 eligible trades')
    box.cd('..')
    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source', { work: [home('example/zulu')] }))
    expect((await box.run(`ki trade routes add ${receiverHome} --direction export --kind work`)).exitCode).toBe(0)
  })

  test('covers import-route mutation and command filters without changing peer configuration', async () => {
    const { box } = await configuredPair()
    expect(await box.run('ki trade list')).toEqual({
      exitCode: 0,
      output: '╭─ KI TRADES\n│  ✦ 0 trades\n├─ results\n│  ╰─ trades: none\n╰─ summary: TRADES=0 PREPARATIONS=0 IMPORTS=0 EXPORTS=0\n'
    })
    expect(await box.run('ki trade show TRD-00000000')).toEqual({
      exitCode: 2,
      output: 'ki: error: trade TRD-00000000 was not found in the registered repository estate\n'
    })
    box.cd('receiver')
    expect((await box.run(['ki', 'trade', 'receive'])).exitCode).toBe(2)
    const removed = await box.run(['ki', 'trade', 'routes', 'remove', sourceHome, '--direction', 'import', '--kind', 'knowledge'])
    const added = await box.run(['ki', 'trade', 'routes', 'add', sourceHome, '--direction', 'import', '--kind', 'knowledge'])
    const selected = await box.run(['ki', 'trade', 'routes', 'check', sourceHome, '--direction', 'import', '--kind', 'knowledge'])
    const absent = await box.run(['ki', 'trade', 'routes', 'check', home('example/absent')])
    const badDirection = await box.run(`ki trade routes check ${sourceHome} --direction sideways`)
    const badKind = await box.run(`ki trade routes check ${sourceHome} --kind other`)
    const badListDirection = await box.run('ki trade list --direction sideways')
    const badListRepository = await box.run('ki trade list --repo example/source')
    const badId = await box.run('ki trade show TRD-invalid')
    const retiredUuidId = await box.run('ki trade show TRD-00000000-0000-0000-0000-000000000000')

    expect(removed.exitCode).toBe(0)
    expect(added.exitCode).toBe(0)
    expect(selected.output).toContain(`import knowledge ${sourceHome}: active`)
    expect(absent.output).toContain('is not declared locally')
    expect(badDirection.output).toContain('--direction accepts export or import')
    expect(badKind.output).toContain('--kind accepts work or knowledge')
    expect(badListDirection.output).toContain('--direction accepts prepare, import, or export')
    expect(badListRepository.output).toContain('--repo must use canonical HTTPS GitHub repository form')
    expect(badId.output).toContain('trade id must use TRD-')
    expect(retiredUuidId.output).toContain('trade id must use TRD-')
  })

  test('rejects malformed outbound envelopes observed by the receiver', async () => {
    const { box } = await configuredPair()
    const created = await createTrade(box, 'work')
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
      [outbound.replace('source_ref: "KI-TOOL-CLI-012"\n', ''), 'must declare non-empty trade field source_ref']
    ]

    for (const [contents, message] of cases) {
      await box.project.write(path, contents)
      expect((await box.run(['ki', 'trade', 'receive', id])).output).toContain(message)
    }

    await box.project.write(
      path,
      outbound.replace('\n---\n#', '\n---\n\n#').replace('## Constraints\n\nThe receiver retains local authority.', '## Constraints\n\n')
    )
    expect((await box.run(['ki', 'trade', 'receive', id])).output).toContain('requires non-empty Constraints section')

    await box.project.write(path, outbound.replace('receiver: example/receiver', 'receiver: example/other'))
    expect((await box.run(['ki', 'trade', 'receive', id])).output).toContain(
      'is unavailable or ambiguous'
    )
    await box.project.write(path, outbound)
    const missing = await box.run(['ki', 'trade', 'receive', 'TRD-00000000'])
    expect(missing.output).toContain('is unavailable or ambiguous')
    const wrongId = 'TRD-00000000'
    await box.project.write(`-/_TRADES/example/receiver/${wrongId}.md`, outbound)
    box.cd('..')
    expect((await box.run('ki trade list')).output).toContain(`filename must match trade id ${id}`)
    box.cd('receiver')
    expect((await box.run(['ki', 'trade', 'receive', wrongId])).output).toContain(
      `filename must match trade id ${id}`
    )
  })

  test('receives all matching trades, reports existing copies, and filters distinct records', async () => {
    const { box } = await configuredPair()
    const first = await createTrade(box, 'work')
    const second = await createTrade(box, 'work', { title: 'Second route' })
    const firstId = /TRD-[0-9a-f-]+/u.exec(first.output)?.[0] as string
    const secondId = /TRD-[0-9a-f-]+/u.exec(second.output)?.[0] as string
    await box.project.write('-/_TRADES/not-an-owner', 'not a directory')
    await box.project.write('-/_TRADES/example/not-a-repository', 'not a directory')
    const outboundList = await box.run('ki trade list --direction export')
    box.cd('receiver')
    const received = await box.run(['ki', 'trade', 'receive', '--all', '--yes'])
    const repeated = await box.run(['ki', 'trade', 'receive', '--all', '--yes'])
    box.cd('..')
    const shown = await box.run(['ki', 'trade', 'show', firstId])

    expect(outboundList.output).toContain(`⚒ ${firstId} export → receiver [submitted · awaiting-receipt] [decision] Route contract`)
    expect(received.output).toContain(firstId)
    expect(received.output).toContain(secondId)
    expect(repeated.output).toContain(firstId)
    expect(repeated.output).toContain(secondId)
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
      output: '╭─ KI TRADES\n│  ✦ 0 trades\n├─ results\n│  ╰─ trades: none\n╰─ summary: TRADES=0 PREPARATIONS=0 IMPORTS=0 EXPORTS=0\n'
    })
    const created = await createTrade(box, 'work')
    const id = /TRD-[0-9a-f-]+/u.exec(created.output)?.[0] as string

    expect((await box.run(['ki', 'trade', 'release', id])).output).toContain('receiver has not recorded an inbound trade')
  })

  test('validates receiver-only status fields, payload immutability, and lifecycle evidence', async () => {
    const { box } = await configuredPair()
    const created = await createTrade(box, 'work')
    const id = /TRD-[0-9a-f-]+/u.exec(created.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', id])
    const path = `receiver/+/_TRADES/example/source/${id}.md`
    const inbound = await box.project.read(path)
    const releaseWith = async (decisionStatus: string) => {
      await box.project.write(path, inbound.replace('decision_status: unconsidered', decisionStatus))
      box.cd('..')
      const result = await box.run(['ki', 'trade', 'release', id])
      box.cd('receiver')
      return result
    }

    const cases: readonly [string, string][] = [
      ['decision_status: unknown', 'invalid decision status'],
      ['decision_status: unconsidered\nreviewed_at: invalid', 'invalid reviewed_at timestamp'],
      ['decision_status: parked', 'requires rationale for decision status parked'],
      ['decision_status: adopted', 'requires adopted_as for decision status adopted'],
      ['decision_status: unconsidered\nadopted_as: "KI-LOCAL-001"', 'permits adopted_as only for decision status adopted'],
      ['decision_status: unconsidered\nretained_as: "Knowledge/Note"', 'permits retained_as only for decision status retained'],
      ['decision_status: superseded\nrationale: "replaced"', 'requires superseded_by for decision status superseded'],
      ['decision_status: unconsidered\nsuperseded_by: "TRD-other"', 'permits superseded_by only for decision status superseded']
    ]
    for (const [status, message] of cases) expect((await releaseWith(status)).output).toContain(message)

    expect((await releaseWith('decision_status: unconsidered')).output).toContain('decision observation policy is satisfied')
    expect((await releaseWith('decision_status: adopted\nadopted_as: "KI-LOCAL-001"\nreviewed_at: 2026-08-03T12:30:00Z')).exitCode).toBe(0)

    box.cd('..')
    const changed = await createTrade(box, 'work')
    const changedId = /TRD-[0-9a-f-]+/u.exec(changed.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', changedId])
    const changedPath = `receiver/+/_TRADES/example/source/${changedId}.md`
    await box.project.write(
      changedPath,
      (await box.project.read(changedPath))
        .replace('decision_status: unconsidered', 'decision_status: declined\nrationale: "not local"')
        .replaceAll('Route contract', 'Changed title')
    )
    box.cd('..')
    expect((await box.run(['ki', 'trade', 'release', changedId])).output).toContain('does not preserve the sender payload')

    const knowledge = await createTrade(box, 'knowledge')
    const knowledgeId = /TRD-[0-9a-f-]+/u.exec(knowledge.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', knowledgeId])
    const knowledgePath = `receiver/+/_TRADES/example/source/${knowledgeId}.md`
    const knowledgeInbound = await box.project.read(knowledgePath)
    await box.project.write(knowledgePath, knowledgeInbound.replace('decision_status: unconsidered', 'decision_status: adopted\nadopted_as: "KI-LOCAL-002"'))
    box.cd('..')
    expect((await box.run(['ki', 'trade', 'release', knowledgeId])).output).toContain('permits adopted only for work trades')
    box.cd('receiver')
    await box.project.write(knowledgePath, knowledgeInbound.replace('decision_status: unconsidered', 'decision_status: retained'))
    box.cd('..')
    expect((await box.run(['ki', 'trade', 'release', knowledgeId])).output).toContain('requires retained_as for decision status retained')

    const superseded = await createTrade(box, 'work')
    const supersededId = /TRD-[0-9a-f-]+/u.exec(superseded.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', supersededId])
    const supersededPath = `receiver/+/_TRADES/example/source/${supersededId}.md`
    await box.project.write(
      supersededPath,
      (await box.project.read(supersededPath)).replace(
        'decision_status: unconsidered',
        'decision_status: superseded\nrationale: "newer trade"\nsuperseded_by: "TRD-00000000"'
      )
    )
    box.cd('..')
    expect((await box.run(['ki', 'trade', 'release', supersededId])).exitCode).toBe(0)
  })

  test('rejects absent, premature, foreign, and ambiguous local lifecycle evidence', async () => {
    const { box, source, receiver } = await configuredPair()
    const created = await createTrade(box, 'work')
    const id = /TRD-[0-9a-f-]+/u.exec(created.output)?.[0] as string
    expect((await box.run(['ki', 'trade', 'release', 'TRD-00000000'])).output).toContain('was not found in the current repository')
    expect((await box.run(['ki', 'trade', 'release', id])).output).toContain('receiver has not recorded an inbound trade')

    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', id])
    expect((await box.run(['ki', 'trade', 'prune', id])).output).toContain('before sender release is observable')
    const inboundPath = `receiver/+/_TRADES/example/source/${id}.md`
    await box.project.write(
      inboundPath,
      (await box.project.read(inboundPath)).replace('decision_status: unconsidered', 'decision_status: declined\nrationale: "not local"')
    )
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

  test('prepares, observes, guards routes and submission identity, then abandons mutable work', async () => {
    const { box } = await configuredPair()
    const prepared = await box.run(prepareTrade('work', { observation: 'receipt' }))
    const id = /TRD-[0-9a-f]{8}/u.exec(prepared.output)?.[0] as string
    const preparationPath = `-/_TRADES/_PREPARATIONS/example/receiver/${id}.md`
    expect(await box.project.read(preparationPath)).toContain('phase: preparing')
    expect((await box.run('ki trade list --direction prepare')).output).toContain(`${id} prepare → receiver [preparing · not-deliverable] [receipt]`)
    expect((await box.run(['ki', 'trade', 'routes', 'remove', receiverHome, '--direction', 'export', '--kind', 'work'])).output).toContain(
      `is used by ${id}`
    )

    box.cd('receiver')
    const first = await box.run(['ki', 'trade', 'observe', id])
    expect(first.output).toContain('verbatim')
    expect(first.output).toContain('first observation')
    box.setRunner(async (command, arguments_) => {
      if (command !== 'git') return { exitCode: 1, output: '' }
      const root = arguments_[1] as string
      if (arguments_[2] === 'rev-parse') return { exitCode: 0, output: `${'a'.repeat(40)}\n` }
      if (arguments_[2] === 'show') return { exitCode: 0, output: await readFile(join(root, (arguments_[3] as string).slice(41)), 'utf8') }
      if (arguments_[2] === 'merge-base') return { exitCode: 0, output: '' }
      if (arguments_[2] === 'diff') return { exitCode: 0, output: 'committed diff\n' }
      return { exitCode: 1, output: '' }
    })
    expect((await box.run(['ki', 'trade', 'observe', id])).output).toContain('diff')
    expect((await box.run(['ki', 'trade', 'observe', 'TRD-00000000'])).output).toContain('unavailable or ambiguous')

    box.cd('..')
    await box.project.write(`-/_TRADES/example/receiver/${id}.md`, 'conflict')
    expect((await box.run(['ki', 'trade', 'submit', id])).output).toContain('already exists')
    await rm(join(box.project.path, `-/_TRADES/example/receiver/${id}.md`))
    expect((await box.run(['ki', 'trade', 'abandon', id, '--yes'])).exitCode).toBe(0)
    await expect(box.project.read(preparationPath)).rejects.toThrow()
    const invalidObservation = await box.run(prepareTrade('work', { observation: 'unknown' }))
    expect(invalidObservation).toEqual({
      exitCode: 2,
      output: 'ki: error: --observation accepts unattended, receipt, decision, or completion\n'
    })
  })

  test('applies observation-led completion and eligible cleanup, including premature-release protection', async () => {
    const { box } = await configuredPair()
    const completion = await createTrade(box, 'work', { observation: 'completion' })
    const completionId = /TRD-[0-9a-f]{8}/u.exec(completion.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', completionId])
    const inbound = `receiver/+/_TRADES/example/source/${completionId}.md`
    await box.project.write(
      inbound,
      (await box.project.read(inbound)).replace('decision_status: unconsidered', 'decision_status: adopted\nadopted_as: "KI-LOCAL-001"')
    )
    box.cd('..')
    expect((await box.run(['ki', 'trade', 'release', completionId])).output).toContain('completion observation policy')
    await box.project.write('receiver/docs/roadmap/not-markdown.txt', 'ignored')
    expect((await box.run(['ki', 'trade', 'release', completionId])).output).toContain('completion observation policy')
    await box.project.write('receiver/docs/roadmap/item.md', '---\nid: KI-LOCAL-001\nstatus: done\n---\n')
    expect((await box.run(['ki', 'trade', 'release', '--eligible'])).output).toContain(completionId)
    expect((await box.run(['ki', 'trade', 'release', '--eligible', '--yes'])).output).toContain('released 1 trade')
    box.cd('receiver')
    expect((await box.run(['ki', 'trade', 'prune', '--eligible'])).output).toContain(completionId)
    expect((await box.run(['ki', 'trade', 'prune', '--eligible', '--yes'])).output).toContain('pruned 1 trade')

    box.cd('..')
    const applied = await createTrade(box, 'work')
    const appliedId = /TRD-[0-9a-f]{8}/u.exec(applied.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', appliedId])
    const appliedPath = `receiver/+/_TRADES/example/source/${appliedId}.md`
    const appliedInbound = await box.project.read(appliedPath)
    await box.project.write(appliedPath, appliedInbound.replace('decision_status: unconsidered', 'decision_status: applied'))
    box.cd('..')
    expect((await box.run(['ki', 'trade', 'release', appliedId])).output).toContain('requires full applied_commit')
    box.cd('receiver')
    await box.project.write(
      appliedPath,
      appliedInbound.replace('decision_status: unconsidered', `decision_status: applied\napplied_commit: ${'b'.repeat(40)}`)
    )
    box.cd('..')
    expect((await box.run(['ki', 'trade', 'release', appliedId])).exitCode).toBe(0)

    const premature = await createTrade(box, 'work')
    const prematureId = /TRD-[0-9a-f]{8}/u.exec(premature.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', prematureId])
    box.cd('..')
    await rm(join(box.project.path, `-/_TRADES/example/receiver/${prematureId}.md`))
    box.cd('receiver')
    expect((await box.run(['ki', 'trade', 'prune', prematureId])).output).toContain('premature decision sender release')
  })
})
