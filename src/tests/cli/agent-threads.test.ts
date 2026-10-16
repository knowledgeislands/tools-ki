import { describe, expect, test } from 'vitest'
import { type Sandbox, sandbox } from './_cli_helper.ts'

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
        'queued (no thread home)',
        '- [queued] x - position 1',
        '- [queued] y - position 2, waiting for x, w',
        ''
      ].join('\n')
    )
    const all = await box.run('ki agent status --all', { now })
    expect(all.stdout).toContain('\n\nrest (no thread home)\n- [at rest]\n')
    expect(all.stdout).not.toContain('old')
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
