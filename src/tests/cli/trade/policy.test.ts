import { realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'
import {
  capitalHome,
  home,
  memberConfiguration,
  registerEstate,
  type TerritoryFixture,
  writeCapital
} from '../_territory_helper.ts'

type Box = Awaited<ReturnType<typeof sandbox>>

const sourceHome = home('example/source')
const receiverHome = home('example/receiver')
const capitalBHome = home('example/capital-b')
const pair = { from: [sourceHome], to: [receiverHome], kinds: ['work', 'knowledge'] } as const

const list = (values: readonly string[]): string => `[${values.map((value) => JSON.stringify(value)).join(', ')}]`

/** A source and receiver member, plus a registered Capital granting `territory`. */
const territoryBox = async (territory: TerritoryFixture = { channels: [pair] }) => {
  const box = await sandbox()
  const source = await realpath(box.project.path)
  const receiver = await box.project.mkdir('receiver')
  await box.project.write('.ki.toml', memberConfiguration('example/source'))
  await box.project.write('receiver/.ki.toml', memberConfiguration('example/receiver'))
  const capital = await writeCapital(box, territory)
  await registerEstate(box, [source, receiver, capital])
  return { box, source, receiver, capital }
}

/** Adds a checkout under `directory` holding `configuration` and returns its root. */
const checkout = async (box: Box, directory: string, configuration: string): Promise<string> => {
  const root = await box.project.mkdir(directory)
  await box.project.write(`${directory}/.ki.toml`, configuration)
  return root
}

const failure = (message: string) => ({ exitCode: 2, output: `ki: error: ${message}\n` })

// Raw Capital declarations for the policy parser refusals.
const capitalHeader = memberConfiguration('example/capital', { trades: false })
const membersLine = `members = ${list([capitalHome, receiverHome, sourceHome])}`
const territoryTable = (body = `name = "Example territory"\n${membersLine}`) =>
  `${capitalHeader}\n[skills.ki-repo.territory]\n${body}\n`
const withPolicy = (policy: string) => `${territoryTable()}\n[skills.ki-trades]\n${policy}\n`
const table = (header: string, fields: Readonly<Record<string, string | undefined>>) =>
  `\n[[${header}]]\n${Object.entries(fields)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${key} = ${value}`)
    .join('\n')}\n`
const channel = (overrides: Readonly<Record<string, string | undefined>> = {}) =>
  table('skills.ki-trades.territory.channels', {
    id: '"delivery"',
    purpose: '"Delivery."',
    from: list([sourceHome]),
    to: list([receiverHome]),
    kinds: '["work", "knowledge"]',
    ...overrides
  })
const subtypes = '\n[skills.ki-trades.territory.subtypes]\nrelease-notes = "Release notes."\n'
const standing = (overrides: Readonly<Record<string, string | undefined>> = {}) =>
  table('skills.ki-trades.territory.standing', {
    subtype: '"release-notes"',
    from: list([sourceHome]),
    to: list([receiverHome]),
    ...overrides
  })

describe('[ki repo trade policy]', () => {
  test('rejects malformed Capital territory and trade policies before resolving any route', async () => {
    const { box, capital } = await territoryBox()
    const path = join(capital, '.ki.toml')
    const T = '[skills.ki-repo.territory]'
    const P = '[skills.ki-trades.territory]'
    const C = '[[skills.ki-trades.territory.channels]]'
    const S = '[[skills.ki-trades.territory.standing]]'
    const repositories = 'must be a non-empty array of canonical HTTPS GitHub repositories'
    const kinds = 'channel delivery.kinds must be a non-empty array of work or knowledge'
    const uncovered = (from: string, to: string) => `standing grant #1 needs a knowledge channel from ${from} to ${to}`
    const outsider = home('example/outsider')
    const cases: readonly (readonly [string, string])[] = [
      // Membership: the Capital must publish one well-formed territory table that lists itself.
      [capitalHeader, `is a territory Capital and must declare ${T}`],
      [`${capitalHeader}territory = "none"\n`, `${T} must be a table`],
      [territoryTable(`name = "Example territory"\n${membersLine}\nextra = 1`), `${T} has unrecognised key extra`],
      [territoryTable('name = "Example territory"'), `${T} must declare members`],
      [territoryTable(`name = " "\n${membersLine}`), `${T}.name must be a non-empty string`],
      [territoryTable(`name = 7\n${membersLine}`), `${T}.name must be a non-empty string`],
      [territoryTable('name = "Example territory"\nmembers = []'), `${T}.members ${repositories}`],
      [territoryTable('name = "Example territory"\nmembers = "all"'), `${T}.members ${repositories}`],
      [territoryTable('name = "Example territory"\nmembers = [1]'), `${T}.members ${repositories}`],
      [
        territoryTable(`name = "Example territory"\nmembers = ["https://github.com/Example/Capital"]`),
        `${T}.members ${repositories}`
      ],
      [
        territoryTable(`name = "Example territory"\nmembers = ${list([capitalHome, capitalHome])}`),
        `${T}.members must not repeat a repository`
      ],
      [
        territoryTable(`name = "Example territory"\nmembers = ${list([sourceHome])}`),
        `${T}.members must include the Capital itself`
      ],
      // Policy shape.
      [withPolicy('territory = "none"'), `${P} must be a table`],
      [withPolicy('\n[skills.ki-trades.territory]\nroutes = []'), `${P} has unrecognised key routes`],
      [
        withPolicy('\n[skills.ki-trades.territory]\nsubtypes = "none"'),
        '[skills.ki-trades.territory.subtypes] must be a subtype-to-description table'
      ],
      [
        withPolicy('\n[skills.ki-trades.territory.subtypes]\nRelease = "Release notes."'),
        'knowledge subtype Release must use a lower-case hyphenated identifier'
      ],
      [
        withPolicy('\n[skills.ki-trades.territory.subtypes]\nrelease-notes = " "'),
        'knowledge subtype release-notes must have a non-empty description'
      ],
      [
        withPolicy('\n[skills.ki-trades.territory.subtypes]\nrelease-notes = 1'),
        'knowledge subtype release-notes must have a non-empty description'
      ],
      [withPolicy('\n[skills.ki-trades.territory]\nchannels = "none"'), `${C} must be an array of tables`],
      [withPolicy('\n[skills.ki-trades.territory]\nchannels = ["none"]'), `${C} must be an array of tables`],
      [withPolicy('\n[skills.ki-trades.territory]\nstanding = [1]'), `${S} must be an array of tables`],
      // Channels.
      [withPolicy(channel({ purpose: undefined })), 'channel delivery must declare purpose'],
      [withPolicy(channel({ extra: '1' })), 'channel delivery has unrecognised key extra'],
      [withPolicy(channel({ id: '1' })), 'channel #1 id must use a lower-case hyphenated identifier'],
      [withPolicy(channel({ id: '"Delivery"' })), 'channel Delivery id must use a lower-case hyphenated identifier'],
      [
        withPolicy(channel() + channel({ from: list([receiverHome]), to: list([sourceHome]) })),
        'channel delivery id is declared twice'
      ],
      [withPolicy(channel({ purpose: '" "' })), 'channel delivery purpose must be a non-empty string'],
      [withPolicy(channel({ from: '[]' })), `channel delivery.from ${repositories}`],
      [
        withPolicy(channel({ to: list([receiverHome, receiverHome]) })),
        'channel delivery.to must not repeat a repository'
      ],
      [
        withPolicy(channel({ to: list([receiverHome, sourceHome]) })),
        `channel delivery names ${sourceHome} as both source and receiver`
      ],
      [
        withPolicy(channel({ to: list([outsider]) })),
        `channel delivery names ${outsider}, which is not a territory member`
      ],
      [withPolicy(channel({ kinds: '[]' })), kinds],
      [withPolicy(channel({ kinds: '"work"' })), kinds],
      [withPolicy(channel({ kinds: '["trade"]' })), kinds],
      [withPolicy(channel({ kinds: '[1]' })), kinds],
      [withPolicy(channel({ kinds: '["work", "work"]' })), 'channel delivery.kinds must not repeat a trade kind'],
      [
        withPolicy(channel() + channel({ id: '"second"', kinds: '["work"]' })),
        `channel second repeats the work route ${sourceHome} -> ${receiverHome} from channel delivery`
      ],
      // Standing grants.
      [withPolicy(subtypes + channel() + standing({ to: undefined })), 'standing grant #1 must declare to'],
      [withPolicy(subtypes + channel() + standing({ extra: '1' })), 'standing grant #1 has unrecognised key extra'],
      [
        withPolicy(subtypes + channel() + standing({ subtype: '"other"' })),
        'standing grant #1 subtype must name a subtype the policy defines'
      ],
      [
        withPolicy(subtypes + channel() + standing({ subtype: '1' })),
        'standing grant #1 subtype must name a subtype the policy defines'
      ],
      [
        withPolicy(subtypes + channel() + standing({ to: list([outsider]) })),
        `standing grant #1 names ${outsider}, which is not a territory member`
      ],
      [
        withPolicy(subtypes + channel() + standing({ from: list([receiverHome]), to: list([sourceHome]) })),
        uncovered(receiverHome, sourceHome)
      ],
      [withPolicy(subtypes + channel({ kinds: '["work"]' }) + standing()), uncovered(sourceHome, receiverHome)],
      [
        withPolicy(subtypes + channel() + standing() + standing()),
        `standing grant #2 repeats release-notes from ${sourceHome} to ${receiverHome}`
      ]
    ]

    for (const [contents, detail] of cases) {
      await box.project.write('capital/.ki.toml', contents)
      expect(await box.run('ki repo trade routes list')).toEqual(
        failure(`territory Capital ${capitalHome} is invalid: ${path} ${detail}`)
      )
    }
  })

  test('fails closed unless the declared Capital resolves uniquely to a Capital listing the member', async () => {
    const box = await sandbox()
    const source = await realpath(box.project.path)
    const receiver = await checkout(box, 'receiver', memberConfiguration('example/receiver'))
    await box.project.write('.ki.toml', memberConfiguration('example/source'))
    const unavailable = failure(`territory policy lives in ${capitalHome}, not available here`)

    // The Capital is not checked out here: never silently "no routes".
    await registerEstate(box, [source, receiver])
    expect(await box.run('ki repo trade routes list')).toEqual(unavailable)
    expect(await box.run('ki repo trade routes check')).toEqual(unavailable)
    expect(await box.run('ki repo trade policy show')).toEqual(unavailable)
    expect(await box.run('ki repo trade policy check')).toEqual(unavailable)

    // Registered twice.
    const capital = await writeCapital(box, { channels: [pair] })
    // The registry refuses duplicate entries, so the copy claims the Capital only after registration.
    const copy = await box.project.mkdir('capital-copy')
    await registerEstate(box, [source, receiver, capital, copy])
    await writeCapital(box, { channels: [pair] }, 'capital-copy')
    expect(await box.run('ki repo trade routes list')).toEqual(
      failure(`territory Capital ${capitalHome} is registered more than once`)
    )

    // The checkout claiming the Capital's identity names another Capital, so it is no Capital.
    await registerEstate(box, [source, receiver, capital])
    await box.project.write('capital/.ki.toml', memberConfiguration('example/capital', { capital: capitalBHome }))
    expect(await box.run('ki repo trade policy show')).toEqual(
      failure(`${capitalHome} does not declare itself a territory Capital`)
    )

    // A Capital that does not list the member.
    await writeCapital(box, { members: [capitalHome, receiverHome] })
    expect(await box.run('ki repo trade routes check')).toEqual(
      failure(`territory Capital ${capitalHome} does not list ${sourceHome} as a member`)
    )

    // Policy inspection needs only a resolved Capital; route inspection also needs [skills.ki-trades].
    await writeCapital(box, { channels: [pair] })
    await box.project.write('.ki.toml', memberConfiguration('example/source', { trades: false }))
    expect((await box.run('ki repo trade policy show')).exitCode).toBe(0)
    expect(await box.run('ki repo trade routes list')).toEqual(
      failure(`${join(source, '.ki.toml')} does not declare [skills.ki-trades]`)
    )
  })

  test('keeps two territories in one registry apart and leaves cross-territory routes pending', async () => {
    const eastHome = home('example/east')
    const westHome = home('example/west')
    const { box, source, receiver, capital } = await territoryBox({
      members: [capitalHome, eastHome, receiverHome, sourceHome],
      channels: [pair, { from: [sourceHome], to: [eastHome], kinds: ['knowledge'] }]
    })
    const capitalB = await writeCapital(
      box,
      {
        identity: 'example/capital-b',
        name: 'Second territory',
        channels: [{ from: [eastHome], to: [westHome], kinds: ['work'] }]
      },
      'capital-b'
    )
    const east = await checkout(box, 'east', memberConfiguration('example/east', { capital: capitalBHome }))
    const west = await checkout(box, 'west', memberConfiguration('example/west', { capital: capitalBHome }))
    await registerEstate(box, [source, receiver, capital, capitalB, east, west])

    // The source's Capital lists east, but east resolves another Capital, so that route stays pending.
    expect(await box.run('ki repo trade routes check')).toEqual({
      exitCode: 0,
      output: [
        '╭─ KI TRADE ROUTE CHECK',
        '├─ routes (3)',
        `│  ├─ export work ${receiverHome}: active`,
        `│  ├─ export knowledge ${eastHome}: awaiting receiver activation`,
        `│  ╰─ export knowledge ${receiverHome}: active`,
        '╰─ summary: ROUTES=3 ACTIVE=2',
        ''
      ].join('\n')
    })
    box.cd('east')
    expect(await box.run('ki repo trade routes check')).toEqual({
      exitCode: 0,
      output: `╭─ KI TRADE ROUTE CHECK\n├─ routes (1)\n│  ╰─ export work ${westHome}: active\n╰─ summary: ROUTES=1 ACTIVE=1\n`
    })
    expect((await box.run('ki repo trade policy show')).output).toContain(
      `│  ├─ capital: ${capitalBHome}\n│  ╰─ territory: Second territory (3 members)\n`
    )
  })

  test('shows the resolved Capital policy with sorted subtypes and empty sections', async () => {
    const { box } = await territoryBox({
      channels: [
        { id: 'delivery', ...pair },
        { id: 'fan-out', from: [receiverHome], to: [capitalHome, sourceHome], kinds: ['work'] }
      ],
      subtypes: { 'zeta-notes': 'Zeta.', 'alpha-notes': 'Alpha.' },
      standing: [{ subtype: 'alpha-notes', from: [sourceHome], to: [receiverHome] }]
    })
    expect(await box.run('ki repo trade policy show')).toEqual({
      exitCode: 0,
      output: [
        '╭─ KI TRADE POLICY',
        `│  ├─ capital: ${capitalHome}`,
        '│  ╰─ territory: Example territory (3 members)',
        '├─ channels (2)',
        '│  ├─ delivery [work, knowledge]: example/source -> example/receiver',
        '│  ╰─ fan-out [work]: example/receiver -> example/capital, example/source',
        '├─ standing (1)',
        '│  ╰─ alpha-notes: example/source -> example/receiver',
        '├─ subtypes (2)',
        '│  ├─ alpha-notes: Alpha.',
        '│  ╰─ zeta-notes: Zeta.',
        '╰─ summary: CHANNELS=2 STANDING=1 SUBTYPES=2',
        ''
      ].join('\n')
    })

    await writeCapital(box, { members: [capitalHome, receiverHome, sourceHome] })
    box.cd('capital')
    expect(await box.run('ki repo trade policy show')).toEqual({
      exitCode: 0,
      output: [
        '╭─ KI TRADE POLICY',
        `│  ├─ capital: ${capitalHome}`,
        '│  ╰─ territory: Example territory (3 members)',
        '├─ channels (0)',
        '│  ╰─ none',
        '├─ standing (0)',
        '│  ╰─ none',
        '├─ subtypes (0)',
        '│  ╰─ none',
        '╰─ summary: CHANNELS=0 STANDING=0 SUBTYPES=0',
        ''
      ].join('\n')
    })
  })

  test('checks every member and claimant against the Capital policy through the local registry', async () => {
    const id = (name: string) => home(`example/${name}`)
    const members = ['absent', 'broken', 'capital', 'foreign', 'idle', 'quiet', 'receiver', 'silent', 'source', 'twice']
    const { box, source, receiver, capital } = await territoryBox({
      members: members.map(id),
      channels: [{ from: [sourceHome], to: [receiverHome, id('silent')], kinds: ['work'] }]
    })
    const roots = [
      source,
      receiver,
      capital,
      await checkout(box, 'broken', memberConfiguration('example/broken', { mapBonus: 9 })),
      await checkout(box, 'foreign', memberConfiguration('example/foreign', { capital: capitalBHome })),
      await checkout(box, 'idle', memberConfiguration('example/idle')),
      await checkout(box, 'quiet', memberConfiguration('example/quiet', { trades: false })),
      await checkout(box, 'silent', memberConfiguration('example/silent', { trades: false })),
      await checkout(box, 'twice', memberConfiguration('example/twice')),
      await box.project.mkdir('twice-copy'),
      await checkout(box, 'stray', memberConfiguration('example/stray')),
      await box.project.mkdir('stray-copy'),
      await checkout(box, 'alien', memberConfiguration('example/alien', { trades: false })),
      // An invalid claimant names no Capital the sweep can trust.
      await checkout(box, 'invalid', memberConfiguration('example/invalid', { mapBonus: 9 }))
    ]
    await registerEstate(box, roots)
    // Second checkouts of one repository claim it only after registration, as the registry refuses duplicates.
    await box.project.write('twice-copy/.ki.toml', memberConfiguration('example/twice'))
    await box.project.write('stray-copy/.ki.toml', memberConfiguration('example/stray'))

    expect(await box.run('ki repo trade policy check')).toEqual({
      exitCode: 1,
      output: [
        '╭─ KI TRADE POLICY CHECK',
        `│  ╰─ capital: ${capitalHome}`,
        '├─ members (12)',
        '│  ├─ example/absent: unverifiable (not checked out here)',
        `│  ├─ example/broken: failing (${join(roots[3] as string, '.ki.toml')} [skills.ki-trades].map_bonus must be an integer from 0 through 3)`,
        '│  ├─ example/capital: warning (declares [skills.ki-trades] but no channel names it)',
        `│  ├─ example/foreign: failing (declares Capital ${capitalBHome})`,
        '│  ├─ example/idle: warning (declares [skills.ki-trades] but no channel names it)',
        '│  ├─ example/quiet: conforming',
        '│  ├─ example/receiver: conforming',
        '│  ├─ example/silent: failing (named by a channel but does not declare [skills.ki-trades])',
        '│  ├─ example/source: conforming',
        '│  ├─ example/twice: failing (registered more than once)',
        '│  ├─ example/alien: failing (claims this Capital but is not a listed member)',
        '│  ╰─ example/stray: failing (claims this Capital but is not a listed member)',
        '╰─ summary: MEMBERS=12 CONFORMING=3 WARNING=2 FAILING=6 UNVERIFIABLE=1',
        'ki: error: trade policy check found 6 failing repositories',
        ''
      ].join('\n')
    })
  })

  test('passes a territory check whose members only conform or warn', async () => {
    const { box } = await territoryBox()
    expect(await box.run('ki repo trade policy check')).toEqual({
      exitCode: 0,
      output: [
        '╭─ KI TRADE POLICY CHECK',
        `│  ╰─ capital: ${capitalHome}`,
        '├─ members (3)',
        '│  ├─ example/capital: warning (declares [skills.ki-trades] but no channel names it)',
        '│  ├─ example/receiver: conforming',
        '│  ╰─ example/source: conforming',
        '╰─ summary: MEMBERS=3 CONFORMING=2 WARNING=1 FAILING=0 UNVERIFIABLE=0',
        ''
      ].join('\n')
    })
  })

  test('compares saved active routes with the routes the current Capital policies make active', async () => {
    const { box, source } = await territoryBox()
    const saved = await box.run('ki repo --estate trade routes list --format json')
    await box.project.write('baseline.json', saved.output)
    const comparison = (lost: readonly string[], added: readonly string[], covered: number) =>
      [
        '╭─ KI TRADE POLICY COMPARISON',
        `├─ lost (${lost.length})`,
        ...(lost.length
          ? lost.map((edge, index) => `│  ${index === lost.length - 1 ? '╰' : '├'}─ ${edge}`)
          : ['│  ╰─ none']),
        `├─ added (${added.length})`,
        ...(added.length
          ? added.map((edge, index) => `│  ${index === added.length - 1 ? '╰' : '├'}─ ${edge}`)
          : ['│  ╰─ none']),
        `╰─ summary: COVERED=${covered} LOST=${lost.length} ADDED=${added.length}`
      ].join('\n')

    // Both directions of an edge collapse to one `exporter -> importer kind` entry.
    expect(await box.run('ki repo trade policy compare --baseline baseline.json')).toEqual({
      exitCode: 0,
      output: `${comparison([], [], 2)}\n`
    })

    await writeCapital(box, {
      channels: [
        { from: [sourceHome], to: [receiverHome], kinds: ['work'] },
        { from: [receiverHome], to: [sourceHome], kinds: ['knowledge'] }
      ]
    })
    expect(
      await box.run(['ki', 'repo', 'trade', 'policy', 'compare', '--baseline', join(source, 'baseline.json')])
    ).toEqual({
      exitCode: 1,
      output: `${comparison([`${sourceHome} -> ${receiverHome} knowledge`], [`${receiverHome} -> ${sourceHome} knowledge`], 1)}\nki: error: trade policy comparison lost 1 active routes\n`
    })

    // Inactive baseline routes are not commitments; import records name the edge from the peer.
    await writeCapital(box, { channels: [pair] })
    await box.project.write(
      'baseline.json',
      JSON.stringify({
        schema: 'ki/trade-routes/v1',
        routes: [
          {
            source: { repository: sourceHome },
            peer: { repository: home('example/absent') },
            direction: 'export',
            kind: 'work',
            state: 'awaiting-receiver'
          },
          {
            source: { repository: receiverHome },
            peer: { repository: sourceHome },
            direction: 'import',
            kind: 'knowledge',
            state: 'active'
          },
          { source: { repository: sourceHome }, peer: { repository: receiverHome }, kind: 'work', state: 'active' }
        ]
      })
    )
    expect(await box.run('ki repo trade policy compare --baseline baseline.json')).toEqual({
      exitCode: 0,
      output: `${comparison([], [], 2)}\n`
    })
  })

  test('rejects unreadable, non-JSON, wrong-contract, and malformed comparison baselines', async () => {
    const { box, source } = await territoryBox()
    const path = join(source, 'baseline.json')
    expect(await box.run(['ki', 'repo', 'trade', 'policy', 'compare', '--baseline', ' '])).toEqual(
      failure('--baseline is required and must be non-empty')
    )
    expect(await box.run('ki repo trade policy compare')).toMatchObject({
      exitCode: 2,
      output: expect.stringContaining("required option '--baseline <path>' not specified")
    })
    expect(await box.run('ki repo trade policy compare --baseline baseline.json')).toEqual(
      failure(`${path} cannot be read`)
    )

    const route = { source: { repository: sourceHome }, peer: { repository: receiverHome }, state: 'active' }
    const cases: readonly (readonly [string, string])[] = [
      ['{not json', 'must be valid JSON'],
      ['[]', 'must be a ki/trade-routes/v1 report'],
      ['{"schema":"ki/trade-routes/v0","routes":[]}', 'must be a ki/trade-routes/v1 report'],
      ['{"schema":"ki/trade-routes/v1","routes":{}}', 'must be a ki/trade-routes/v1 report'],
      ['{"schema":"ki/trade-routes/v1","routes":[1]}', 'contains a malformed route'],
      [
        JSON.stringify({ schema: 'ki/trade-routes/v1', routes: [{ ...route, source: 'x' }] }),
        'contains a malformed route'
      ],
      [
        JSON.stringify({ schema: 'ki/trade-routes/v1', routes: [{ ...route, peer: null }] }),
        'contains a malformed route'
      ]
    ]
    for (const [contents, detail] of cases) {
      await box.project.write('baseline.json', contents)
      expect(await box.run('ki repo trade policy compare --baseline baseline.json')).toEqual(
        failure(`${path} ${detail}`)
      )
    }
  })

  test('retires the repository-local standing and subtype mutators', async () => {
    const { box } = await territoryBox()
    for (const [argv, parent] of [
      [['standing', 'add', sourceHome], 'ki repo trade standing'],
      [['standing', 'remove', sourceHome], 'ki repo trade standing'],
      [['subtypes', 'list'], 'ki repo trade'],
      [['subtypes', 'add', 'release-notes'], 'ki repo trade']
    ] as const) {
      expect(await box.run(['ki', 'repo', 'trade', ...argv])).toMatchObject({
        exitCode: 2,
        output: expect.stringContaining(
          `unknown subcommand '${argv[0] === 'standing' ? argv[1] : argv[0]}' for '${parent}'`
        )
      })
    }
  })
})
