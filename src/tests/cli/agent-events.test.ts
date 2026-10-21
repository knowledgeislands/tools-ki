import { rm, utimes } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { type AgentLaunch, runCommand, type Sandbox, sandbox } from './_cli_helper.ts'

const now = () => Date.parse('2026-10-07T19:30:00Z')
const assets = 'ki/harnesses/knowledgeislands/ki-agentic-harness/skills/governance/ki-delegation/assets'

/** A Git project as the thread home, a harness shipping the run assets, and fake detached processes. */
const setupRun = async (box: Sandbox) => {
  box.setEnv({ TZ: 'UTC' })
  await box.project.git(['init', '-q'])
  box.setRunner(runCommand)
  await box.project.write('+/_WORK/ki.r/work.md', '---\nid: ki.r\n---\n')
  await box.project.git(['add', '--', '+/_WORK/ki.r/work.md'])
  await box.project.git(['commit', '-q', '-m', 'work'])
  await box.data.write(`${assets}/rules-none.md`, '# Footer\n\n## Rules\n\n- Rule.\n')
  await box.data.write(`${assets}/run-prompt.md`, '# Task\n')
  await box.project.write('task.md', '# Task\n')
  // A run started under run events; a test of an older run removes the snapshot.
  await box.state.write('ki/agents/r/events.state.json', '{}\n')
  const launches: AgentLaunch[] = []
  const alive = new Set<number>()
  box.setAgentProcesses({
    launch: async (launch) => {
      launches.push(launch)
      alive.add(1000 + launches.length)
      return 1000 + launches.length
    },
    alive: (pid) => alive.has(pid),
    sleep: async () => alive.clear()
  })
  return { launches, alive }
}

interface Event {
  readonly seq: number
  readonly agent: string
  readonly attempt: number
  readonly kind: string
  readonly text: string
  readonly tag?: string
}

const events = async (box: Sandbox): Promise<Event[]> =>
  (await box.state.read('ki/agents/r/events.jsonl'))
    .split('\n')
    .filter((line) => line)
    .map((line) => JSON.parse(line) as Event)

const kinds = async (box: Sandbox): Promise<string[]> =>
  (await events(box)).map((event) => `${event.agent} ${event.kind}: ${event.tag ? `${event.tag} - ` : ''}${event.text}`)

/** A run from before run events: no snapshot and no log, with agents that already ended. */
const olderRun = async (box: Sandbox): Promise<void> => {
  await rm(`${box.state.path}/ki/agents/r/events.state.json`)
  await box.state.write('ki/agents/r/answered.pid', '5\n')
  await box.state.write('ki/agents/r/answered.report.md', '## Queries\n\n### HOOK-FIX - Fix the hook\n')
  await box.state.write('ki/agents/r/answered.status', '19:20 UTC - milestone: reported\nDONE\n')
  await box.state.write('ki/agents/r/moved.pid', '6\n')
  await box.state.write('ki/agents/r/moved.status', 'DONE\n')
  await box.state.write('ki/agents/r/quit.pid', '7\n')
  await box.state.write('ki/agents/r/quit.status', '19:22 UTC - failed: tests red\n')
}

const wait = async (box: Sandbox): Promise<string> => (await box.run('ki agent wait r --next', { now })).stdout

const written = async (box: Sandbox, file: string, body: string, minute: number): Promise<void> => {
  await box.state.write(`ki/agents/r/${file}`, body)
  const at = new Date(`2026-10-07T19:${minute}:00Z`)
  await utimes(`${box.state.path}/ki/agents/r/${file}`, at, at)
}

describe('ki agent run events', () => {
  test('returns finishes in the order they happened, not in name order (the 13 October defect)', async () => {
    const box = await sandbox()
    await setupRun(box)
    for (const [name, minute] of [
      ['notify', 25],
      ['review-astra', 31],
      ['merge', 52]
    ] as const) {
      await written(box, `${name}.pid`, '5\n', minute)
      await written(box, `${name}.report.md`, '# Report\n', minute)
      await written(box, `${name}.status`, `19:${minute} UTC - reported\nDONE\n`, minute)
    }

    expect([await wait(box), await wait(box), await wait(box), await wait(box)]).toEqual([
      'notify done: 19:25 UTC - reported\n',
      'review-astra done: 19:31 UTC - reported\n',
      'merge done: 19:52 UTC - reported\n',
      'ALL FINISHED\n'
    ])
    expect((await events(box)).map((event) => [event.seq, event.attempt])).toEqual([
      [1, 1],
      [2, 1],
      [3, 1]
    ])
  })

  test('raises one needs-owner event per outstanding query, in either report shape', async () => {
    const box = await sandbox()
    await setupRun(box)
    await box.run('ki agent launch r one . task.md', { now })
    await box.project.write(
      '+/_WORK/ki.r/one.report.md',
      '# Report\n\n## Done\n\n### PUSH-1 - not a query\n\n## Queries\n\n### HOOK-FIX - Fix the hook\n\n**Context** text.\n\n### TMP-HOME - Choose the root\n\n### Untagged heading\n'
    )
    await box.state.write('ki/agents/r/one.status', '19:40 UTC - reported\nDONE\n')

    expect([await wait(box), await wait(box), await wait(box)]).toEqual([
      'one done: 19:40 UTC - reported\n',
      'one needs-owner: HOOK-FIX - Fix the hook\n',
      'one needs-owner: TMP-HOME - Choose the root\n'
    ])
    await box.run('ki agent status r', { now })
    expect(await events(box)).toHaveLength(4)

    await box.project.write('+/_WORK/ki.r/one.report.md', '## Queries\n\n### HOOK-FIX - Fix the hook today\n')
    expect(await wait(box)).toBe('one needs-owner: HOOK-FIX - Fix the hook today\n')

    await box.state.write('ki/agents/r/old.pid', '7\n')
    await box.project.write('+/_WORK/ki.r/old.report.md', '## Outstanding queries\n\n#### HOOK-FIX — Fix the hook\n')
    await box.state.write('ki/agents/r/old.status', 'DONE\n')
    expect([await wait(box), await wait(box), await wait(box)]).toEqual([
      'old done: DONE\n',
      'old needs-owner: HOOK-FIX - Fix the hook\n',
      'ALL FINISHED\n'
    ])
  })

  test('copies a state-folder report into the thread folder on DONE, leaving a copy Git does not hold', async () => {
    const box = await sandbox()
    await setupRun(box)
    for (const name of ['one', 'edited', 'again']) await box.run(`ki agent launch r ${name} . task.md`, { now })
    const report = '# Report\n\n## Queries\n\n### HOOK-FIX - Fix the hook\n'
    await box.state.write('ki/agents/r/one.report.md', report)
    await box.state.write('ki/agents/r/one.status', '19:40 UTC - reported\nDONE\n')

    expect([await wait(box), await wait(box)]).toEqual([
      'one done: 19:40 UTC - reported\n',
      'one needs-owner: HOOK-FIX - Fix the hook\n'
    ])
    expect(await box.project.read('+/_WORK/ki.r/one.report.md')).toBe(report)

    // A thread-folder copy with uncommitted changes stays; one Git holds unchanged is replaced.
    await box.project.write('+/_WORK/ki.r/edited.report.md', '# Edited by hand\n')
    await box.project.write('+/_WORK/ki.r/again.report.md', '# Earlier attempt\n')
    await box.project.git(['add', '--', '+/_WORK/ki.r/again.report.md'])
    await box.project.git(['commit', '-q', '-m', 'earlier'])
    for (const name of ['edited', 'again']) {
      await box.state.write(`ki/agents/r/${name}.report.md`, `# ${name}\n`)
      await box.state.write(`ki/agents/r/${name}.status`, 'DONE\n')
    }
    await box.run('ki agent status r', { now })
    expect(await box.project.read('+/_WORK/ki.r/edited.report.md')).toBe('# Edited by hand\n')
    expect(await box.project.read('+/_WORK/ki.r/again.report.md')).toBe('# again\n')
  })

  test('leaves a report the thread retired when a lost snapshot replays its agent, homing a fresh one', async () => {
    const box = await sandbox()
    await setupRun(box)
    await box.run('ki agent launch r one . task.md', { now })
    await box.state.write('ki/agents/r/one.report.md', '# One\n')
    await box.state.write('ki/agents/r/one.status', 'DONE\n')
    await box.run('ki agent status r', { now })
    await box.project.git(['add', '--', '+/_WORK/ki.r/one.report.md'])
    await box.project.git(['commit', '-q', '-m', 'thread'])
    await box.project.git(['rm', '-q', '+/_WORK/ki.r/one.report.md'])
    await box.project.git(['commit', '-q', '-m', 'retire'])

    // The events log survives the snapshot, so derivation starts from empty and sees one end again.
    const replay = async () => {
      await rm(`${box.state.path}/ki/agents/r/events.state.json`)
      await box.run('ki agent status r', { now })
      return box.project.read('+/_WORK/ki.r/one.report.md').catch(() => 'absent')
    }
    expect(await replay()).toBe('absent')
    expect(await box.state.read('ki/agents/r/one.report.md')).toBe('# One\n')

    // A report Git has never held with these contents, as from a relaunch, is still homed.
    await box.state.write('ki/agents/r/one.report.md', '# One again\n')
    expect(await replay()).toBe('# One again\n')

    // Staged, then deleted from the working tree: the index alone holds it.
    await box.project.git(['add', '--', '+/_WORK/ki.r/one.report.md'])
    await rm(`${box.project.path}/+/_WORK/ki.r/one.report.md`)
    expect(await replay()).toBe('absent')
  })

  test('turns milestone, blocked and failed status lines into events, never re-emitting one', async () => {
    const box = await sandbox()
    await setupRun(box)
    await box.run('ki agent launch r one . task.md', { now })
    const status = (line: string) => box.state.write('ki/agents/r/one.status', `${line}\n`)
    const observe = () => box.run('ki agent status r', { now })

    for (const line of [
      '19:31 UTC - milestone: built',
      '19:31 UTC - milestone: built',
      '19:32 UTC - testing',
      '19:33 UTC - blocked: no key',
      '19:34 UTC - failed: tests red'
    ]) {
      await status(line)
      await observe()
    }

    expect(await kinds(box)).toEqual([
      'one launch: launched (pid 1001)',
      'one progress: built',
      'one blocked: no key',
      'one failed: tests red'
    ])
    expect([await wait(box), await wait(box), await wait(box)]).toEqual([
      'one blocked: no key\n',
      'one failed: tests red\n',
      'ALL FINISHED\n'
    ])
    expect(await events(box)).toHaveLength(4)
  })

  test('records a held launch and a closed gate as blocked, and a dispatcher drop', async () => {
    const box = await sandbox()
    const processes = await setupRun(box)
    processes.alive.add(6)
    await box.state.write('ki/agents/r/slow.pid', '6\n')
    await box.run('ki agent launch r one . task.md --wait-for slow', { now })
    processes.alive.clear()
    await box.run(['ki', ...(processes.launches[0] as AgentLaunch).arguments], { now })
    await box.run('ki agent queue r two task.md --wait-for slow', { now })
    await box.run('ki agent dispatch r --max 1 --interval 1 --foreground', { now })

    expect(await kinds(box)).toEqual([
      'one held: held until slow finish',
      'one blocked: gate cannot open: slow exited without DONE',
      'two blocked: could not launch: gate cannot open: slow exited without DONE'
    ])
    expect([await wait(box), await wait(box), await wait(box), await wait(box)]).toEqual([
      'one blocked: gate cannot open: slow exited without DONE\n',
      'two blocked: could not launch: gate cannot open: slow exited without DONE\n',
      'slow failed: exited without DONE (no status)\n',
      'ALL FINISHED\n'
    ])
  })

  test('appends each event once when observers race, and refuses an old owned lock', async () => {
    const box = await sandbox()
    await setupRun(box)
    // Changed in the same instant, the two agents are ordered by name.
    await written(box, 'b.pid', '6\n', 20)
    await written(box, 'a.pid', '5\n', 20)

    await Promise.all([box.run('ki agent status r', { now }), box.run('ki agent status r', { now })])
    expect(await kinds(box)).toEqual([
      'a failed: exited without DONE (no status)',
      'b failed: exited without DONE (no status)'
    ])

    await box.state.write('ki/agents/r/events.lock', '1\n')
    await box.state.write('ki/agents/r/c.pid', '7\n')
    const blocked = box.run('ki agent status r', { now: () => Date.now() })
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(await kinds(box)).toHaveLength(2)
    await rm(`${box.state.path}/ki/agents/r/events.lock`)
    expect((await blocked).exitCode).toBe(0)
    expect(await kinds(box)).toHaveLength(3)

    await written(box, 'events.lock', '1\n', 29)
    await box.state.write('ki/agents/r/d.pid', '8\n')
    expect((await box.run('ki agent status r', { now })).exitCode).toBe(1)
    expect(await kinds(box)).toHaveLength(3)
  })

  test('treats the agents an older run had already ended as seen on its first read', async () => {
    const box = await sandbox()
    const processes = await setupRun(box)
    await olderRun(box)
    processes.alive.add(8)
    await box.state.write('ki/agents/r/live.pid', '8\n')
    await box.state.write('ki/agents/r/live.status', '19:25 UTC - working\n')

    await box.run('ki agent status r', { now })
    expect(await kinds(box)).toEqual([])
    await box.state.write('ki/agents/r/live.report.md', '## Queries\n\n### TMP-HOME - Choose the root\n')
    await box.state.write('ki/agents/r/live.status', '19:40 UTC - reported\nDONE\n')
    expect([await wait(box), await wait(box), await wait(box)]).toEqual([
      'live done: 19:40 UTC - reported\n',
      'live needs-owner: TMP-HOME - Choose the root\n',
      'ALL FINISHED\n'
    ])
  })

  test('starts an older run seen when its first event is a launch, and derives a lost snapshot from empty', async () => {
    const box = await sandbox()
    await setupRun(box)
    await olderRun(box)
    await box.run('ki agent launch r fresh . task.md', { now })
    await box.run('ki agent status r', { now })
    expect(await kinds(box)).toEqual(['fresh launch: launched (pid 1001)'])

    const lost = await sandbox()
    await setupRun(lost)
    await olderRun(lost)
    await lost.state.write(
      'ki/agents/r/events.jsonl',
      `${JSON.stringify({ seq: 1, at: 'x', run: 'r', agent: 'quit', attempt: 1, kind: 'launch', text: 'launched (pid 7)' })}\n`
    )
    await lost.run('ki agent status r', { now })
    expect(await kinds(lost)).toEqual([
      'quit launch: launched (pid 7)',
      'answered progress: reported',
      'answered done: 19:20 UTC - milestone: reported',
      'answered needs-owner: HOOK-FIX - Fix the hook',
      'moved failed: no report',
      'quit failed: tests red'
    ])
  })

  test('numbers a relaunched agent as a new attempt with events of its own', async () => {
    const box = await sandbox()
    const processes = await setupRun(box)
    await box.run('ki agent launch r fix . task.md', { now })
    await box.project.write('+/_WORK/ki.r/fix.report.md', '# First\n')
    await box.project.git(['add', '--all'])
    await box.project.git(['commit', '-q', '-m', 'report'])
    await box.state.write('ki/agents/r/fix.status', '19:31 UTC - milestone: built\nDONE\n')
    expect(await wait(box)).toBe('fix done: 19:31 UTC - milestone: built\n')

    processes.alive.clear()
    expect((await box.run('ki agent launch r fix . task.md --relaunch', { now })).exitCode).toBe(0)
    await box.state.write('ki/agents/r/fix.status', '19:31 UTC - milestone: built\nDONE\n')
    expect(await wait(box)).toBe('fix done: 19:31 UTC - milestone: built\n')
    expect((await events(box)).map((event) => `${event.attempt} ${event.kind}`)).toEqual([
      '1 launch',
      '1 progress',
      '1 done',
      '2 launch',
      '2 progress',
      '2 done'
    ])
  })
})
