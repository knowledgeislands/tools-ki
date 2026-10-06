import { realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { sandbox } from '../_cli_helper.ts'
import {
  capitalHome,
  home,
  memberConfiguration,
  registerEstate,
  type StandingFixture,
  writeCapital
} from '../_territory_helper.ts'

const sourceHome = home('example/source')
const receiverHome = home('example/receiver')
const commit = 'a'.repeat(40)
const capturedAt = { now: () => Date.UTC(2026, 8, 8, 9, 30, 0) }

const subtypes = {
  'shared-maintenance': 'Shared maintenance evidence.',
  'another-subtype': 'A second territory subtype.'
} as const
const knowledge = { from: [sourceHome], to: [receiverHome], kinds: ['knowledge'] } as const
const grant = (subtype: string): StandingFixture => ({ subtype, from: [sourceHome], to: [receiverHome] })

/** A source and receiver member whose Capital grants a knowledge channel and `standing` grants. */
const fixture = async (standing: readonly StandingFixture[] = [grant('shared-maintenance')]) => {
  const box = await sandbox()
  const source = await realpath(box.project.path)
  const receiver = await box.project.mkdir('receiver')
  await box.project.write('.ki.toml', memberConfiguration('example/source'))
  await box.project.write('docs/source.md', '# Source\n\n## Finding\n')
  await box.project.write('receiver/.ki.toml', memberConfiguration('example/receiver'))
  await box.project.write('receiver/docs/capture file.md', '# Capture\n\n## Source analysis\n')
  await box.project.write('receiver/docs/double.md', '# Double\n\n')
  await box.project.write('receiver/docs/plain.md', '# Plain')
  const capital = await writeCapital(box, { subtypes, channels: [knowledge], standing })
  await registerEstate(box, [source, receiver, capital])
  box.setRunner(async (commandName, arguments_) => {
    if (commandName === 'git' && arguments_[2] === 'cat-file') return { exitCode: 0, output: '' }
    return { exitCode: 1, output: 'unsupported command' }
  })
  return { box, source, receiver, capital }
}

type Box = Awaited<ReturnType<typeof fixture>>['box']

const capture = (
  box: Box,
  target = 'docs/capture file.md#source-analysis',
  options: { subtype?: string; sourceRef?: string } = {}
) =>
  box.run(
    [
      'ki',
      'repo',
      'trade',
      'standing',
      'capture',
      sourceHome,
      '--subtype',
      options.subtype ?? 'shared-maintenance',
      '--source-ref',
      options.sourceRef ?? `${commit}:docs/source.md#finding`,
      '--capture',
      target
    ],
    capturedAt
  )

const grants = (title: string, lines: readonly string[], active: number) =>
  [
    `╭─ KI TRADE STANDING ${title}`,
    `├─ grants (${lines.length})`,
    ...(lines.length
      ? lines.map((line, index) => `│  ${index === lines.length - 1 ? '╰' : '├'}─ ${line}`)
      : ['│  ╰─ none']),
    `╰─ summary: GRANTS=${lines.length} ACTIVE=${active}`,
    ''
  ].join('\n')

const failure = (message: string) => ({ exitCode: 2, output: `ki: error: ${message}\n` })

describe('[ki repo trade standing intake]', () => {
  test('reads exact grants from the Capital policy and appends one commit-pinned receiver-local capture', async () => {
    const { box } = await fixture([grant('shared-maintenance'), grant('another-subtype')])

    expect(await box.run('ki repo trade standing list')).toEqual({
      exitCode: 0,
      output: grants(
        'GRANTS',
        [
          `export knowledge another-subtype ${receiverHome}: active`,
          `export knowledge shared-maintenance ${receiverHome}: active`
        ],
        2
      )
    })
    box.cd('receiver')
    expect(
      await box.run([
        'ki',
        'repo',
        'trade',
        'standing',
        'check',
        sourceHome,
        '--direction',
        'import',
        '--subtype',
        'shared-maintenance'
      ])
    ).toEqual({
      exitCode: 0,
      output: grants('CHECK', [`import knowledge shared-maintenance ${sourceHome}: active`], 1)
    })

    const captured = await capture(box)
    expect(captured.output).toMatch(
      /^ki repo trade standing capture: captured STI-[0-9a-f]{8} in docs\/capture file\.md\n$/u
    )
    const contents = await box.project.read('receiver/docs/capture file.md')
    expect(contents).toContain('<!-- ki-trades:standing-intake -->\n```toml')
    expect(contents).toContain('schema = "ki-trades/standing-intake/v1"')
    expect(contents).toContain(`source = ${JSON.stringify(sourceHome)}`)
    expect(contents).toContain(`source_ref = ${JSON.stringify(`${commit}:docs/source.md#finding`)}`)
    expect(contents).toContain(`receiver = ${JSON.stringify(receiverHome)}`)
    expect(contents).toContain('subtype = "shared-maintenance"')
    expect(contents).toContain('captured_at = "2026-09-08T09:30:00Z"')
    expect(contents).toContain('capture = "docs/capture file.md#source-analysis"')
    for (const target of ['docs/double.md#double', 'docs/plain.md#plain'])
      expect((await capture(box, target)).exitCode).toBe(0)

    // Withdrawing the grant in the Capital withdraws direct-capture authority; the subtype survives.
    await writeCapital(box, { subtypes, channels: [knowledge], standing: [grant('another-subtype')] })
    expect(await box.run('ki repo trade standing list')).toEqual({
      exitCode: 0,
      output: grants('GRANTS', [`import knowledge another-subtype ${sourceHome}: active`], 1)
    })
    expect(await capture(box)).toEqual(
      failure(
        `standing import knowledge subtype shared-maintenance from ${sourceHome} is not granted by the territory policy`
      )
    )
    expect(await box.project.read('docs/source.md')).toBe('# Source\n\n## Finding\n')
  })

  test('keeps a grant pending exactly while its knowledge route is, without touching a peer', async () => {
    const { box, source, receiver, capital } = await fixture()
    box.cd('receiver')
    const pending = (state: string) => ({
      list: {
        exitCode: 0,
        output: grants('GRANTS', [`import knowledge shared-maintenance ${sourceHome}: ${state}`], 0)
      },
      capture: failure(`standing import knowledge subtype shared-maintenance from ${sourceHome} is ${state}`)
    })

    expect(await capture(box, undefined, { subtype: 'other-subtype' })).toEqual(
      failure('knowledge subtype other-subtype is not defined by the territory policy')
    )
    expect(await capture(box, undefined, { subtype: 'Bad_Subtype' })).toEqual(
      failure('--subtype must use a lower-case hyphenated identifier')
    )
    expect(await box.run(['ki', 'repo', 'trade', 'standing', 'check', receiverHome])).toEqual(
      failure(`standing route ${receiverHome} is not granted by the territory policy`)
    )

    // The source stops trading.
    await box.project.write('.ki.toml', memberConfiguration('example/source', { trades: false }))
    expect(await box.run('ki repo trade standing list --incomplete')).toEqual(pending('awaiting sender').list)
    expect(await box.run('ki repo trade standing check')).toEqual({
      exitCode: 0,
      output: grants('CHECK', [`import knowledge shared-maintenance ${sourceHome}: awaiting sender`], 0)
    })
    expect(await capture(box)).toEqual(pending('awaiting sender').capture)

    // The source trades again but resolves another registered Capital.
    const capitalB = await writeCapital(
      box,
      { identity: 'example/capital-b', members: [home('example/capital-b'), sourceHome] },
      'capital-b'
    )
    await box.project.write('.ki.toml', memberConfiguration('example/source', { capital: home('example/capital-b') }))
    await registerEstate(box, [source, receiver, capital, capitalB])
    expect(await box.run('ki repo trade standing list --incomplete')).toEqual(pending('awaiting sender').list)

    // The source is registered twice.
    await box.project.write('.ki.toml', memberConfiguration('example/source'))
    const copy = await box.project.mkdir('source-copy')
    await registerEstate(box, [source, receiver, capital, copy])
    await box.project.write('source-copy/.ki.toml', memberConfiguration('example/source'))
    expect(await capture(box)).toEqual(pending('ambiguous repository').capture)

    // From the source, an unregistered receiver leaves the export grant awaiting the receiver.
    await registerEstate(box, [source, capital])
    box.cd('..')
    expect(await box.run('ki repo trade standing list --incomplete')).toEqual({
      exitCode: 0,
      output: grants('GRANTS', [`export knowledge shared-maintenance ${receiverHome}: awaiting receiver`], 0)
    })
    await registerEstate(box, [source, receiver, capital])
    expect(await box.run('ki repo trade standing list --incomplete')).toEqual({
      exitCode: 0,
      output: grants('GRANTS', [], 0)
    })
    expect(await box.project.read('docs/source.md')).toBe('# Source\n\n## Finding\n')
    expect(await box.project.read('receiver/docs/capture file.md')).toBe('# Capture\n\n## Source analysis\n')
  })

  test('orders grants from several sources and reports each against its own knowledge route', async () => {
    const { box } = await fixture()
    const otherHome = home('example/other')
    await writeCapital(box, {
      subtypes,
      channels: [{ from: [sourceHome, otherHome], to: [receiverHome], kinds: ['knowledge'] }],
      standing: [{ subtype: 'shared-maintenance', from: [sourceHome, otherHome], to: [receiverHome] }]
    })
    box.cd('receiver')
    expect(await box.run('ki repo trade standing list')).toEqual({
      exitCode: 0,
      output: grants(
        'GRANTS',
        [
          `import knowledge shared-maintenance ${otherHome}: awaiting sender`,
          `import knowledge shared-maintenance ${sourceHome}: active`
        ],
        1
      )
    })
  })

  test('refuses malformed, unresolved, or non-local capture targets after an exact grant activates', async () => {
    const { box } = await fixture()
    box.cd('receiver')
    const at = (sourceRef: string, target: string) => capture(box, target, { sourceRef })

    expect((await at('not-a-ref', 'docs/capture file.md#source-analysis')).output).toContain(
      'source-ref must use <40-hex-commit>:<path>#<anchor>'
    )
    box.setRunner(async () => ({ exitCode: 1, output: 'missing' }))
    expect((await at(`${commit}:docs/source.md#finding`, 'docs/capture file.md#source-analysis')).output).toContain(
      `source commit ${commit} does not resolve`
    )
    box.setRunner(async (_commandName, arguments_) => ({
      exitCode: (arguments_[4] as string).endsWith('^{commit}') ? 0 : 1,
      output: ''
    }))
    expect((await at(`${commit}:docs/source.md#finding`, 'docs/capture file.md#source-analysis')).output).toContain(
      `source path docs/source.md does not resolve at ${commit}`
    )
    box.setRunner(async () => ({ exitCode: 0, output: '' }))
    expect((await at(`${commit}:docs/source.md#finding`, 'capture-without-anchor')).output).toContain(
      'capture must use <relative-markdown-path>#<anchor>'
    )
    expect((await at(`${commit}:docs/source.md#finding`, '../peer.md#finding')).output).toContain(
      'must name a Markdown file inside the current repository'
    )
    expect((await at(`${commit}:docs/source.md#finding`, '/tmp/peer.md#finding')).output).toContain(
      'must name a Markdown file inside the current repository'
    )
    expect((await at(`${commit}:docs/source.md#finding`, 'docs/missing.md#finding')).output).toContain(
      'must be an existing regular file'
    )
    expect(
      await box.run([
        'ki',
        'repo',
        'trade',
        'standing',
        'capture',
        sourceHome,
        '--subtype',
        'shared-maintenance',
        '--source-ref',
        ' ',
        '--capture',
        'docs/plain.md#plain'
      ])
    ).toEqual(failure('--source-ref is required and must be non-empty'))
    expect(await box.project.read('docs/source.md')).toBe('# Source\n\n## Finding\n')
  })

  test('rejects undefined, uncovered, and repeated grants when the Capital policy is parsed', async () => {
    const { box, capital } = await fixture()
    const invalid = (detail: string) =>
      failure(`territory Capital ${capitalHome} is invalid: ${join(capital, '.ki.toml')} ${detail}`)
    const cases: readonly (readonly [Parameters<typeof writeCapital>[1], string])[] = [
      [
        { subtypes, channels: [knowledge], standing: [grant('undefined-subtype')] },
        'standing grant #1 subtype must name a subtype the policy defines'
      ],
      [
        { subtypes, channels: [{ ...knowledge, kinds: ['work'] }], standing: [grant('shared-maintenance')] },
        `standing grant #1 needs a knowledge channel from ${sourceHome} to ${receiverHome}`
      ],
      [
        { subtypes, channels: [knowledge], standing: [grant('shared-maintenance'), grant('shared-maintenance')] },
        `standing grant #2 repeats shared-maintenance from ${sourceHome} to ${receiverHome}`
      ]
    ]
    for (const [territory, detail] of cases) {
      await writeCapital(box, territory)
      expect(await box.run('ki repo trade standing list')).toEqual(invalid(detail))
    }
  })
})
