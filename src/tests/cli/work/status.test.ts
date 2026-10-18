import { mkdir, realpath, utimes } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from '../_cli_helper.ts'

const NOW = Date.parse('2026-10-18T03:00:00Z')
const now = () => NOW
const REPOSITORY = 'https://github.com/example/principal'

const declaration = (territory: readonly string[] = []): string =>
  [
    '[repo]',
    'harnesses = ["example/harness"]',
    '',
    '[skills.ki-repo-project]',
    '',
    '[skills.ki-repo]',
    'repo_type = "project"',
    'primary_shape = "ki-repo-project"',
    `repository = ${JSON.stringify(REPOSITORY)}`,
    ...territory,
    ''
  ].join('\n')

const capital = (extra: readonly string[]): readonly string[] => [
  `capital = ${JSON.stringify(REPOSITORY)}`,
  'territory_name = "Example"',
  `territory_members = ${JSON.stringify([REPOSITORY])}`,
  ...extra
]

const workFile = (id: string, fields: Readonly<Record<string, string>> = {}): string => {
  const values: Record<string, string> = {
    id,
    level: 'project',
    title: `'EX > ${id}'`,
    worker: 'agent',
    supervisor: 'owner',
    state: 'with-supervisor',
    since: '2026-10-18T02:00:00Z',
    ...fields
  }
  return `---\n${Object.entries(values)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')}\n---\n\n# ${id}\n\n## Next steps\n\n## Messages\n\n## Parked\n`
}

const checkpoint = (fields: readonly string[], status?: string): string =>
  `---\ntype: ki-checkpoint\n${fields.join('\n')}\n---\n\n${status ? `**Pick-up**\n\n- **Status:** ${status}\n` : ''}`

const writeWork = (box: Sandbox, id: string, fields?: Readonly<Record<string, string>>) =>
  box.project.write(`repo/+/_WORK/${id}/work.md`, workFile(id, fields))

const alive = (box: Sandbox, pids: readonly number[]): void =>
  box.setAgentProcesses({ launch: async () => 0, alive: (pid) => pids.includes(pid), sleep: async () => {} })

describe('ki work status', () => {
  test('reads every work file into ki/work-status/v1 with its live runs, and counts work awaiting review', async () => {
    const box = await sandbox()
    await box.project.write('repo/.ki.toml', declaration())
    await writeWork(box, 'ex.alpha', {
      theme: 'model',
      state: 'with-worker',
      since: '2026-10-18T02:00:00Z',
      beat: '2026-10-18T02:58:00Z',
      received: '2026-10-18T01:00:00Z'
    })
    await writeWork(box, 'ex.beta', { state: 'with-worker', since: '2026-10-18T02:00:00Z' })
    await writeWork(box, 'ex.gamma', { state: 'handoff-to-supervisor', blocking: 'true' })
    await writeWork(box, 'ex.regular', { level: 'regular', since: '2026-10-17T02:00:00Z' })
    await writeWork(box, 'ex.delta', { state: 'handoff-to-worker' })
    await writeWork(box, 'ex.epsilon', { state: 'handoff', target: 'run/review' })
    await writeWork(box, 'ex', {
      level: 'territory',
      state: 'on-hold',
      since: '2026-09-01T00:00:00Z',
      hold: '\n  reason: paused\n  release: "after the migration"'
    })
    await writeWork(box, 'ex.zeta', {
      state: 'on-hold',
      since: '2026-09-01T00:00:00Z',
      hold: '{reason: more-expected}'
    })
    await writeWork(box, 'ex.eta', { state: 'on-hold', hold: '{reason: paused}' })
    await writeWork(box, 'ex.theta', { state: 'finished' })
    await writeWork(box, 'ex.iota', { state: 'with-supervisor', supervisor: 'run/coordinator' })
    await box.project.write('repo/+/_WORK_REVIEW/ex.old/work.md', workFile('ex.old'))
    await mkdir(`${box.project.path}/repo/+/_WORK_REVIEW/ex.empty`, { recursive: true })
    const root = await realpath(`${box.project.path}/repo`)
    alive(box, [11, 12, 13, 14])
    await box.state.write(
      'ki/agents/ex-alpha/thread.json',
      JSON.stringify({ repository: root, folder: '+/_WORK/ex.alpha' })
    )
    for (const [name, pid] of [
      ['fresh', 11],
      ['slow', 12],
      ['silent', 13]
    ] as const)
      await box.state.write(`ki/agents/ex-alpha/${name}.pid`, `${pid}\n`)
    await box.state.write('ki/agents/ex-alpha/fresh.status', '03:58 BST - building\n')
    await box.state.write('ki/agents/ex-alpha/slow.status', '03:30 BST - thinking\n')
    const state = `${box.state.path}/ki/agents/ex-alpha`
    await utimes(`${state}/fresh.status`, new Date(NOW - 60_000), new Date(NOW - 60_000))
    await utimes(`${state}/slow.status`, new Date(NOW - 30 * 60_000), new Date(NOW - 30 * 60_000))
    await box.state.write(
      'ki/agents/other/thread.json',
      JSON.stringify({ repository: root, folder: '+/_THREADS/other' })
    )
    await box.state.write('ki/agents/other/a.pid', '14\n')
    await box.state.write('ki/agents/other/a.status', '03:59 BST - elsewhere\n')
    await box.state.write('ki/agents/queued/queue.jsonl', '{"name":"x","waitFor":[]}\n')
    await box.state.write(
      'ki/agents/queued/thread.json',
      JSON.stringify({ repository: root, folder: '+/_WORK/ex.beta' })
    )

    const json = await box.run('ki work status --repo repo --format json', { now })
    const text = await box.run('ki work status --repo repo', { now })

    expect(json.exitCode).toBe(0)
    const report = JSON.parse(json.stdout)
    expect(report).toMatchObject({ schema: 'ki/work-status/v1', repository: 'example/principal' })
    expect(report.generatedAt).toBe('2026-10-18T03:00:00Z')
    const byId = Object.fromEntries(report.work.map((entry: { id: string }) => [entry.id, entry]))
    expect(byId['ex.alpha']).toEqual({
      identity: 'example/principal',
      id: 'ex.alpha',
      level: 'project',
      title: 'EX > ex.alpha',
      theme: 'model',
      worker: 'agent',
      supervisor: 'owner',
      state: 'with-worker',
      hold: null,
      holder: 'agent',
      role: 'worker',
      target: null,
      blocking: false,
      since: '2026-10-18T02:00:00Z',
      received: '2026-10-18T01:00:00Z',
      beat: '2026-10-18T02:58:00Z',
      path: '+/_WORK/ex.alpha/work.md',
      items: [
        {
          id: 'ex-alpha/fresh',
          kind: 'run',
          holder: 'run/ex-alpha',
          role: 'worker',
          state: 'with-worker',
          target: null,
          blocking: false,
          since: '2026-10-18T02:59:00Z'
        },
        expect.objectContaining({ id: 'ex-alpha/slow', since: '2026-10-18T02:30:00Z' })
      ]
    })
    expect(byId['ex.beta'].items).toEqual([])
    expect(byId['ex.gamma']).toMatchObject({ holder: 'owner', role: 'supervisor', blocking: true })
    expect(byId['ex.delta']).toMatchObject({ holder: 'agent', role: 'worker' })
    expect(byId['ex.epsilon']).toMatchObject({ holder: 'run/review', role: null, target: 'run/review' })
    expect(byId['ex']).toMatchObject({
      level: 'territory',
      holder: null,
      role: null,
      hold: { reason: 'paused', release: 'after the migration' }
    })
    expect(byId['ex.zeta'].hold).toEqual({ reason: 'more-expected', release: null })
    expect(byId['ex.theta']).toMatchObject({ state: 'finished', holder: null })
    expect(json.stderr).toBe('')

    expect(text.exitCode).toBe(0)
    expect(text.stdout).toBe(
      [
        '╭─ KI WORK STATUS example/principal',
        '├─ with you (2)',
        '│  ├─ 🧑 ex.regular · owner · since 2026-10-17T02:00:00Z',
        '│  ╰─ 🧑 ex.gamma · owner · since 2026-10-18T02:00:00Z',
        '├─ stuck (2)',
        '│  ├─ ⏳ ex-alpha/slow · run/ex-alpha · since 2026-10-18T02:30:00Z',
        '│  ╰─ ⏳ ex.beta · agent · since 2026-10-18T02:00:00Z',
        '├─ blocked (2)',
        '│  ├─ ⛔ ex.epsilon · run/review · since 2026-10-18T02:00:00Z',
        '│  ╰─ ⛔ ex.gamma · owner · since 2026-10-18T02:00:00Z',
        '├─ moving (4)',
        '│  ├─ 🤖 ex.alpha · agent · since 2026-10-18T02:00:00Z',
        '│  ├─ 🤖 ex-alpha/fresh · run/ex-alpha · since 2026-10-18T02:59:00Z',
        '│  ├─ 🤖 ex.delta · agent · since 2026-10-18T02:00:00Z',
        '│  ╰─ 🤖 ex.iota · run/coordinator · since 2026-10-18T02:00:00Z',
        '├─ on hold (3)',
        '│  ├─ ⏸️ ex · nobody · since 2026-09-01T00:00:00Z · paused over 31 days',
        '│  ├─ ⏸️ ex.eta · nobody · since 2026-10-18T02:00:00Z',
        '│  ╰─ ⏸️ ex.zeta · nobody · since 2026-09-01T00:00:00Z',
        '├─ awaiting review (1)',
        '╰─ summary: WORK=11 WITH_YOU=2 STUCK=2 BLOCKED=2 MOVING=4 ON_HOLD=3 REVIEW=1',
        ''
      ].join('\n')
    )
  })

  test('warns of each unreadable work file and lists the rest', async () => {
    const box = await sandbox()
    await box.project.write('repo/.ki.toml', declaration())
    const cases: readonly (readonly [string, string, string])[] = [
      ['ex.a', '# no front matter\n', 'has no YAML front matter'],
      ['ex.b', '---\nid: [unclosed\n---\n', 'has no YAML front matter'],
      ['ex.c', '---\n- one\n---\n', 'has no YAML front matter'],
      ['ex.d', workFile('Ex_D'), 'id must be a dotted work id'],
      ['ex.e', workFile('ex.other'), 'id ex.other must name its folder'],
      ['ex.f', workFile('ex.f', { level: 'initiative' }), 'level must be one of territory, regular, project'],
      ['ex.g', workFile('ex.g', { title: "' '" }), 'title must be a non-empty string'],
      ['ex.h', workFile('ex.h', { worker: 'someone' }), 'worker must name a holder'],
      ['ex.i', workFile('ex.i', { supervisor: 'work/Bad' }), 'supervisor must name a holder'],
      ['ex.j', workFile('ex.j', { state: 'busy' }), 'state must be one of with-worker, handoff-to-supervisor'],
      ['ex.k', workFile('ex.k', { since: 'yesterday' }), 'since must be a UTC time'],
      ['ex.l', workFile('ex.l', { state: 'handoff' }), 'target must name a holder in handoff'],
      ['ex.m', workFile('ex.m', { state: 'on-hold' }), 'hold.reason must be paused or more-expected while on hold']
    ]
    for (const [folder, contents] of cases) await box.project.write(`repo/+/_WORK/${folder}/work.md`, contents)
    await mkdir(`${box.project.path}/repo/+/_WORK/ex.n`, { recursive: true })
    await writeWork(box, 'ex.ok', { worker: 'person/kris', supervisor: 'work/ex', since: '2026-10-18T02:00:00+01:00' })

    const json = await box.run('ki work status --repo repo --format json', { now })
    const text = await box.run('ki work status --repo repo', { now })

    expect(json.exitCode).toBe(0)
    expect(JSON.parse(json.stdout).work.map((entry: { id: string }) => entry.id)).toEqual(['ex.ok'])
    expect(JSON.parse(json.stdout).work[0].since).toBe('2026-10-18T01:00:00Z')
    for (const [folder, , message] of cases)
      expect(json.stderr).toContain(`ki: warning: +/_WORK/${folder}/work.md: ${message}`)
    expect(json.stderr).toContain('ki: warning: +/_WORK/ex.n/ has no work.md\n')
    expect(text.stdout).toContain(`├─ warnings (${cases.length + 1})`)
    expect(text.stdout).toContain('│  ├─ ! +/_WORK/ex.a/work.md: has no YAML front matter')
  })

  test('reads thread-model checkpoints through the tolerance window, warning of each new home', async () => {
    const box = await sandbox()
    await box.project.write('repo/.ki.toml', declaration(capital(['territory_aliases = ["ex", "example"]'])))
    await box.project.write('repo/+/_CHECKPOINTS/README.md', checkpoint(['thread: readme']))
    await box.project.write(
      'repo/+/_CHECKPOINTS/_state-of-play.md',
      checkpoint(["label: 'Master: state-of-play'", 'updated_at: 2026-10-17T12:58:00Z'], 'rest, wrapped up')
    )
    await box.project.write(
      'repo/+/_CHECKPOINTS/model.ways-of-working.md',
      checkpoint(["updated_at: '2026-10-18T01:28:00Z'"], 'busy. a run is out')
    )
    await box.project.write(
      'repo/+/_CHECKPOINTS/rig.mac-studio.md',
      checkpoint(['created_at: 2026-10-01T00:00:00Z'], 'hold until the hardware arrives')
    )
    await box.project.write(
      'repo/+/_CHECKPOINTS/registry-removal.md',
      checkpoint(['updated_at: 2026-10-15T12:19:09Z'], 'paused')
    )
    await box.project.write('repo/+/_CHECKPOINTS/undated.md', checkpoint(['thread: undated']))
    await box.project.write('repo/+/_CHECKPOINTS/notes.md', '---\ntype: note\n---\n')
    await box.project.write('repo/+/_CHECKPOINTS/plain.md', '# not a checkpoint\n')
    await box.project.write('repo/+/_CHECKPOINTS/log.txt', 'not markdown\n')
    await mkdir(`${box.project.path}/repo/+/_CHECKPOINTS/folder.md`, { recursive: true })

    const json = await box.run('ki work status --repo repo --format json', { now })

    expect(json.exitCode).toBe(0)
    const byId = Object.fromEntries(JSON.parse(json.stdout).work.map((entry: { id: string }) => [entry.id, entry]))
    expect(Object.keys(byId)).toEqual(['ex', 'ex.ways-of-working', 'ex.regular.registry-removal', 'ex.mac-studio'])
    expect(byId['ex']).toMatchObject({
      level: 'territory',
      title: 'Master: state-of-play',
      state: 'with-supervisor',
      holder: 'owner',
      since: '2026-10-17T12:58:00Z',
      path: '+/_CHECKPOINTS/_state-of-play.md',
      items: []
    })
    expect(byId['ex.ways-of-working']).toMatchObject({
      level: 'project',
      title: 'model.ways-of-working',
      state: 'with-worker',
      holder: 'agent'
    })
    expect(byId['ex.mac-studio']).toMatchObject({
      state: 'on-hold',
      hold: { reason: 'paused', release: null },
      since: '2026-10-01T00:00:00Z'
    })
    expect(byId['ex.regular.registry-removal']).toMatchObject({ level: 'regular', state: 'with-supervisor' })
    expect(json.stderr).toContain(
      'ki: warning: +/_CHECKPOINTS/_state-of-play.md is a thread-model checkpoint; move it to +/_WORK/ex/work.md\n'
    )
    expect(json.stderr).toContain('ki: warning: +/_CHECKPOINTS/undated.md: updated_at must be a UTC time\n')
    expect(json.stderr).not.toContain('README')
  })

  test("takes a legacy id's territory from a work file, else the Capital's handle, else the folder", async () => {
    const box = await sandbox()
    await box.project.write('repo/.ki.toml', declaration())
    await writeWork(box, 'ki.ways-of-working')
    await box.project.write('repo/+/_CHECKPOINTS/rig.chezmoi.md', checkpoint(['updated_at: 2026-10-18T01:31:20Z']))
    await box.project.write('prefixed/.ki.toml', declaration(capital(['territory_prefix = "example-islands"'])))
    await box.project.write('prefixed/+/_CHECKPOINTS/rig.chezmoi.md', checkpoint(['updated_at: 2026-10-18T01:31:20Z']))
    await box.project.write('bare/.ki.toml', declaration())
    await box.project.write('bare/+/_CHECKPOINTS/rig.chezmoi.md', checkpoint(['updated_at: 2026-10-18T01:31:20Z']))

    const ids = async (repository: string) =>
      JSON.parse((await box.run(`ki work status --repo ${repository} --format json`, { now })).stdout).work.map(
        (entry: { id: string }) => entry.id
      )

    expect(await ids('repo')).toEqual(['ki.ways-of-working', 'ki.chezmoi'])
    expect(await ids('prefixed')).toEqual(['example-islands.chezmoi'])
    expect(await ids('bare')).toEqual(['bare.chezmoi'])
  })

  test('shows empty views for a repository with no work, from the working directory by default', async () => {
    const box = await sandbox()
    await box.project.write('repo/.ki.toml', declaration())
    box.cd('repo')

    const result = await box.run('ki work status', { now })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('├─ with you (0)\n├─ stuck (0)')
    expect(result.stdout).toContain('╰─ summary: WORK=0 WITH_YOU=0 STUCK=0 BLOCKED=0 MOVING=0 ON_HOLD=0 REVIEW=0\n')
  })

  test('rejects an unknown format and a directory that is not a KI repository', async () => {
    const box = await sandbox()
    await box.project.write('repo/.ki.toml', declaration())
    await box.project.mkdir('plain')

    const format = await box.run('ki work status --repo repo --format yaml', { now })
    const plain = await box.run('ki work status --repo plain', { now })

    expect(format.exitCode).toBe(2)
    expect(format.output).toContain("argument 'yaml' is invalid")
    expect(plain.exitCode).toBe(2)
    expect(plain.output).toContain('--repo must name a repository containing .ki.toml')
  })
})
