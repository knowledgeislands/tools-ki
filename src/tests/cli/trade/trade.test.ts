import { readFile, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'

const tradesTable = 'skills.ki-trades'
const home = (identity: string): string => `https://github.com/${identity}`
const sourceHome = home('example/source')
const receiverHome = home('example/receiver')

type Kind = 'work' | 'knowledge'
type Directions = Partial<Record<Kind, readonly string[]>>

/** Inverts the kind-keyed fixture arguments into the partner-keyed route map the contract declares. */
const routeLines = (exportsTo: Directions, importsFrom: Directions): readonly string[] => {
  const partners = new Map<string, { export: Kind[]; import: Kind[] }>()
  const record = (direction: 'export' | 'import', directions: Directions): void => {
    for (const kind of ['work', 'knowledge'] as const)
      for (const partner of directions[kind] ?? []) {
        const entry = partners.get(partner) ?? { export: [], import: [] }
        entry[direction].push(kind)
        partners.set(partner, entry)
      }
  }
  record('export', exportsTo)
  record('import', importsFrom)
  if (!partners.size) return []
  return [
    '',
    `[${tradesTable}.routes]`,
    ...[...partners.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([partner, kinds]) => {
        const entries = (['export', 'import'] as const)
          .filter((direction) => kinds[direction].length)
          .map((direction) => `${direction} = [${kinds[direction].map((kind) => JSON.stringify(kind)).join(', ')}]`)
        return `${JSON.stringify(partner.slice('https://github.com/'.length))} = { ${entries.join(', ')} }`
      })
  ]
}

const repositoryConfiguration = (identity: string, exportsTo: Directions = {}, importsFrom: Directions = {}): string =>
  [
    '[repo]',
    'harnesses = ["example/harness"]',
    '',
    '[skills.ki-repo]',
    `repository = ${JSON.stringify(home(identity))}`,
    'title = "Test repository"',
    'description = "Trade fixture."',
    'repo_code = "TEST"',
    '',
    `[${tradesTable}]`,
    ...routeLines(exportsTo, importsFrom),
    ''
  ].join('\n')

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
  await box.project.write(
    '.ki-config.toml',
    repositoryConfiguration('example/source', { work: [receiverHome], knowledge: [receiverHome] })
  )
  await box.project.write(
    'receiver/.ki-config.toml',
    repositoryConfiguration('example/receiver', {}, { work: [sourceHome], knowledge: [sourceHome] })
  )
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
    await box.project.write(
      'receiver/.ki-config.toml',
      repositoryConfiguration('example/receiver', {}, { work: [sourceHome] })
    )
    await box.config.write('ki/config.toml', localConfiguration([source, receiver]))

    const empty = await box.run('ki trade routes list')
    const added = await box.run([
      'ki',
      'trade',
      'routes',
      'add',
      receiverHome,
      '--direction',
      'export',
      '--kind',
      'work'
    ])
    const exportOnly = await box.run('ki trade routes list')
    const addedExportKnowledge = await box.run([
      'ki',
      'trade',
      'routes',
      'add',
      receiverHome,
      '--direction',
      'export',
      '--kind',
      'knowledge'
    ])
    const addedImport = await box.run([
      'ki',
      'trade',
      'routes',
      'add',
      receiverHome,
      '--direction',
      'import',
      '--kind',
      'knowledge'
    ])
    const listed = await box.run('ki trade routes list')
    const checkedAll = await box.run('ki trade routes check')
    const checked = await box.run([
      'ki',
      'trade',
      'routes',
      'check',
      receiverHome,
      '--direction',
      'export',
      '--kind',
      'work'
    ])
    const removed = await box.run([
      'ki',
      'trade',
      'routes',
      'remove',
      receiverHome,
      '--direction',
      'export',
      '--kind',
      'work'
    ])
    const removedExportKnowledge = await box.run([
      'ki',
      'trade',
      'routes',
      'remove',
      receiverHome,
      '--direction',
      'export',
      '--kind',
      'knowledge'
    ])
    const removedImport = await box.run([
      'ki',
      'trade',
      'routes',
      'remove',
      receiverHome,
      '--direction',
      'import',
      '--kind',
      'knowledge'
    ])

    expect(empty.output).toContain('│  ╰─ routes: none')
    expect(added).toEqual({
      exitCode: 0,
      output: `ki trade routes add: export work ${sourceHome} -> ${receiverHome}\n`
    })
    expect(exportOnly.output).toContain('│  ╰─ export')
    expect(addedExportKnowledge).toEqual({
      exitCode: 0,
      output: `ki trade routes add: export knowledge ${sourceHome} -> ${receiverHome}\n`
    })
    expect(addedImport).toEqual({
      exitCode: 0,
      output: `ki trade routes add: import knowledge ${sourceHome} -> ${receiverHome}\n`
    })
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
    expect(removed).toEqual({
      exitCode: 0,
      output: `ki trade routes remove: export work ${sourceHome} -> ${receiverHome}\n`
    })
    expect(removedExportKnowledge).toEqual({
      exitCode: 0,
      output: `ki trade routes remove: export knowledge ${sourceHome} -> ${receiverHome}\n`
    })
    expect(removedImport).toEqual({
      exitCode: 0,
      output: `ki trade routes remove: import knowledge ${sourceHome} -> ${receiverHome}\n`
    })
    expect(await box.project.read('.ki-config.toml')).toContain(`repository = "${sourceHome}"`)
    expect(await box.project.read('receiver/.ki-config.toml')).toContain('"example/source" = { import = ["work"] }')
  })

  test('pairs copies whose phases differ, since sender and receiver hold different states', async () => {
    const { box } = await configuredPair()
    const created = await createTrade(box, 'work', {}, () => Date.UTC(2026, 7, 3, 12, 0, 0))
    const id = /TRD-[0-9a-f]{8}/u.exec(created.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', id])
    box.cd('..')

    // The sender's copy reads submitted and the receiver's reads received, so the two are
    // correctly divergent on phase alone. Pairing strips it, or every honest pair would
    // report as tampered.
    expect(await box.project.read(`-/_TRADES/example/receiver/${id}.md`)).toContain('phase: submitted')
    expect(await box.project.read(`receiver/+/_TRADES/example/source/${id}.md`)).toContain('phase: received')

    const listed = await box.run('ki trade list')

    expect(listed.exitCode).toBe(0)
    // The compact observation badge describes what the sender now awaits from the receiver.
    expect(listed.output).toContain('[? decision]')
    expect(listed.output).not.toContain('unrecognised trade field')
    expect(await box.run(['ki', 'trade', 'show', id])).toMatchObject({ exitCode: 0 })
  })

  test('groups estate routes by exporter when several repositories declare several peers', async () => {
    const box = await sandbox()
    const thirdHome = home('example/third')
    const source = await realpath(box.project.path)
    const receiver = await box.project.mkdir('receiver')
    const third = await box.project.mkdir('third')
    // Source reaches two peers and receiver reaches one, so the listing has a
    // non-final exporter and a non-final peer — the branches a single pair never reaches.
    await box.project.write(
      '.ki-config.toml',
      repositoryConfiguration('example/source', { work: [receiverHome, thirdHome] })
    )
    await box.project.write(
      'receiver/.ki-config.toml',
      repositoryConfiguration('example/receiver', { knowledge: [thirdHome] }, { work: [sourceHome] })
    )
    await box.project.write(
      'third/.ki-config.toml',
      repositoryConfiguration('example/third', {}, { work: [sourceHome], knowledge: [receiverHome] })
    )
    await box.config.write('ki/config.toml', localConfiguration([source, receiver, third]))

    expect(await box.run('ki trade routes list --estate')).toEqual({
      exitCode: 0,
      output:
        '╭─ KI TRADE ROUTES\n├─ results\n│  ├─ example/receiver\n│  │  ╰─ → example/third · ◇ knowledge [active]\n│  ╰─ example/source\n│     ├─ → example/receiver · ⚒ work [active]\n│     ╰─ → example/third · ⚒ work [active]\n╰─ summary: ROUTES=3 ACTIVE=3 INCOMPLETE=0\n'
    })
  })

  test('lists incomplete route declarations across the registered estate', async () => {
    const { box } = await configuredPair()
    const estate = await box.run('ki trade routes list --estate')
    const incomplete = await box.run('ki trade routes list --estate --incomplete')

    expect(estate).toEqual({
      exitCode: 0,
      output:
        '╭─ KI TRADE ROUTES\n├─ results\n│  ╰─ example/source\n│     ╰─ → example/receiver · ◇ knowledge, ⚒ work [active]\n╰─ summary: ROUTES=1 ACTIVE=1 INCOMPLETE=0\n'
    })
    expect(incomplete).toEqual({
      exitCode: 0,
      output:
        '╭─ KI TRADE ROUTES\n├─ results\n│  ╰─ incomplete routes: none\n╰─ summary: ROUTES=0 ACTIVE=0 INCOMPLETE=0\n'
    })

    await box.project.write(
      'receiver/.ki-config.toml',
      repositoryConfiguration('example/receiver', {}, { work: [sourceHome] })
    )

    expect(await box.run('ki trade routes list --estate --incomplete')).toEqual({
      exitCode: 0,
      output:
        '╭─ KI TRADE ROUTES\n├─ results\n│  ╰─ example/source\n│     ╰─ → example/receiver · ◇ knowledge [awaiting receiver activation]\n╰─ summary: ROUTES=1 ACTIVE=0 INCOMPLETE=1\n'
    })
  })

  // The diagram asserts structure — node count, edge count, reciprocity, legend, self-containment —
  // rather than coordinates, so tuning the layout later does not rewrite these expectations.
  const diagramEstate = async () => {
    const box = await sandbox()
    const thirdHome = home('example/third')
    const source = await realpath(box.project.path)
    const receiver = await box.project.mkdir('receiver')
    const third = await box.project.mkdir('third')
    const fourth = await box.project.mkdir('fourth')
    await box.project.write(
      '.ki-config.toml',
      repositoryConfiguration(
        'example/source',
        { work: [receiverHome, thirdHome], knowledge: [receiverHome] },
        { work: [receiverHome] }
      )
    )
    await box.project.write(
      'receiver/.ki-config.toml',
      repositoryConfiguration(
        'example/receiver',
        { work: [sourceHome], knowledge: [thirdHome] },
        { work: [sourceHome], knowledge: [sourceHome] }
      )
    )
    await box.project.write(
      'third/.ki-config.toml',
      repositoryConfiguration('example/third', {}, { work: [sourceHome], knowledge: [receiverHome] })
    )
    // Neither of this repository's declarations is reciprocated, so one edge runs each way
    // and both render incomplete — the states a fully wired estate never produces.
    await box.project.write(
      'fourth/.ki-config.toml',
      repositoryConfiguration('example/fourth', { work: [sourceHome] }, { knowledge: [thirdHome] })
    )
    await box.config.write('ki/config.toml', localConfiguration([source, receiver, third, fourth]))
    return box
  }

  test('renders the registered estate as an interactive network page and opens it', async () => {
    const box = await diagramEstate()
    const opened: string[][] = []
    box.setRunner(async (command, args) => {
      opened.push([command, ...args])
      return { exitCode: 0, output: '' }
    })

    const rendered = await box.run('ki trade routes list --estate --html')

    expect(rendered.exitCode).toBe(0)
    expect(rendered.output).toContain('estate network written to')
    const page = await box.home.read('.cache/ki/estate-routes.html')
    // The page is a payload and a simulation, so the assertions are about the estate it carries
    // and never about where anything is drawn — the browser decides that, and a reader can drag it.
    const payload = JSON.parse(/window\.__estate = (.*?)<\/script>/u.exec(page)?.[1] as string)
    expect(payload.nodes.map((node: { id: string }) => node.id)).toEqual([
      'example/fourth',
      'example/receiver',
      'example/source',
      'example/third'
    ])
    expect(payload.links).toEqual([
      {
        source: 'example/fourth',
        target: 'example/source',
        kinds: ['work'],
        states: ['awaiting-receiver'],
        active: false
      },
      { source: 'example/receiver', target: 'example/source', kinds: ['work'], states: ['active'], active: true },
      { source: 'example/receiver', target: 'example/third', kinds: ['knowledge'], states: ['active'], active: true },
      {
        source: 'example/source',
        target: 'example/receiver',
        kinds: ['knowledge', 'work'],
        states: ['active'],
        active: true
      },
      { source: 'example/source', target: 'example/third', kinds: ['work'], states: ['active'], active: true },
      {
        source: 'example/third',
        target: 'example/fourth',
        kinds: ['knowledge'],
        states: ['awaiting-sender'],
        active: false
      }
    ])
    expect(payload.incomplete).toBe(false)
    // Self-contained: the viewer runtime ships in the page, so nothing is fetched when it opens.
    expect(page).toContain('forceSimulation')
    expect(page).not.toMatch(/<script[^>]*\ssrc=/u)
    expect(page).toContain('knowledge</span>')
    expect(opened).toEqual([['open', join(box.home.path, '.cache/ki/estate-routes.html')]])
  })

  test('narrows the network to incomplete routes and reports a failure to open it', async () => {
    const box = await diagramEstate()
    box.setRunner(async () => ({ exitCode: 1, output: '' }))

    const rendered = await box.run('ki trade routes list --estate --incomplete --html')

    expect(rendered.exitCode).toBe(0)
    // The page is already written, so failing to open it is worth saying and not worth failing on.
    expect(rendered.output).toContain('could not open')
    const payload = JSON.parse(
      /window\.__estate = (.*?)<\/script>/u.exec(await box.home.read('.cache/ki/estate-routes.html'))?.[1] as string
    )
    expect(payload.incomplete).toBe(true)
    expect(payload.nodes).toHaveLength(3)
    expect(payload.links.map((link: { source: string }) => link.source)).toEqual(['example/fourth', 'example/third'])
  })

  test('renders an empty estate network and refuses a network of the local route list', async () => {
    const box = await sandbox()
    const source = await realpath(box.project.path)
    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source'))
    await box.config.write('ki/config.toml', localConfiguration([source]))
    box.setEnv({ KI_BROWSER_OPENER: 'noop-opener' })
    const opened: string[] = []
    box.setRunner(async (command) => {
      opened.push(command)
      return { exitCode: 0, output: '' }
    })

    expect((await box.run('ki trade routes list --estate --html')).exitCode).toBe(0)
    const page = await box.home.read('.cache/ki/estate-routes.html')
    expect(page).toContain('0 repositories · 0 routes · all declared routes')
    expect(JSON.parse(/window\.__estate = (.*?)<\/script>/u.exec(page)?.[1] as string).links).toEqual([])
    // The opener is configurable, so a machine without the platform default can still be used.
    expect(opened).toEqual(['noop-opener'])
    expect(await box.run('ki trade routes list --html')).toEqual({
      exitCode: 2,
      output: 'ki: error: trade route --html requires --estate\n'
    })

    // Without an override the opener is the platform's, which is injected rather than read from
    // the host, so both defaults stay reachable from a test wherever the suite runs.
    box.setEnv({ KI_BROWSER_OPENER: undefined })
    await box.run('ki trade routes list --estate --html', { platform: 'linux' })
    await box.run('ki trade routes list --estate --html', { platform: 'darwin' })
    expect(opened.slice(1)).toEqual(['xdg-open', 'open'])
  })

  test('releases a decided trade whose receiver reformatted the record without changing the payload', async () => {
    const { box } = await configuredPair()
    const created = await createTrade(box, 'work')
    const id = /TRD-[0-9a-f]{8}/u.exec(created.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', id])
    // Everything a Markdown formatter does to a received record at once: it requotes the
    // frontmatter's YAML scalars and puts a blank line before the first block. None of it is
    // payload, and if any of it read as tampering no trade could ever complete its lifecycle
    // in a repository with ordinary formatting hygiene.
    const inboundPath = `receiver/+/_TRADES/example/source/${id}.md`
    await box.project.write(
      inboundPath,
      (await box.project.read(inboundPath))
        .replace(
          'decision_status: unconsidered',
          'decision_status: adopted\nadopted_as: "KI-LOCAL-004"\nreviewed_at: 2026-08-03T12:30:00Z'
        )
        .replace(/^title: "(.*)"$/mu, "title: '$1'")
        .replace(/^source_ref: "(.*)"$/mu, "source_ref: '$1'")
        .replace(`---\n\n# ${id}`, `---\n\n\n# ${id}`)
    )
    box.cd('..')
    // The sender copy stands in for a record frozen before this repository emitted a canonical
    // blank line after the frontmatter, which must still pair against a formatted receiver copy.
    const outboundPath = `-/_TRADES/example/receiver/${id}.md`
    const outbound = await box.project.read(outboundPath)
    expect(outbound).toContain(`---\n\n# ${id}`)
    await box.project.write(outboundPath, outbound.replace(`---\n\n# ${id}`, `---\n# ${id}`))

    expect(await box.run(['ki', 'trade', 'release', id])).toMatchObject({ exitCode: 0 })
  })

  test('refuses release when the receiver inbound record declares a phase its location contradicts', async () => {
    // The estate scan derives direction from the record's own phase, so it can never disagree
    // with itself. Release is the caller that does not: it asserts inbound for a file in another
    // repository, hand-editable and never consulted for its phase before this point. A record
    // copied into place rather than recorded through `ki trade receive` arrives here intact.
    const { box } = await configuredPair()
    const created = await createTrade(box, 'work')
    const id = /TRD-[0-9a-f]{8}/u.exec(created.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', id])
    const inboundPath = `receiver/+/_TRADES/example/source/${id}.md`
    const inbound = await box.project.read(inboundPath)
    box.cd('..')
    const releaseWithPhase = async (phase: string) => {
      await box.project.write(inboundPath, inbound.replace('phase: received', `phase: ${phase}`))
      return box.run(['ki', 'trade', 'release', id])
    }

    // The two lines fail on different inputs: a phase outside the vocabulary at all, and a phase
    // inside it that belongs to another location.
    const outsideVocabulary = await releaseWithPhase('bogus')
    expect(outsideVocabulary.exitCode).toBe(2)
    expect(outsideVocabulary.output).toContain(`${id}.md has invalid phase`)

    const wrongLocation = await releaseWithPhase('submitted')
    expect(wrongLocation.exitCode).toBe(2)
    expect(wrongLocation.output).toContain(`${id}.md inbound must declare phase: received`)
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
      receivedInbound.replace(
        'decision_status: unconsidered',
        'decision_status: adopted\nadopted_as: "KI-RECEIVER-FND-001"'
      )
    )
    box.cd('..')
    const listed = await box.run([
      'ki',
      'trade',
      'list',
      '--repo',
      receiverHome,
      '--direction',
      'import',
      '--status',
      'adopted',
      '--kind',
      'work'
    ])
    const allListed = await box.run('ki trade list')
    const plainListed = await box.run('ki trade list --no-icons')
    const shown = await box.run(['ki', 'trade', 'show', id])
    const released = await box.run(['ki', 'trade', 'release', id])
    box.cd('receiver')
    const pruned = await box.run(['ki', 'trade', 'prune', id])

    expect(created.output).toBe(`ki trade submit: submitted ${id} for example/receiver [decision]\n`)
    expect(received).toEqual({ exitCode: 0, output: `ki trade receive: received ${id}\n` })
    expect(listed.output).toContain(`${id} import [✓ release] ← [⚒ work] source [adopted] Route contract`)
    expect(allListed.output).toContain(`${id} import [✓ release] ← [⚒ work] source [adopted]`)
    expect(allListed.output).toContain(`${id} export [⚒ work] → [✓ release] receiver [adopted]`)
    expect(plainListed.output).toContain(`${id} export [work] → [release] receiver [adopted]`)
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
    expect(listed.output).toContain(`${id} export [ⓘ knowledge] → [↓ receipt] receiver Route contract`)
    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', id])
    const path = `receiver/+/_TRADES/example/source/${id}.md`
    await box.project.write(
      path,
      (await box.project.read(path)).replace(
        'decision_status: unconsidered',
        'decision_status: retained\nretained_as: "Knowledge/Local/Note"'
      )
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
      (await box.project.read(invalidPath)).replace(
        'decision_status: unconsidered',
        'decision_status: retained\nretained_as: "Knowledge/Local/Note"'
      )
    )
    box.cd('..')
    expect((await box.run(['ki', 'trade', 'release', invalidId])).output).toContain(
      'permits retained only for knowledge trades'
    )
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
    expect(nonreciprocal.output).toMatch(
      /^ki trade submit: submitted TRD-[0-9a-f]{8} for example\/receiver \[decision\]\n$/
    )
    const id = /TRD-[0-9a-f]{8}/u.exec(nonreciprocal.output)?.[0] as string
    expect(await box.project.read(`-/_TRADES/example/receiver/${id}.md`)).toContain(`receiver: example/receiver`)
    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source'))
    expect((await createTrade(box, 'work')).output).toContain('is not declared locally')
    expect(missingKind.exitCode).toBe(2)
    expect(missingDirection.exitCode).toBe(2)
    expect(malformedRepository).toEqual({
      exitCode: 2,
      output: 'ki: error: trade route repository must use canonical HTTPS GitHub repository form\n'
    })
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

    expect(listed.output).toContain(`${id} export [⚒ work] → [↓ receipt] other/receiver Route contract`)
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
      output: '╭─ KI TRADE ROUTES\n├─ results\n│  ╰─ routes: none\n╰─ summary: ROUTES=0\n'
    })
    expect(await box.run('ki trade routes check')).toEqual({
      exitCode: 0,
      output: '╭─ KI TRADE ROUTE CHECK\n├─ routes (0)\n│  ╰─ none\n╰─ summary: ROUTES=0 ACTIVE=0\n'
    })

    await box.project.write('.ki-config.toml', '[not valid TOML\n')
    expect((await box.run('ki trade routes list')).output).toContain('must be valid TOML')

    await box.project.write(
      '.ki-config.toml',
      repositoryConfiguration('example/source').replace(`repository = "${sourceHome}"\n`, '')
    )
    expect((await box.run('ki trade routes list')).output).toContain(
      '.repository must use canonical HTTPS GitHub repository form'
    )

    const repositoryOnly = repositoryConfiguration('example/source').split(`[${tradesTable}]`)[0] as string
    const withRoutes = (routes: string): string =>
      `${repositoryOnly}[${tradesTable}]\n\n[${tradesTable}.routes]\n${routes}\n`

    await box.project.write('.ki-config.toml', `${repositoryOnly}[${tradesTable}]\nunknown = true\n`)
    expect((await box.run('ki trade routes list')).output).toContain('has unrecognised key unknown')

    // Each partner is named once by a key TOML itself keeps unique, so what remains checkable is the
    // key's form, the entry's shape, and the kinds it carries.
    const rejected: readonly (readonly [string, string])[] = [
      ['"example/receiver" = { export = ["work"], other = [] }', 'has unrecognised key other'],
      ['"https://github.com/example/receiver" = { export = ["work"] }', 'must use canonical owner/repository form'],
      ['"example/source" = { export = ["work"] }', 'must not name the local repository'],
      ['"example/receiver" = "work"', 'must be a table of export and import trade kinds'],
      ['"example/receiver" = { export = [] }', 'must be a non-empty array of work or knowledge'],
      ['"example/receiver" = { export = ["other"] }', 'must be a non-empty array of work or knowledge'],
      ['"example/receiver" = { export = ["work", "work"] }', 'must not repeat a trade kind']
    ]
    for (const [routes, detail] of rejected) {
      await box.project.write('.ki-config.toml', withRoutes(routes))
      const listed = await box.run('ki trade routes list')
      expect(listed.exitCode).toBe(2)
      expect(listed.output).toContain(detail)
    }

    await box.project.write('.ki-config.toml', `${repositoryOnly}[${tradesTable}]\nroutes = "none"\n`)
    expect((await box.run('ki trade routes list')).output).toContain(`[${tradesTable}.routes] must be a table`)

    await box.project.write('.ki-config.toml', repositoryOnly)
    expect((await box.run('ki trade routes list')).output).toContain(`does not declare [${tradesTable}]`)
    await box.project.write('.ki-config.toml', `${repositoryOnly}[${tradesTable}]\n\n[after]\nvalue = true\n`)
    expect((await box.run(`ki trade routes add ${receiverHome} --direction export --kind work`)).exitCode).toBe(0)
    expect(await box.project.read('.ki-config.toml')).toContain('[after]\nvalue = true')
    await box.project.write('.ki-config.toml', repositoryOnly)
    expect((await box.run(`ki trade routes add ${receiverHome} --direction export --kind work`)).output).toContain(
      'does not declare'
    )
    // Declared as an inline table under [skills], which parses but presents no header for the
    // editor to rewrite, so the write refuses rather than appending a second declaration.
    await box.project.write(
      '.ki-config.toml',
      `[repo]\nharnesses = ["example/harness"]\n\n[skills]\nki-repo = { repository = "${sourceHome}" }\nki-trades = {}\n`
    )
    expect((await box.run(`ki trade routes add ${receiverHome} --direction export --kind work`)).output).toContain(
      `does not declare [${tradesTable}] route tables`
    )
    // No [skills] namespace at all: the repository endpoint the estate is keyed by is absent.
    await box.project.write('.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n')
    expect((await box.run('ki trade routes list')).output).toContain(
      '.repository must use canonical HTTPS GitHub repository form'
    )

    const missingHome = home('example/missing')
    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source', { work: [missingHome] }))
    expect((await box.run('ki trade routes check')).output).toContain(`${missingHome}: awaiting receiver activation`)

    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source', { work: [receiverHome] }))
    await box.project.write('receiver/.ki-config.toml', '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\n')
    expect((await box.run('ki trade routes check')).output).toContain(`${receiverHome}: awaiting receiver activation`)
    await box.project.write(
      'receiver/.ki-config.toml',
      `[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = 1\n`
    )
    expect((await box.run('ki trade routes check')).output).toContain(`${receiverHome}: awaiting receiver activation`)
    await box.project.write(
      'receiver/.ki-config.toml',
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "not-a-repository"\n'
    )
    expect((await box.run('ki trade routes check')).output).toContain(`${receiverHome}: awaiting receiver activation`)
    await box.project.write(
      'receiver/.ki-config.toml',
      `[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "${receiverHome}"\n`
    )
    expect((await box.run('ki trade routes check')).output).toContain(`${receiverHome}: awaiting receiver activation`)
    await box.project.write('receiver/.ki-config.toml', repositoryConfiguration('example/receiver'))
    expect((await box.run('ki trade routes check')).output).toContain(`${receiverHome}: awaiting receiver activation`)

    await box.project.write(
      'receiver/.ki-config.toml',
      repositoryConfiguration('example/receiver', {}, { work: [sourceHome] })
    )
    await box.project.write(
      'duplicate/.ki-config.toml',
      repositoryConfiguration('example/receiver', {}, { work: [sourceHome] })
    )
    expect((await box.run('ki trade routes check')).output).toContain(`${receiverHome}: ambiguous repository`)

    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source'))
    expect((await box.run(`ki trade routes add ${sourceHome} --direction export --kind work`)).output).toContain(
      'must differ from the local repository'
    )
    expect((await box.run(`ki trade routes remove ${receiverHome} --direction export --kind work`)).output).toContain(
      'is not declared locally'
    )
    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source'))
    await box.project.write(
      'receiver/.ki-config.toml',
      repositoryConfiguration('example/receiver', {}, { work: [sourceHome] })
    )
    box.cd('receiver')
    expect((await box.run(['ki', 'trade', 'receive'])).output).toContain('requires one trade id or --all')
    await box.project.write('receiver/.ki-config.toml', repositoryConfiguration('example/receiver'))
    expect((await box.run(['ki', 'trade', 'receive', '--all'])).output).toContain('0 eligible trades')
    box.cd('..')
    await box.project.write(
      '.ki-config.toml',
      repositoryConfiguration('example/source', { work: [home('example/zulu')] })
    )
    expect((await box.run(`ki trade routes add ${receiverHome} --direction export --kind work`)).exitCode).toBe(0)
  })

  test('covers import-route mutation and command filters without changing peer configuration', async () => {
    const { box } = await configuredPair()
    expect(await box.run('ki trade list')).toEqual({
      exitCode: 0,
      output: '╭─ KI TRADES\n├─ results\n│  ╰─ trades: none\n╰─ summary: TRADES=0 PREPARATIONS=0 IMPORTS=0 EXPORTS=0\n'
    })
    expect(await box.run('ki trade show TRD-00000000')).toEqual({
      exitCode: 2,
      output: 'ki: error: trade TRD-00000000 was not found in the registered repository estate\n'
    })
    box.cd('receiver')
    expect((await box.run(['ki', 'trade', 'receive'])).exitCode).toBe(2)
    const removed = await box.run([
      'ki',
      'trade',
      'routes',
      'remove',
      sourceHome,
      '--direction',
      'import',
      '--kind',
      'knowledge'
    ])
    const added = await box.run([
      'ki',
      'trade',
      'routes',
      'add',
      sourceHome,
      '--direction',
      'import',
      '--kind',
      'knowledge'
    ])
    const selected = await box.run([
      'ki',
      'trade',
      'routes',
      'check',
      sourceHome,
      '--direction',
      'import',
      '--kind',
      'knowledge'
    ])
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

  test('previews only frozen submissions while a sender still holds a preparation', async () => {
    const { box } = await configuredPair()
    const submitted = await createTrade(box, 'work', { title: 'Frozen contract' })
    const submittedId = /TRD-[0-9a-f]{8}/u.exec(submitted.output)?.[0] as string
    // Retiring _PREPARATIONS put preparations on the submitted record's path, so the receive
    // scan sees them. One unfrozen preparation must not hide the submissions beside it.
    const preparing = await box.run(prepareTrade('work', { title: 'Still preparing' }))
    const preparingId = /TRD-[0-9a-f]{8}/u.exec(preparing.output)?.[0] as string

    box.cd('receiver')
    const preview = await box.run(['ki', 'trade', 'receive', '--all'])
    const askedDirectly = await box.run(['ki', 'trade', 'receive', preparingId])

    expect(preview.exitCode).toBe(0)
    expect(preview.output).toContain(submittedId)
    expect(preview.output).not.toContain(preparingId)
    // Silence in a preview is not a refusal: asking for it by id still says why.
    expect(askedDirectly.exitCode).not.toBe(0)
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
      [
        outbound.replace('title: "Route contract"', 'title: "Route contract"\ntitle: "Again"'),
        'repeats trade field title'
      ],
      [outbound.replace('source_ref: "KI-TOOL-CLI-012"', 'extra: value'), 'has unrecognised trade field extra'],
      [outbound.replace('created_at:', 'created_at: invalid #'), 'has invalid created_at timestamp'],
      [outbound.replace('sender: example/source', 'sender: Example/source'), 'trade record address must use canonical'],
      [outbound.replace('kind: work', 'kind: other'), 'has invalid trade kind'],
      [outbound.replace('observation: decision', 'observation: whenever'), 'has invalid observation policy'],
      [
        outbound.replace(`# ${id}: Route contract`, '# Some other heading'),
        'H1 must exactly repeat trade id and title'
      ],
      [outbound.replace('source_ref: "KI-TOOL-CLI-012"\n', ''), 'must declare non-empty trade field source_ref']
    ]

    for (const [contents, message] of cases) {
      await box.project.write(path, contents)
      expect((await box.run(['ki', 'trade', 'receive', id])).output).toContain(message)
    }

    await box.project.write(
      path,
      outbound
        .replace('\n---\n#', '\n---\n\n#')
        .replace('## Constraints\n\nThe receiver retains local authority.', '## Constraints\n\n')
    )
    expect((await box.run(['ki', 'trade', 'receive', id])).output).toContain('requires non-empty Constraints section')

    await box.project.write(path, outbound.replace('receiver: example/receiver', 'receiver: example/other'))
    expect((await box.run(['ki', 'trade', 'receive', id])).output).toContain('is unavailable or ambiguous')
    await box.project.write(path, outbound)
    const missing = await box.run(['ki', 'trade', 'receive', 'TRD-00000000'])
    expect(missing.output).toContain('is unavailable or ambiguous')
    const wrongId = 'TRD-00000000'
    await box.project.write(`-/_TRADES/example/receiver/${wrongId}.md`, outbound)
    box.cd('..')
    expect((await box.run('ki trade list')).output).toContain(`filename must match trade id ${id}`)
    box.cd('receiver')
    expect((await box.run(['ki', 'trade', 'receive', wrongId])).output).toContain(`filename must match trade id ${id}`)
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

    expect(outboundList.output).toContain(`${firstId} export [⚒ work] → [↓ receipt] receiver Route contract`)
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
      output: '╭─ KI TRADES\n├─ results\n│  ╰─ trades: none\n╰─ summary: TRADES=0 PREPARATIONS=0 IMPORTS=0 EXPORTS=0\n'
    })
    const created = await createTrade(box, 'work')
    const id = /TRD-[0-9a-f-]+/u.exec(created.output)?.[0] as string

    expect((await box.run(['ki', 'trade', 'release', id])).output).toContain(
      'receiver has not recorded an inbound trade'
    )
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
      [
        'decision_status: unconsidered\nadopted_as: "KI-LOCAL-001"',
        'permits adopted_as only for decision status adopted'
      ],
      [
        'decision_status: unconsidered\nretained_as: "Knowledge/Note"',
        'permits retained_as only for decision status retained'
      ],
      ['decision_status: superseded\nrationale: "replaced"', 'requires superseded_by for decision status superseded'],
      [
        'decision_status: unconsidered\nsuperseded_by: "TRD-other"',
        'permits superseded_by only for decision status superseded'
      ]
    ]
    for (const [status, message] of cases) expect((await releaseWith(status)).output).toContain(message)

    expect((await releaseWith('decision_status: unconsidered')).output).toContain(
      'decision observation policy is satisfied'
    )
    expect(
      (await releaseWith('decision_status: adopted\nadopted_as: "KI-LOCAL-001"\nreviewed_at: 2026-08-03T12:30:00Z'))
        .exitCode
    ).toBe(0)

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
    expect((await box.run(['ki', 'trade', 'release', changedId])).output).toContain(
      'does not preserve the sender payload'
    )

    const knowledge = await createTrade(box, 'knowledge')
    const knowledgeId = /TRD-[0-9a-f-]+/u.exec(knowledge.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', knowledgeId])
    const knowledgePath = `receiver/+/_TRADES/example/source/${knowledgeId}.md`
    const knowledgeInbound = await box.project.read(knowledgePath)
    await box.project.write(
      knowledgePath,
      knowledgeInbound.replace('decision_status: unconsidered', 'decision_status: adopted\nadopted_as: "KI-LOCAL-002"')
    )
    box.cd('..')
    expect((await box.run(['ki', 'trade', 'release', knowledgeId])).output).toContain(
      'permits adopted only for work trades'
    )
    box.cd('receiver')
    await box.project.write(
      knowledgePath,
      knowledgeInbound.replace('decision_status: unconsidered', 'decision_status: retained')
    )
    box.cd('..')
    expect((await box.run(['ki', 'trade', 'release', knowledgeId])).output).toContain(
      'requires retained_as for decision status retained'
    )

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
    expect((await box.run(['ki', 'trade', 'release', 'TRD-00000000'])).output).toContain(
      'was not found in the current repository'
    )
    expect((await box.run(['ki', 'trade', 'release', id])).output).toContain(
      'receiver has not recorded an inbound trade'
    )

    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', id])
    expect((await box.run(['ki', 'trade', 'prune', id])).output).toContain('before sender release is observable')
    const inboundPath = `receiver/+/_TRADES/example/source/${id}.md`
    await box.project.write(
      inboundPath,
      (await box.project.read(inboundPath)).replace(
        'decision_status: unconsidered',
        'decision_status: declined\nrationale: "not local"'
      )
    )
    expect((await box.run(['ki', 'trade', 'prune', id])).output).toContain('before sender release is observable')

    box.cd('..')
    const duplicate = await box.project.mkdir('duplicate')
    await box.project.write(
      'duplicate/.ki-config.toml',
      repositoryConfiguration('example/receiver', {}, { work: [sourceHome] })
    )
    await box.config.write('ki/config.toml', localConfiguration([source, receiver, duplicate]))
    expect((await box.run(['ki', 'trade', 'release', id])).output).toContain('unavailable or ambiguous')

    await box.config.write('ki/config.toml', localConfiguration([source, receiver]))
    await box.project.write('.ki-config.toml', repositoryConfiguration('example/other', { work: [receiverHome] }))
    expect((await box.run(['ki', 'trade', 'release', id])).output).toContain('not owned by the current repository')

    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source', { work: [receiverHome] }))
    box.cd('receiver')
    await box.project.write(
      'receiver/.ki-config.toml',
      repositoryConfiguration('example/other-receiver', {}, { work: [sourceHome] })
    )
    expect((await box.run(['ki', 'trade', 'prune', id])).output).toContain('not addressed to the current repository')
  })

  test('prepares, observes, guards routes and record validity, then abandons mutable work', async () => {
    const { box } = await configuredPair()
    const prepared = await box.run(prepareTrade('work', { observation: 'receipt' }))
    const id = /TRD-[0-9a-f]{8}/u.exec(prepared.output)?.[0] as string
    const preparationPath = `-/_TRADES/example/receiver/${id}.md`
    expect(await box.project.read(preparationPath)).toContain('phase: preparing')
    expect((await box.run('ki trade list --direction prepare')).output).toContain(
      `${id} prepare [⚒ work] → [? decision] receiver`
    )
    expect(
      (await box.run(['ki', 'trade', 'routes', 'remove', receiverHome, '--direction', 'export', '--kind', 'work']))
        .output
    ).toContain(`is used by ${id}`)

    box.cd('receiver')
    const first = await box.run(['ki', 'trade', 'observe', id])
    expect(first.output).toContain('verbatim')
    expect(first.output).toContain('first observation')
    box.setRunner(async (command, arguments_) => {
      if (command !== 'git') return { exitCode: 1, output: '' }
      const root = arguments_[1] as string
      if (arguments_[2] === 'rev-parse') return { exitCode: 0, output: `${'a'.repeat(40)}\n` }
      if (arguments_[2] === 'show')
        return { exitCode: 0, output: await readFile(join(root, (arguments_[3] as string).slice(41)), 'utf8') }
      if (arguments_[2] === 'merge-base') return { exitCode: 0, output: '' }
      if (arguments_[2] === 'diff') return { exitCode: 0, output: 'committed diff\n' }
      return { exitCode: 1, output: '' }
    })
    expect((await box.run(['ki', 'trade', 'observe', id])).output).toContain('diff')
    expect((await box.run(['ki', 'trade', 'observe', 'TRD-00000000'])).output).toContain('unavailable or ambiguous')

    box.cd('..')
    // Submission rewrites the phase in place, so no outbound destination exists to collide
    // with; what remains to guard is that a corrupted record is refused. The preparation and
    // its successor share one path, so restore it rather than removing it before abandoning.
    const valid = await box.project.read(preparationPath)
    await box.project.write(preparationPath, 'conflict')
    expect((await box.run(['ki', 'trade', 'submit', id])).output).toContain('has invalid phase')
    await box.project.write(preparationPath, valid)
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
      (await box.project.read(inbound)).replace(
        'decision_status: unconsidered',
        'decision_status: adopted\nadopted_as: "KI-LOCAL-001"'
      )
    )
    box.cd('..')
    expect((await box.run('ki trade list --direction export')).output).toContain(
      `${completionId} export [⚒ work] → [… completion] receiver [adopted] Route contract`
    )
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
    await box.project.write(
      appliedPath,
      appliedInbound.replace('decision_status: unconsidered', 'decision_status: applied')
    )
    box.cd('..')
    expect((await box.run(['ki', 'trade', 'release', appliedId])).output).toContain('requires full applied_commit')
    box.cd('receiver')
    await box.project.write(
      appliedPath,
      appliedInbound.replace(
        'decision_status: unconsidered',
        `decision_status: applied\napplied_commit: ${'b'.repeat(40)}`
      )
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

  test('narrows the local route list to incomplete routes and omits unconfigured repositories from the estate', async () => {
    const { box } = await configuredPair()
    await box.project.write(
      'receiver/.ki-config.toml',
      repositoryConfiguration('example/receiver', {}, { work: [sourceHome] })
    )

    expect(await box.run('ki trade routes list --incomplete')).toEqual({
      exitCode: 0,
      output: `╭─ KI TRADE ROUTES\n├─ results\n│  ╰─ export\n│     ╰─ knowledge ${receiverHome} [awaiting receiver activation]\n╰─ summary: ROUTES=1\n`
    })

    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source'))
    await box.project.write('receiver/.ki-config.toml', repositoryConfiguration('example/receiver'))
    expect(await box.run('ki trade routes list --estate')).toEqual({
      exitCode: 0,
      output: '╭─ KI TRADE ROUTES\n├─ results\n│  ╰─ routes: none\n╰─ summary: ROUTES=0 ACTIVE=0 INCOMPLETE=0\n'
    })

    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source', { work: [receiverHome] }))
    await box.project.write(
      'receiver/.ki-config.toml',
      `[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "${receiverHome}"\n`
    )
    expect(await box.run('ki trade routes list --estate')).toEqual({
      exitCode: 0,
      output:
        '╭─ KI TRADE ROUTES\n├─ results\n│  ╰─ example/source\n│     ╰─ → example/receiver · ⚒ work [awaiting receiver activation]\n╰─ summary: ROUTES=1 ACTIVE=0 INCOMPLETE=1\n'
    })
  })

  test('rejects ambiguous cleanup grammar, reports an already-received copy, and marks prune eligibility', async () => {
    const { box } = await configuredPair()
    const created = await createTrade(box, 'work')
    const id = /TRD-[0-9a-f]{8}/u.exec(created.output)?.[0] as string

    expect(await box.run(['ki', 'trade', 'release', id, '--eligible'])).toEqual({
      exitCode: 2,
      output: 'ki: error: ki trade release accepts either one trade id or --eligible\n'
    })
    expect(await box.run(['ki', 'trade', 'prune'])).toEqual({
      exitCode: 2,
      output: 'ki: error: ki trade prune requires one trade id or --eligible\n'
    })

    box.cd('receiver')
    const received = await box.run(['ki', 'trade', 'receive', id])
    const repeated = await box.run(['ki', 'trade', 'receive', id])
    expect(received).toEqual({ exitCode: 0, output: `ki trade receive: received ${id}\n` })
    expect(repeated).toEqual({ exitCode: 0, output: `ki trade receive: existing ${id}\n` })

    const inboundPath = `receiver/+/_TRADES/example/source/${id}.md`
    await box.project.write(
      inboundPath,
      (await box.project.read(inboundPath)).replace(
        'decision_status: unconsidered',
        'decision_status: adopted\nadopted_as: "KI-LOCAL-001"'
      )
    )
    box.cd('..')
    expect((await box.run(['ki', 'trade', 'release', id])).exitCode).toBe(0)
    expect((await box.run('ki trade list --direction import')).output).toContain(
      `${id} import [✓ prune] ← [⚒ work] source [adopted] Route contract`
    )
  })

  test('skips absent submission directories and peers that declare no trade routes', async () => {
    const { box } = await configuredPair()
    box.cd('receiver')
    const beforeAnySubmission = await box.run(['ki', 'trade', 'receive', '--all'])
    box.cd('..')
    await box.project.write(
      '.ki-config.toml',
      `[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo]\nrepository = "${sourceHome}"\n`
    )
    box.cd('receiver')
    const unavailable = await box.run(['ki', 'trade', 'receive', 'TRD-00000000'])
    const previewed = await box.run(['ki', 'trade', 'receive', '--all'])
    const observed = await box.run(['ki', 'trade', 'observe', 'TRD-00000000'])

    expect(beforeAnySubmission.output).toContain('0 eligible trades')
    expect(unavailable.output).toContain('is unavailable or ambiguous')
    expect(previewed.output).toContain('0 eligible trades')
    expect(observed.output).toContain('is unavailable or ambiguous')
  })

  test('ignores submission files that are not named for a trade identifier', async () => {
    const { box } = await configuredPair()
    await box.project.write('-/_TRADES/example/receiver/notes.md', 'not a trade record\n')
    box.cd('receiver')

    expect((await box.run(['ki', 'trade', 'receive', '--all'])).output).toContain('0 eligible trades')
  })

  test('previews an eligible batch that excludes a submission the receiver has not recorded', async () => {
    const { box } = await configuredPair()
    const created = await createTrade(box, 'work')
    const id = /TRD-[0-9a-f]{8}/u.exec(created.output)?.[0] as string

    const previewed = await box.run(['ki', 'trade', 'release', '--eligible'])

    expect(previewed).toEqual({ exitCode: 0, output: 'ki trade release --eligible: 0 eligible trades\n' })
    expect(await box.project.read(`-/_TRADES/example/receiver/${id}.md`)).toContain('kind: work')
  })

  test('holds a completion trade while the linked receiver work is not yet done', async () => {
    const { box } = await configuredPair()
    const created = await createTrade(box, 'work', { observation: 'completion' })
    const id = /TRD-[0-9a-f]{8}/u.exec(created.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', id])
    const inboundPath = `receiver/+/_TRADES/example/source/${id}.md`
    await box.project.write(
      inboundPath,
      (await box.project.read(inboundPath)).replace(
        'decision_status: unconsidered',
        'decision_status: adopted\nadopted_as: "KI-LOCAL-001"'
      )
    )
    await box.project.write('receiver/docs/roadmap/other.md', '---\nid: KI-OTHER-001\nstatus: done\n---\n')
    box.cd('..')

    expect((await box.run(['ki', 'trade', 'release', id])).output).toContain(
      'cannot be released before its completion observation policy is satisfied'
    )
  })

  test('refuses to read a trade peer without a usable committed HEAD or a committed record', async () => {
    const { box } = await configuredPair()
    const created = await createTrade(box, 'work')
    const id = /TRD-[0-9a-f]{8}/u.exec(created.output)?.[0] as string
    box.cd('receiver')

    box.setRunner(async () => ({ exitCode: 1, output: 'fatal: not a git repository\n' }))
    const withoutHead = await box.run(['ki', 'trade', 'receive', id])
    box.setRunner(async (_command, arguments_) =>
      arguments_[2] === 'rev-parse'
        ? { exitCode: 0, output: `${'a'.repeat(40)}\n` }
        : { exitCode: 1, output: 'fatal: path does not exist\n' }
    )
    const withoutRecord = await box.run(['ki', 'trade', 'receive', id])

    expect(withoutHead.output).toContain('has no usable committed HEAD')
    expect(withoutRecord.output).toContain(`is not committed at ${'a'.repeat(40)}`)
  })

  test('reports a prior observation reference that cannot be compared with committed history', async () => {
    const { box } = await configuredPair()
    const prepared = await box.run(prepareTrade('work'))
    const id = /TRD-[0-9a-f]{8}/u.exec(prepared.output)?.[0] as string
    box.cd('receiver')
    const first = await box.run(['ki', 'trade', 'observe', id])
    const second = await box.run(['ki', 'trade', 'observe', id])
    box.setRunner(async (_command, arguments_) =>
      arguments_[2] === 'show'
        ? { exitCode: 0, output: await readFile(join(box.project.path, (arguments_[3] as string).slice(41)), 'utf8') }
        : arguments_[2] === 'diff'
          ? { exitCode: 1, output: 'fatal: bad revision\n' }
          : { exitCode: 0, output: `${'a'.repeat(40)}\n` }
    )
    const undiffable = await box.run(['ki', 'trade', 'observe', id])

    expect(first.output).toContain('first observation has no prior committed reference')
    expect(second.output).toContain('the prior reference is not comparable with the current committed history')
    expect(undiffable.output).toContain(`verbatim ${'a'.repeat(40)}`)
  })

  test('releases an unattended submission without waiting for a receiver decision', async () => {
    const { box } = await configuredPair()
    const created = await createTrade(box, 'work', { observation: 'unattended' })
    const id = /TRD-[0-9a-f]{8}/u.exec(created.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', id])
    box.cd('..')

    expect(await box.run(['ki', 'trade', 'release', id])).toEqual({
      exitCode: 0,
      output: `ki trade release: released ${id}\n`
    })
  })

  test('ignores non-trade entries and other-kind records when checking route-removal dependencies', async () => {
    const { box } = await configuredPair()
    await createTrade(box, 'knowledge')
    await box.project.write('-/_TRADES/example/receiver/notes.md', 'not a trade record\n')
    await box.project.write('-/_TRADES/example/receiver/TRD-00000001.txt', 'not markdown\n')
    await box.project.mkdir('-/_TRADES/example/receiver/TRD-00000002.md')

    const removed = await box.run([
      'ki',
      'trade',
      'routes',
      'remove',
      receiverHome,
      '--direction',
      'export',
      '--kind',
      'work'
    ])

    expect(removed).toEqual({
      exitCode: 0,
      output: `ki trade routes remove: export work ${sourceHome} -> ${receiverHome}\n`
    })
  })

  test('refuses release when the export route is no longer active or no longer declared', async () => {
    const { box } = await configuredPair()
    const created = await createTrade(box, 'work')
    const id = /TRD-[0-9a-f]{8}/u.exec(created.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', id])
    box.cd('..')

    await box.project.write('receiver/.ki-config.toml', repositoryConfiguration('example/receiver'))
    const inactive = await box.run(['ki', 'trade', 'release', id])
    await box.project.write('.ki-config.toml', repositoryConfiguration('example/source', { knowledge: [receiverHome] }))
    const undeclared = await box.run(['ki', 'trade', 'release', id])

    expect(inactive).toEqual({
      exitCode: 2,
      output: `ki: error: export work trade route ${receiverHome} is awaiting receiver\n`
    })
    expect(undeclared).toEqual({
      exitCode: 2,
      output: `ki: error: export work trade route ${receiverHome} is not declared locally\n`
    })
  })

  test('rejects preparations that lose their phase, policy, or heading contract', async () => {
    const { box } = await configuredPair()
    const prepared = await box.run(prepareTrade('work'))
    const id = /TRD-[0-9a-f]{8}/u.exec(prepared.output)?.[0] as string
    const path = `-/_TRADES/example/receiver/${id}.md`
    const preparation = await box.project.read(path)

    const cases: readonly [string, string][] = [
      [preparation.replace('phase: preparing\n', ''), 'has invalid phase'],
      [preparation.replace('observation: decision', 'observation: eventually'), 'has invalid observation policy'],
      [preparation.replace(`# ${id}: Route contract`, `# ${id}: Other contract`), 'H1 must exactly repeat']
    ]

    for (const [contents, message] of cases) {
      await box.project.write(path, contents)
      expect((await box.run('ki trade list')).output).toContain(message)
    }
  })

  test('rejects receiver fields that contradict the recorded decision status', async () => {
    const { box } = await configuredPair()
    const work = await createTrade(box, 'work')
    const workId = /TRD-[0-9a-f]{8}/u.exec(work.output)?.[0] as string
    const knowledge = await createTrade(box, 'knowledge')
    const knowledgeId = /TRD-[0-9a-f]{8}/u.exec(knowledge.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'trade', 'receive', workId])
    await box.run(['ki', 'trade', 'receive', knowledgeId])
    box.cd('..')
    const workPath = `receiver/+/_TRADES/example/source/${workId}.md`
    const knowledgePath = `receiver/+/_TRADES/example/source/${knowledgeId}.md`
    const workInbound = await box.project.read(workPath)
    const knowledgeInbound = await box.project.read(knowledgePath)

    const cases: readonly [string, string, string][] = [
      [
        workPath,
        workInbound.replace(`received_from_ref: ${'a'.repeat(40)}`, 'received_from_ref: nope'),
        'has invalid received_from_ref commit'
      ],
      [
        workPath,
        workInbound.replace(
          'decision_status: unconsidered',
          `decision_status: declined\nrationale: "not local"\napplied_commit: ${'b'.repeat(40)}`
        ),
        'permits applied_commit only for decision status applied'
      ],
      [
        knowledgePath,
        knowledgeInbound.replace(
          'decision_status: unconsidered',
          `decision_status: applied\napplied_commit: ${'b'.repeat(40)}`
        ),
        'permits applied only for work trades'
      ]
    ]

    for (const [path, contents, message] of cases) {
      await box.project.write(workPath, workInbound)
      await box.project.write(knowledgePath, knowledgeInbound)
      await box.project.write(path, contents)
      expect((await box.run('ki trade list')).output).toContain(message)
    }
  })
})
