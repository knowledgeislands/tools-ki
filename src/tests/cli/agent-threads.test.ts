import { realpath, utimes } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { runCommand, type Sandbox, sandbox } from './_cli_helper.ts'

const now = () => Date.parse('2026-10-07T19:30:00Z')

/** Fake detached processes: only the given pids are alive. */
const alive = (box: Sandbox, pids: readonly number[]): void =>
  box.setAgentProcesses({ launch: async () => 0, alive: (pid) => pids.includes(pid), sleep: async () => {} })

describe('ki agent status with no run', () => {
  const setupRuns = async (box: Sandbox): Promise<void> => {
    alive(box, [11, 12])
    await box.state.write('ki/agents/live/thread.json', '{"repository":"/work/repo","folder":"+/_THREADS/live"}\n')
    await box.state.write('ki/agents/live/a.pid', '11\n')
    await box.state.write('ki/agents/live/a.status', '21:05 CEST - building\n')
    await box.state.write('ki/agents/live/b.pid', '10\n')
    await box.state.write('ki/agents/live/b.status', 'DONE\n')
    await box.state.write('ki/agents/live/h.pid', '12\n')
    await box.state.write('ki/agents/live/h.status', '21:06 CEST - held until a finish\n')
    await box.state.write(
      'ki/agents/queued/queue.jsonl',
      '{"name":"x","waitFor":[]}\n{"name":"y","waitFor":["x","w"]}\n'
    )
    await box.state.write('ki/agents/rest/c.pid', '13\n')
    await box.state.write('ki/agents/rest/c.status', 'DONE\n')
    await box.state.write('ki/agents/_archive/old/d.pid', '11\n')
    await box.state.write('ki/agents/stray.txt', 'not a run\n')
  }

  test('lists each live run with its thread home and live agents, in the banner form', async () => {
    const box = await sandbox()
    await setupRuns(box)

    const result = await box.run('ki agent status', { now })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe(
      [
        'live (/work/repo/+/_THREADS/live)',
        '- [running] a - 21:05 CEST - building',
        '- [running] h - 21:06 CEST - held until a finish',
        '',
        'queued (no work folder)',
        '- [queued] x - position 1',
        '- [queued] y - position 2, waiting for x, w',
        ''
      ].join('\n')
    )
    const all = await box.run('ki agent status --all', { now })
    expect(all.stdout).toContain('\n\nrest (no work folder)\n- [at rest]\n')
    expect(all.stdout).not.toMatch(/^old /m)
    expect(await box.state.read('ki/agents/live/a.status')).toBe('21:05 CEST - building\n')
  })

  test('says when nothing is live, and refuses --all beside a run name', async () => {
    const box = await sandbox()
    alive(box, [])
    expect((await box.run('ki agent status', { now })).stdout).toBe('no live runs\n')
    expect((await box.run('ki agent status --all', { now })).stdout).toBe('no runs\n')
    await box.state.write('ki/agents/rest/c.pid', '13\n')
    expect((await box.run('ki agent status', { now })).stdout).toBe('no live runs\n')

    const both = await box.run('ki agent status rest --all', { now })
    expect(both.exitCode).toBe(2)
    expect(both.stderr).toBe('ki: error: --all lists every run; give it without a run name\n')
  })
})

describe('ki agent send', () => {
  /** A Git project owning the at-rest coordinator run `gov`, a live run and a finished one. */
  const setupSend = async (box: Sandbox): Promise<string> => {
    await box.project.git(['init', '-q'])
    box.setRunner(runCommand)
    alive(box, [11])
    const root = await realpath(box.project.path)
    await box.state.write(
      'ki/agents/gov/thread.json',
      `${JSON.stringify({ repository: root, folder: '+/_THREADS/gov' })}\n`
    )
    await box.state.write('ki/agents/gov/a.pid', '10\n')
    await box.state.write('ki/agents/live/a.pid', '11\n')
    await box.state.write('ki/agents/live/a.status', '19:20 UTC - building\n')
    await box.state.write('ki/agents/rest/c.pid', '13\n')
    await box.state.write('ki/agents/rest/c.status', 'DONE\n')
    return root
  }
  const send = (box: Sandbox, ...rest: string[]) => box.run(['ki', 'agent', 'send', ...rest], { now })

  test("appends a line naming the sender to a live run's inbox, which its next status shows once", async () => {
    const box = await sandbox()
    await setupSend(box)

    expect((await send(box, 'live', 'Rebase', 'on main.')).stdout).toBe(
      `Sent to live in ${box.state.path}/ki/agents/live/inbox.md\n`
    )
    box.setEnv({ KI_AGENT_RUN: 'marked' })
    expect((await send(box, 'live', 'From the marker.', '--from', 'ignored')).exitCode).toBe(0)
    box.setEnv({ KI_AGENT_RUN: undefined })
    expect((await send(box, 'live', 'From the option.', '--from', 'named')).exitCode).toBe(0)
    const sent = [
      '2026-10-07T19:30:00Z from gov: Rebase on main.',
      '2026-10-07T19:30:00Z from marked: From the marker.',
      '2026-10-07T19:30:00Z from named: From the option.'
    ]
    expect(await box.state.read('ki/agents/live/inbox.md')).toBe(`${sent.join('\n')}\n`)

    const status = await box.run('ki agent status live', { now })
    expect(status.stdout).toBe(['a: 19:20 UTC - building', ...sent.map((line) => `inbox: ${line}`), ''].join('\n'))
    expect((await box.run('ki agent status live', { now })).stdout).toBe('a: 19:20 UTC - building\n')
    await send(box, 'live', 'Later.')
    expect((await box.run('ki agent status live', { now })).stdout).toBe(
      'a: 19:20 UTC - building\ninbox: 2026-10-07T19:30:00Z from gov: Later.\n'
    )
  })

  test('refuses a run that is not live, a bad line, and an unknown sender', async () => {
    const box = await sandbox()
    const root = await setupSend(box)

    const rest = await send(box, 'rest', 'Hello.')
    expect(rest.exitCode).toBe(1)
    expect(rest.stderr).toBe('ki: error: rest is not live: no agent is running or held and its queue is empty\n')
    expect((await send(box, 'gone', 'Hello.')).stderr).toBe('ki: error: no such run: gone\n')
    for (const line of [' ', 'two\nlines'])
      expect((await send(box, 'live', line)).stderr).toBe('ki: error: send takes one non-empty line\n')
    expect((await send(box, 'live', 'Hello.', '--from', 'bad/name')).stderr).toBe(
      "ki: error: invalid run: 'bad/name'\n"
    )
    expect(await box.state.read('ki/agents/rest/inbox.md').catch(() => 'absent')).toBe('absent')

    await box.state.write(
      'ki/agents/live/thread.json',
      `${JSON.stringify({ repository: root, folder: '+/_THREADS/live' })}\n`
    )
    const shared = await send(box, 'live', 'Hello.')
    expect(shared.exitCode).toBe(2)
    expect(shared.stderr).toBe(
      'ki: error: gov, live all have their thread in this repository; name the sender with --from <run>\n'
    )
    box.cd('../home')
    expect((await send(box, 'live', 'Hello.')).stderr).toBe(
      "ki: error: no run has its thread in this directory's repository; name the sender with --from <run>\n"
    )
    expect(await box.state.read('ki/agents/live/inbox.md').catch(() => 'absent')).toBe('absent')
  })
})

describe('ki agent decide with a bare option letter', () => {
  const report = async (box: Sandbox, name: string, body: string, day: number): Promise<void> => {
    await box.project.write(`+/_WORK/ki.r/${name}`, body)
    const at = new Date(`2026-10-0${day}T12:00:00Z`)
    await utimes(`${box.project.path}/+/_WORK/ki.r/${name}`, at, at)
  }

  test('logs the option wording from the newest report carrying the tag, naming it in source:', async () => {
    const box = await sandbox()
    await box.project.git(['init', '-q'])
    box.setRunner(runCommand)
    await box.project.write('+/_WORK/ki.r/work.md', '---\nid: ki.r\n---\n')
    await box.run('ki agent decide r PROBE - ship it as planned', { now })
    await report(
      box,
      'older.report.md',
      '## Queries\n\n### PROBE - Pick\n\n**Options:**\n\na) Old.\nb) Old.\nc) Old.\n',
      1
    )
    await report(
      box,
      'newer.report.md',
      [
        '# Report',
        '## Done',
        '### PROBE - not a query',
        '## Queries',
        '### OTHER - Else',
        '**Options:**',
        'a) Other.',
        '### PROBE - Pick one',
        '**Context:** a) not an option.',
        'a) Nor this.',
        '**Options:**',
        'a) (recommended) Ship it now.',
        '- b) Hold it.',
        '### NEXT - Later',
        '**Options:**',
        'c) Stray.',
        ''
      ].join('\n\n'),
      2
    )
    await report(box, 'none.report.md', '## Queries\n\n### ELSE - Nothing\n', 3)
    await box.project.write('+/_WORK/ki.r/notes.md', '## Queries\n\n### PROBE - Pick\n')

    expect((await box.run('ki agent decide r PROBE - a', { now })).exitCode).toBe(0)
    await box.run(['ki', 'agent', 'decide', 'r', 'PROBE — b)', '--home', 'docs/x.md', '--class', 'operational'], {
      now
    })
    const log = await box.project.read('+/_WORK/ki.r/decisions.md')
    expect(log).toBe(
      [
        '# Decisions',
        '',
        '## Decision 1 (2026-10-07T19:30:00Z)',
        '',
        '- PROBE - ship it as planned',
        '',
        '## Decision 2 (2026-10-07T19:30:00Z)',
        '',
        'source: +/_WORK/ki.r/newer.report.md',
        '',
        '- a) Ship it now.',
        '',
        '## Decision 3 (2026-10-07T19:30:00Z)',
        '',
        'home: docs/x.md',
        'class: operational',
        'source: +/_WORK/ki.r/newer.report.md',
        '',
        '- b) Hold it.',
        ''
      ].join('\n')
    )

    const missing = await box.run('ki agent decide r PROBE - c', { now })
    expect(missing.exitCode).toBe(1)
    expect(missing.stderr).toBe('ki: error: +/_WORK/ki.r/newer.report.md has no option c) under PROBE\n')
    const untagged = await box.run('ki agent decide r NOWHERE - b', { now })
    expect(untagged.exitCode).toBe(1)
    expect(untagged.stderr).toBe('ki: error: no report in the thread folder of r carries a NOWHERE query\n')
    const bare = await box.run('ki agent decide r b)', { now })
    expect(bare.exitCode).toBe(2)
    expect(bare.stderr).toBe("ki: error: 'b)' is a bare option letter; give its query tag, as '<TAG> - b'\n")
    expect((await box.run('ki agent decide fresh PROBE - a --log elsewhere.md', { now })).stderr).toBe(
      'ki: error: no report in the thread folder of fresh carries a PROBE query\n'
    )
    await box.state.write('ki/agents/moved/thread.json', '{"repository":"/nowhere","folder":"+/_THREADS/moved"}\n')
    expect((await box.run('ki agent decide moved PROBE - a', { now })).stderr).toBe(
      'ki: error: no report in the thread folder of moved carries a PROBE query\n'
    )
    expect(await box.project.read('+/_WORK/ki.r/decisions.md')).toBe(log)
    expect(await box.project.read('elsewhere.md').catch(() => 'absent')).toBe('absent')
  })
})
