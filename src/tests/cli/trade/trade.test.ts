import { readFile, realpath, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'
import {
  type ChannelFixture,
  capitalHome,
  home,
  memberConfiguration,
  registerEstate,
  writeCapital
} from '../_territory_helper.ts'

const tradesTable = 'skills.ki-trades'
const sourceHome = home('example/source')
const receiverHome = home('example/receiver')

type Kind = 'work' | 'knowledge'
const bothKinds: readonly Kind[] = ['work', 'knowledge']

/** A member declaration: its Capital plus a bare `[skills.ki-trades]` table. */
const repositoryConfiguration = (identity: string, mapBonus?: number | string): string =>
  memberConfiguration(identity, { mapBonus })

/** Writes the Capital checkout granting `channels` and returns its root for registration. */
const territory = (box: Awaited<ReturnType<typeof sandbox>>, channels: readonly ChannelFixture[]): Promise<string> =>
  writeCapital(box, { channels })

const configureEstate = registerEstate

const configuredPair = async () => {
  const box = await sandbox()
  const source = await realpath(box.project.path)
  const receiver = await box.project.mkdir('receiver')
  await box.project.write('.ki.toml', repositoryConfiguration('example/source'))
  await box.project.write('receiver/.ki.toml', repositoryConfiguration('example/receiver'))
  const capital = await territory(box, [{ from: [sourceHome], to: [receiverHome], kinds: bothKinds }])
  await configureEstate(box, [source, receiver, capital])
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
  return { box, source, receiver, capital }
}

const prepareTrade = (
  kind: 'work' | 'knowledge',
  overrides: { readonly receiver?: string; readonly title?: string; readonly observation?: string } = {}
): readonly string[] => [
  'ki',
  'repo',
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
  return box.run(['ki', 'repo', 'trade', 'submit', id])
}

describe('[ki repo trade]', () => {
  test('rejects unknown decision status rather than reporting no trades', async () => {
    const box = await sandbox()
    expect(await box.run('ki repo trade list --status bogus')).toEqual({
      exitCode: 2,
      output:
        'ki: error: trade list --status must be one of unconsidered, in_progress, parked, clarify, applied, adopted, retained, declined, superseded\n'
    })
  })
  test('refuses release when the submitted trade receiver is no longer in the local estate', async () => {
    const { box, source, capital } = await configuredPair()
    const submitted = await createTrade(box, 'work')
    const id = /TRD-[0-9a-f]{8}/u.exec(submitted.output)?.[0] as string
    await configureEstate(box, [source, capital])

    expect((await box.run(['ki', 'repo', 'trade', 'release', id])).output).toContain(
      'trade record peer example/receiver is unavailable or ambiguous in the registered repository estate'
    )
  })

  test('lists and checks the typed directional routes the Capital grants without touching member declarations', async () => {
    const box = await sandbox()
    const absentHome = home('example/absent')
    const quietHome = home('example/quiet')
    const source = await realpath(box.project.path)
    const receiver = await box.project.mkdir('receiver')
    const quiet = await box.project.mkdir('quiet')
    await box.project.write('.ki.toml', repositoryConfiguration('example/source'))
    await box.project.write('receiver/.ki.toml', repositoryConfiguration('example/receiver'))
    // A member that does not declare ki-trades cannot activate a route the Capital grants it.
    await box.project.write('quiet/.ki.toml', memberConfiguration('example/quiet', { trades: false }))
    const capital = await writeCapital(box, { members: [absentHome, capitalHome, quietHome, receiverHome, sourceHome] })
    await configureEstate(box, [source, receiver, quiet, capital])
    const empty = await box.run('ki repo trade routes list')

    await territory(box, [
      { from: [sourceHome], to: [receiverHome], kinds: ['work'] },
      { from: [sourceHome], to: [absentHome], kinds: ['knowledge'] },
      { from: [quietHome], to: [sourceHome], kinds: ['knowledge'] }
    ])
    const sourceDeclaration = await box.project.read('.ki.toml')
    const listed = await box.run('ki repo trade routes list')
    const checkedAll = await box.run('ki repo trade routes check')
    const checked = await box.run([
      'ki',
      'repo',
      'trade',
      'routes',
      'check',
      receiverHome,
      '--direction',
      'export',
      '--kind',
      'work'
    ])

    expect(empty.output).toContain('│  ╰─ routes: none')
    expect(listed).toEqual({
      exitCode: 0,
      output: [
        '╭─ KI TRADE ROUTES',
        '├─ results',
        '│  ├─ export',
        `│  │  ├─ work ${receiverHome} [active]`,
        `│  │  ╰─ knowledge ${absentHome} [awaiting receiver activation]`,
        '│  ╰─ import',
        `│     ╰─ knowledge ${quietHome} [awaiting sender activation]`,
        '╰─ summary: ROUTES=3',
        ''
      ].join('\n')
    })
    expect(checkedAll.output).toContain(`│  ├─ export work ${receiverHome}: active`)
    expect(checkedAll.output).toContain(`│  ├─ export knowledge ${absentHome}: awaiting receiver activation`)
    expect(checkedAll.output).toContain(`│  ╰─ import knowledge ${quietHome}: awaiting sender activation`)
    expect(checked).toEqual({
      exitCode: 0,
      output: `╭─ KI TRADE ROUTE CHECK\n├─ routes (1)\n│  ╰─ export work ${receiverHome}: active\n╰─ summary: ROUTES=1 ACTIVE=1\n`
    })
    // Route authority lives only in the Capital: the retired mutators are gone and no member file changes.
    for (const retired of ['add', 'remove'])
      expect(
        await box.run([
          'ki',
          'repo',
          'trade',
          'routes',
          retired,
          receiverHome,
          '--direction',
          'export',
          '--kind',
          'work'
        ])
      ).toMatchObject({ exitCode: 2, output: expect.stringContaining(`unknown subcommand '${retired}'`) })
    expect(await box.project.read('.ki.toml')).toBe(sourceDeclaration)
    expect(await box.project.read('receiver/.ki.toml')).toBe(repositoryConfiguration('example/receiver'))
  })

  test('pairs copies whose phases differ, since sender and receiver hold different states', async () => {
    const { box } = await configuredPair()
    const created = await createTrade(box, 'work', {}, () => Date.UTC(2026, 7, 3, 12, 0, 0))
    const id = /TRD-[0-9a-f]{8}/u.exec(created.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'repo', 'trade', 'receive', id])
    box.cd('..')

    // The sender's copy reads submitted and the receiver's reads received, so the two are
    // correctly divergent on phase alone. Pairing strips it, or every honest pair would
    // report as tampered.
    expect(await box.project.read(`-/_TRADES/example/receiver/${id}.md`)).toContain('phase: submitted')
    expect(await box.project.read(`receiver/+/_TRADES/example/source/${id}.md`)).toContain('phase: received')

    const listed = await box.run('ki repo --estate trade list')

    expect(listed.exitCode).toBe(0)
    expect(listed.output).toContain(`${id} import`)
    expect(listed.output).not.toContain(`${id} export`)
    // The compact observation badge describes what the sender now awaits from the receiver.
    expect(listed.output).toContain('[? decision]')
    expect(listed.output).not.toContain('unrecognised trade field')
    expect(await box.run(['ki', 'repo', '--estate', 'trade', 'show', id])).toMatchObject({ exitCode: 0 })
  })

  test('scopes trade reads and route inspection through the parent repository selector', async () => {
    const { box } = await configuredPair()
    const created = await createTrade(box, 'work')
    const id = /TRD-[0-9a-f]{8}/u.exec(created.output)?.[0] as string

    expect((await box.run('ki repo trade list')).output).toContain(`${id} export`)
    expect((await box.run('ki repo --repo receiver trade list')).output).toContain(`${id} import → example/receiver`)
    expect((await box.run('ki repo --estate trade list')).output).toContain(`${id} import → example/receiver`)
    expect((await box.run('ki repo --estate trade list')).output).not.toContain(`${id} export`)
    expect((await box.run(['ki', 'repo', '--repo', 'receiver', 'trade', 'show', id])).output).toContain(
      'not found in the selected repositories'
    )
    expect((await box.run('ki repo --repo receiver trade routes check')).output).toContain(
      `│  ├─ import work ${sourceHome}: active\n│  ╰─ import knowledge ${sourceHome}: active\n╰─ summary: ROUTES=2 ACTIVE=2`
    )
    expect((await box.run(`ki repo --estate trade routes check ${receiverHome}`)).output).toContain(
      'requires exactly one repository'
    )
    expect((await box.run('ki trade list')).output).toContain("unknown subcommand 'trade' for 'ki'")
  })

  test('pairs estate routes lexically when several repositories declare several peers', async () => {
    const box = await sandbox()
    const thirdHome = home('example/third')
    const source = await realpath(box.project.path)
    const receiver = await box.project.mkdir('receiver')
    const third = await box.project.mkdir('third')
    // Source reaches two peers and receiver reaches one, so the listing has a
    // non-final exporter and a non-final peer — the branches a single pair never reaches.
    await box.project.write('.ki.toml', repositoryConfiguration('example/source'))
    await box.project.write('receiver/.ki.toml', repositoryConfiguration('example/receiver'))
    await box.project.write('third/.ki.toml', repositoryConfiguration('example/third'))
    const capital = await territory(box, [
      { from: [sourceHome], to: [receiverHome, thirdHome], kinds: ['work'] },
      { from: [receiverHome], to: [thirdHome], kinds: ['knowledge'] }
    ])
    await configureEstate(box, [source, receiver, third, capital])

    expect(await box.run('ki repo --estate trade routes list')).toEqual({
      exitCode: 0,
      output:
        '╭─ KI TRADE ROUTES\n╭──────────────────┬────────────────────────┬────────────────╮\n│ example/receiver │ → —                    │ example/source │\n│                  ├────────────────────────┤                │\n│                  │ ← ⚒ work [active]      │                │\n├──────────────────┼────────────────────────┼────────────────┤\n│ example/receiver │ → ⓘ knowledge [active] │ example/third  │\n│                  ├────────────────────────┤                │\n│                  │ ← —                    │                │\n├──────────────────┼────────────────────────┼────────────────┤\n│ example/source   │ → ⚒ work [active]      │ example/third  │\n│                  ├────────────────────────┤                │\n│                  │ ← —                    │                │\n╰──────────────────┴────────────────────────┴────────────────╯\nsummary: ROUTES=3 ACTIVE=3 INCOMPLETE=0\n'
    })
    const narrow = await box.run('ki repo --estate trade routes list', { interactive: true, columns: 40 })
    expect(narrow.output).toContain('├─ example/receiver ↔ example/source')
    expect(narrow.output).toContain('╰─ example/source ↔ example/third')
  })

  test('lists incomplete route declarations across the registered estate', async () => {
    const { box } = await configuredPair()
    const estate = await box.run('ki repo --estate trade routes list')
    const incomplete = await box.run('ki repo --estate trade routes list --incomplete')

    expect(estate).toEqual({
      exitCode: 0,
      output:
        '╭─ KI TRADE ROUTES\n╭──────────────────┬─────────────────────────────────────────┬────────────────╮\n│ example/receiver │ → —                                     │ example/source │\n│                  ├─────────────────────────────────────────┤                │\n│                  │ ← ⓘ knowledge [active], ⚒ work [active] │                │\n╰──────────────────┴─────────────────────────────────────────┴────────────────╯\nsummary: ROUTES=1 ACTIVE=1 INCOMPLETE=0\n'
    })
    expect(incomplete).toEqual({
      exitCode: 0,
      output: '╭─ KI TRADE ROUTES\n╰─ routes: none\nsummary: ROUTES=0 ACTIVE=0 INCOMPLETE=0\n'
    })

    // The Capital still grants the route, but a receiver without ki-trades cannot activate it.
    await box.project.write('receiver/.ki.toml', memberConfiguration('example/receiver', { trades: false }))

    const narrowed = await box.run('ki repo --estate trade routes list --incomplete')
    expect(narrowed.exitCode).toBe(0)
    expect(narrowed.output).toContain('example/receiver')
    expect(narrowed.output).toContain(
      '← ⓘ knowledge [awaiting receiver activation], ⚒ work [awaiting receiver activation]'
    )
    expect(narrowed.output).toContain('summary: ROUTES=1 ACTIVE=0 INCOMPLETE=1')
  })

  test('uses the same pair projection for explicit wide and narrow estate tables', async () => {
    const { box } = await configuredPair()

    const wide = await box.run('ki repo --estate trade routes list', { interactive: true, columns: 120 })
    const explicit = await box.run('ki repo --estate trade routes list --format text', {
      interactive: true,
      columns: 120
    })
    const narrow = await box.run('ki repo --estate trade routes list', { interactive: true, columns: 40 })

    expect(explicit).toEqual(wide)
    expect(wide.output).toContain('╭──────────────────┬')
    expect(wide.output).toContain('example/receiver │ → —')
    expect(wide.output).toContain('← ⓘ knowledge [active], ⚒ work [active]')
    expect(narrow.output).toBe(
      '╭─ KI TRADE ROUTES\n╰─ example/receiver ↔ example/source\n   ├─ → —\n   ╰─ ← ⓘ knowledge [active], ⚒ work [active]\nsummary: ROUTES=1 ACTIVE=1 INCOMPLETE=0\n'
    )
  })

  test('keeps both directions in one lexical estate pair', async () => {
    const { box } = await configuredPair()
    await territory(box, [
      { from: [sourceHome], to: [receiverHome], kinds: ['work'] },
      { from: [receiverHome], to: [sourceHome], kinds: ['knowledge'] }
    ])

    const listed = await box.run('ki repo --estate trade routes list')

    expect(listed.exitCode).toBe(0)
    expect(listed.output).toContain('→ ⓘ knowledge [active]')
    expect(listed.output).toContain('← ⚒ work [active]')
    expect(listed.output).toContain('summary: ROUTES=2 ACTIVE=2 INCOMPLETE=0')
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
    const fourthHome = home('example/fourth')
    await box.project.write('.ki.toml', repositoryConfiguration('example/source'))
    await box.project.write('receiver/.ki.toml', repositoryConfiguration('example/receiver'))
    await box.project.write('third/.ki.toml', repositoryConfiguration('example/third'))
    // The Capital lists this repository and grants it one edge each way, but it resolves another
    // Capital, so both render incomplete — the states a fully wired estate never produces.
    await box.project.write(
      'fourth/.ki.toml',
      memberConfiguration('example/fourth', { capital: home('example/elsewhere') })
    )
    const capital = await territory(box, [
      { from: [sourceHome], to: [receiverHome, thirdHome], kinds: ['work'] },
      { from: [sourceHome], to: [receiverHome], kinds: ['knowledge'] },
      { from: [receiverHome], to: [sourceHome], kinds: ['work'] },
      { from: [receiverHome], to: [thirdHome], kinds: ['knowledge'] },
      { from: [fourthHome], to: [sourceHome], kinds: ['work'] },
      { from: [thirdHome], to: [fourthHome], kinds: ['knowledge'] }
    ])
    await configureEstate(box, [source, receiver, third, fourth, capital])
    return box
  }

  test('renders versioned path-free estate route evidence as JSON', async () => {
    const box = await diagramEstate()

    const rendered = await box.run('ki repo --estate trade routes list --format json')

    expect(rendered.exitCode).toBe(0)
    // The member resolving another Capital is stated on standard error, outside the contract.
    expect(rendered.stderr).toBe(
      `skipped: example/fourth (territory policy lives in ${home('example/elsewhere')}, not available here)\n`
    )
    const report = JSON.parse(rendered.stdout)
    expect(report).toMatchObject({
      schema: 'ki/trade-routes/v1',
      scope: 'estate',
      incomplete: false
    })
    expect(report.routes).toContainEqual({
      source: {
        identity: 'example/source',
        repository: 'https://github.com/example/source',
        mapBonus: 0
      },
      peer: {
        identity: 'example/receiver',
        repository: 'https://github.com/example/receiver',
        resolved: true,
        mapBonus: 0
      },
      direction: 'export',
      kind: 'work',
      state: 'active'
    })
    expect(JSON.stringify(report)).not.toContain(box.project.path)
    expect(JSON.stringify(report)).not.toContain('.ki.toml')
  })

  test('filters JSON evidence to incomplete routes', async () => {
    const box = await diagramEstate()

    const rendered = await box.run('ki repo --estate trade routes list --incomplete --format json')

    expect(rendered.exitCode).toBe(0)
    const report = JSON.parse(rendered.stdout)
    expect(report.incomplete).toBe(true)
    expect(report.routes.length).toBeGreaterThan(0)
    expect(report.routes.every((route: { state: string }) => route.state !== 'active')).toBe(true)
  })

  test('represents unresolved peers without leaking registry paths or inventing map bonuses', async () => {
    const box = await sandbox()
    const source = await realpath(box.project.path)
    await box.project.write('.ki.toml', repositoryConfiguration('example/source'))
    const capital = await territory(box, [{ from: [sourceHome], to: [home('example/unresolved')], kinds: ['work'] }])
    await configureEstate(box, [source, capital])

    const rendered = await box.run('ki repo --estate trade routes list --format json')

    expect(rendered.exitCode).toBe(0)
    expect(JSON.parse(rendered.output).routes).toEqual([
      {
        source: {
          identity: 'example/source',
          repository: 'https://github.com/example/source',
          mapBonus: 0
        },
        peer: {
          identity: 'example/unresolved',
          repository: 'https://github.com/example/unresolved',
          resolved: false,
          mapBonus: null
        },
        direction: 'export',
        kind: 'work',
        state: 'awaiting-receiver'
      }
    ])
  })

  test('requires an aggregate selection for JSON and rejects unknown formats and retired presentation flags', async () => {
    const { box } = await configuredPair()

    box.cd('receiver')
    expect(await box.run('ki repo trade routes list --format json')).toEqual({
      exitCode: 2,
      output: 'ki: error: trade route --format json requires an aggregate repository selection\n'
    })
    expect(await box.run('ki repo --estate trade routes list --format yaml')).toEqual({
      exitCode: 2,
      output: 'ki: error: trade route --format must be text or json\n'
    })
    expect((await box.run('ki repo --estate trade routes list --html')).output).toContain("unknown option '--html'")
    expect((await box.run('ki repo --estate trade routes list --table')).output).toContain("unknown option '--table'")
  })
  test('releases a decided trade whose receiver reformatted the record without changing the payload', async () => {
    const { box } = await configuredPair()
    const created = await createTrade(box, 'work')
    const id = /TRD-[0-9a-f]{8}/u.exec(created.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'repo', 'trade', 'receive', id])
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

    expect(await box.run(['ki', 'repo', 'trade', 'release', id])).toMatchObject({ exitCode: 0 })
  })

  test('refuses release when the receiver inbound record declares a phase its location contradicts', async () => {
    // The estate scan derives direction from the record's own phase, so it can never disagree
    // with itself. Release is the caller that does not: it asserts inbound for a file in another
    // repository, hand-editable and never consulted for its phase before this point. A record
    // copied into place rather than recorded through `ki repo trade receive` arrives here intact.
    const { box } = await configuredPair()
    const created = await createTrade(box, 'work')
    const id = /TRD-[0-9a-f]{8}/u.exec(created.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'repo', 'trade', 'receive', id])
    const inboundPath = `receiver/+/_TRADES/example/source/${id}.md`
    const inbound = await box.project.read(inboundPath)
    box.cd('..')
    const releaseWithPhase = async (phase: string) => {
      await box.project.write(inboundPath, inbound.replace('phase: received', `phase: ${phase}`))
      return box.run(['ki', 'repo', 'trade', 'release', id])
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
    const received = await box.run(['ki', 'repo', 'trade', 'receive', id])
    const receiverListed = await box.run('ki repo trade list')
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
      'repo',
      '--repo',
      'receiver',
      'trade',
      'list',
      '--direction',
      'import',
      '--status',
      'adopted',
      '--kind',
      'work'
    ])
    const allListed = await box.run('ki repo --estate trade list')
    const plainListed = await box.run('ki repo --estate trade list --no-icons')
    const shown = await box.run(['ki', 'repo', '--estate', 'trade', 'show', id])
    const released = await box.run(['ki', 'repo', 'trade', 'release', id])
    box.cd('receiver')
    const pruned = await box.run(['ki', 'repo', 'trade', 'prune', id])

    expect(created.output).toBe(`ki repo trade submit: submitted ${id} for example/receiver [decision]\n`)
    expect(received).toEqual({ exitCode: 0, output: `ki repo trade receive: received ${id}\n` })
    expect(receiverListed.output.match(new RegExp(id, 'g'))).toHaveLength(1)
    expect(listed.output).toContain(`${id} import [✓ release] ← [⚒ work] source [adopted] Route contract`)
    expect(allListed.output).toContain(`${id} import [✓ release] ← [⚒ work] source [adopted]`)
    expect(allListed.output).not.toContain(`${id} export`)
    expect(plainListed.output).not.toContain(`${id} export`)
    expect(shown.output).toContain(`Repository: ${sourceHome} [export]\n${outbound.trimEnd()}`)
    expect(released).toEqual({ exitCode: 0, output: `ki repo trade release: released ${id}\n` })
    expect(pruned).toEqual({ exitCode: 0, output: `ki repo trade prune: pruned ${id}\n` })
    await expect(box.project.read(`receiver/+/_TRADES/example/source/${id}.md`)).rejects.toThrow()
  })

  test('permits retained knowledge to release and prune, but refuses retained work', async () => {
    const { box } = await configuredPair()
    const created = await createTrade(box, 'knowledge')
    const id = /TRD-[0-9a-f-]+/u.exec(created.output)?.[0] as string
    const listed = await box.run('ki repo trade list')
    expect(listed.output).toContain(`${id} export [ⓘ knowledge] → [↓ receipt] receiver Route contract`)
    box.cd('receiver')
    await box.run(['ki', 'repo', 'trade', 'receive', id])
    const path = `receiver/+/_TRADES/example/source/${id}.md`
    await box.project.write(
      path,
      (await box.project.read(path)).replace(
        'decision_status: unconsidered',
        'decision_status: retained\nretained_as: "Knowledge/Local/Note"'
      )
    )
    box.cd('..')
    const released = await box.run(['ki', 'repo', 'trade', 'release', id])
    box.cd('receiver')
    const pruned = await box.run(['ki', 'repo', 'trade', 'prune', id])

    expect(released.exitCode).toBe(0)
    expect(pruned.exitCode).toBe(0)

    box.cd('..')
    const invalid = await createTrade(box, 'work')
    const invalidId = /TRD-[0-9a-f-]+/u.exec(invalid.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'repo', 'trade', 'receive', invalidId])
    const invalidPath = `receiver/+/_TRADES/example/source/${invalidId}.md`
    await box.project.write(
      invalidPath,
      (await box.project.read(invalidPath)).replace(
        'decision_status: unconsidered',
        'decision_status: retained\nretained_as: "Knowledge/Local/Note"'
      )
    )
    box.cd('..')
    expect((await box.run(['ki', 'repo', 'trade', 'release', invalidId])).output).toContain(
      'permits retained only for knowledge trades'
    )
  })

  test('creates granted outbound trades before receiver activation and rejects malformed or retired inputs', async () => {
    const { box } = await configuredPair()
    // The receiver has not yet declared ki-trades, so the granted route awaits its activation.
    await box.project.write('receiver/.ki.toml', memberConfiguration('example/receiver', { trades: false }))

    const pending = await createTrade(box, 'work')
    const missingKind = await box.run(['ki', 'repo', 'trade', 'prepare', receiverHome])
    const malformedDirection = await box.run(`ki repo trade routes check ${receiverHome} --direction sideways`)
    const malformedRepository = await box.run('ki repo trade routes check example/receiver --direction export')
    const malformedKind = await box.run(`ki repo trade routes check ${receiverHome} --kind other`)
    const emptyTitle = await box.run(prepareTrade('work', { title: '   ' }))
    const retired = await box.run('ki handoffs list')
    const plural = await box.run('ki repo trades list')

    expect(pending.exitCode).toBe(0)
    expect(pending.output).toMatch(
      /^ki repo trade submit: submitted TRD-[0-9a-f]{8} for example\/receiver \[decision\]\n$/
    )
    const id = /TRD-[0-9a-f]{8}/u.exec(pending.output)?.[0] as string
    expect(await box.project.read(`-/_TRADES/example/receiver/${id}.md`)).toContain(`receiver: example/receiver`)
    await territory(box, [{ from: [receiverHome], to: [sourceHome], kinds: bothKinds }])
    expect((await createTrade(box, 'work')).output).toContain(
      `export work trade route ${receiverHome} is not granted by the territory policy`
    )
    expect(missingKind.exitCode).toBe(2)
    expect(malformedDirection).toEqual({ exitCode: 2, output: 'ki: error: --direction accepts export or import\n' })
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
    await box.project.write('.ki.toml', repositoryConfiguration('example/source'))
    await box.project.write('receiver/.ki.toml', repositoryConfiguration('other/receiver'))
    const capital = await territory(box, [{ from: [sourceHome], to: [foreignReceiver], kinds: ['work'] }])
    await configureEstate(box, [source, receiver, capital])

    const created = await createTrade(box, 'work', { receiver: foreignReceiver })
    const id = /TRD-[0-9a-f]{8}/u.exec(created.output)?.[0] as string
    const listed = await box.run('ki repo trade list')

    expect(listed.output).toContain(`${id} export [⚒ work] → [↓ receipt] other/receiver Route contract`)
  })

  test('reports malformed member declarations and refuses retired route keys', async () => {
    const box = await sandbox()
    const source = await realpath(box.project.path)
    const capital = await writeCapital(box, { members: [capitalHome, sourceHome] })
    await configureEstate(box, [source, capital])
    const bare = memberConfiguration('example/source', { trades: false })
    const policyMessage = `come from the territory Capital's [${tradesTable}.territory] policy`

    await box.project.write('.ki.toml', repositoryConfiguration('example/source'))
    expect(await box.run('ki repo trade routes list')).toEqual({
      exitCode: 0,
      output: '╭─ KI TRADE ROUTES\n├─ results\n│  ╰─ routes: none\n╰─ summary: ROUTES=0\n'
    })
    expect(await box.run('ki repo trade routes check')).toEqual({
      exitCode: 0,
      output: '╭─ KI TRADE ROUTE CHECK\n├─ routes (0)\n│  ╰─ none\n╰─ summary: ROUTES=0 ACTIVE=0\n'
    })

    const repositoryForm = '[skills.ki-repo].repository must use canonical HTTPS GitHub repository form'
    const capitalForm = '[skills.ki-repo].capital must name the territory Capital in canonical HTTPS form'
    const rejected: readonly (readonly [string, string])[] = [
      ['[not valid TOML\n', 'must be valid TOML'],
      [bare.replace(`repository = "${sourceHome}"\n`, ''), repositoryForm],
      // No [skills] namespace at all, or a ki-repo entry that is not a table.
      ['[repo]\nharnesses = ["example/harness"]\n', repositoryForm],
      ['[repo]\nharnesses = ["example/harness"]\n\n[skills]\nki-repo = "none"\n', repositoryForm],
      [bare.replace(`capital = "${capitalHome}"\n`, ''), capitalForm],
      [bare.replace(`capital = "${capitalHome}"`, 'capital = "example/capital"'), capitalForm],
      [
        `${bare}territory_name = "Rogue"\n`,
        '[skills.ki-repo].territory_name and [skills.ki-repo].territory_members are permitted only in a territory Capital'
      ],
      [
        bare.replace('[skills.ki-repo-project]\n', '[skills]\nki-trades = "none"\n\n[skills.ki-repo-project]\n'),
        `[${tradesTable}] must be a table`
      ],
      [`${bare}\n[${tradesTable}]\nunknown = true\n`, `[${tradesTable}] has unrecognised key unknown`],
      ...['-1', '4', '1.5', '"one"'].map(
        (value) =>
          [
            `${bare}\n[${tradesTable}]\nmap_bonus = ${value}\n`,
            'map_bonus must be an integer from 0 through 3'
          ] as const
      ),
      [
        `${bare}\n[${tradesTable}.routes."example/receiver"]\nexport = ["work"]\n`,
        `[${tradesTable}].routes is retired; routes, standing grants and subtypes ${policyMessage}`
      ],
      [`${bare}\n[${tradesTable}]\nroutes = "none"\n`, `[${tradesTable}].routes is retired`],
      [
        `${bare}\n[${tradesTable}.subtypes.knowledge]\nshared-maintenance = "Shared."\n`,
        `[${tradesTable}].subtypes is retired; routes, standing grants and subtypes ${policyMessage}`
      ],
      [
        `${bare}\n[${tradesTable}.territory.subtypes]\nshared-maintenance = "Shared."\n`,
        `[${tradesTable}.territory] is permitted only in a territory Capital`
      ],
      [bare, `.ki.toml does not declare [${tradesTable}]`]
    ]
    for (const [declaration, detail] of rejected) {
      await box.project.write('.ki.toml', declaration)
      const listed = await box.run('ki repo trade routes list')
      expect(listed.exitCode).toBe(2)
      expect(listed.output).toContain(detail)
    }
    await box.project.write('.ki.toml', repositoryConfiguration('example/source', 3))
    expect((await box.run('ki repo trade routes list')).exitCode).toBe(0)
  })

  test('derives pending, active, and ambiguous registered-estate route states from each peer', async () => {
    const box = await sandbox()
    const source = await realpath(box.project.path)
    const receiver = await box.project.mkdir('receiver')
    const duplicate = await box.project.mkdir('duplicate')
    const missingHome = home('example/missing')
    await box.project.write('.ki.toml', repositoryConfiguration('example/source'))
    await box.project.write('receiver/.ki.toml', repositoryConfiguration('example/receiver'))
    const capital = await territory(box, [{ from: [sourceHome], to: [missingHome, receiverHome], kinds: ['work'] }])
    // The duplicate checkout is registered before it holds any declaration, which is not a peer.
    await configureEstate(box, [source, receiver, duplicate, capital])

    const checked = (await box.run('ki repo trade routes check')).output
    expect(checked).toContain(`export work ${missingHome}: awaiting receiver activation`)
    expect(checked).toContain(`export work ${receiverHome}: active`)

    const header =
      '[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\n'
    const pendingReceivers = [
      // No canonical identity is claimed, so the checkout is no trade endpoint at all.
      header,
      `${header}repository = 1\n`,
      `${header}repository = "not-a-repository"\n`,
      '[repo]\nharnesses = ["example/harness"]\nskills = "none"\n',
      '[not valid TOML\n',
      // The identity is claimed but the declaration is invalid, so it cannot activate the route.
      `${header}repository = "${receiverHome}"\n`,
      // A valid member that has not declared ki-trades.
      memberConfiguration('example/receiver', { trades: false }),
      // A trading peer that resolves another Capital never activates this Capital's route.
      memberConfiguration('example/receiver', { capital: home('example/elsewhere') })
    ]
    for (const declaration of pendingReceivers) {
      await box.project.write('receiver/.ki.toml', declaration)
      expect((await box.run(`ki repo trade routes check ${receiverHome}`)).output).toContain(
        `export work ${receiverHome}: awaiting receiver activation`
      )
    }

    await box.project.write('receiver/.ki.toml', repositoryConfiguration('example/receiver'))
    await box.project.write('duplicate/.ki.toml', repositoryConfiguration('example/receiver'))
    expect((await box.run('ki repo trade routes check')).output).toContain(`${receiverHome}: ambiguous repository`)

    await rm(join(duplicate, '.ki.toml'))
    box.cd('receiver')
    expect((await box.run(['ki', 'repo', 'trade', 'receive'])).output).toContain('requires one trade id or --all')
    expect((await box.run(['ki', 'repo', 'trade', 'receive', '--all'])).output).toContain('0 eligible trades')
  })

  test('covers import-route inspection and command filters without changing peer configuration', async () => {
    const { box } = await configuredPair()
    expect(await box.run('ki repo trade list')).toEqual({
      exitCode: 0,
      output:
        '╭─ KI TRADES\n├─ results\n│  ╰─ trades: none\n╰─ summary: TRADES=0 PREPARATIONS=0 IMPORTS=0 AWAITING_RECEIPT=0 EXPORTS=0\n'
    })
    expect(await box.run('ki repo trade show TRD-00000000')).toEqual({
      exitCode: 2,
      output: 'ki: error: trade TRD-00000000 was not found in the selected repositories\n'
    })
    const sourceDeclaration = await box.project.read('.ki.toml')
    box.cd('receiver')
    expect((await box.run(['ki', 'repo', 'trade', 'receive'])).exitCode).toBe(2)
    const selected = await box.run([
      'ki',
      'repo',
      'trade',
      'routes',
      'check',
      sourceHome,
      '--direction',
      'import',
      '--kind',
      'knowledge'
    ])
    const absent = await box.run(['ki', 'repo', 'trade', 'routes', 'check', home('example/absent')])
    const badDirection = await box.run(`ki repo trade routes check ${sourceHome} --direction sideways`)
    const badKind = await box.run(`ki repo trade routes check ${sourceHome} --kind other`)
    const badListDirection = await box.run('ki repo trade list --direction sideways')
    const badListRepository = await box.run('ki repo --repo example/source trade list')
    const badId = await box.run('ki repo trade show TRD-invalid')
    const retiredUuidId = await box.run('ki repo trade show TRD-00000000-0000-0000-0000-000000000000')

    expect(selected).toEqual({
      exitCode: 0,
      output: `╭─ KI TRADE ROUTE CHECK\n├─ routes (1)\n│  ╰─ import knowledge ${sourceHome}: active\n╰─ summary: ROUTES=1 ACTIVE=1\n`
    })
    expect(absent).toEqual({
      exitCode: 2,
      output: `ki: error: trade route ${home('example/absent')} is not granted by the territory policy\n`
    })
    expect(badDirection.output).toContain('--direction accepts export or import')
    expect(badKind.output).toContain('--kind accepts work or knowledge')
    expect(badListDirection.output).toContain('--direction accepts prepare, import, or export')
    expect(badListRepository.output).toContain('--repo must be an existing directory')
    expect(badId.output).toContain('trade id must use TRD-')
    expect(retiredUuidId.output).toContain('trade id must use TRD-')
    expect(await box.project.read('.ki.toml')).toBe(sourceDeclaration)
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
    const preview = await box.run(['ki', 'repo', 'trade', 'receive', '--all'])
    const inventory = await box.run(['ki', 'repo', 'trade', 'list'])
    const askedDirectly = await box.run(['ki', 'repo', 'trade', 'receive', preparingId])

    expect(preview.exitCode).toBe(0)
    expect(preview.output).toContain(submittedId)
    expect(preview.output).not.toContain(preparingId)
    expect(inventory.output).toContain(`${submittedId} import`)
    expect(inventory.output).toContain('AWAITING_RECEIPT=1')
    expect(inventory.output).not.toContain(`${preparingId} import`)
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
      expect((await box.run(['ki', 'repo', 'trade', 'receive', id])).output).toContain(message)
    }

    await box.project.write(
      path,
      outbound
        .replace('\n---\n#', '\n---\n\n#')
        .replace('## Constraints\n\nThe receiver retains local authority.', '## Constraints\n\n')
    )
    expect((await box.run(['ki', 'repo', 'trade', 'receive', id])).output).toContain(
      'requires non-empty Constraints section'
    )

    await box.project.write(path, outbound.replace('receiver: example/receiver', 'receiver: example/other'))
    expect((await box.run(['ki', 'repo', 'trade', 'receive', id])).output).toContain('is unavailable or ambiguous')
    await box.project.write(path, outbound)
    const missing = await box.run(['ki', 'repo', 'trade', 'receive', 'TRD-00000000'])
    expect(missing.output).toContain('is unavailable or ambiguous')
    const wrongId = 'TRD-00000000'
    await box.project.write(`-/_TRADES/example/receiver/${wrongId}.md`, outbound)
    box.cd('..')
    expect((await box.run('ki repo trade list')).output).toContain(`filename must match trade id ${id}`)
    box.cd('receiver')
    expect((await box.run(['ki', 'repo', 'trade', 'receive', wrongId])).output).toContain(
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
    const outboundList = await box.run('ki repo trade list --direction export')
    box.cd('receiver')
    const received = await box.run(['ki', 'repo', 'trade', 'receive', '--all', '--yes'])
    const repeated = await box.run(['ki', 'repo', 'trade', 'receive', '--all', '--yes'])
    box.cd('..')
    const shown = await box.run(['ki', 'repo', 'trade', 'show', firstId])

    expect(outboundList.output).toContain(`${firstId} export [⚒ work] → [↓ receipt] receiver Route contract`)
    expect(received.output).toContain(firstId)
    expect(received.output).toContain(secondId)
    expect(repeated.output).toContain(firstId)
    expect(repeated.output).toContain(secondId)
    expect(shown.output).not.toContain(secondId)
  })

  test('reports missing, invalid, and unregistered user configuration before trade mutation', async () => {
    const unbootstrapped = await sandbox()
    await unbootstrapped.project.write('.ki.toml', repositoryConfiguration('example/source'))
    expect((await unbootstrapped.run('ki repo trade routes list')).output).toContain(
      'current KI repository is not registered'
    )

    const box = await sandbox()
    const source = await realpath(box.project.path)
    await box.project.write('.ki.toml', repositoryConfiguration('example/source'))
    await box.config.write('ki/config.toml', 'not valid TOML')
    expect((await box.run('ki repo trade routes list')).output).toContain('current KI repository is not registered')
    await configureEstate(box, [])
    expect((await box.run('ki repo trade routes list')).output).toContain('current KI repository is not registered')
    await configureEstate(box, [source])
    // Registered, but its Capital is not checked out here: trade operations fail closed.
    expect(await box.run('ki repo trade routes list')).toEqual({
      exitCode: 2,
      output: `ki: error: territory policy lives in ${capitalHome}, not available here\n`
    })
    await configureEstate(box, [source, await writeCapital(box, { members: [capitalHome, sourceHome] })])
    expect((await box.run('ki repo trade routes list')).exitCode).toBe(0)
  })

  test('ignores missing registered roots and missing trade paths without treating them as peer state', async () => {
    const { box, source, receiver, capital } = await configuredPair()
    await configureEstate(box, [source, receiver, capital, `${box.root.path}/missing`])

    expect(await box.run('ki repo trade list')).toEqual({
      exitCode: 0,
      output:
        '╭─ KI TRADES\n├─ results\n│  ╰─ trades: none\n╰─ summary: TRADES=0 PREPARATIONS=0 IMPORTS=0 AWAITING_RECEIPT=0 EXPORTS=0\n'
    })
    const created = await createTrade(box, 'work')
    const id = /TRD-[0-9a-f-]+/u.exec(created.output)?.[0] as string

    expect((await box.run(['ki', 'repo', 'trade', 'release', id])).output).toContain(
      'receiver has not recorded an inbound trade'
    )
  })

  test('validates receiver-only status fields, payload immutability, and lifecycle evidence', async () => {
    const { box } = await configuredPair()
    const created = await createTrade(box, 'work')
    const id = /TRD-[0-9a-f-]+/u.exec(created.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'repo', 'trade', 'receive', id])
    const path = `receiver/+/_TRADES/example/source/${id}.md`
    const inbound = await box.project.read(path)
    const releaseWith = async (decisionStatus: string) => {
      await box.project.write(path, inbound.replace('decision_status: unconsidered', decisionStatus))
      box.cd('..')
      const result = await box.run(['ki', 'repo', 'trade', 'release', id])
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
    await box.run(['ki', 'repo', 'trade', 'receive', changedId])
    const changedPath = `receiver/+/_TRADES/example/source/${changedId}.md`
    await box.project.write(
      changedPath,
      (await box.project.read(changedPath))
        .replace('decision_status: unconsidered', 'decision_status: declined\nrationale: "not local"')
        .replaceAll('Route contract', 'Changed title')
    )
    box.cd('..')
    expect((await box.run(['ki', 'repo', 'trade', 'release', changedId])).output).toContain(
      'does not preserve the sender payload'
    )

    const knowledge = await createTrade(box, 'knowledge')
    const knowledgeId = /TRD-[0-9a-f-]+/u.exec(knowledge.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'repo', 'trade', 'receive', knowledgeId])
    const knowledgePath = `receiver/+/_TRADES/example/source/${knowledgeId}.md`
    const knowledgeInbound = await box.project.read(knowledgePath)
    await box.project.write(
      knowledgePath,
      knowledgeInbound.replace('decision_status: unconsidered', 'decision_status: adopted\nadopted_as: "KI-LOCAL-002"')
    )
    box.cd('..')
    expect((await box.run(['ki', 'repo', 'trade', 'release', knowledgeId])).output).toContain(
      'permits adopted only for work trades'
    )
    box.cd('receiver')
    await box.project.write(
      knowledgePath,
      knowledgeInbound.replace('decision_status: unconsidered', 'decision_status: retained')
    )
    box.cd('..')
    expect((await box.run(['ki', 'repo', 'trade', 'release', knowledgeId])).output).toContain(
      'requires retained_as for decision status retained'
    )

    const superseded = await createTrade(box, 'work')
    const supersededId = /TRD-[0-9a-f-]+/u.exec(superseded.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'repo', 'trade', 'receive', supersededId])
    const supersededPath = `receiver/+/_TRADES/example/source/${supersededId}.md`
    await box.project.write(
      supersededPath,
      (await box.project.read(supersededPath)).replace(
        'decision_status: unconsidered',
        'decision_status: superseded\nrationale: "newer trade"\nsuperseded_by: "TRD-00000000"'
      )
    )
    box.cd('..')
    expect((await box.run(['ki', 'repo', 'trade', 'release', supersededId])).exitCode).toBe(0)
  })

  test('rejects absent, premature, foreign, and ambiguous local lifecycle evidence', async () => {
    const { box, source, receiver, capital } = await configuredPair()
    const created = await createTrade(box, 'work')
    const id = /TRD-[0-9a-f-]+/u.exec(created.output)?.[0] as string
    expect((await box.run(['ki', 'repo', 'trade', 'release', 'TRD-00000000'])).output).toContain(
      'was not found in the current repository'
    )
    expect((await box.run(['ki', 'repo', 'trade', 'release', id])).output).toContain(
      'receiver has not recorded an inbound trade'
    )

    box.cd('receiver')
    await box.run(['ki', 'repo', 'trade', 'receive', id])
    expect((await box.run(['ki', 'repo', 'trade', 'prune', id])).output).toContain(
      'before sender release is observable'
    )
    const inboundPath = `receiver/+/_TRADES/example/source/${id}.md`
    await box.project.write(
      inboundPath,
      (await box.project.read(inboundPath)).replace(
        'decision_status: unconsidered',
        'decision_status: declined\nrationale: "not local"'
      )
    )
    expect((await box.run(['ki', 'repo', 'trade', 'prune', id])).output).toContain(
      'before sender release is observable'
    )

    box.cd('..')
    const duplicate = await box.project.mkdir('duplicate')
    await box.project.write('duplicate/.ki.toml', repositoryConfiguration('example/receiver'))
    await configureEstate(box, [source, receiver, capital, duplicate])
    expect((await box.run(['ki', 'repo', 'trade', 'release', id])).output).toContain(
      'repositories repeats a repository'
    )

    await configureEstate(box, [source, receiver, capital])
    // The foreign identities stay territory members, so only record ownership is at stake.
    await writeCapital(box, {
      members: [capitalHome, home('example/other'), home('example/other-receiver'), receiverHome, sourceHome],
      channels: [{ from: [sourceHome], to: [receiverHome], kinds: bothKinds }]
    })
    await box.project.write('.ki.toml', repositoryConfiguration('example/other'))
    expect((await box.run(['ki', 'repo', 'trade', 'release', id])).output).toContain(
      'not owned by the current repository'
    )

    await box.project.write('.ki.toml', repositoryConfiguration('example/source'))
    box.cd('receiver')
    await box.project.write('receiver/.ki.toml', repositoryConfiguration('example/other-receiver'))
    expect((await box.run(['ki', 'repo', 'trade', 'prune', id])).output).toContain(
      'not addressed to the current repository'
    )
  })

  test('prepares, observes, guards routes and record validity, then abandons mutable work', async () => {
    const { box } = await configuredPair()
    const prepared = await box.run(prepareTrade('work', { observation: 'receipt' }))
    const id = /TRD-[0-9a-f]{8}/u.exec(prepared.output)?.[0] as string
    const preparationPath = `-/_TRADES/example/receiver/${id}.md`
    expect(await box.project.read(preparationPath)).toContain('phase: preparing')
    expect((await box.run('ki repo trade list --direction prepare')).output).toContain(
      `${id} prepare [⚒ work] → [? decision] receiver`
    )

    box.cd('receiver')
    const first = await box.run(['ki', 'repo', 'trade', 'observe', id])
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
    expect((await box.run(['ki', 'repo', 'trade', 'observe', id])).output).toContain('diff')
    expect((await box.run(['ki', 'repo', 'trade', 'observe', 'TRD-00000000'])).output).toContain(
      'unavailable or ambiguous'
    )

    box.cd('..')
    // Submission rewrites the phase in place, so no outbound destination exists to collide
    // with; what remains to guard is that a corrupted record is refused. The preparation and
    // its successor share one path, so restore it rather than removing it before abandoning.
    const valid = await box.project.read(preparationPath)
    await box.project.write(preparationPath, 'conflict')
    expect((await box.run(['ki', 'repo', 'trade', 'submit', id])).output).toContain('has invalid phase')
    await box.project.write(preparationPath, valid)
    expect((await box.run(['ki', 'repo', 'trade', 'abandon', id, '--yes'])).exitCode).toBe(0)
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
    await box.run(['ki', 'repo', 'trade', 'receive', completionId])
    const inbound = `receiver/+/_TRADES/example/source/${completionId}.md`
    await box.project.write(
      inbound,
      (await box.project.read(inbound)).replace(
        'decision_status: unconsidered',
        'decision_status: adopted\nadopted_as: "KI-LOCAL-001"'
      )
    )
    box.cd('..')
    expect((await box.run('ki repo trade list --direction export')).output).toContain(
      `${completionId} export [⚒ work] → [… completion] receiver [adopted] Route contract`
    )
    expect((await box.run(['ki', 'repo', 'trade', 'release', completionId])).output).toContain(
      'completion observation policy'
    )
    await box.project.write('receiver/docs/roadmap/not-markdown.txt', 'ignored')
    expect((await box.run(['ki', 'repo', 'trade', 'release', completionId])).output).toContain(
      'completion observation policy'
    )
    await box.project.write('receiver/docs/roadmap/item.md', '---\nid: KI-LOCAL-001\nstatus: done\n---\n')
    expect((await box.run(['ki', 'repo', 'trade', 'release', '--eligible'])).output).toContain(completionId)
    expect((await box.run(['ki', 'repo', 'trade', 'release', '--eligible', '--yes'])).output).toContain(
      'released 1 trade'
    )
    box.cd('receiver')
    expect((await box.run(['ki', 'repo', 'trade', 'prune', '--eligible'])).output).toContain(completionId)
    expect((await box.run(['ki', 'repo', 'trade', 'prune', '--eligible', '--yes'])).output).toContain('pruned 1 trade')

    box.cd('..')
    const applied = await createTrade(box, 'work')
    const appliedId = /TRD-[0-9a-f]{8}/u.exec(applied.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'repo', 'trade', 'receive', appliedId])
    const appliedPath = `receiver/+/_TRADES/example/source/${appliedId}.md`
    const appliedInbound = await box.project.read(appliedPath)
    await box.project.write(
      appliedPath,
      appliedInbound.replace('decision_status: unconsidered', 'decision_status: applied')
    )
    box.cd('..')
    expect((await box.run(['ki', 'repo', 'trade', 'release', appliedId])).output).toContain(
      'requires full applied_commit'
    )
    box.cd('receiver')
    await box.project.write(
      appliedPath,
      appliedInbound.replace(
        'decision_status: unconsidered',
        `decision_status: applied\napplied_commit: ${'b'.repeat(40)}`
      )
    )
    box.cd('..')
    expect((await box.run(['ki', 'repo', 'trade', 'release', appliedId])).exitCode).toBe(0)

    const premature = await createTrade(box, 'work')
    const prematureId = /TRD-[0-9a-f]{8}/u.exec(premature.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'repo', 'trade', 'receive', prematureId])
    box.cd('..')
    await rm(join(box.project.path, `-/_TRADES/example/receiver/${prematureId}.md`))
    box.cd('receiver')
    expect((await box.run(['ki', 'repo', 'trade', 'prune', prematureId])).output).toContain(
      'premature decision sender release'
    )
  })

  test('narrows the local route list to incomplete routes and omits unconfigured repositories from the estate', async () => {
    const { box } = await configuredPair()
    const absentHome = home('example/absent')
    await territory(box, [
      { from: [sourceHome], to: [receiverHome], kinds: ['work'] },
      { from: [sourceHome], to: [absentHome], kinds: ['knowledge'] }
    ])

    expect(await box.run('ki repo trade routes list --incomplete')).toEqual({
      exitCode: 0,
      output: `╭─ KI TRADE ROUTES\n├─ results\n│  ╰─ export\n│     ╰─ knowledge ${absentHome} [awaiting receiver activation]\n╰─ summary: ROUTES=1\n`
    })

    // Members the Capital no longer lists are stated as skipped rather than dropped.
    await territory(box, [])
    const unlisted = (member: string) =>
      `skipped: ${member.slice('https://github.com/'.length)} (territory Capital ${capitalHome} does not list ${member} as a member)`
    expect(await box.run('ki repo --estate trade routes list')).toEqual({
      exitCode: 0,
      output: `╭─ KI TRADE ROUTES\n╰─ routes: none\n${unlisted(sourceHome)}\n${unlisted(receiverHome)}\nsummary: ROUTES=0 ACTIVE=0 INCOMPLETE=0 SKIPPED=2\n`
    })

    await territory(box, [{ from: [sourceHome], to: [receiverHome], kinds: ['work'] }])
    // A receiver whose declaration names no Capital is invalid, so it is no trade endpoint.
    await box.project.write(
      'receiver/.ki.toml',
      `[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\nrepository = "${receiverHome}"\n`
    )
    expect(await box.run('ki repo --estate trade routes list')).toEqual({
      exitCode: 0,
      output:
        '╭─ KI TRADE ROUTES\n╭──────────────────┬─────────────────────────────────────────┬────────────────╮\n│ example/receiver │ → —                                     │ example/source │\n│                  ├─────────────────────────────────────────┤                │\n│                  │ ← ⚒ work [awaiting receiver activation] │                │\n╰──────────────────┴─────────────────────────────────────────┴────────────────╯\nsummary: ROUTES=1 ACTIVE=0 INCOMPLETE=1\n'
    })
  })

  test('states a trading member whose Capital is unavailable in every aggregate view instead of dropping it', async () => {
    const { box, source, receiver, capital } = await configuredPair()
    const elsewhereHome = home('example/elsewhere')
    const created = await createTrade(box, 'work')
    const id = /TRD-[0-9a-f]{8}/u.exec(created.output)?.[0] as string
    const baselineJson = await box.run('ki repo --estate trade routes list --format json')
    const baselineList = await box.run('ki repo --estate trade list')
    const orphan = await box.project.mkdir('orphan')
    await box.project.write('orphan/.ki.toml', memberConfiguration('example/orphan', { capital: elsewhereHome }))
    await configureEstate(box, [source, receiver, capital, orphan])
    const unavailable = `territory policy lives in ${elsewhereHome}, not available here`
    const skipped = `skipped: example/orphan (${unavailable})`

    // Text states each skip beside the evidence and counts it in the summary.
    const routes = await box.run('ki repo --estate trade routes list')
    expect(routes.exitCode).toBe(0)
    expect(routes.output.split('\n').slice(-3)).toEqual([
      skipped,
      'summary: ROUTES=1 ACTIVE=1 INCOMPLETE=0 SKIPPED=1',
      ''
    ])

    // JSON keeps the versioned contract byte-identical and states the skip on standard error.
    const json = await box.run('ki repo --estate trade routes list --format json')
    expect(json.exitCode).toBe(0)
    expect(json.stdout).toBe(baselineJson.stdout)
    expect(json.stderr).toBe(`${skipped}\n`)

    // The aggregate trade inventory and show view state the skip rather than omit the member.
    const listed = await box.run('ki repo --estate trade list')
    expect(listed.exitCode).toBe(0)
    expect(listed.output).toBe(
      baselineList.output.replace(
        /╰─ summary: (.*)\n$/u,
        (_line, summary: string) => `├─ ${skipped}\n╰─ summary: ${summary} SKIPPED=1\n`
      )
    )
    const shown = await box.run(['ki', 'repo', '--estate', 'trade', 'show', id])
    expect(shown.exitCode).toBe(0)
    expect(shown.stderr).toBe(`${skipped}\n`)
    expect(shown.stdout).toContain(`Repository: ${sourceHome} [export]`)

    // Selected alone, the member fails closed instead of reporting an empty inventory.
    box.cd('orphan')
    expect(await box.run('ki repo trade list --direction export')).toEqual({
      exitCode: 2,
      output: `ki: error: ${unavailable}\n`
    })
    expect(await box.run(['ki', 'repo', 'trade', 'show', id])).toEqual({
      exitCode: 2,
      output: `ki: error: ${unavailable}\n`
    })
    box.cd('..')
  })

  test('rejects ambiguous cleanup grammar, reports an already-received copy, and marks prune eligibility', async () => {
    const { box } = await configuredPair()
    const created = await createTrade(box, 'work')
    const id = /TRD-[0-9a-f]{8}/u.exec(created.output)?.[0] as string

    expect(await box.run(['ki', 'repo', 'trade', 'release', id, '--eligible'])).toEqual({
      exitCode: 2,
      output: 'ki: error: ki repo trade release accepts either one trade id or --eligible\n'
    })
    expect(await box.run(['ki', 'repo', 'trade', 'prune'])).toEqual({
      exitCode: 2,
      output: 'ki: error: ki repo trade prune requires one trade id or --eligible\n'
    })

    box.cd('receiver')
    const received = await box.run(['ki', 'repo', 'trade', 'receive', id])
    const repeated = await box.run(['ki', 'repo', 'trade', 'receive', id])
    expect(received).toEqual({ exitCode: 0, output: `ki repo trade receive: received ${id}\n` })
    expect(repeated).toEqual({ exitCode: 0, output: `ki repo trade receive: existing ${id}\n` })

    const inboundPath = `receiver/+/_TRADES/example/source/${id}.md`
    await box.project.write(
      inboundPath,
      (await box.project.read(inboundPath)).replace(
        'decision_status: unconsidered',
        'decision_status: adopted\nadopted_as: "KI-LOCAL-001"'
      )
    )
    box.cd('..')
    expect((await box.run(['ki', 'repo', 'trade', 'release', id])).exitCode).toBe(0)
    expect((await box.run('ki repo --estate trade list --direction import')).output).toContain(
      `${id} import [✓ prune] ← [⚒ work] source [adopted] Route contract`
    )
  })

  test('skips absent submission directories and peers that declare no trade routes', async () => {
    const { box } = await configuredPair()
    box.cd('receiver')
    const beforeAnySubmission = await box.run(['ki', 'repo', 'trade', 'receive', '--all'])
    box.cd('..')
    await box.project.write(
      '.ki.toml',
      `[repo]\nharnesses = ["example/harness"]\n\n[skills.ki-repo-project]\n\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\nrepository = "${sourceHome}"\n`
    )
    box.cd('receiver')
    const unavailable = await box.run(['ki', 'repo', 'trade', 'receive', 'TRD-00000000'])
    const previewed = await box.run(['ki', 'repo', 'trade', 'receive', '--all'])
    const observed = await box.run(['ki', 'repo', 'trade', 'observe', 'TRD-00000000'])

    expect(beforeAnySubmission.output).toContain('0 eligible trades')
    expect(unavailable.output).toContain('is unavailable or ambiguous')
    expect(previewed.output).toContain('0 eligible trades')
    expect(observed.output).toContain('is unavailable or ambiguous')
  })

  test('ignores submission files that are not named for a trade identifier', async () => {
    const { box } = await configuredPair()
    await box.project.write('-/_TRADES/example/receiver/notes.md', 'not a trade record\n')
    box.cd('receiver')

    expect((await box.run(['ki', 'repo', 'trade', 'receive', '--all'])).output).toContain('0 eligible trades')
  })

  test('previews an eligible batch that excludes a submission the receiver has not recorded', async () => {
    const { box } = await configuredPair()
    const created = await createTrade(box, 'work')
    const id = /TRD-[0-9a-f]{8}/u.exec(created.output)?.[0] as string

    const previewed = await box.run(['ki', 'repo', 'trade', 'release', '--eligible'])

    expect(previewed).toEqual({ exitCode: 0, output: 'ki repo trade release --eligible: 0 eligible trades\n' })
    expect(await box.project.read(`-/_TRADES/example/receiver/${id}.md`)).toContain('kind: work')
  })

  test('holds a completion trade while the linked receiver work is not yet done', async () => {
    const { box } = await configuredPair()
    const created = await createTrade(box, 'work', { observation: 'completion' })
    const id = /TRD-[0-9a-f]{8}/u.exec(created.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'repo', 'trade', 'receive', id])
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

    expect((await box.run(['ki', 'repo', 'trade', 'release', id])).output).toContain(
      'cannot be released before its completion observation policy is satisfied'
    )
  })

  test('refuses to read a trade peer without a usable committed HEAD or a committed record', async () => {
    const { box } = await configuredPair()
    const created = await createTrade(box, 'work')
    const id = /TRD-[0-9a-f]{8}/u.exec(created.output)?.[0] as string
    box.cd('receiver')

    box.setRunner(async () => ({ exitCode: 1, output: 'fatal: not a git repository\n' }))
    const withoutHead = await box.run(['ki', 'repo', 'trade', 'receive', id])
    box.setRunner(async (_command, arguments_) =>
      arguments_[2] === 'rev-parse'
        ? { exitCode: 0, output: `${'a'.repeat(40)}\n` }
        : { exitCode: 1, output: 'fatal: path does not exist\n' }
    )
    const withoutRecord = await box.run(['ki', 'repo', 'trade', 'receive', id])

    expect(withoutHead.output).toContain('has no usable committed HEAD')
    expect(withoutRecord.output).toContain(`is not committed at ${'a'.repeat(40)}`)
  })

  test('reports a prior observation reference that cannot be compared with committed history', async () => {
    const { box } = await configuredPair()
    const prepared = await box.run(prepareTrade('work'))
    const id = /TRD-[0-9a-f]{8}/u.exec(prepared.output)?.[0] as string
    box.cd('receiver')
    const first = await box.run(['ki', 'repo', 'trade', 'observe', id])
    const second = await box.run(['ki', 'repo', 'trade', 'observe', id])
    box.setRunner(async (_command, arguments_) =>
      arguments_[2] === 'show'
        ? { exitCode: 0, output: await readFile(join(box.project.path, (arguments_[3] as string).slice(41)), 'utf8') }
        : arguments_[2] === 'diff'
          ? { exitCode: 1, output: 'fatal: bad revision\n' }
          : { exitCode: 0, output: `${'a'.repeat(40)}\n` }
    )
    const undiffable = await box.run(['ki', 'repo', 'trade', 'observe', id])

    expect(first.output).toContain('first observation has no prior committed reference')
    expect(second.output).toContain('the prior reference is not comparable with the current committed history')
    expect(undiffable.output).toContain(`verbatim ${'a'.repeat(40)}`)
  })

  test('releases an unattended submission without waiting for a receiver decision', async () => {
    const { box } = await configuredPair()
    const created = await createTrade(box, 'work', { observation: 'unattended' })
    const id = /TRD-[0-9a-f]{8}/u.exec(created.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'repo', 'trade', 'receive', id])
    box.cd('..')

    expect(await box.run(['ki', 'repo', 'trade', 'release', id])).toEqual({
      exitCode: 0,
      output: `ki repo trade release: released ${id}\n`
    })
  })

  test('keeps listing an existing trade after the Capital withdraws another kind of channel', async () => {
    const { box } = await configuredPair()
    const created = await createTrade(box, 'knowledge')
    const id = /TRD-[0-9a-f]{8}/u.exec(created.output)?.[0] as string
    await territory(box, [{ from: [sourceHome], to: [receiverHome], kinds: ['knowledge'] }])

    const listed = await box.run('ki repo trade list')
    expect(listed.exitCode).toBe(0)
    expect(listed.output).toContain(id)
    expect(await box.run('ki repo trade routes check')).toEqual({
      exitCode: 0,
      output: `╭─ KI TRADE ROUTE CHECK\n├─ routes (1)\n│  ╰─ export knowledge ${receiverHome}: active\n╰─ summary: ROUTES=1 ACTIVE=1\n`
    })
  })

  test('refuses release when the export route is no longer active or no longer declared', async () => {
    const { box, source, receiver, capital } = await configuredPair()
    const created = await createTrade(box, 'work')
    const id = /TRD-[0-9a-f]{8}/u.exec(created.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'repo', 'trade', 'receive', id])
    box.cd('..')

    // The receiver moves to another registered territory, so the source's route stops resolving.
    const capitalB = await writeCapital(
      box,
      { identity: 'example/capital-b', members: [home('example/capital-b'), receiverHome] },
      'capital-b'
    )
    await box.project.write(
      'receiver/.ki.toml',
      memberConfiguration('example/receiver', { capital: home('example/capital-b') })
    )
    await configureEstate(box, [source, receiver, capital, capitalB])
    const inactive = await box.run(['ki', 'repo', 'trade', 'release', id])
    await territory(box, [{ from: [sourceHome], to: [receiverHome], kinds: ['knowledge'] }])
    const undeclared = await box.run(['ki', 'repo', 'trade', 'release', id])

    expect(inactive).toEqual({
      exitCode: 2,
      output: `ki: error: export work trade route ${receiverHome} is awaiting receiver\n`
    })
    expect(undeclared).toEqual({
      exitCode: 2,
      output: `ki: error: export work trade route ${receiverHome} is not granted by the territory policy\n`
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
      expect((await box.run('ki repo trade list')).output).toContain(message)
    }
  })

  test('rejects receiver fields that contradict the recorded decision status', async () => {
    const { box } = await configuredPair()
    const work = await createTrade(box, 'work')
    const workId = /TRD-[0-9a-f]{8}/u.exec(work.output)?.[0] as string
    const knowledge = await createTrade(box, 'knowledge')
    const knowledgeId = /TRD-[0-9a-f]{8}/u.exec(knowledge.output)?.[0] as string
    box.cd('receiver')
    await box.run(['ki', 'repo', 'trade', 'receive', workId])
    await box.run(['ki', 'repo', 'trade', 'receive', knowledgeId])
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
      expect((await box.run('ki repo trade list')).output).toContain(message)
    }
  })
})
