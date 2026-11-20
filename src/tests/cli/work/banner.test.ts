import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from '../_cli_helper.ts'

const NOW = Date.parse('2026-11-19T03:40:00Z')
const now = () => NOW
const LONDON = { TZ: 'Europe/London' }

/** Kris's drawing, verbatim from the summary-model design note, the scroll as he drew it. */
const KRIS_DRAWING = [
  '  /==================================================================================\\',
  ' /                                 KNOWLEDGE  ISLANDS                                 \\',
  '|======================================================================================|',
  '  _[===]_       ________________________________________________________       _[===]_',
  '   |:|:|       (_)----------------------------------------------------(_)       |:|:|',
  '   |:|:|        |                  TERRA  ·  ON HOLD                   |        |:|:|',
  '   |:|:|        |                                                      |        |:|:|',
  '   |:|:|        |         2 waiting on you  ·  nothing running         |        |:|:|',
  '   |:|:|        |       Wednesday 4 November 2026  ·  01:00 GMT        |        |:|:|',
  '   |:|:|       (_)----------------------------------------------------(_)       |:|:|',
  '  _|___|________________________________________________________________________|___|_'
]

/** A scroll line as the art draws it, between its two `|` marks. */
const scrollLine = (inner: string): string => `   |:|:|        |${inner}|        |:|:|`

type Fields = Readonly<Record<string, string | undefined>>

const markdown = (fields: Fields, body: string): string =>
  `---\n${Object.entries(fields)
    .flatMap(([key, value]) => (value === undefined ? [] : [`${key}: ${value}`]))
    .join('\n')}\n---\n\n${body}`

const entry = (fields: Fields = {}, held: readonly string[] = []): string =>
  markdown(
    {
      'ki-id': 'ex.summit',
      'ki-level': 'territory',
      'ki-role': 'governor',
      'ki-repositories': '\n  - ex/principal',
      'ki-state': 'with-worker',
      'ki-since': '2026-11-19T01:00:00Z',
      'ki-workers': '\n  - id: actor:ward\n    role: governor\n    status: active',
      ...fields
    },
    `# ex.summit\n\n## Now\n\n- Nothing.\n\n## Held\n\n${held.map((line) => `- ${line}\n  continued`).join('\n')}\n\n## Changes\n\n- The changes.\n`
  )

const change = (revised: string | undefined, questions: readonly string[], gaps = true): string =>
  markdown(
    { 'ki-document-type': 'change@e11cee07f', 'ki-revised': revised },
    [
      '# A change',
      '',
      '## 6. Changes',
      '',
      '1. Not a question.',
      '',
      '## 7. Open',
      '',
      '### 7.1 Questions',
      '',
      ...questions.flatMap((question, index) => [`${index + 1}. ${question}`, '   More context.']),
      '',
      ...(gaps ? ['### 7.2 Gaps', '', '1. A gap, never a query.', ''] : [])
    ].join('\n')
  )

const declaration = (work: boolean): string =>
  [
    '[repo]',
    'backpacks = ["knowledgeislands/ki-agent-backpack"]',
    '',
    '[skills.ki-repo-project]',
    '',
    '[skills.ki-repo]',
    'repo_type = "project"',
    'primary_shape = "ki-repo-project"',
    'repository = "https://github.com/example/principal"',
    'repo_code = "EX"',
    '',
    ...(work ? ['[skills.ki-work]', 'adapter = "roadmap"', '', '[skills.ki-work-roadmap]', ''] : [])
  ].join('\n')

const record = (number: number, fields: readonly string[]): string =>
  [
    '---',
    `id: EX-00${number}`,
    `title: Record ${number}`,
    ...fields,
    'blocks: []',
    'blocked_by: []',
    'baseline_ref: null',
    'created_at: 2026-11-01T00:00:00Z',
    'updated_at: 2026-11-01T00:00:00Z',
    '---',
    '',
    `# EX-00${number}: Record ${number}`,
    '',
    '## Goal',
    '',
    'A goal.',
    '',
    '## Context',
    '',
    'Context.',
    '',
    '## Boundary',
    '',
    'A boundary.',
    '',
    '## Discussion',
    '',
    'None.',
    ''
  ].join('\n')

const registry = (box: Sandbox, names: readonly string[]): Promise<void> =>
  box.state.write(
    'ki/registry.toml',
    [
      'schema = 1',
      ...names.flatMap((name) => [
        '',
        `[repositories."${name}"]`,
        `repository = "https://github.com/example/${name}"`,
        `path = ${JSON.stringify(`${box.project.path}/${name}`)}`
      ]),
      ''
    ].join('\n')
  )

/**
 * A store with one package, `ex.summit`, its roster, a sub-package, meetings and a registered repository whose roadmap
 * holds one open record, one idea and one done record.
 */
const setup = async (fields: Fields = {}): Promise<Sandbox> => {
  const box = await sandbox()
  box.setEnv({ ...LONDON, MCP_CAIRN_STORE: `${box.project.path}/store` })
  await box.project.write('store/work/ex/ex.summit/_index.md', entry(fields, ['One held.', 'Two held.']))
  await box.project.write(
    'store/work/ex/ex.summit/10-alpha.change.md',
    change('2026-11-18T22:00:00Z', [
      '**ALPHA-ONE:** a tagged lead.',
      '**Done, 18 November:** answered.',
      '**SOMETHING (parked):** parked where it stands.',
      '**How it goes** (MENTION-TAG), a tag in brackets.',
      'A question with no tag at all.'
    ])
  )
  await box.project.write('store/work/ex/ex.summit/20-beta.change.md', change(undefined, [], false))
  await box.project.write(
    'store/work/ex/ex.summit/sub/_index.md',
    entry({ 'ki-id': 'ex.summit+sub', 'ki-parent': 'ex.summit', 'ki-repositories': '[]' })
  )
  await box.project.write(
    'store/work/ex/ex.summit/sub/10-sub.change.md',
    change('2026-11-17T10:00:00Z', ['**SUB-Q:** the oldest.'], false)
  )
  await box.project.write('store/work/ex/ex.summit/notes/plain.md', '# Notes\n')
  await box.project.write('store/roster/roles/governor/_index.md', markdown({ 'ki-glyph': '🏛️' }, '# Governor\n'))
  await box.project.write('store/roster/actors/ward/_index.md', markdown({ 'ki-name': 'Ward' }, '# Ward\n'))
  const meeting = (id: string, status: string, participants = ''): string =>
    markdown(
      {
        'ki-id': `meeting:${id}`,
        'ki-document-type': 'meeting',
        'ki-status': status,
        'ki-participants': participants || undefined
      },
      '# Meeting\n'
    )
  await box.project.write('store/meetings/ex.summit/20261118-call/_index.md', meeting('ex.summit.call', 'open'))
  await box.project.write(
    'store/meetings/other.room/_index.md',
    meeting(
      'other.room',
      'open',
      '\n  - id: actor:ward\n  - id: actor:quire\n  - actor:loose\n  - ~\n  - id: actor:ex.tools@reviewer'
    )
  )
  await box.project.write('store/roster/actors/quire/_index.md', markdown({ 'ki-name': 'Quire' }, '# Quire\n'))
  await box.project.write('store/meetings/other.room/old/_index.md', meeting('other.room.old', 'adjourned'))
  await box.project.write('store/meetings/elsewhere/_index.md', meeting('elsewhere', 'open', '\n  - id: actor:other'))
  await box.project.write('store/meetings/elsewhere/note/_index.md', markdown({ title: 'A note' }, '# Note\n'))
  await box.project.write('store/meetings/elsewhere/broken/_index.md', '---\nkey: [unclosed\n---\n')
  await box.project.write('store/meetings/elsewhere/listed/_index.md', '---\n- a list\n---\n')
  await box.project.write('principal/.ki.toml', declaration(true))
  await box.project.write('principal/docs/roadmap/EX-001-open.md', record(1, ['horizon: next', 'status: draft']))
  await box.project.write('principal/docs/roadmap/EX-002-idea.md', record(2, ['status: triage']))
  await box.project.write('principal/docs/roadmap/EX-003-done.md', record(3, ['status: done']))
  await registry(box, ['principal'])
  return box
}

const banner = (box: Sandbox, arguments_: string) => box.run(`ki work banner ${arguments_}`.trim(), { now })

describe('ki work banner', () => {
  test('prints the Full banner: art, heading, counts with zeros written, roadmap and package lines, items and named thread', async () => {
    const box = await setup()
    const result = await banner(box, 'ex.summit --host sol')
    expect(result.stderr).toBe('')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe(
      [
        '```text',
        ...KRIS_DRAWING.slice(0, 5),
        scrollLine(`${' '.repeat(19)}SOL  ·  WITH YOU${' '.repeat(19)}`),
        scrollLine(' '.repeat(54)),
        scrollLine(`${' '.repeat(9)}4 waiting on you  ·  nothing running${' '.repeat(9)}`),
        scrollLine(`${' '.repeat(7)}Thursday 19 November 2026  ·  03:40 GMT${' '.repeat(8)}`),
        ...KRIS_DRAWING.slice(9),
        '```',
        '',
        '### 🤖 With worker · at 01:00 GMT',
        '',
        '🤖 0 running · ⏳ 0 queued · 👤 4 with you · ⛔ 0 blocked · 🅿️ 1 parked',
        '',
        '🗺️ roadmap · 3 records · 1 open · 1 done awaiting prune · 1 idea',
        '',
        '📦 package · changes 3 · open 4 · held 2 · meetings 2',
        '',
        '- 👤 SUB-Q · owner · at Tuesday 17 November 10:00',
        '- 👤 ALPHA-ONE · owner · at yesterday 22:00',
        '- 👤 MENTION-TAG · owner · at yesterday 22:00',
        '- 👤 10-alpha question 5 · owner · at yesterday 22:00',
        '- 🅿️ 1 query in the change documents',
        '',
        'Ward (🏛️ 🔑 ex.summit)',
        ''
      ].join('\n')
    )
  })

  test('draws Kris’s scroll exactly, an odd split putting the extra space on the right', async () => {
    const box = await setup({
      'ki-state': 'on-hold',
      'ki-hold': '\n  reason: paused\n  release: the harness migration lands',
      'ki-since': '2026-11-04T00:10:00Z'
    })
    await box.project.write('store/work/ex/ex.summit/sub/10-sub.change.md', change('2026-11-03T10:00:00Z', [], false))
    await box.project.write(
      'store/work/ex/ex.summit/10-alpha.change.md',
      change('2026-11-03T22:00:00Z', ['**ONE:** first.', '**TWO (parked):** second.'])
    )
    const result = await box.run('ki work banner ex.summit --host terra', {
      now: () => Date.parse('2026-11-04T01:00:00Z')
    })
    expect(result.exitCode).toBe(0)
    expect(result.stdout.split('\n').slice(1, 12)).toEqual(KRIS_DRAWING)
    expect(result.stdout.split('\n').slice(13).join('\n')).toBe(
      [
        '',
        '### ⏸️ On hold · paused until the harness migration lands · at 00:10 GMT',
        '',
        '⏸️ drained · 🅿️ 2 queries parked',
        '',
        '🗺️ roadmap · 3 records · 1 open · 1 done awaiting prune · 1 idea',
        '',
        '📦 package · changes 3 · open 0 · held 2 · meetings 2',
        '',
        '- 🅿️ 2 queries in the change documents',
        '- ⏸️ the harness migration lands, or `resume`',
        '',
        'Ward (🏛️ 🔑 ex.summit)',
        ''
      ].join('\n')
    )
  })

  test('leaves out only the art with --no-art, and the art, roadmap and package lines with --short', async () => {
    const box = await setup()
    const full = await banner(box, 'ex.summit --host sol')
    const noArt = await banner(box, 'ex.summit --no-art')
    const short = await banner(box, 'ex.summit --short')
    expect(noArt.exitCode).toBe(0)
    expect(noArt.stdout).toBe(full.stdout.split('\n').slice(14).join('\n'))
    expect(short.stdout).toBe(
      [
        '### 🤖 With worker · at 01:00 GMT',
        '',
        '🤖 0 running · ⏳ 0 queued · 👤 4 with you · ⛔ 0 blocked · 🅿️ 1 parked',
        '',
        '- 👤 SUB-Q · owner · at Tuesday 17 November 10:00',
        '- 👤 ALPHA-ONE · owner · at yesterday 22:00',
        '- 👤 MENTION-TAG · owner · at yesterday 22:00',
        '- 👤 10-alpha question 5 · owner · at yesterday 22:00',
        '- 🅿️ 1 query in the change documents',
        '',
        'Ward (🏛️ 🔑 ex.summit)',
        ''
      ].join('\n')
    )
  })

  test('reads questions asked as tagged headings, the one form, beside the older numbered ones', async () => {
    const box = await setup()
    await box.project.write(
      'store/work/ex/ex.summit/20-beta.change.md',
      markdown(
        { 'ki-document-type': 'change@e11cee07f', 'ki-revised': '2026-11-19T00:30:00Z' },
        [
          '# B change',
          '',
          '## 7. Open',
          '',
          '### 7.1 Questions',
          '',
          'Questions for Kris, in the one form.',
          '',
          '#### ACCEPT-BANNER: accept the banner command',
          '',
          '- **Context.** Built, and not (parked) for all its context mentions (OTHER-TAG).',
          '- **Query.** Does Kris accept it?',
          '- **Options.**',
          '  - a) (recommended, confidence high) Accept it.',
          '  - b) Return it.',
          '',
          'Benefit: medium · Cascade: contained · Confidence: high · Waits on: none.',
          '',
          '#### STORE-SETTING: how ki finds the store (parked)',
          '',
          '- **Query.** Where?',
          '',
          '#### 3. OLD-DASH - an older dashed heading',
          '',
          '#### RUMI-NOTES: settled already',
          '',
          '- **Taken, 18 November:** a.',
          '',
          '#### a question with no tag',
          '',
          '### 7.2 Gaps',
          '',
          '#### NOT-ASKED: a heading under Gaps',
          ''
        ].join('\n')
      )
    )
    const result = await banner(box, 'ex.summit --short')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain(
      [
        '🤖 0 running · ⏳ 0 queued · 👤 7 with you · ⛔ 0 blocked · 🅿️ 2 parked',
        '',
        '- 👤 SUB-Q · owner · at Tuesday 17 November 10:00',
        '- 👤 ALPHA-ONE · owner · at yesterday 22:00',
        '- 👤 MENTION-TAG · owner · at yesterday 22:00',
        '- 👤 10-alpha question 5 · owner · at yesterday 22:00',
        '- 👤 ACCEPT-BANNER · owner · at 00:30',
        '- 👤 OLD-DASH · owner · at 00:30',
        '- 👤 20-beta question 5 · owner · at 00:30',
        '- 🅿️ 2 queries in the change documents'
      ].join('\n')
    )
  })

  test('takes the live counts, items, heading-for line and meetings from the session, in the standard’s order', async () => {
    const box = await setup()
    const result = await box.run(
      [
        'ki',
        'work',
        'banner',
        'ex.summit',
        '--short',
        '--running',
        '2',
        '--queued',
        '1',
        '--blocked',
        '1',
        '--item',
        '🪟 until 08:00 · stop wake',
        '--item',
        '⛔ package commit · repo/ki-cairn-store · at 02:40',
        '--item',
        '🤖 work-model · run/work-model · at 03:20',
        '--item',
        '⏳ review · run/review · at 03:30',
        '--item',
        '👤 WORK-HOME · owner · at 02:58',
        '--item',
        '🅿️ a tangent · owner · at 01:10',
        '--item',
        '🤖 tools fix · work/ex.tools · at 03:05',
        '--heading-for',
        'draining → ⏸️ On hold',
        '--meeting',
        'ex.summit.call',
        '--meeting',
        'other.room'
      ],
      { now }
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe(
      [
        '### 🤖 With worker · at 01:00 GMT',
        '',
        '🤖 2 running · ⏳ 1 queued · 👤 4 with you · ⛔ 1 blocked · 🅿️ 1 parked',
        '',
        '- 🤖 work-model · run/work-model · at 03:20',
        '- 🤖 tools fix · work/ex.tools · at 03:05',
        '- ⏳ review · run/review · at 03:30',
        '- 👤 SUB-Q · owner · at Tuesday 17 November 10:00',
        '- 👤 ALPHA-ONE · owner · at yesterday 22:00',
        '- 👤 MENTION-TAG · owner · at yesterday 22:00',
        '- 👤 10-alpha question 5 · owner · at yesterday 22:00',
        '- 👤 WORK-HOME · owner · at 02:58',
        '- ⛔ package commit · repo/ki-cairn-store · at 02:40',
        '- 🅿️ 1 query in the change documents',
        '- 🅿️ a tangent · owner · at 01:10',
        '- 🪟 until 08:00 · stop wake',
        '',
        '↪️ draining → ⏸️ On hold',
        '',
        '🤝 in ex.summit.call, other.room · with Quire, ex.tools@reviewer',
        '',
        'Ward (🏛️ 🔑 ex.summit)',
        ''
      ].join('\n')
    )
  })

  test.each([
    [{ 'ki-state': 'with-supervisor' }, '### 👤 With supervisor · at 01:00 GMT', 'WITH YOU'],
    [{ 'ki-state': 'handoff-to-worker' }, '### 👤 → 🤖 Handoff to worker · at 01:00 GMT', 'ALL CLEAR'],
    [{ 'ki-state': 'handoff-to-supervisor' }, '### 🤖 → 👤 Handoff to supervisor · at 01:00 GMT', 'WITH YOU'],
    [
      { 'ki-state': 'handoff-to-supervisor', 'ki-blocking': 'true' },
      '### 🤖 → 👤 Handoff to supervisor · blocked · at 01:00 GMT',
      'WITH YOU'
    ],
    [
      { 'ki-state': 'handoff', 'ki-target': 'run/review' },
      '### → 🎯 Handoff to run/review · at 01:00 GMT',
      'ALL CLEAR'
    ],
    [{}, '### 🤖 With worker · at 01:00 GMT', 'ALL CLEAR']
  ])('heads %o with the state’s own heading and the five views', async (fields, heading, scroll) => {
    const box = await setup(fields)
    await box.project.write('store/work/ex/ex.summit/10-alpha.change.md', change('2026-11-18T22:00:00Z', []))
    await box.project.write('store/work/ex/ex.summit/sub/10-sub.change.md', change('2026-11-17T10:00:00Z', []))
    const result = await banner(box, 'ex.summit --host sol --running 1')
    expect(result.exitCode).toBe(0)
    const lines = result.stdout.split('\n')
    const host = `SOL  ·  ${scroll}`
    const left = Math.floor((54 - host.length) / 2)
    expect(lines[6]).toBe(scrollLine(`${' '.repeat(left)}${host}${' '.repeat(54 - host.length - left)}`))
    expect(lines[8]).toContain('nothing waiting on you  ·  1 running')
    expect(lines[14]).toBe(heading)
    expect(lines[16]).toBe('🤖 1 running · ⏳ 0 queued · 👤 0 with you · ⛔ 0 blocked · 🅿️ 0 parked')
  })

  test('heads a Snoozing hold, idle when the worker set it, with its own counts and release', async () => {
    const box = await setup({
      'ki-state': 'on-hold',
      'ki-hold': '\n  reason: more-expected\n  set_by: worker',
      'ki-since': '2026-11-18T23:58:00Z'
    })
    const idle = await banner(box, 'ex.summit --host sol --running 3')
    expect(idle.exitCode).toBe(0)
    expect(idle.stdout).toContain(scrollLine(`${' '.repeat(19)}SOL  ·  SNOOZING${' '.repeat(19)}`))
    expect(idle.stdout).toContain(scrollLine(`${' '.repeat(9)}5 waiting on you  ·  nothing running${' '.repeat(9)}`))
    expect(idle.stdout).toContain(
      [
        '### 💤 Snoozing (on hold) · idle · at yesterday 23:58 GMT',
        '',
        '💤 waiting for a message · 🅿️ 5 queries parked',
        ''
      ].join('\n')
    )
    expect(idle.stdout).toContain(
      ['- 🅿️ 5 queries in the change documents', '- 💤 a message arrives, or `resume`', '', 'Ward'].join('\n')
    )
    await box.project.write(
      'store/work/ex/ex.summit/_index.md',
      entry({ 'ki-state': 'on-hold', 'ki-hold': '{reason: snoozing, release: a message}' })
    )
    expect((await banner(box, 'ex.summit --short')).stdout).toMatch(/^### 💤 Snoozing \(on hold\) · at 01:00 GMT\n/)
  })

  test('closes a Finished package with its label and no counts line', async () => {
    const box = await setup({ 'ki-state': 'finished', 'ki-label': 'Example summit' })
    const result = await banner(box, 'ex.summit --host sol --running 2')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain(scrollLine(`${' '.repeat(19)}SOL  ·  FINISHED${' '.repeat(19)}`))
    expect(result.stdout).toContain(scrollLine(`${' '.repeat(9)}4 waiting on you  ·  nothing running${' '.repeat(9)}`))
    expect(result.stdout.split('\n').slice(13, 18)).toEqual([
      '',
      '### 🏁 Finished · Example summit closed at 01:00 GMT',
      '',
      '🗺️ roadmap · 3 records · 1 open · 1 done awaiting prune · 1 idea',
      ''
    ])
    const unlabelled = await setup({ 'ki-state': 'finished', 'ki-label': "''" })
    expect((await banner(unlabelled, 'ex.summit --short')).stdout).toMatch(/^### 🏁 Finished · ex.summit closed at/)
  })

  test('writes the thread line bare for an unnamed seat and as 🧵 for a seat with no role', async () => {
    const box = await setup({ 'ki-workers': '\n  - ~\n  - id: actor:ward\n    role: governor\n    status: retired' })
    expect((await banner(box, 'ex.summit --short')).stdout).toMatch(/\n\n🏛️ 🔑 ex\.summit\n$/)
    await box.project.write('store/work/ex/ex.summit/_index.md', entry({ 'ki-workers': '\n  - role: governor' }))
    expect((await banner(box, 'ex.summit --short')).stdout).toMatch(/\n\n🏛️ 🔑 ex\.summit\n$/)
    await box.project.write('store/work/ex/ex.summit/_index.md', entry({ 'ki-workers': undefined }))
    expect((await banner(box, 'ex.summit --short')).stdout).toMatch(/\n\n🏛️ 🔑 ex\.summit\n$/)
    await box.project.write(
      'store/work/ex/ex.summit/_index.md',
      entry({ 'ki-workers': '\n  - id: actor:nobody\n    role: governor' })
    )
    expect((await banner(box, 'ex.summit --short')).stdout).toMatch(/\n\n🏛️ 🔑 ex\.summit\n$/)
    await box.project.write('store/roster/actors/ward/_index.md', markdown({ 'ki-name': "' '" }, '# Ward\n'))
    await box.project.write('store/work/ex/ex.summit/_index.md', entry())
    expect((await banner(box, 'ex.summit --short')).stdout).toMatch(/\n\n🏛️ 🔑 ex\.summit\n$/)
    await box.project.write('store/work/ex/ex.summit/_index.md', entry({ 'ki-role': undefined }))
    expect((await banner(box, 'ex.summit --short')).stdout).toMatch(/\n\n🧵 ex\.summit\n$/)
  })

  test('writes 🗺️ roadmap · none where no package repository has a roadmap', async () => {
    const box = await setup({ 'ki-repositories': '[]', 'ki-workers': undefined })
    expect((await banner(box, 'ex.summit --no-art')).stdout).toContain(
      '🗺️ roadmap · none\n\n📦 package · changes 3 · open 4 · held 2 · meetings 1'
    )
    await box.project.write('plain/.ki.toml', declaration(false))
    await box.project.write('bare/.ki.toml', declaration(true))
    await registry(box, ['principal', 'plain', 'bare'])
    await box.project.write(
      'store/work/ex/ex.summit/_index.md',
      entry({ 'ki-repositories': '\n  - ex/plain\n  - ex/bare' })
    )
    expect((await banner(box, 'ex.summit --no-art')).stdout).toContain('🗺️ roadmap · none\n')
    await box.project.write(
      'store/work/ex/ex.summit/_index.md',
      entry({ 'ki-repositories': '\n  - ex/plain\n  - ex/principal', 'ki-label': 'Example' })
    )
    await box.project.write('principal/docs/roadmap/EX-002-idea.md', record(2, ['horizon: next', 'status: ready']))
    await box.project.write('principal/docs/roadmap/EX-003-done.md', record(3, ['horizon: next', 'status: ready']))
    expect((await banner(box, 'ex.summit --no-art')).stdout).toContain(
      '🗺️ roadmap · 3 records · 3 open · 0 done awaiting prune · 0 ideas\n'
    )
    await box.project.write('store/work/ex/ex.summit/_index.md', entry({ 'ki-repositories': undefined }))
    expect((await banner(box, 'ex.summit --no-art')).stdout).toContain('🗺️ roadmap · none\n')
  })

  test('finds the package and its store from the working directory when none is named', async () => {
    const box = await setup()
    box.setEnv({ MCP_CAIRN_STORE: undefined })
    await box.project.write('store/work/ex/ex.summit/sub/deep/_index.md', markdown({ title: 'not a package' }, '#\n'))
    await box.project.write(
      'store/work/ex/ex.summit/sub/20-plain.change.md',
      markdown({ 'ki-revised': '2026-11-17T10:00:00Z' }, '# No open section\n')
    )
    box.cd('store/work/ex/ex.summit/sub/deep')
    const sub = await banner(box, '--short')
    expect(sub.stderr).toBe('')
    expect(sub.stdout).toMatch(/^### 🤖 With worker/)
    box.cd('../../notes')
    expect((await banner(box, '--short')).stdout).toMatch(/\n\nWard \(🏛️ 🔑 ex\.summit\)\n$/)
  })

  test('reads a sub-package by its + id, and the store from --store, MCP_CAIRN_STORE or the rig’s Cairn configuration', async () => {
    const box = await setup()
    await box.project.write(
      'store/work/ex/ex.summit/sub/_index.md',
      entry({ 'ki-id': 'ex.summit+sub', 'ki-state': 'with-supervisor', 'ki-role': undefined })
    )
    expect((await banner(box, 'ex.summit+sub --short')).stdout).toMatch(
      /^### 👤 With supervisor[\s\S]*\n🧵 ex\.summit\+sub\n$/
    )
    box.setEnv({ MCP_CAIRN_STORE: '' })
    await box.config.write('cairn/config.toml', '[rig]\nname = "terra"\n\n[store]\npath = "~/store"\n')
    const missingStore = await banner(box, 'ex.summit')
    expect(missingStore.exitCode).toBe(1)
    expect(missingStore.stderr).toMatch(/no work package ex\.summit in \S*\/home\/store\/work\n/)
    await box.home.write('store/work/ex/ex.summit/_index.md', entry({ 'ki-repositories': '[]', 'ki-role': undefined }))
    const configured = await banner(box, 'ex.summit')
    expect(configured.exitCode).toBe(0)
    expect(configured.stdout).toContain(scrollLine(`${' '.repeat(17)}TERRA  ·  ALL CLEAR${' '.repeat(18)}`))
    const given = await banner(box, `ex.summit --store ${box.project.path}/store --host sol`)
    expect(given.stdout).toContain('SOL  ·  WITH YOU')
    await box.config.write('cairn/config.toml', '[rig]\nname = 7\n')
    const none = await banner(box, 'ex.summit')
    expect(none.exitCode).toBe(1)
    expect(none.stderr).toContain('no Cairn store: pass --store <dir>, set MCP_CAIRN_STORE')
    box.setEnv({ XDG_CONFIG_HOME: undefined })
    await box.home.write('.config/cairn/config.toml', '[store]\npath = "~"\n')
    expect((await banner(box, 'ex.summit')).stderr).toMatch(/no work package ex\.summit in \S*\/home\/work\n/)
  })

  test('reads the local time zone from TZ, or the host’s own without it', async () => {
    const box = await setup()
    box.setEnv({ TZ: 'America/New_York' })
    expect((await banner(box, 'ex.summit --short')).stdout).toMatch(/^### 🤖 With worker · at 20:00 GMT-5\n/)
    box.setEnv({ TZ: undefined })
    expect((await banner(box, 'ex.summit --short')).exitCode).toBe(0)
  })

  test.each([
    ['ex.summit --short --running two', 'a live count must be a whole number, zero or more, not two', 2],
    ['ex.summit --short --full', "option '--full' cannot be used with option '--short'", 2],
    ['ex.summit --short --heading-for x', '', 0],
    ['ex.summit --host a-very-long-host-name-for-a-scroll-line-that-cannot-fit', "over the scroll's 54", 1],
    ['ex.missing', 'no work package ex.missing in', 1],
    ['ex.summit+absent', 'no work package ex.summit+absent in', 1]
  ])('refuses %s', async (arguments_, message, code) => {
    const box = await setup()
    const result = await banner(box, arguments_)
    expect(result.exitCode).toBe(code)
    expect(result.stderr).toContain(message)
  })

  test('refuses --heading-for unless the work is With worker, and the art without a host', async () => {
    const box = await setup({ 'ki-state': 'with-supervisor' })
    const heading = await banner(box, 'ex.summit --short --heading-for x')
    expect(heading.exitCode).toBe(2)
    expect(heading.stderr).toContain('--heading-for applies only while the work is With worker')
    const host = await banner(box, 'ex.summit')
    expect(host.exitCode).toBe(2)
    expect(host.stderr).toContain('no host for the art scroll')
  })

  test('names each meeting with the others there, leaving off the with part where there are none', async () => {
    const box = await setup()
    const result = await banner(box, 'ex.summit --short --meeting other.room --meeting ex.summit.call')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain(
      '\n\n🤝 in other.room · with Quire, ex.tools@reviewer, ex.summit.call\n\nWard (🏛️ 🔑 ex.summit)\n'
    )
  })

  test('refuses a meeting the store does not hold, naming it', async () => {
    const box = await setup()
    const result = await banner(box, 'ex.summit --short --meeting no.such.room')
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('no meeting no.such.room in')
  })

  test('refuses a working directory outside any package', async () => {
    const box = await setup()
    for (const [directory, step] of [
      ['store/work/ex', 'store/work/ex'],
      ['principal', '../../../principal']
    ] as const) {
      await box.project.mkdir(directory)
      box.cd(step)
      const result = await banner(box, '')
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('is not inside a work package')
    }
  })

  test.each<[string, Fields | string, string]>([
    ['no front matter', '# ex.summit\n', '_index.md has no readable front matter'],
    ['a missing state', { 'ki-state': undefined }, '_index.md: ki-state is missing'],
    ['an unknown state', { 'ki-state': 'resting' }, 'ki-state must be one of with-worker'],
    ['an unreadable since', { 'ki-since': 'soon' }, '_index.md: ki-since is not a time: soon'],
    ['a handoff without a target', { 'ki-state': 'handoff' }, '_index.md: ki-target is missing'],
    ['a hold without a reason', { 'ki-state': 'on-hold' }, '_index.md: ki-hold.reason must be paused'],
    [
      'a paused hold without a release',
      { 'ki-state': 'on-hold', 'ki-hold': '{reason: paused}' },
      '_index.md: ki-hold.release is missing'
    ],
    ['a role with no role page', { 'ki-role': 'mystery' }, 'roles/mystery/_index.md: ki-glyph is missing'],
    ['repositories that are not a list', { 'ki-repositories': 'ex/principal' }, 'ki-repositories must be a list'],
    ['a repository name that is not text', { 'ki-repositories': '[7]' }, 'ki-repositories must be a list'],
    ['an unregistered repository', { 'ki-repositories': '[ex/unknown]' }, 'names ex/unknown, which is not in the local']
  ])('refuses a package with %s, naming the file and field', async (_case, fields, message) => {
    const box = await setup()
    if (typeof fields === 'string') await box.project.write('store/work/ex/ex.summit/_index.md', fields)
    else await box.project.write('store/work/ex/ex.summit/_index.md', entry({ ...fields, 'ki-id': 'ex.summit' }))
    const result = await banner(box, 'ex.summit --short')
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain(message)
  })

  test('refuses an open query whose change document has no revision, an empty role glyph and an unreadable record', async () => {
    const box = await setup()
    await box.project.write('store/work/ex/ex.summit/20-beta.change.md', change(undefined, ['**OPEN:** waiting.']))
    expect((await banner(box, 'ex.summit --short')).stderr).toContain('20-beta.change.md: ki-revised is missing')
    await box.project.write('store/work/ex/ex.summit/20-beta.change.md', change('never', ['**OPEN:** waiting.']))
    expect((await banner(box, 'ex.summit --short')).stderr).toContain('ki-revised is not a time: never')
    await box.project.write('store/work/ex/ex.summit/20-beta.change.md', change(undefined, []))
    await box.project.write('store/roster/roles/governor/_index.md', markdown({ 'ki-glyph': "''" }, '#\n'))
    expect((await banner(box, 'ex.summit --short')).stderr).toContain('governor/_index.md: ki-glyph is missing')
    await box.project.write('store/roster/roles/governor/_index.md', markdown({ 'ki-glyph': '🏛️' }, '#\n'))
    await box.project.write('principal/docs/roadmap/EX-004-broken.md', '---\nid: EX-004\n---\n')
    const fault = await banner(box, 'ex.summit --short')
    expect(fault.exitCode).toBe(1)
    expect(fault.stderr).toContain(`${box.project.path}/principal/docs/roadmap/EX-004-broken.md: `)
  })

  test('refuses a malformed Cairn configuration, naming it', async () => {
    const box = await setup()
    await box.config.write('cairn/config.toml', '[store\n')
    const result = await banner(box, 'ex.summit --short')
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain(`${box.config.path}/cairn/config.toml is not valid TOML`)
  })
})
