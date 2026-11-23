import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from '../_cli_helper.ts'

const NOW = Date.parse('2026-11-23T09:00:00Z')
const now = () => NOW

const declaration = (repository: string): string =>
  [
    '[repo]',
    'backpacks = ["example/backpack"]',
    '',
    '[skills.ki-repo-project]',
    '',
    '[skills.ki-repo]',
    'repo_type = "project"',
    'primary_shape = "ki-repo-project"',
    `repository = ${JSON.stringify(repository)}`,
    ''
  ].join('\n')

type Fields = Readonly<Record<string, string | undefined>>

/** A package's `_index.md`: the standard's required fields with the given ones over them, a field set undefined left out. */
const entry = (id: string, fields: Fields = {}): string => {
  const values: Fields = {
    'ki-id': id,
    'ki-level': 'regular',
    'ki-description': `>-\n  Runs ${id}. Takes its units.`,
    'ki-worker': 'agent',
    'ki-supervisor': 'owner',
    'ki-role': 'warden',
    'ki-repositories': '\n  - ex/app',
    'ki-state': 'with-supervisor',
    'ki-since': '2026-11-23T08:00:00Z',
    ...fields
  }
  return `---\n${Object.entries(values)
    .flatMap(([key, value]) => (value === undefined ? [] : [`${key}: ${value}`]))
    .join(
      '\n'
    )}\n---\n\n# ${id}\n\n## Goals\n\nNone.\n\n## Scope\n\nNone.\n\n## Now\n\nNone.\n\n## Held\n\nNone.\n\n## Changes\n\nNone.\n`
}

const write = (box: Sandbox, folder: string, id: string, fields?: Fields) =>
  box.project.write(`store/work/${folder}/_index.md`, entry(id, fields))

/** A store with a territory's summit, its nodes and a sub-package, and a repository, `app`, that several name. */
const setup = async (): Promise<Sandbox> => {
  const box = await sandbox()
  box.setEnv({ MCP_CAIRN_STORE: `${box.project.path}/store` })
  await box.project.write('app/.ki.toml', declaration('https://github.com/example/app'))
  await write(box, 'ex/ex.summit', 'ex.summit', {
    'ki-level': 'territory',
    'ki-repositories': '\n  - ex/principal',
    'ki-state': 'with-worker',
    'ki-since': '2026-11-23T07:00:00Z',
    'ki-beat': '2026-11-23T08:55:00Z'
  })
  await write(box, 'ex/ex.alpha', 'ex.alpha', {
    'ki-level': 'project',
    'ki-project': 'alpha',
    'ki-label': "'EX > Alpha'",
    'ki-parent': 'ex.summit',
    'ki-records': '\n  - EX-APP-CLI-001',
    'ki-state': 'handoff-to-supervisor',
    'ki-blocking': 'true',
    'ki-since': '2026-11-23T06:00:00Z',
    'ki-received': '2026-11-23T06:30:00Z',
    'ki-mark': '2026-11-23T05:00:00Z',
    'ki-method_read': '1234567',
    'ki-workers':
      '\n  - id: actor:ward\n    role: warden\n    tier: managers\n    since: 2026-11-20T00:00:00Z\n    status: active\n  - role: journeyman\n    tier: makers\n    status: vacant\n  - not a seat'
  })
  await box.project.write('store/work/ex/ex.alpha/10-first.change.md', '# First\n')
  await box.project.write('store/work/ex/ex.alpha/notes.md', '# Not a change document\n')
  await write(box, 'ex/ex.beta', 'ex.beta', {
    'ki-parent': 'ex.summit',
    'ki-repositories': '\n  - elsewhere/app',
    'ki-state': 'handoff',
    'ki-target': 'run/review',
    'ki-method_read': "'abc1234'",
    'ki-role': undefined,
    'ki-description': undefined
  })
  await write(box, 'ex/ex.gamma', 'ex.gamma', {
    'ki-parent': 'ex.summit',
    'ki-state': 'on-hold',
    'ki-since': '2026-10-01T00:00:00Z',
    'ki-hold': '\n  reason: paused\n  release: after the migration\n  set_by: owner'
  })
  await write(box, 'ex/ex.delta', 'ex.delta', {
    'ki-parent': 'ex.alpha',
    'ki-state': 'on-hold',
    'ki-hold': '{reason: snoozing}',
    'ki-workers': 'none'
  })
  await write(box, 'ex/ex.epsilon', 'ex.epsilon', { 'ki-parent': 'ex.summit', 'ki-state': 'handoff-to-worker' })
  await write(box, 'ex/ex.zeta', 'ex.zeta', { 'ki-parent': 'ex.summit', 'ki-state': 'finished' })
  await write(box, 'ex/ex.summit/sub', 'ex.summit+sub', {
    'ki-parent': 'ex.summit',
    'ki-since': '2026-11-22T00:00:00Z'
  })
  await box.project.write('store/work/ex/ex.summit/sub/10-strand.change.md', '# Strand\n')
  await box.project.write('store/work/ex/ex.summit/notes/plain.md', '# Not a sub-package\n')
  await write(box, 'ex/ex.other', 'ex.other', { 'ki-parent': 'ex.summit', 'ki-repositories': '[]' })
  await write(box, 'oth/oth.summit', 'oth.summit', {
    'ki-level': 'territory',
    'ki-repositories': '\n  - oth/principal'
  })
  await box.project.write('store/work/README.md', '# Work\n')
  await box.project.write('store/work-legacy/ex/ex.old/_index.md', entry('ex.old'))
  return box
}

const status = (box: Sandbox, arguments_: string) => box.run(`ki work status ${arguments_}`.trim(), { now })

describe('ki work status', () => {
  test('reads the packages naming the repository from the Cairn store into ki/work-status/v2 and its views', async () => {
    const box = await setup()
    const json = await status(box, '--repo app --format json')
    const text = await status(box, '--repo app')

    expect(json.exitCode).toBe(0)
    expect(json.stderr).toBe('')
    const report = JSON.parse(json.stdout)
    expect(report).toMatchObject({
      schema: 'ki/work-status/v2',
      store: `${box.project.path}/store`,
      repository: 'example/app',
      generatedAt: '2026-11-23T09:00:00Z'
    })
    expect(report.work.map((work: { id: string }) => work.id)).toEqual([
      'ex.alpha',
      'ex.beta',
      'ex.delta',
      'ex.epsilon',
      'ex.gamma',
      'ex.summit+sub',
      'ex.zeta'
    ])
    const byId = Object.fromEntries(report.work.map((work: { id: string }) => [work.id, work]))
    expect(byId['ex.alpha']).toEqual({
      id: 'ex.alpha',
      level: 'project',
      label: 'EX > Alpha',
      project: 'alpha',
      parent: 'ex.summit',
      role: 'warden',
      description: 'Runs ex.alpha. Takes its units.',
      worker: 'agent',
      supervisor: 'owner',
      repositories: ['ex/app'],
      records: ['EX-APP-CLI-001'],
      state: 'handoff-to-supervisor',
      hold: null,
      holder: 'owner',
      holderRole: 'supervisor',
      target: null,
      blocking: true,
      since: '2026-11-23T06:00:00Z',
      received: '2026-11-23T06:30:00Z',
      beat: null,
      mark: '2026-11-23T05:00:00Z',
      method_read: '1234567',
      workers: [
        { role: 'warden', tier: 'managers', id: 'actor:ward', since: '2026-11-20T00:00:00Z', status: 'active' },
        { role: 'journeyman', tier: 'makers', id: null, since: null, status: 'vacant' }
      ],
      path: 'work/ex/ex.alpha/_index.md',
      changes: ['work/ex/ex.alpha/10-first.change.md']
    })
    expect(byId['ex.beta']).toMatchObject({
      role: null,
      description: null,
      holder: 'run/review',
      holderRole: null,
      target: 'run/review',
      method_read: 'abc1234'
    })
    expect(byId['ex.gamma'].hold).toEqual({ reason: 'paused', release: 'after the migration' })
    expect(byId['ex.delta']).toMatchObject({ hold: { reason: 'snoozing', release: null }, workers: [] })
    expect(byId['ex.epsilon']).toMatchObject({ holder: 'agent', holderRole: 'worker' })
    expect(byId['ex.summit+sub']).toMatchObject({
      parent: 'ex.summit',
      path: 'work/ex/ex.summit/sub/_index.md',
      changes: ['work/ex/ex.summit/sub/10-strand.change.md']
    })

    expect(text.exitCode).toBe(0)
    expect(text.stdout).toBe(
      `${[
        '╭─ KI WORK STATUS example/app',
        '├─ with you (2)',
        '│  ├─ 👤 ex.summit+sub · owner · since 2026-11-22T00:00:00Z',
        '│  ╰─ 👤 ex.alpha · owner · since 2026-11-23T06:00:00Z',
        '├─ stuck (0)',
        '├─ blocked (2)',
        '│  ├─ ⛔ ex.alpha · owner · since 2026-11-23T06:00:00Z',
        '│  ╰─ ⛔ ex.beta · run/review · since 2026-11-23T08:00:00Z',
        '├─ moving (1)',
        '│  ╰─ 🤖 ex.epsilon · agent · since 2026-11-23T08:00:00Z',
        '├─ on hold (2)',
        '│  ├─ ⏸️ ex.delta · nobody · since 2026-11-23T08:00:00Z',
        '│  ╰─ ⏸️ ex.gamma · nobody · since 2026-10-01T00:00:00Z · paused over 31 days',
        '╰─ summary: WORK=7 WITH_YOU=2 STUCK=0 BLOCKED=2 MOVING=1 ON_HOLD=2'
      ].join('\n')}\n`
    )
  })

  test('lists every package with --all, flags a silent worker as stuck, and reads the working directory by default', async () => {
    const box = await setup()
    const all = await status(box, '--all --format json')
    expect(all.exitCode).toBe(0)
    const report = JSON.parse(all.stdout)
    expect(report.repository).toBeNull()
    expect(report.work.map((work: { id: string }) => work.id)).toContain('ex.other')
    expect(report.work.map((work: { id: string }) => work.id)).not.toContain('ex.old')

    await write(box, 'ex/ex.silent', 'ex.silent', {
      'ki-parent': 'ex.summit',
      'ki-state': 'with-worker',
      'ki-since': '2026-11-23T07:00:00Z'
    })
    const text = await status(box, '--all')
    expect(text.stdout).toContain('╭─ KI WORK STATUS all packages')
    expect(text.stdout).toContain('├─ stuck (1)\n│  ╰─ ⏳ ex.silent · agent · since 2026-11-23T07:00:00Z\n')
    expect(text.stdout).toContain('│  ├─ 🤖 ex.epsilon · agent · since 2026-11-23T08:00:00Z\n')
    expect(text.stdout).toContain('│  ╰─ 🤖 ex.summit · agent · since 2026-11-23T07:00:00Z\n')

    box.cd('app')
    const here = await status(box, '--format json')
    expect(JSON.parse(here.stdout).repository).toBe('example/app')
  })

  test('lists each unfinished package for routing, and places the listed packages in their work tree', async () => {
    const box = await setup()
    await write(box, 'ex/ex.long', 'ex.long', {
      'ki-parent': 'ex.summit',
      'ki-description': `>-\n  ${'A very long routing description that runs on and on '.repeat(3)}`
    })
    const routing = await status(box, '--repo app --view routing')
    expect(routing.exitCode).toBe(0)
    expect(routing.stdout).toBe(
      `${[
        '╭─ KI WORK ROUTING example/app',
        '├─ ex.alpha · handoff-to-supervisor · Runs ex.alpha. Takes its units.',
        '├─ ex.beta · handoff · no description',
        '├─ ex.delta · on-hold · Runs ex.delta. Takes its units.',
        '├─ ex.epsilon · handoff-to-worker · Runs ex.epsilon. Takes its units.',
        '├─ ex.gamma · on-hold · Runs ex.gamma. Takes its units.',
        '├─ ex.long · with-supervisor · A very long routing description that runs on and on A very long routing description that runs...',
        '├─ ex.summit+sub · with-supervisor · Runs ex.summit+sub. Takes its units.',
        '╰─ summary: WORK=8 LIVE=7'
      ].join('\n')}\n`
    )

    await write(box, 'ex/ex.alpha/deep', 'ex.alpha+deep', { 'ki-parent': 'ex.alpha', 'ki-repositories': '[]' })
    await write(box, 'ex/ex.alpha/deep/deeper', 'ex.alpha+deep+deeper', { 'ki-parent': 'ex.alpha+deep' })
    const tree = await status(box, '--repo app --view tree')
    expect(tree.exitCode).toBe(0)
    expect(tree.stdout).toBe(
      `${[
        '╭─ KI WORK TREE example/app',
        '├─ ex.summit',
        '│  ├─ ex.alpha · handoff-to-supervisor · owner · since 2026-11-23T06:00:00Z',
        '│  │  ├─ ex.alpha+deep',
        '│  │  │  ╰─ ex.alpha+deep+deeper · with-supervisor · owner · since 2026-11-23T08:00:00Z',
        '│  │  ╰─ ex.delta · on-hold · nobody · since 2026-11-23T08:00:00Z',
        '│  ├─ ex.beta · handoff · run/review · since 2026-11-23T08:00:00Z',
        '│  ├─ ex.epsilon · handoff-to-worker · agent · since 2026-11-23T08:00:00Z',
        '│  ├─ ex.gamma · on-hold · nobody · since 2026-10-01T00:00:00Z',
        '│  ├─ ex.long · with-supervisor · owner · since 2026-11-23T08:00:00Z',
        '│  ├─ ex.summit+sub · with-supervisor · owner · since 2026-11-22T00:00:00Z',
        '│  ╰─ ex.zeta · finished · nobody · since 2026-11-23T08:00:00Z',
        '╰─ summary: WORK=9 SHOWN=11'
      ].join('\n')}\n`
    )
  })

  test('warns of each unreadable package and each parent that names none, leaves its territory or closes a cycle', async () => {
    const box = await setup()
    const bad = (folder: string, id: string, fields: Fields) => write(box, `bad/${folder}`, id, fields)
    await box.project.write('store/work/bad/bad.empty/10-orphan.change.md', '# Orphan\n')
    await box.project.write('store/work/bad/bad.bare/_index.md', '# No front matter\n')
    await bad('bad.id', 'Bad_Id', {})
    await bad('bad.folder', 'bad.elsewhere', {})
    await bad('bad.level', 'bad.level', { 'ki-level': 'summit' })
    await bad('bad.summit', 'bad.summit', { 'ki-level': 'territory' })
    await bad('bad.summit/strand', 'bad.summit+strand', { 'ki-parent': 'bad.other' })
    await bad('bad.parent', 'bad.parent', { 'ki-parent': '[bad.summit]' })
    await bad('bad.worker', 'bad.worker', { 'ki-worker': "''" })
    await bad('bad.supervisor', 'bad.supervisor', { 'ki-supervisor': undefined })
    await bad('bad.repositories', 'bad.repositories', { 'ki-repositories': undefined })
    await bad('bad.records', 'bad.records', { 'ki-records': '\n  - 7' })
    await bad('bad.state', 'bad.state', { 'ki-state': 'resting' })
    await bad('bad.since', 'bad.since', { 'ki-since': 'yesterday' })
    await bad('bad.handoff', 'bad.handoff', { 'ki-state': 'handoff' })
    await bad('bad.hold', 'bad.hold', { 'ki-state': 'on-hold', 'ki-hold': '{reason: bored}' })
    await bad('bad.lost', 'bad.lost', { 'ki-parent': 'bad.missing' })
    await bad('bad.abroad', 'bad.abroad', { 'ki-parent': 'ex.summit' })
    await bad('bad.one', 'bad.one', { 'ki-parent': 'bad.two' })
    await bad('bad.two', 'bad.two', { 'ki-parent': 'bad.one' })
    await bad('bad.tail', 'bad.tail', { 'ki-parent': 'bad.one' })

    const json = await status(box, '--all --format json')
    expect(json.exitCode).toBe(0)
    const ids = JSON.parse(json.stdout).work.map((work: { id: string }) => work.id)
    expect(ids).toEqual(expect.arrayContaining(['bad.lost', 'bad.abroad', 'bad.one', 'bad.two', 'bad.tail']))
    expect(ids).not.toContain('bad.summit+strand')
    const warnings = [
      'work/bad/bad.empty/ has no _index.md',
      'work/bad/bad.abroad/_index.md: ki-parent ex.summit is outside territory bad',
      'work/bad/bad.bare/_index.md: has no YAML front matter',
      'work/bad/bad.folder/_index.md: ki-id bad.elsewhere must agree with its folder, bad.folder',
      'work/bad/bad.handoff/_index.md: ki-target must name a holder in handoff',
      'work/bad/bad.hold/_index.md: ki-hold.reason must be one of paused, more-expected, snoozing while on hold',
      'work/bad/bad.id/_index.md: ki-id must be a dotted work id',
      'work/bad/bad.level/_index.md: ki-level must be one of root, territory, regular, project',
      'work/bad/bad.lost/_index.md: ki-parent bad.missing names no package in the store',
      'work/bad/bad.one/_index.md: ki-parent closes a cycle back to bad.one',
      'work/bad/bad.parent/_index.md: ki-parent must be a dotted work id',
      'work/bad/bad.records/_index.md: ki-records must be a list of record ids',
      'work/bad/bad.repositories/_index.md: ki-repositories must be a list of <territory folder>/<repository> names',
      'work/bad/bad.since/_index.md: ki-since must be a UTC time',
      'work/bad/bad.state/_index.md: ki-state must be one of with-worker, handoff-to-supervisor, with-supervisor, handoff-to-worker, handoff, on-hold, finished',
      'work/bad/bad.summit/strand/_index.md: ki-parent must name the parent package, bad.summit',
      'work/bad/bad.supervisor/_index.md: ki-supervisor must name a holder',
      'work/bad/bad.two/_index.md: ki-parent closes a cycle back to bad.two',
      'work/bad/bad.worker/_index.md: ki-worker must name a holder'
    ]
    for (const warning of warnings) expect(json.stderr).toContain(`ki: warning: ${warning}\n`)
    expect(json.stderr).not.toContain('bad.tail/_index.md')
    expect(json.stderr.split('\n').filter(Boolean)).toHaveLength(warnings.length)

    const text = await status(box, '--all --view tree')
    expect(text.stdout).toContain(`├─ warnings (${warnings.length})\n`)
    expect(text.stdout).toContain('├─ bad.lost · with-supervisor · owner')
    expect(text.stdout).not.toContain('bad.tail')
  })

  test('reads the store --store names, and refuses an unknown form or --all with --repo', async () => {
    const box = await setup()
    box.setEnv({ MCP_CAIRN_STORE: undefined })
    await box.project.write('elsewhere/work/zz/zz.summit/_index.md', entry('zz.summit', { 'ki-level': 'territory' }))
    const given = await status(box, '--all --store elsewhere --format json')
    expect(JSON.parse(given.stdout).work.map((work: { id: string }) => work.id)).toEqual(['zz.summit'])

    const none = await status(box, '--all')
    expect(none.exitCode).toBe(1)
    expect(none.stderr).toContain('no Cairn store: pass --store <dir>')

    const format = await status(box, '--all --format yaml')
    expect(format.exitCode).not.toBe(0)
    const both = await status(box, '--all --repo app')
    expect(both.exitCode).not.toBe(0)
    expect(both.stderr).toContain("option '--all' cannot be used with option '--repo <dir>'")
    const outside = await status(box, '--repo store')
    expect(outside.exitCode).toBe(2)
  })
})
