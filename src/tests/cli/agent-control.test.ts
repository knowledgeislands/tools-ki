import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { chmod, mkdtemp, readdir, readFile, rename, rm, symlink, utimes } from 'node:fs/promises'
import { hostname, tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, test } from 'vitest'
import {
  type AgentLaunch,
  type AgentLaunchEvidence,
  type AgentProcesses,
  type CliEntrypoint,
  runCommand,
  sandbox
} from './_cli_helper.ts'

describe('fourth review blocking regressions', () => {
  test('human control output preserves a confirmed stop and renders its inspection warning', async () => {
    const f = await fixture()
    await f.launch()
    const control = present(f.processes.control)
    f.box.setAgentProcesses({
      ...f.processes,
      control: {
        ...control,
        terminate: async (...args) => {
          await control.terminate(...args)
          await f.box.state.write('ki/agents/r/control.lock', 'foreign-holder\n')
        }
      }
    })
    const result = await f.run('ki agent stop r worker --attempt 1 --reason owner')
    expect(result.exitCode, result.output).toBe(0)
    expect(result.stdout).toContain('stopped')
    expect(result.stderr).toContain('warning: observed stopped; lock release requires inspection')
    expect(f.signals).toHaveLength(1)
    expect(await f.box.state.read('ki/agents/r/control.lock')).toBe('foreign-holder\n')
    expect((await f.events()).filter((event) => event.kind === 'stopped')).toHaveLength(1)
  })

  test('a completion inspection failure stays unconfirmed until a later healthy observation', async () => {
    const f = await fixture()
    await f.launch()
    f.set({ empty: true })
    await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
    await f.box.state.write('ki/agents/r/worker.report.md', '# Done\n')
    const control = present(f.processes.control)
    let checks = 0
    f.box.setAgentProcesses({
      ...f.processes,
      control: {
        ...control,
        inspect: async (identity) => {
          const scope = await control.inspect(identity)
          if (++checks % 2 === 0) throw new Error('completion inspection unavailable')
          return scope
        }
      }
    })
    expect((await f.run('ki agent status r')).output).toContain('completion-unconfirmed')
    expect((await f.events()).filter((event) => event.kind === 'done' || event.kind === 'failed')).toHaveLength(0)
    f.box.setAgentProcesses(f.processes)
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    expect((await f.events()).filter((event) => event.kind === 'done')).toHaveLength(1)
  })

  test('pending ties use publication identity and retain the latest legacy snapshot', async () => {
    const f = await fixture(false)
    await f.launch()
    const snapshot = JSON.parse(await f.box.state.read('ki/agents/r/events.state.json'))
    await f.box.state.write(
      'ki/agents/r/events.state.json',
      JSON.stringify({ worker: { ...snapshot.worker, attempt: 2 } })
    )
    for (const publication of ['b', 'a']) {
      await f.box.state.write(
        `ki/agents/r/events.pending/${publication}.json`,
        JSON.stringify({
          publication,
          agent: 'worker',
          attempt: 2,
          kind: 'progress',
          text: publication,
          publicationOrder: 1
        })
      )
    }
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    expect((await f.events()).filter((event) => event.kind === 'progress').map((event) => event.text)).toEqual([
      'a',
      'b'
    ])
  })

  test('legacy query adoption checks each tag even when another query survives', async () => {
    const f = await fixture(false)
    await f.launch()
    await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
    await f.box.state.write(
      'ki/agents/r/worker.report.md',
      '# Done\n\n## Queries\n\n### FIRST - First\n\n### SECOND - Second\n'
    )
    f.set({ empty: true })
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    const events = await f.events()
    const query = events.find((event) => event.kind === 'needs-owner' && event.tag === 'SECOND')
    expect(query).toBeDefined()
    query.tag = 'CHANGED'
    await f.box.state.write('ki/agents/r/events.jsonl', `${events.map((event) => JSON.stringify(event)).join('\n')}\n`)
    await f.box.state.write('ki/agents/r/events.history', 'ki/agent-events/v1\n')
    const result = await f.run('ki agent status r')
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('lost an observed query')
  })

  test('legacy cancelled queue outcomes publish once without a stored reason', async () => {
    const f = await fixture(false)
    const queued = await f.queue()
    const store = await f.state()
    Object.assign(store.entries[queued.entry], { state: 'cancelled', disposition: 'blocked' })
    await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    expect(
      (await f.events()).filter(
        (event) => event.kind === 'blocked' && event.text.includes('preserved blocked queue outcome')
      )
    ).toHaveLength(1)
  })

  test('corrupt queue projection is refused without starting a worker', async () => {
    const f = await fixture(false)
    await f.queue()
    await f.box.state.write('ki/agents/r/queue.jsonl', '{')
    const result = await f.run('ki agent dispatch r --max 1 --foreground')
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('queue-evidence-unverified')
    expect(f.launched()).toBe(0)
  })

  test('a dead held predecessor appears blocked in overview and closes queued dependants', async () => {
    const f = await fixture(false)
    await f.box.state.write('ki/agents/r/before.pid', '17\n')
    expect((await f.run('ki agent launch r worker . brief.md --wait-for before --json')).exitCode).toBe(0)
    await f.run('ki agent queue r dependent brief.md --wait-for worker --json')
    f.box.setAgentProcesses({ ...f.processes, alive: (pid) => pid === 17 })
    expect((await f.run('ki agent status --all')).output).toContain('blocked')
    f.onSleep(async () => {
      await f.box.state.write('ki/agents/r/before.status', 'DONE\n')
      await f.box.state.write('ki/agents/r/before.report.md', '# Done\n')
    })
    expect((await f.run('ki agent dispatch r --max 2 --foreground')).exitCode).toBe(1)
    expect((await f.events()).filter((event) => event.agent === 'dependent' && event.kind === 'blocked')).toHaveLength(
      1
    )
    expect(f.launched()).toBe(1)
  })

  test.each(['throw', 'changed'] as const)(
    'completion rechecks a scope that becomes %s during observation',
    async (fault) => {
      const f = await fixture()
      await f.launch()
      await f.box.state.write('ki/agents/r/worker.report.md', '# Done\n')
      await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
      f.set({ empty: true })
      const control = present(f.processes.control)
      let observations = 0
      f.box.setAgentProcesses({
        ...f.processes,
        control: {
          ...control,
          inspect: async (identity) => {
            const result = await control.inspect(identity)
            if (await f.box.state.read('ki/agents/r/events.lock').catch(() => undefined)) {
              if (++observations === 4) {
                if (fault === 'throw') throw new Error('scope unavailable during completion')
                return { ...result, fenced: false }
              }
            }
            return result
          }
        }
      })
      expect((await f.run('ki agent status r')).exitCode).toBe(0)
      expect(observations).toBeGreaterThanOrEqual(4)
      expect((await f.events()).filter((event) => event.kind === 'done')).toHaveLength(0)
      f.box.setAgentProcesses(f.processes)
      expect((await f.run('ki agent status r')).exitCode).toBe(0)
      expect((await f.run('ki agent status r')).exitCode).toBe(0)
      expect((await f.events()).filter((event) => event.kind === 'done')).toHaveLength(1)
    }
  )

  test.each(['live', 'dead', 'malformed', 'invalid-pid'] as const)(
    'unfinished operation preserves %s holder evidence',
    async (holder) => {
      const f = await fixture()
      const launched = await f.launch()
      expect(launched.exitCode).toBe(0)
      const store = await f.state()
      const operation = Object.values(store.operations).find((item: any) => item.operation === 'spawn') as any
      delete operation.receipt
      await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
      const journal = (await f.box.state.read('ki/agents/r/control.journal.jsonl'))
        .split('\n')
        .filter(Boolean)
        .filter((line) => {
          const row = JSON.parse(line)
          return row.phase !== 'observed' || row.receipt.operationId !== operation.id
        })
      await f.box.state.write('ki/agents/r/control.journal.jsonl', `${journal.join('\n')}\n`)
      await rename(
        `${f.box.state.path}/ki/agents/r/control-receipts/${operation.id}.json`,
        `${f.box.state.path}/ki/agents/r/receipt.saved`
      )
      const evidence = holder === 'malformed' ? '{' : JSON.stringify({ pid: holder === 'invalid-pid' ? 0 : 17 })
      await f.box.state.write('ki/agents/r/control.lock', evidence)
      if (holder === 'dead')
        f.box.setAgentProcesses({ ...f.processes, alive: (pid) => pid !== 17 && f.processes.alive(pid) })
      const result = await f.run('ki agent status r')
      expect(await f.box.state.read('ki/agents/r/control.lock')).toBe(evidence)
      if (holder === 'malformed' || holder === 'invalid-pid') {
        expect(result.exitCode).toBe(1)
        expect(result.output).toContain('invalid holder evidence')
      } else {
        expect(result.exitCode, result.output).toBe(0)
        const events = (await f.events()).filter(
          (event) => event.kind === 'blocked' && event.operation === operation.id
        )
        expect(events).toHaveLength(holder === 'dead' ? 1 : 0)
        expect((await f.run('ki agent status r')).exitCode).toBe(0)
        expect(
          (await f.events()).filter((event) => event.kind === 'blocked' && event.operation === operation.id)
        ).toHaveLength(holder === 'dead' ? 1 : 0)
      }
    }
  )

  test.each([
    ['state', 'unknown'],
    ['state', 17],
    ['gateFailure', 17],
    ['gateFailure', '']
  ])('damaged attempt outcome %s=%s is refused before event derivation', async (field, value) => {
    const f = await fixture()
    await f.launch()
    const store = await f.state()
    store.attempts.worker[field] = value
    await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
    const journal = await f.box.state.read('ki/agents/r/events.jsonl')
    const refused = await f.run('ki agent status r')
    expect(refused.exitCode).toBe(1)
    expect(refused.output).toContain('control-state-unverified')
    expect(await f.box.state.read('ki/agents/r/events.jsonl')).toBe(journal)
  })

  test.each([
    ['state', 'unknown'],
    ['state', 17],
    ['dispositionReason', 17],
    ['dispositionReason', '']
  ])('damaged queue outcome %s=%s cannot silently drop work', async (field, value) => {
    const f = await fixture()
    const queued = await f.queue()
    const store = await f.state()
    store.entries[queued.entry][field] = value
    await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
    const refused = await f.run('ki agent status r')
    expect(refused.exitCode).toBe(1)
    expect(refused.output).toContain('control-state-unverified')
  })
  test('a protected homed report cannot hide the current worker query', async () => {
    const f = await fixture(false)
    await f.launch()
    await f.box.project.write('+/_WORK/ki.r/worker.report.md', '# Protected owner notes\n')
    await f.box.state.write(
      'ki/agents/r/worker.report.md',
      '# Done\n\n## Queries\n\n### CURRENT-QUERY - Needs attention\n'
    )
    await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
    f.set({ empty: true })
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    expect(
      (await f.events()).filter((event) => event.kind === 'needs-owner' && event.tag === 'CURRENT-QUERY')
    ).toHaveLength(1)
    expect(await f.box.project.read('+/_WORK/ki.r/worker.report.md')).toBe('# Protected owner notes\n')
  })
  test('unconfirmed native spawn cannot be settled by DONE files without owned scope evidence', async () => {
    const f = await fixture(false)
    f.box.setAgentProcesses({
      ...f.processes,
      launch: async () => {
        await f.box.state.write('ki/agents/r/worker.report.md', '# Unverified\n')
        await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
        throw new Error('lost spawn acknowledgement')
      }
    })
    expect((await f.launch()).exitCode).toBe(1)
    expect((await f.run('ki agent status r')).output).toContain('claim-unconfirmed')
    const waited = await f.run('ki agent wait r')
    expect(waited.exitCode).toBe(1)
    expect(waited.output).toContain('ownership-unverified')
    expect((await f.events()).filter((event) => event.kind === 'done' || event.kind === 'failed')).toHaveLength(0)
  })

  test('DONE files from a held supervisor cannot satisfy a worker completion gate', async () => {
    const f = await fixture(false)
    await f.box.state.write('ki/agents/r/before.pid', '17\n')
    await f.run('ki agent launch r worker . brief.md --wait-for before --json')
    await f.box.state.write('ki/agents/r/worker.report.md', '# Unexpected\n')
    await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
    expect((await f.run('ki agent status r')).output).toContain('held; worker launch not authorised')
    expect((await f.events()).filter((event) => event.kind === 'done')).toHaveLength(0)
  })
  test('a worker completing before its first publication still publishes one done event', async () => {
    const f = await fixture()
    const control = present(f.processes.control)
    f.box.setAgentProcesses({
      ...f.processes,
      control: {
        ...control,
        launch: async (...args) => {
          const owner = await control.launch(...args)
          await f.box.state.write('ki/agents/r/worker.report.md', '# Done\n')
          await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
          f.set({ empty: true })
          return owner
        }
      }
    })
    expect((await f.launch()).exitCode).toBe(0)
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    expect((await f.events()).filter((event) => event.kind === 'done')).toHaveLength(1)
  })

  test.each(['empty', 'receipt', 'terminal', 'status', 'query'])(
    'legacy history cannot discard surviving %s evidence during checkpoint adoption',
    async (kind) => {
      const f = await fixture(kind === 'receipt')
      await f.launch()
      if (kind === 'receipt') await f.stop()
      if (kind === 'status') {
        await f.box.state.write('ki/agents/r/worker.status', '12:00 UTC - milestone: retained\n')
        await f.run('ki agent status r')
      }
      if (kind === 'terminal' || kind === 'query') {
        await f.box.state.write(
          'ki/agents/r/worker.report.md',
          '# Done\n\n## Queries\n\n### OLD-QUERY - Retained question\n'
        )
        await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
        f.set({ empty: true })
        await f.run('ki agent status r')
      }
      const events = await f.events()
      const retained =
        kind === 'empty'
          ? []
          : kind === 'query'
            ? events.filter((event) => event.kind !== 'needs-owner')
            : events.slice(0, 1)
      const damaged = retained.map((event) => `${JSON.stringify(event)}\n`).join('')
      await f.box.state.write('ki/agents/r/events.history', 'ki/agent-events/v1\n')
      await f.box.state.write('ki/agents/r/events.jsonl', damaged)
      const refused = await f.run('ki agent status r')
      expect(refused.exitCode, refused.output).toBe(1)
      expect(refused.output).toContain('events-evidence-unverified')
      expect(await f.box.state.read('ki/agents/r/events.jsonl')).toBe(damaged)
    }
  )

  test.each([false, true])('verified legacy status identities adopt a checkpoint (strip source=%s)', async (strip) => {
    const f = await fixture(false)
    await f.launch()
    await f.box.state.write('ki/agents/r/worker.status', '12:00 UTC - milestone: retained\n')
    await f.run('ki agent status r')
    const events = await f.events()
    if (strip) for (const event of events) delete event.statusLine
    await f.box.state.write('ki/agents/r/events.jsonl', events.map((event) => `${JSON.stringify(event)}\n`).join(''))
    await f.box.state.write('ki/agents/r/events.history', 'ki/agent-events/v1\n')
    const adopted = await f.run('ki agent status r')
    expect(adopted.exitCode, adopted.output).toBe(0)
    expect((await f.events()).filter((event) => event.kind === 'progress')).toHaveLength(1)
    expect(JSON.parse(await f.box.state.read('ki/agents/r/events.history')).schema).toBe('ki/agent-events/v2')
  })

  test('legacy seeded completion without immutable control evidence remains readable', async () => {
    const f = await fixture(false)
    await f.box.state.write('ki/agents/r/worker.pid', '17\n')
    await f.box.state.write('ki/agents/r/worker.report.md', '# Done\n')
    await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
    await f.box.state.write('ki/agents/r/events.jsonl', '')
    await f.box.state.write('ki/agents/r/events.history', 'ki/agent-events/v1\n')
    await f.box.state.write('ki/agents/r/events.state.json', JSON.stringify({ worker: { attempt: 1, ended: true } }))
    f.set({ empty: true })
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    expect(await f.box.state.read('ki/agents/r/events.jsonl')).toBe('')
  })
  test('a same-length valid journal rewrite is rejected by its committed digest', async () => {
    const f = await fixture(false)
    await f.launch()
    const events = await f.events()
    events[0].text = 'altered valid event'
    const damaged = `${events.map((event) => JSON.stringify(event)).join('\n')}\n`
    await f.box.state.write('ki/agents/r/events.jsonl', damaged)
    expect((await f.run('ki agent status r')).exitCode).toBe(1)
    expect(await f.box.state.read('ki/agents/r/events.jsonl')).toBe(damaged)
  })
  test.each([
    ['run', 'other'],
    ['queueSource', 17],
    ['queueSource', ''],
    ['at', 17],
    ['at', 'not-a-time'],
    ['queueSource', 17],
    ['queueSource', ''],
    ['operation', 17],
    ['operation', ''],
    ['publication', 17],
    ['publication', ''],
    ['tag', 17],
    ['tag', ''],
    ['attempt', Number.MAX_SAFE_INTEGER + 1]
  ])('valid JSON with damaged journal %s=%s fails closed', async (field, value) => {
    const f = await fixture(false)
    await f.launch()
    const events = await f.events()
    events[0][field] = value
    await f.box.state.write('ki/agents/r/events.history', 'ki/agent-events/v1\n')
    const source = `${events.map((event) => JSON.stringify(event)).join('\n')}\n`
    await f.box.state.write('ki/agents/r/events.jsonl', source)
    const status = await f.run('ki agent status r')
    expect(status.exitCode).toBe(1)
    expect(status.output).toContain('events-evidence-unverified')
    expect(await f.box.state.read('ki/agents/r/events.jsonl')).toBe(source)
  })

  test.each([
    ['schema', 'other'],
    ['seq', -1],
    ['seq', '1'],
    ['sha256', 7],
    ['sha256', 'wrong'],
    ['journal', 7],
    ['journal', 'wrong']
  ])('damaged checkpoint %s=%s preserves the journal', async (field, value) => {
    const f = await fixture(false)
    await f.launch()
    const source = await f.box.state.read('ki/agents/r/events.jsonl')
    const checkpoint = JSON.parse(await f.box.state.read('ki/agents/r/events.history'))
    checkpoint[field] = value
    await f.box.state.write('ki/agents/r/events.history', JSON.stringify(checkpoint))
    expect((await f.run('ki agent status r')).exitCode).toBe(1)
    expect(await f.box.state.read('ki/agents/r/events.jsonl')).toBe(source)
  })

  test.each(['', '-1', 'NaN', '5', '9007199254740992'])(
    'damaged waiter cursor %s never consumes evidence',
    async (cursor) => {
      const f = await fixture(false)
      await f.launch()
      const journal = await f.box.state.read('ki/agents/r/events.jsonl')
      await f.box.state.write('ki/agents/r/events.seen', cursor)
      const result = await f.run('ki agent wait r --next')
      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('events-evidence-unverified')
      expect(await f.box.state.read('ki/agents/r/events.seen')).toBe(cursor)
      expect(await f.box.state.read('ki/agents/r/events.jsonl')).toBe(journal)
    }
  )

  test('a missing journal newline is repaired from the exact committed intent', async () => {
    const f = await fixture(false)
    await f.launch()
    const source = (await f.box.state.read('ki/agents/r/events.jsonl')).trimEnd()
    await f.box.state.write('ki/agents/r/events.jsonl', source)
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    expect(await f.box.state.read('ki/agents/r/events.jsonl')).toBe(`${source}\n`)
  })

  test('an unknown control journal phase is not replayed as an observation', async () => {
    const f = await fixture()
    await f.launch()
    const source = await f.box.state.read('ki/agents/r/control.journal.jsonl')
    await f.box.state.write(
      'ki/agents/r/control.journal.jsonl',
      source.replace('"phase":"observed"', '"phase":"unknown"')
    )
    const status = await f.run('ki agent status r')
    expect(status.exitCode).toBe(1)
    expect(status.output).toContain('control-state-unverified')
  })
  test('mixed legacy and numbered pending publications have a total order', async () => {
    const f = await fixture(false)
    await f.launch()
    for (const [file, publicationOrder, time] of [
      ['a', undefined, 10],
      ['b', 2, 30],
      ['c', undefined, 40],
      ['d', 1, 50]
    ] as const) {
      const path = `${f.box.state.path}/ki/agents/r/events.pending/${file}.json`
      await f.box.state.write(
        `ki/agents/r/events.pending/${file}.json`,
        JSON.stringify({
          publication: file,
          agent: 'worker',
          attempt: 1,
          kind: 'progress',
          text: file,
          publicationOrder
        })
      )
      await utimes(path, time, time)
    }
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    expect((await f.events()).filter((event) => event.kind === 'progress').map((event) => event.text)).toEqual([
      'a',
      'c',
      'd',
      'b'
    ])
  })

  test.each([
    ['failed', 'exited without DONE (no status)'],
    ['blocked', 'could not launch: old refusal']
  ])('legacy %s terminal evidence survives snapshot loss', async (kind, text) => {
    const f = await fixture(false)
    await f.launch()
    const first = (await f.events())[0]
    await f.box.state.write('ki/agents/r/events.history', 'ki/agent-events/v1\n')
    await f.box.state.write(
      'ki/agents/r/events.jsonl',
      `${JSON.stringify({ ...first, kind, text, terminal: undefined, publication: undefined })}\n`
    )
    await rename(`${f.box.state.path}/ki/agents/r/events.state.json`, `${f.box.state.path}/ki/agents/r/snapshot.saved`)
    {
      const store = await f.state()
      store.attempts.worker.state = 'failed'
      for (const attempt of Object.values(store.history) as { state: string }[]) attempt.state = 'failed'
      await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
    }
    f.set({ empty: true })
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    expect((await f.events()).filter((event) => event.kind !== 'launch')).toHaveLength(1)
  })

  test('a held scope proven empty blocks despite a reused live PID', async () => {
    const f = await fixture()
    await f.box.state.write('ki/agents/r/before.pid', '17\n')
    await f.run('ki agent launch r worker . brief.md --wait-for before --json')
    f.set({ empty: true })
    f.box.setAgentProcesses({ ...f.processes, alive: () => true })
    const status = await f.run('ki agent status r')
    expect(status.output).toContain('ownership-unverified')
    expect((await f.events()).filter((event) => event.agent === 'worker' && event.kind === 'blocked')).toHaveLength(1)
  })

  test('an ownership loss without an operation identity refuses instead of inventing an ID', async () => {
    const f = await fixture()
    await f.launch()
    const state = await f.state()
    state.operations = {}
    await f.box.state.write('ki/agents/r/control.json', JSON.stringify(state))
    await f.box.state.write('ki/agents/r/control.journal.jsonl', '')
    f.set({ ownership: false })
    const status = await f.run('ki agent status r')
    expect(status.exitCode).toBe(1)
    expect(status.output).toContain('owned attempt has no operation identity')
  })
  test.each([false, true])('lost running ownership blocks waits even with a reused PID (DONE=%s)', async (done) => {
    const f = await fixture()
    await f.launch()
    if (done) {
      await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
      await f.box.state.write('ki/agents/r/worker.report.md', '# Done\n')
    }
    f.set({ ownership: false })
    f.onSleep(async () => {
      throw new Error('lost ownership wait did not end')
    })
    const first = await f.run('ki agent wait r --next')
    expect(first.output).toContain('ownership-unverified')
    const second = await f.run('ki agent wait r --next')
    expect(second.exitCode).toBe(1)
    expect(second.output).toContain('ownership-unverified')
    expect((await f.run('ki agent wait r')).exitCode).toBe(1)
    expect((await f.events()).filter((event) => event.kind === 'blocked')).toHaveLength(1)
    expect((await f.events()).filter((event) => event.kind === 'failed' || event.kind === 'done')).toHaveLength(0)
    await f.queue('next')
    const dispatched = await f.run('ki agent dispatch r --max 2 --foreground')
    expect(dispatched.exitCode).toBe(1)
    expect(dispatched.output).toContain('ownership-unverified')
    expect(f.launched()).toBe(1)
    const closed = await f.run('ki agent close r --accept-exited worker --reconciled')
    expect(closed.exitCode).toBe(1)
    expect(closed.output).toContain('ownership-unverified')
  })
  test('relaunch publishes an unobserved completion and query before archiving their source', async () => {
    const f = await fixture(false)
    await f.launch()
    await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
    await f.box.state.write(
      'ki/agents/r/worker.report.md',
      '# Done\n\n## Queries\n\n### OLD-QUERY - Review this outcome\n'
    )
    f.set({ empty: true })
    const relaunched = await f.run('ki agent launch r worker . brief.md --relaunch --json')
    expect(relaunched.exitCode, relaunched.output).toBe(0)
    f.set({ empty: false })
    await rename(`${f.box.state.path}/ki/agents/r/events.state.json`, `${f.box.state.path}/ki/agents/r/snapshot.saved`)
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    const events = (await f.events()).filter((event) => event.agent === 'worker' && event.attempt === 1)
    expect(events.filter((event) => event.kind === 'done')).toHaveLength(1)
    expect(events.filter((event) => event.kind === 'needs-owner' && event.tag === 'OLD-QUERY')).toHaveLength(1)
  })
  test.each(['stop-timeout', 'ownership-unverified'] as const)(
    'verified completion after %s remains natural and ends waits',
    async (outcome) => {
      const f = await fixture()
      await f.launch()
      f.signal(outcome === 'stop-timeout' ? 'descendants' : 'ownership-loss')
      expect(JSON.parse((await f.stop('--grace 1')).stdout).outcome).toBe(outcome)
      await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
      await f.box.state.write('ki/agents/r/worker.report.md', '# Done\n')
      f.set({ empty: true, lost: false })
      let sleeps = 0
      f.onSleep(async () => {
        if (++sleeps > 2) throw new Error('completion wait did not end')
      })
      expect((await f.run('ki agent wait r')).output).toContain('ALL FINISHED')
      expect((await f.run('ki agent status r')).exitCode).toBe(0)
      const retried = await f.stop()
      expect(JSON.parse(retried.stdout).outcome).toBe('already-terminal')
      const events = await f.events()
      expect(events.filter((event) => event.kind === 'done')).toHaveLength(1)
      expect(events.filter((event) => event.kind === 'stopped' || event.kind === 'failed')).toHaveLength(0)
    }
  )
  test.each(['held', 'running'] as const)(
    'relaunch preserves held history and closes a superseded %s dependency',
    async (historicalState) => {
      const f = await fixture(false)
      const live = new Set([17])
      f.box.setAgentProcesses({
        ...f.processes,
        alive: (pid) => live.has(pid),
        launch: async (launch) => {
          const pid = await f.processes.launch(launch)
          live.add(pid)
          return pid
        }
      })
      await f.box.state.write('ki/agents/r/before.pid', '17\n')
      const first = await f.run('ki agent launch r worker . brief.md --wait-for before --json')
      const held = JSON.parse(first.stdout) as { pid: number; identity: { token: string } }
      const queued = await f.run('ki agent queue r next brief.md --wait-for worker --json')
      expect(queued.exitCode).toBe(0)
      live.delete(held.pid)
      await f.box.state.write('ki/agents/r/before.status', 'DONE\n')
      await f.box.state.write('ki/agents/r/before.report.md', '# Done\n')
      expect((await f.run('ki agent launch r worker . brief.md --wait-for before --relaunch --json')).exitCode).toBe(0)
      const store = await f.state()
      expect(store.history[held.identity.token].state).toBe('held')
      store.history[held.identity.token].state = historicalState
      await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
      f.onSleep(async () => {
        await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
        await f.box.state.write('ki/agents/r/worker.report.md', '# Done\n')
      })
      expect((await f.run('ki agent dispatch r --max 2 --foreground')).exitCode).toBe(0)
      const events = await f.events()
      expect(events.filter((event) => event.agent === 'next' && event.kind === 'blocked')).toHaveLength(1)
      expect(
        events.filter((event) => event.agent === 'worker' && event.attempt === 1 && event.kind === 'blocked')
      ).toHaveLength(1)
      expect(
        events.filter((event) => event.agent === 'worker' && event.attempt === 1 && event.kind === 'failed')
      ).toHaveLength(0)
    }
  )
  test.each(['stop-timeout', 'ownership-unverified'] as const)(
    'recovers exactly one %s notification after pending writes fail',
    async (outcome) => {
      const f = await fixture()
      await f.launch()
      const pending = `${f.box.state.path}/ki/agents/r/events.pending`
      await chmod(pending, 0o500)
      if (outcome === 'stop-timeout') f.signal('descendants')
      else f.signal('ownership-loss')
      let operation = ''
      try {
        // Persist stop-requested before denying the subsequent publication.
        await chmod(pending, 0o700)
        f.onSleep(async () => {
          await chmod(pending, 0o500)
        })
        if (outcome === 'ownership-unverified') {
          const control = present(f.processes.control)
          f.box.setAgentProcesses({
            ...f.processes,
            control: {
              ...control,
              terminate: async (...args) => {
                await control.terminate(...args)
                await chmod(pending, 0o500)
              }
            }
          })
        }
        const stopped = await f.stop('--grace 1')
        expect(stopped.exitCode, stopped.output).toBe(1)
        const receipt = JSON.parse(stopped.stdout)
        operation = receipt.operationId
        expect(receipt.outcome).toBe(outcome)
      } finally {
        await chmod(pending, 0o700)
      }
      for (let pass = 0; pass < 2; pass += 1) {
        expect((await f.run('ki agent status r')).exitCode).toBe(0)
        await f.stop(`--request ${operation}`)
      }
      expect(
        (await f.events()).filter((event) => event.operation === operation && event.kind === 'blocked')
      ).toHaveLength(1)
    }
  )

  test.each(['empty', 'prefix'] as const)(
    'refuses a journal truncated to %s without reusing event identities',
    async (kind) => {
      const f = await fixture()
      await f.launch()
      await f.stop()
      const journal = await f.box.state.read('ki/agents/r/events.jsonl')
      const truncated = kind === 'empty' ? '' : `${journal.split('\n')[0]}\n`
      await f.box.state.write('ki/agents/r/events.seen', '3\n')
      await f.box.state.write('ki/agents/r/events.jsonl', truncated)
      const result = await f.run('ki agent status r')
      expect(result.exitCode, result.output).toBe(0)
      expect(await f.box.state.read('ki/agents/r/events.jsonl')).toBe(journal)
      expect(await f.box.state.read('ki/agents/r/events.seen')).toBe('3\n')
      await f.box.state.write('ki/agents/r/events.jsonl', journal)
      expect((await f.run('ki agent status r')).exitCode).toBe(0)
      expect(await f.box.state.read('ki/agents/r/events.jsonl')).toBe(journal)
    }
  )

  test.each(['wait r', 'wait r --next', 'watch r 1'])(
    'dead held supervisor bounds %s and publishes ownership loss exactly once',
    async (command) => {
      const f = await fixture(false)
      await f.box.state.write('ki/agents/r/before.pid', '17\n')
      expect((await f.run('ki agent launch r worker . brief.md --wait-for before --json')).exitCode).toBe(0)
      const before = await f.state()
      const operation = present(
        (Object.values(before.operations) as { id: string; operation: string }[]).find(
          (value) => value.operation === 'spawn-supervisor'
        )
      )
      f.box.setAgentProcesses({ ...f.processes, alive: (pid) => pid === 17 })
      let sleeps = 0
      f.onSleep(async () => {
        if (++sleeps > 2) throw new Error('wait did not end after ownership loss')
      })
      const result = await f.run(`ki agent ${command}`)
      expect(result.output).toContain('ownership-unverified')
      expect(result.output).toContain(operation.id)
      expect(result.output).not.toContain('ALL FINISHED')
      expect(result.output).not.toContain('wait did not end')
      if (command === 'wait r --next') {
        const again = await f.run('ki agent wait r --next')
        expect(again.exitCode).toBe(1)
        expect(again.output).toContain(operation.id)
      }
      for (let pass = 0; pass < 2; pass += 1) await f.run('ki agent status r')
      const events = (await f.events()).filter((event) => event.agent === 'worker')
      expect(events.filter((event) => event.kind === 'blocked' && event.operation === operation.id)).toHaveLength(1)
      expect(events.filter((event) => event.kind === 'failed')).toHaveLength(0)
    }
  )
})

const present = <T>(value: T): NonNullable<T> => {
  expect(value).toBeDefined()
  expect(value).not.toBeNull()
  return value as NonNullable<T>
}

type Controller = NonNullable<AgentProcesses['control']>
type Identity = Parameters<Controller['launch']>[0]
type Observation = Awaited<ReturnType<Controller['inspect']>>
const assets = 'ki/harnesses/knowledgeislands/ki-agentic-harness/skills/governance/ki-delegation/assets'
const hash = (text: string): string => createHash('sha256').update(text).digest('hex')
const evidenced = () =>
  ({
    profiles: {
      'codex-standard': {
        profile: 'codex-standard',
        runtime: 'codex',
        model: 'fixture-codex-standard',
        efforts: ['medium', 'high', 'xhigh', 'max'],
        revision: 'fixture/v1',
        evidenceRevision: 'fixture-owner-reviewed-standard/v1'
      },
      'codex-strongest': {
        profile: 'codex-strongest',
        runtime: 'codex',
        model: 'fixture-codex-strongest',
        efforts: ['medium', 'high', 'xhigh', 'max'],
        revision: 'fixture/v1',
        evidenceRevision: 'fixture-owner-reviewed-strongest/v1'
      },
      'claude-worker': {
        profile: 'claude-worker',
        runtime: 'claude',
        model: 'fixture-claude-worker',
        efforts: ['medium', 'high', 'xhigh', 'max'],
        revision: 'fixture/v1',
        evidenceRevision: 'fixture-owner-reviewed-worker/v1'
      }
    },
    alternatives: []
  }) satisfies AgentLaunchEvidence

const fixture = async (managed = true) => {
  const box = await sandbox()
  box.setRunner(runCommand)
  await box.project.git(['init', '-q'])
  await box.project.write('+/_WORK/ki.r/work.md', '---\nid: ki.r\n---\n')
  await box.project.git(['add', '--', '+/_WORK/ki.r/work.md'])
  await box.project.git(['commit', '-q', '-m', 'base'])
  await box.project.write('brief.md', '# Bounded task\n')
  await box.project.write('authority.md', '# Grant\n\nThe owner grants this bounded recovery.\n')
  for (const tier of ['none', 'push', 'prune', 'release'])
    await box.data.write(`${assets}/rules-${tier}.md`, `# Footer\n\n## Rules\n\nTier ${tier}.\n`)
  await box.data.write(`${assets}/run-prompt.md`, '# Task\n')
  const identities: Identity[] = []
  const launches: AgentLaunch[] = []
  let signalEffect: 'empty' | 'descendants' | 'ownership-loss' | 'inspection-error' = 'empty'
  const signals: Identity[] = []
  const stopEffects = new Set<string>()
  const emptyScopes = new Set<string>()
  const deadPids = new Set<number>()
  const effects = new Map<string, { payloadSha256: string; token: string; scope: string }>()
  let time = Date.parse('2026-10-21T12:00:00Z')
  let onSleep: () => Promise<void> = async () => {}
  let empty = false
  let fenced = true
  let containment = true
  let ownership = true
  let terminal: Observation['terminal']
  let lost = false
  let launched = 0
  let failLaunch = false
  let permission = false
  let workerStarted = true
  let consumed = true
  let verified = true
  const owner = (identity: Identity) => ({
    pid: 2001 + identities.findIndex((item) => item.token === identity.token),
    birth: `birth-${identity.token}`,
    session: `session-${identity.token}`,
    group: `group-${identity.token}`,
    token: identity.token,
    scope: identity.scope,
    launcher: identity.launcher
  })
  const observe = (identity: Identity): Observation => ({
    token: identity.token,
    scope: identity.scope,
    ownership: ownership && !lost,
    containment,
    empty: empty || emptyScopes.has(identity.scope),
    fenced,
    authorisationConsumed: consumed,
    workerStarted,
    owner: owner(identity),
    terminal
  })
  const processes: AgentProcesses = {
    launch: async (launch) => {
      launches.push(launch)
      launched += 1
      return 4000 + launched
    },
    alive: (pid) =>
      !empty &&
      !deadPids.has(pid) &&
      (pid < 2001 || pid >= 4000 || !emptyScopes.has(identities[pid - 2001]?.scope ?? '')),
    sleep: async (milliseconds) => {
      time += milliseconds
      await onSleep()
    },
    ...(managed
      ? {
          control: {
            launch: async (identity, launch, phase, effect) => {
              effects.set(effect.operationId, {
                payloadSha256: effect.payloadSha256,
                token: identity.token,
                scope: identity.scope
              })
              launches.push(launch)
              identities.push(structuredClone(identity))
              launched += 1
              if (failLaunch) throw new Error('injected acknowledgement loss')
              workerStarted = phase === 'worker'
              consumed = workerStarted
              return owner(identity)
            },
            inspect: async (identity) => {
              if (signals.length && signalEffect === 'inspection-error') throw new Error('lost observation')
              return observe(identity)
            },
            terminate: async (identity, effect) => {
              if (permission) throw new Error('permission denied')
              if (stopEffects.has(effect.operationId)) return
              stopEffects.add(effect.operationId)
              signals.push(identity)
              if (identity.owner) deadPids.add(identity.owner.pid)
              if (signalEffect !== 'descendants') emptyScopes.add(identity.scope)
              if (signalEffect === 'ownership-loss') lost = true
            },
            verifyRecovery: async (identity, evidence, effect) => {
              const record = effects.get(effect.operationId)
              if (
                !verified ||
                !record ||
                record.payloadSha256 !== effect.payloadSha256 ||
                record.token !== identity.token ||
                record.scope !== identity.scope
              )
                return undefined
              for (const proof of evidence['proofs'] as { path: string }[])
                if ((await readFile(proof.path, 'utf8')) !== 'adapter-proof\n') return undefined
              return observe(identity)
            }
          } satisfies Controller
        }
      : {})
  }
  box.setAgentProcesses(processes)
  const run = (command: string | readonly string[]) => box.run(command, { now: () => time })
  const launch = () => run('ki agent launch r worker . brief.md --json')
  const stop = (extra = '') => run(`ki agent stop r worker --attempt 1 --reason owner --json ${extra}`)
  const state = async () => JSON.parse(await box.state.read('ki/agents/r/control.json'))
  const events = async () =>
    (await box.state.read('ki/agents/r/events.jsonl'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
  const queue = async (name = 'worker') => JSON.parse((await run(`ki agent queue r ${name} brief.md --json`)).stdout)
  return {
    box,
    processes,
    run,
    launch,
    stop,
    state,
    events,
    queue,
    identities,
    signals,
    launches,
    onSleep: (next: () => Promise<void>) => {
      onSleep = next
    },
    signal: (effect: typeof signalEffect) => {
      signalEffect = effect
    },
    launched: () => launched,
    set: (values: {
      empty?: boolean
      fenced?: boolean
      containment?: boolean
      ownership?: boolean
      terminal?: Observation['terminal']
      lost?: boolean
      failLaunch?: boolean
      permission?: boolean
      workerStarted?: boolean
      consumed?: boolean
      verified?: boolean
    }) => {
      empty = values.empty ?? empty
      fenced = values.fenced ?? fenced
      containment = values.containment ?? containment
      ownership = values.ownership ?? ownership
      terminal = values.terminal ?? terminal
      lost = values.lost ?? lost
      failLaunch = values.failLaunch ?? failLaunch
      permission = values.permission ?? permission
      workerStarted = values.workerStarted ?? workerStarted
      consumed = values.consumed ?? consumed
      verified = values.verified ?? verified
    }
  }
}

const declarationFixture = async (f: Awaited<ReturnType<typeof fixture>>) => {
  await f.launch()
  await f.run('ki agent launch r reviewer . brief.md --json')
  const store = await f.state()
  const identity = (name: string) => {
    const attempt = store.attempts[name]
    return { run: 'r', agent: name, attempt: attempt.attempt, token: attempt.token }
  }
  const record = '---\nid: KI-TEST-001\n---\n\n# Record\n'
  const review = '# Independent review\n'
  await f.box.project.write('record.md', record)
  await f.box.project.write('+/_WORK/ki.r/reviewer.report.md', review)
  const authority = `${f.box.project.path}/authority.md#Grant`
  const declaration = {
    schema: 'ki/agent-acceptance/v1',
    authority,
    authority_sha256: hash(await f.box.project.read('authority.md')),
    override: 'accept-named-records-only',
    records: [
      {
        id: 'KI-TEST-001',
        path: `${f.box.project.path}/record.md`,
        sha256: hash(record),
        reviews: [
          {
            path: `${f.box.project.path}/+/_WORK/ki.r/reviewer.report.md`,
            sha256: hash(review),
            reviewer_attempt: identity('reviewer'),
            delivery_attempt: identity('worker')
          }
        ]
      }
    ]
  }
  return { declaration, record, review, authority }
}

const uncertain = async () => {
  const f = await fixture()
  const queued = await f.queue()
  f.set({ failLaunch: true, workerStarted: false, consumed: false })
  expect((await f.run('ki agent dispatch r --max 1 --foreground')).exitCode).toBe(1)
  const store = await f.state()
  const operation = Object.values(store.operations).find(
    (value) => (value as { operation: string }).operation === 'spawn'
  ) as { id: string; target: Identity }
  await f.box.project.write('proof.json', 'adapter-proof\n')
  const evidence = {
    schema: 'ki/agent-reconciliation/v1',
    operation_id: operation.id,
    target_id: operation.target.token,
    observation: 'spawn-not-started',
    proofs: [{ path: `${f.box.project.path}/proof.json`, sha256: hash('adapter-proof\n') }]
  }
  const command = `ki agent recover resolve r --operation ${operation.id} --evidence evidence.json --authority ${f.box.project.path}/authority.md#Grant --json`
  return { f, queued, operation, evidence, command }
}

describe('agent control contract', () => {
  test('a confirmed natural completion remains done in subsequent status reads', async () => {
    const f = await fixture()
    await f.launch()
    await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
    await f.box.state.write('ki/agents/r/worker.report.md', '# Complete\n')
    f.set({ empty: true })
    expect((await f.stop()).exitCode).toBe(0)
    const result = await f.run('ki agent status r')
    expect(result.exitCode, result.output).toBe(0)
    expect(result.stdout).toContain('worker: finished')
    expect(f.signals).toHaveLength(0)
  })

  test('a foreground launch without a frozen packet cannot start a worker', async () => {
    const f = await fixture()
    const result = await f.run('ki agent launch r worker . brief.md --foreground')
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('selection-unverified')
    expect(f.launched()).toBe(0)
  })

  test('legacy queued requests coexist with identity-backed entries', async () => {
    const f = await fixture(false)
    await f.queue('new')
    const line = await f.box.state.read('ki/agents/r/queue.jsonl')
    const legacy = JSON.parse(line.trim())
    delete legacy.entry
    delete legacy.selection
    legacy.name = 'legacy'
    legacy.prompt = `${f.box.project.path}/brief.md`
    await f.box.state.write('ki/agents/r/queue.jsonl', `${JSON.stringify(legacy)}\n${line}`)
    f.onSleep(async () => {
      f.set({ empty: true })
    })
    const result = await f.run('ki agent dispatch r --max 2 --foreground')
    expect(result.exitCode, result.output).toBe(0)
    expect(f.launched()).toBe(2)
  })

  test('an omitted optional frozen grant list retains empty grants on dispatch', async () => {
    const f = await fixture(false)
    const queued = await f.queue()
    const store = await f.state()
    delete store.entries[queued.entry].request.allow
    await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
    f.onSleep(async () => {
      f.set({ empty: true })
    })
    const result = await f.run('ki agent dispatch r --max 1 --foreground')
    expect(result.exitCode, result.output).toBe(0)
    expect(f.launched()).toBe(1)
    expect(JSON.parse(await f.box.state.read('ki/agents/r/worker.launch.json')).grants).toEqual([])
  })

  test('a worktree replaced during preparation cannot receive the reserved attempt', async () => {
    const f = await fixture()
    f.box.setRunner(async (command, args, environment) => {
      const result = await runCommand(command, args, environment)
      if (command === 'git' && args.includes('worktree') && args.includes('add') && result.exitCode === 0) {
        const path = present(args.at(-2))
        await rename(path, `${path}-retained`)
        await symlink(f.box.project.path, path)
      }
      return result
    })
    const result = await f.run('ki agent launch r worker . brief.md --worktree . --json')
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('workdir-identity-changed')
    expect(f.launched()).toBe(0)
  })

  test('a foreign recovery reference cannot clear the original spawn fence', async () => {
    const { f, evidence, command, operation } = await uncertain()
    await f.box.project.write('evidence.json', JSON.stringify(evidence))
    f.set({ verified: false })
    const result = await f.run(`${command} --request unverified-resolution`)
    expect(result.exitCode).toBe(1)
    const store = await f.state()
    const receipt = store.operations['unverified-resolution'].receipt
    receipt.exitCode = 0
    receipt.evidence.originalOperation = 'foreign-operation'
    await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
    await f.box.state.write('ki/agents/r/control-receipts/unverified-resolution.json', JSON.stringify(receipt))
    const rows = (await f.box.state.read('ki/agents/r/control.journal.jsonl'))
      .trim()
      .split('\n')
      .map((row) => JSON.parse(row))
    for (const row of rows)
      if (row.phase === 'observed' && row.receipt.operationId === 'unverified-resolution') row.receipt = receipt
    await f.box.state.write(
      'ki/agents/r/control.journal.jsonl',
      `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`
    )
    const inspected = await f.run(`ki agent recover inspect r --operation ${operation.id} --json`)
    expect(inspected.exitCode, inspected.output).toBe(0)
    expect(JSON.parse(inspected.stdout).reason).toBe('unconfirmed')
    expect((await f.run('ki agent launch r worker . brief.md --relaunch --json')).exitCode).toBe(1)
    expect(f.launched()).toBe(1)
  })

  test('an unknown journal phase is refused before any signal', async () => {
    const f = await fixture()
    await f.launch()
    const journal = await f.box.state.read('ki/agents/r/control.journal.jsonl')
    await f.box.state.write('ki/agents/r/control.journal.jsonl', `${journal}{"phase":"foreign"}\n`)
    const result = await f.stop()
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('control-state-unverified')
    expect(f.signals).toHaveLength(0)
  })

  test('claimed attempts share the live inventory without hiding other agents', async () => {
    const f = await fixture()
    await f.box.state.write('ki/agents/r/before.pid', '900\n')
    await f.run('ki agent queue r worker brief.md --wait-for before --json')
    await f.run(`ki agent launch r worker . ${f.box.state.path}/ki/agents/r/worker.queued.md --json`)
    const overview = await f.run('ki agent status')
    expect(overview.exitCode).toBe(0)
    expect(overview.stdout).toContain('worker')
    expect(overview.stdout).toContain('before')
  })

  test('a later confirmed stop lets an interrupted earlier request replay its stopped receipt', async () => {
    const f = await fixture()
    await f.launch()
    await f.stop('--request interrupted-stop')
    const store = await f.state()
    delete store.operations['interrupted-stop'].receipt
    await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
    await rename(
      `${f.box.state.path}/ki/agents/r/control-receipts/interrupted-stop.json`,
      `${f.box.state.path}/ki/agents/r/control-receipts/interrupted-stop.saved`
    )
    const rows = (await f.box.state.read('ki/agents/r/control.journal.jsonl'))
      .trim()
      .split('\n')
      .map((row) => JSON.parse(row))
      .filter((row) => row.phase !== 'observed' || row.receipt.operationId !== 'interrupted-stop')
    await f.box.state.write(
      'ki/agents/r/control.journal.jsonl',
      `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`
    )
    expect((await f.stop('--request confirmed-stop')).exitCode).toBe(0)
    const result = await f.stop('--request interrupted-stop')
    expect(result.exitCode, result.output).toBe(0)
    expect(JSON.parse(result.stdout).outcome).toBe('stopped')
    expect(f.signals).toHaveLength(1)
  })

  test('a missing queue projection retains the original unconfirmed stop target', async () => {
    const f = await fixture()
    const queued = await f.queue()
    await f.stop('--request interrupted-queue-stop')
    const store = await f.state()
    delete store.operations['interrupted-queue-stop'].receipt
    delete store.entries[queued.entry]
    await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
    await rename(
      `${f.box.state.path}/ki/agents/r/control-receipts/interrupted-queue-stop.json`,
      `${f.box.state.path}/ki/agents/r/control-receipts/interrupted-queue-stop.saved`
    )
    const rows = (await f.box.state.read('ki/agents/r/control.journal.jsonl'))
      .trim()
      .split('\n')
      .map((row) => JSON.parse(row))
      .filter((row) => row.phase !== 'observed' || row.receipt.operationId !== 'interrupted-queue-stop')
    await f.box.state.write(
      'ki/agents/r/control.journal.jsonl',
      `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`
    )
    const result = await f.stop('--request interrupted-queue-stop')
    expect(result.exitCode, result.output).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ outcome: 'queued-use-dequeue', target: { id: queued.entry } })
    expect(f.launched()).toBe(0)
  })

  test('an interrupted dequeue receipt reconstructs one cancellation event', async () => {
    const f = await fixture()
    const queued = await f.queue()
    const command = `ki agent dequeue r worker --entry ${queued.entry} --reason owner --request interrupted-dequeue --json`
    await f.run(command)
    const store = await f.state()
    delete store.operations['interrupted-dequeue'].receipt
    await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
    await rename(
      `${f.box.state.path}/ki/agents/r/control-receipts/interrupted-dequeue.json`,
      `${f.box.state.path}/ki/agents/r/control-receipts/interrupted-dequeue.saved`
    )
    const rows = (await f.box.state.read('ki/agents/r/control.journal.jsonl'))
      .trim()
      .split('\n')
      .map((row) => JSON.parse(row))
      .filter((row) => row.phase !== 'observed' || row.receipt.operationId !== 'interrupted-dequeue')
    await f.box.state.write(
      'ki/agents/r/control.journal.jsonl',
      `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`
    )
    const result = await f.run(command)
    expect(result.exitCode, result.output).toBe(0)
    expect(JSON.parse(result.stdout).outcome).toBe('cancelled-before-start')
    expect((await f.events()).filter((event) => event.kind === 'dequeued')).toHaveLength(1)
  })

  test('an acknowledged queue entry with a lost attempt projection stays unconfirmed', async () => {
    const f = await fixture()
    const queued = await f.queue()
    f.onSleep(async () => {
      f.set({ empty: true })
    })
    expect((await f.run('ki agent dispatch r --max 1 --foreground')).exitCode).toBe(0)
    const store = await f.state()
    delete store.history[store.attempts.worker.token]
    delete store.attempts.worker
    await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
    const result = await f.run(`ki agent dequeue r worker --entry ${queued.entry} --reason owner --json`)
    expect(result.exitCode, result.output).toBe(1)
    expect(JSON.parse(result.stdout).outcome).toBe('claim-unconfirmed')
    expect(f.signals).toHaveLength(0)
  })

  test('failed attempt events are derived only once across repeated observers', async () => {
    const f = await fixture(false)
    await f.launch()
    await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
    await f.stop()
    await f.run('ki agent status r')
    await f.run('ki agent status r')
    expect((await f.events()).filter((event) => event.kind === 'failed')).toHaveLength(1)
  })

  test('a missing acceptance record is refused even with a correctly shaped digest', async () => {
    const f = await fixture()
    const { declaration, authority } = await declarationFixture(f)
    present(declaration.records[0]).path = `${f.box.project.path}/missing.md`
    await f.box.project.write('acceptance.json', JSON.stringify(declaration))
    f.box.setAgentLaunchEvidence(evidenced())
    const result = await f.run(
      `ki agent launch r acceptor . brief.md --role accept --authority ${authority} --acceptance acceptance.json --dry-run --json`
    )
    expect(result.exitCode).toBe(1)
    expect(JSON.parse(result.stdout).refusals.join(' ')).toContain('changed or missing record/review')
    expect(f.launched()).toBe(2)
  })

  test('a missing held PID cannot be replaced even when its managed scope is empty', async () => {
    const f = await fixture()
    await f.box.state.write('ki/agents/r/before.pid', '900\n')
    await f.run('ki agent launch r worker . brief.md --wait-for before --json')
    await rename(`${f.box.state.path}/ki/agents/r/worker.pid`, `${f.box.state.path}/ki/agents/r/worker.saved-pid`)
    f.set({ empty: true })
    const result = await f.run('ki agent launch r worker . brief.md --relaunch --json')
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('held process acknowledgement is unavailable')
    expect(f.launched()).toBe(1)
  })

  test.each(['foreign-entry', 'missing-entry'])('held metadata cannot change its %s', async (variant) => {
    const f = await fixture()
    await f.box.state.write('ki/agents/r/before.pid', '900\n')
    const queued = JSON.parse((await f.run('ki agent queue r worker brief.md --wait-for before --json')).stdout)
    await f.run(`ki agent launch r worker . ${f.box.state.path}/ki/agents/r/worker.queued.md --json`)
    if (variant === 'foreign-entry') {
      const metadata = JSON.parse(await f.box.state.read('ki/agents/r/worker.launch.json'))
      metadata.request.entry = 'foreign'
      await f.box.state.write('ki/agents/r/worker.launch.json', JSON.stringify(metadata))
    } else {
      const store = await f.state()
      delete store.entries[queued.entry]
      await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
    }
    const result = await f.run(['ki', ...present(f.launches[0]).arguments])
    expect(result.exitCode, result.output).toBe(0)
    expect(result.stdout).toContain('launch-fenced: queue identity changed')
    expect(f.launched()).toBe(1)
  })

  test.each(['open', 'blocked', 'foreign-run'])(
    'legacy queue handles %s without inventing an identity',
    async (variant) => {
      const f = await fixture(false)
      await f.queue()
      const row = JSON.parse((await f.box.state.read('ki/agents/r/queue.jsonl')).trim())
      delete row.entry
      delete row.selection
      delete row.allow
      if (variant === 'blocked') row.waitFor = ['before']
      if (variant === 'foreign-run') row.run = 'foreign'
      await f.box.state.write('ki/agents/r/queue.jsonl', `${JSON.stringify(row)}\n`)
      const directory = `${f.box.state.path}/ki/agents/r`
      for (const name of await readdir(directory))
        if (name.startsWith('control') || name.endsWith('.launch.json'))
          await rename(`${directory}/${name}`, `${directory}/legacy-${name}.saved`)

      if (variant === 'blocked') {
        await f.box.state.write('ki/agents/r/before.pid', '900\n')
        f.set({ empty: true })
      }
      f.onSleep(async () => {
        f.set({ empty: true })
      })
      const result = await f.run('ki agent dispatch r --max 1 --foreground')
      expect(result.exitCode, result.output).toBe(variant === 'foreign-run' ? 1 : 0)
      if (variant === 'open') expect(f.launched()).toBe(1)
      if (variant === 'blocked') expect(result.stdout).toContain('gate cannot open')
      if (variant === 'foreign-run') expect(result.stderr).toContain('queue-home-unverified')
    }
  )

  test('a completed historical predecessor still opens the exact bound gate after relaunch', async () => {
    const f = await fixture()
    await f.launch()
    await f.run('ki agent queue r after brief.md --wait-for worker --json')
    await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
    await f.box.state.write('ki/agents/r/worker.report.md', '# Complete\n')
    f.set({ empty: true })
    expect((await f.run('ki agent launch r worker . brief.md --relaunch --json')).exitCode).toBe(0)
    f.set({ empty: false })
    f.onSleep(async () => {
      f.set({ empty: true })
    })
    const result = await f.run('ki agent dispatch r --max 2 --foreground')
    expect(result.exitCode, result.output).toBe(0)
    expect(f.launched()).toBe(3)
  })

  test('an interrupted stop receipt preserves a stopped scope and derives its event once', async () => {
    const f = await fixture()
    await f.launch()
    await f.stop('--request stopped-before-receipt')
    const store = await f.state()
    delete store.operations['stopped-before-receipt'].receipt
    await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
    await rename(
      `${f.box.state.path}/ki/agents/r/control-receipts/stopped-before-receipt.json`,
      `${f.box.state.path}/ki/agents/r/control-receipts/stopped-before-receipt.saved`
    )
    const rows = (await f.box.state.read('ki/agents/r/control.journal.jsonl'))
      .trim()
      .split('\n')
      .map((row) => JSON.parse(row))
      .filter((row) => row.phase !== 'observed' || row.receipt.operationId !== 'stopped-before-receipt')
    await f.box.state.write(
      'ki/agents/r/control.journal.jsonl',
      `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`
    )
    const inspected = await f.run('ki agent recover inspect r --operation stopped-before-receipt --json')
    expect(JSON.parse(inspected.stdout).requiredEvidence.observations).toEqual([])
    const result = await f.stop('--request stopped-before-receipt')
    expect(result.exitCode, result.output).toBe(0)
    expect(JSON.parse(result.stdout).outcome).toBe('stopped')
    expect(f.signals).toHaveLength(1)
    expect((await f.events()).filter((event) => event.kind === 'stopped')).toHaveLength(1)
  })

  test('an interrupted queued-stop receipt retries the original queue identity after cancellation', async () => {
    const f = await fixture()
    const queued = await f.queue()
    await f.stop('--request queued-stop')
    const store = await f.state()
    delete store.operations['queued-stop'].receipt
    await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
    await rename(
      `${f.box.state.path}/ki/agents/r/control-receipts/queued-stop.json`,
      `${f.box.state.path}/ki/agents/r/control-receipts/queued-stop.saved`
    )
    const rows = (await f.box.state.read('ki/agents/r/control.journal.jsonl'))
      .trim()
      .split('\n')
      .map((row) => JSON.parse(row))
      .filter((row) => row.phase !== 'observed' || row.receipt.operationId !== 'queued-stop')
    await f.box.state.write(
      'ki/agents/r/control.journal.jsonl',
      `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`
    )
    await f.run(`ki agent dequeue r worker --entry ${queued.entry} --reason owner --json`)
    const result = await f.stop('--request queued-stop')
    expect(result.exitCode, result.output).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({ outcome: 'queued-use-dequeue', resultingState: 'cancelled' })
    expect(f.launched()).toBe(0)
  })

  test('a queue entry dropped by a closed gate is already terminal when dequeued', async () => {
    const f = await fixture()
    const first = await f.queue('before')
    const queued = JSON.parse((await f.run('ki agent queue r worker brief.md --wait-for before --json')).stdout)
    await f.run(`ki agent dequeue r before --entry ${first.entry} --reason owner --json`)
    await f.run('ki agent dispatch r --max 1 --foreground')
    const result = await f.run(`ki agent dequeue r worker --entry ${queued.entry} --reason owner --json`)
    expect(result.exitCode, result.output).toBe(0)
    expect(JSON.parse(result.stdout).outcome).toBe('already-terminal')
  })

  test('a missing worker acknowledgement keeps dequeue and requeue fenced', async () => {
    const { f, queued } = await uncertain()
    const result = await f.run(`ki agent dequeue r worker --entry ${queued.entry} --reason owner --json`)
    expect(result.exitCode, result.output).toBe(1)
    expect(JSON.parse(result.stdout).outcome).toBe('claim-unconfirmed')
    expect((await f.run('ki agent queue r worker brief.md --json')).stderr).toContain('claim-unconfirmed')
  })

  test('recovery cannot report a cancelled entry as started', async () => {
    const { f, queued, evidence, command } = await uncertain()
    const store = await f.state()
    store.entries[queued.entry].state = 'cancelled'
    store.entries[queued.entry].disposition = 'dequeued'
    await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
    evidence.observation = 'spawn-started'
    await f.box.project.write('evidence.json', JSON.stringify(evidence))
    f.set({ workerStarted: true, consumed: true })
    const result = await f.run(command)
    expect(result.exitCode, result.output).toBe(1)
    expect(JSON.parse(result.stdout).outcome).toBe('reconciliation-unconfirmed')
    expect((await f.state()).entries[queued.entry].state).toBe('cancelled')
  })

  test('dependency projection cannot change its already frozen binding', async () => {
    const f = await fixture()
    await f.queue('before')
    const queued = JSON.parse((await f.run('ki agent queue r worker brief.md --wait-for before --json')).stdout)
    const store = await f.state()
    store.entries[queued.entry].dependencies.before.token = 'foreign'
    await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
    const result = await f.run('ki agent dispatch r --max 1 --foreground')
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('control-state-unverified')
    expect(f.launched()).toBe(0)
  })

  test('a legacy thread home never acquires control authority', async () => {
    const f = await fixture()
    await f.launch()
    await f.box.project.write('+/_THREADS/r/work.md', '---\nid: ki.r\n---\n')
    await f.box.state.write(
      'ki/agents/r/thread.json',
      JSON.stringify({ repository: f.box.project.path, folder: '+/_THREADS/r' })
    )
    expect((await f.stop()).exitCode).toBe(1)
    expect(f.signals).toHaveLength(0)
  })

  test('a foreign queue projection cannot create a claim', async () => {
    const f = await fixture()
    await f.queue()
    const row = JSON.parse((await f.box.state.read('ki/agents/r/queue.jsonl')).trim())
    row.entry = 'unknown-entry'
    await f.box.state.write('ki/agents/r/queue.jsonl', `${JSON.stringify(row)}\n`)
    const result = await f.run('ki agent dispatch r --max 1 --foreground')
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('queue-identity-unverified')
    expect(f.launched()).toBe(0)
  })

  test.each(['runtime', 'model', 'effort', 'rules', 'allow'])('dispatch refuses a changed queue %s', async (key) => {
    const f = await fixture()
    await f.queue()
    const row = JSON.parse((await f.box.state.read('ki/agents/r/queue.jsonl')).trim())
    row[key] = { runtime: 'codex', model: 'different', effort: 'max', rules: 'push', allow: ['fetch'] }[key]
    await f.box.data.write(`${assets}/grant-fetch.md`, '## Grant: fetch\n\nRead-only.\n')
    await f.box.state.write('ki/agents/r/queue.jsonl', `${JSON.stringify(row)}\n`)
    const result = await f.run('ki agent dispatch r --max 1 --foreground')
    expect(result.exitCode, result.output).toBe(1)
    expect(result.stderr).toContain('selection-changed')
    expect(f.launched()).toBe(0)
  })

  test('invalid held role metadata is refused before any new launch', async () => {
    const f = await fixture()
    await f.box.state.write('ki/agents/r/before.pid', '900\n')
    await f.run('ki agent launch r worker . brief.md --wait-for before --json')
    const metadata = JSON.parse(await f.box.state.read('ki/agents/r/worker.launch.json'))
    delete metadata.request.selection
    metadata.request.role = 'foreign'
    await f.box.state.write('ki/agents/r/worker.launch.json', JSON.stringify(metadata))
    const result = await f.run(['ki', ...present(f.launches[0]).arguments])
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain('unknown role')
    expect(f.launched()).toBe(1)
  })

  test('legacy held metadata without an optional grant list keeps empty grants', async () => {
    const f = await fixture(false)
    await f.box.state.write('ki/agents/r/before.pid', '900\n')
    await f.run('ki agent launch r worker . brief.md --wait-for before --json')
    const metadata = JSON.parse(await f.box.state.read('ki/agents/r/worker.launch.json'))
    delete metadata.request.selection
    delete metadata.request.allow
    await f.box.state.write('ki/agents/r/worker.launch.json', JSON.stringify(metadata))
    await f.box.state.write('ki/agents/r/before.status', 'DONE\n')
    const result = await f.run(['ki', ...present(f.launches[0]).arguments])
    expect(result.exitCode, result.output).toBe(0)
    expect(f.launched()).toBe(2)
    const final = JSON.parse(await f.box.state.read('ki/agents/r/worker.launch.json'))
    expect(final.grants).toEqual([])
  })

  test('acceptance rejects an invalid review object even with valid record evidence', async () => {
    const f = await fixture()
    const { declaration, authority } = await declarationFixture(f)
    const document = structuredClone(declaration) as unknown as { records: { reviews: unknown[] }[] }
    present(document.records[0]).reviews = [{}]
    f.box.setAgentLaunchEvidence({
      ...evidenced(),
      acceptance: { revision: 'ki/scoped-acceptance/v1', render: JSON.stringify }
    })
    await f.box.project.write('acceptance.json', JSON.stringify(document))
    const result = await f.run(
      `ki agent launch r acceptor . brief.md --role accept --authority ${authority} --acceptance acceptance.json --dry-run --json`
    )
    expect(result.exitCode).toBe(1)
    expect(JSON.parse(result.stdout).refusals.join(' ')).toContain('invalid review shape')
  })

  test.each(['0', '-1', '1.5', '9007199254740992'])('rejects invalid positive control number %s', async (value) => {
    const f = await fixture()
    expect((await f.run(`ki agent stop r worker --attempt ${value} --reason owner --json`)).exitCode).toBe(2)
    expect(f.signals).toHaveLength(0)
  })

  test.each(['launch', 'queue'])(
    'successful %s dry-run reports explicit grants without reserving an attempt',
    async (verb) => {
      const f = await fixture()
      f.box.setAgentLaunchEvidence(evidenced())
      await f.box.data.write(`${assets}/grant-fetch.md`, '# Fetch grant\n')
      const args = `ki agent ${verb} r worker ${verb === 'launch' ? '. ' : ''}brief.md --role mechanical --authority authority.md#Grant --allow fetch --dry-run --json`
      const result = await f.run(args)
      expect(result.exitCode, result.output).toBe(0)
      expect(JSON.parse(result.stdout)).toMatchObject({
        role: 'mechanical',
        grants: ['fetch'],
        sources: { grants: 'explicit' }
      })
      expect(f.launched()).toBe(0)
      expect(await f.box.state.read('ki/agents/r/control.json').catch(() => undefined)).toBeUndefined()
    }
  )

  test('authority digest covers nested headings and stops at the next peer', async () => {
    const f = await fixture()
    f.box.setAgentLaunchEvidence(evidenced())
    const grant = '# Grant\n\nBounded.\n\n## Detail\n\nNested.\n\n'
    await f.box.project.write('authority.md', `${grant}# Other\n\nUnrelated.\n`)
    const result = await f.run(
      'ki agent launch r worker . brief.md --role mechanical --authority authority.md#Grant --dry-run --json'
    )
    expect(result.exitCode, result.output).toBe(0)
    expect(JSON.parse(result.stdout).authority.sha256).toBe(hash(grant))
  })

  test('a new stop request for a stopped attempt is an idempotent terminal no-op', async () => {
    const f = await fixture()
    await f.launch()
    expect((await f.stop('--request first-stop')).exitCode).toBe(0)
    const retry = await f.stop('--request later-stop')
    expect(JSON.parse(retry.stdout).outcome).toBe('already-stopped')
    expect(f.signals).toHaveLength(1)
  })

  test('an adapter completion without a worker report remains failed without a signal', async () => {
    const f = await fixture()
    await f.launch()
    await rename(`${f.box.state.path}/ki/agents/r/worker.status`, `${f.box.state.path}/ki/agents/r/worker.saved-status`)
    f.set({ terminal: 'done' })
    const controller = present(f.processes.control)
    f.box.setAgentProcesses({
      ...f.processes,
      control: {
        ...controller,
        inspect: async (identity) => ({ ...(await controller.inspect(identity)), empty: true })
      }
    })
    const result = await f.stop()
    expect(result.exitCode, result.output).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ outcome: 'already-terminal', resultingState: 'failed' })
    expect(f.signals).toHaveLength(0)
  })

  test('completion with unavailable scope ownership is visibly blocked', async () => {
    const f = await fixture()
    await f.launch()
    await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
    f.box.setAgentProcesses({
      ...f.processes,
      control: {
        ...present(f.processes.control),
        inspect: async () => {
          throw new Error('observation unavailable')
        }
      }
    })
    const result = await f.run('ki agent status r')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('ownership-unverified')
    expect(result.stdout).not.toContain('ALL FINISHED')
  })

  test.each(['worker', 'supervisor'])(
    'foreign %s launch acknowledgements fence replacement and expose recovery',
    async (phase) => {
      const f = await fixture()
      const controller = present(f.processes.control)
      const launch = controller.launch
      f.box.setAgentProcesses({
        ...f.processes,
        control: { ...controller, launch: async (...args) => ({ ...(await launch(...args)), token: 'foreign' }) }
      })
      if (phase === 'supervisor') await f.box.state.write('ki/agents/r/before.pid', '900\n')
      const result = await f.run(
        `ki agent launch r worker . brief.md ${phase === 'supervisor' ? '--wait-for before' : ''} --json`
      )
      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain('claim-unconfirmed')
      expect((await f.state()).attempts.worker.state).toBe('unconfirmed')
      const operation = Object.values((await f.state()).operations).find(
        (item) => (item as { operation: string }).operation === (phase === 'worker' ? 'spawn' : 'spawn-supervisor')
      ) as { id: string }
      const inspected = await f.run(`ki agent recover inspect r --operation ${operation.id} --json`)
      expect(JSON.parse(inspected.stdout).requiredEvidence.observations).toEqual(['spawn-started', 'spawn-not-started'])
      expect((await f.run('ki agent queue r worker brief.md --json')).exitCode).toBe(1)
      expect((await f.run('ki agent launch r worker . brief.md --relaunch --json')).exitCode).toBe(1)
    }
  )

  test('an unacknowledged held supervisor stays live and cannot be replaced', async () => {
    const f = await fixture()
    await f.box.state.write('ki/agents/r/before.pid', '900\n')
    expect((await f.run('ki agent launch r worker . brief.md --wait-for before --json')).exitCode).toBe(0)
    await rename(`${f.box.state.path}/ki/agents/r/worker.pid`, `${f.box.state.path}/ki/agents/r/worker.saved-pid`)
    const status = await f.run('ki agent status r')
    expect(status.stdout).toContain('held; launch acknowledgement unavailable')
    expect((await f.run('ki agent launch r worker . brief.md --relaunch --json')).stderr).toContain('claim-unconfirmed')
  })

  test.each(['missing-request', 'foreign-run', 'foreign-name'])('held launch refuses %s metadata', async (variant) => {
    const f = await fixture()
    await f.box.state.write('ki/agents/r/before.pid', '900\n')
    await f.run('ki agent launch r worker . brief.md --wait-for before --json')
    const packet = JSON.parse(await f.box.state.read('ki/agents/r/worker.launch.json'))
    if (variant === 'missing-request') delete packet.request
    if (variant === 'foreign-run') packet.request.run = 'foreign'
    if (variant === 'foreign-name') packet.request.name = 'foreign'
    await f.box.state.write('ki/agents/r/worker.launch.json', JSON.stringify(packet))
    const result = await f.run(['ki', ...present(f.launches[0]).arguments])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('selection-unverified')
    expect(f.launched()).toBe(1)
  })

  test.each(['throw', 'changed-observation'])('recovery refuses an adapter %s', async (variant) => {
    const { f, evidence, command } = await uncertain()
    await f.box.project.write('evidence.json', JSON.stringify(evidence))
    const controller = present(f.processes.control)
    const inspect = controller.inspect
    f.box.setAgentProcesses({
      ...f.processes,
      control: {
        ...controller,
        verifyRecovery: async (identity) => {
          if (variant === 'throw') throw new Error('verification unavailable')
          return { ...(await inspect(identity)), empty: true }
        }
      }
    })
    const result = await f.run(command)
    expect(result.exitCode, result.output).toBe(1)
    expect(JSON.parse(result.stdout).outcome).toBe('reconciliation-unconfirmed')
    expect(f.signals).toHaveLength(0)
  })

  test('a failed recovery receipt can be retried by its exact operation identity', async () => {
    const { f, evidence, command } = await uncertain()
    await f.box.project.write('evidence.json', JSON.stringify(evidence))
    f.set({ verified: false })
    const first = await f.run(`${command} --request recovery-refusal`)
    expect(first.exitCode).toBe(1)
    const second = await f.run(`${command} --request recovery-refusal`)
    expect(second.stdout).toBe(first.stdout)
  })

  test.each(['receipt-file', 'journal-intent', 'receipt-schema'])(
    'replays interrupted persistence from %s',
    async (variant) => {
      const f = await fixture()
      await f.launch()
      const store = await f.state()
      const operation = Object.values(store.operations)[0] as { id: string; receipt?: Record<string, unknown> }
      const rows = (await f.box.state.read('ki/agents/r/control.journal.jsonl'))
        .trim()
        .split('\n')
        .map((row) => JSON.parse(row))
      if (variant === 'journal-intent') delete store.operations[operation.id]
      else {
        const receipt = present(operation.receipt)
        if (variant === 'receipt-schema') receipt['schema'] = 'foreign'
        await f.box.state.write(`ki/agents/r/control-receipts/${operation.id}.json`, JSON.stringify(receipt))
        delete operation.receipt
      }
      await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
      await f.box.state.write(
        'ki/agents/r/control.journal.jsonl',
        `${rows
          .filter((row) => row.phase === 'intent')
          .map((row) => JSON.stringify(row))
          .join('\n')}\n`
      )
      const result = await f.run(`ki agent recover inspect r --operation ${operation.id} --json`)
      expect(result.exitCode, result.output).toBe(variant === 'receipt-schema' ? 1 : 0)
      if (variant === 'receipt-schema') expect(result.stderr).toContain('control-state-unverified')
      else expect(JSON.parse(result.stdout).reason).toBe('confirmed')
      expect(f.launched()).toBe(1)
    }
  )

  test.each(['footer', 'declaration', 'capability', 'wording', 'missing-evidence', 'renderer-error'])(
    'frozen acceptance refuses changed %s',
    async (variant) => {
      const f = await fixture()
      const { declaration, authority } = await declarationFixture(f)
      const capability = {
        revision: 'ki/scoped-acceptance/v1' as const,
        render: (document: unknown) => JSON.stringify(document)
      }
      f.box.setAgentLaunchEvidence({ ...evidenced(), acceptance: capability })
      await f.box.project.write('acceptance.json', JSON.stringify(declaration))
      const queued = await f.run(
        `ki agent queue r acceptor brief.md --role accept --authority ${authority} --acceptance acceptance.json --json`
      )
      expect(queued.exitCode, queued.output).toBe(0)
      if (variant === 'footer') {
        const store = await f.state()
        const entry = store.entries[JSON.parse(queued.stdout).entry]
        entry.request.selection.rules = 'push'
        await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
        await f.box.state.write('ki/agents/r/queue.jsonl', '')
      }
      if (variant === 'declaration') await f.box.project.write('acceptance.json', JSON.stringify(declaration, null, 2))
      if (variant === 'capability') f.box.setAgentLaunchEvidence(evidenced())
      if (variant === 'missing-evidence') f.box.setAgentLaunchEvidence(undefined)
      if (variant === 'wording')
        f.box.setAgentLaunchEvidence({ ...evidenced(), acceptance: { ...capability, render: () => 'different' } })
      if (variant === 'renderer-error')
        f.box.setAgentLaunchEvidence({
          ...evidenced(),
          acceptance: {
            ...capability,
            render: () => {
              throw new Error('acceptance renderer unavailable')
            }
          }
        })
      f.set({ empty: true })
      if (variant === 'renderer-error') {
        const refused = await f.run('ki agent dispatch r --max 1 --foreground')
        expect(refused.exitCode).toBe(1)
        expect(refused.output).toContain('acceptance renderer unavailable')
        expect(f.launched()).toBe(2)
        return
      }
      const result = await f.run('ki agent dispatch r --max 1 --foreground')
      expect(result.exitCode, result.output).toBe(1)
      expect(result.stderr).toContain(
        variant === 'footer'
          ? 'footer-mismatch'
          : variant === 'declaration'
            ? 'acceptance-changed'
            : 'acceptance-contract-unavailable'
      )
      expect(f.launched()).toBe(2)
    }
  )

  test('dequeue fences a claimed held supervisor before its dependency can finish', async () => {
    const f = await fixture()
    const queued = await f.run('ki agent queue r worker brief.md --wait-for before --json')
    expect(queued.exitCode).toBe(0)
    const entry = JSON.parse(queued.stdout).entry
    const launched = await f.run([
      'ki',
      'agent',
      'launch',
      'r',
      'worker',
      '.',
      `${f.box.state.path}/ki/agents/r/worker.queued.md`,
      '--json'
    ])
    expect(launched.exitCode, launched.output).toBe(0)
    const cancelled = await f.run(`ki agent dequeue r worker --entry ${entry} --reason owner --json`)
    expect(cancelled.exitCode).toBe(0)
    const held = present(f.launches[0])
    const fenced = await f.run(['ki', ...held.arguments])
    expect(fenced.exitCode).toBe(0)
    expect(fenced.stdout).toContain('launch-fenced')
    expect(f.launched()).toBe(1)
    expect((await f.run('ki agent status r')).stdout).toContain('dequeued')
    expect((await f.events()).filter((event) => event.kind === 'dequeued')).toHaveLength(1)
  })

  test.each(['names', 'agent', 'entry', 'token', 'attempt', 'no-attempt', 'historic-running', 'unbound'] as const)(
    'a queued dependency refuses unverified %s',
    async (variant) => {
      const f = await fixture()
      if (variant === 'historic-running') await f.launch()
      else await f.queue('before')
      const name = variant === 'historic-running' ? 'worker' : 'before'
      expect((await f.run(`ki agent queue r after brief.md --wait-for ${name} --json`)).exitCode).toBe(0)
      if (variant !== 'historic-running') {
        const before = Object.values((await f.state()).entries).find(
          (item) => (item as { name: string }).name === 'before'
        ) as { id: string }
        expect((await f.run(`ki agent dequeue r before --entry ${before.id} --reason owner --json`)).exitCode).toBe(0)
      } else f.set({ empty: true })
      const store = await f.state()
      const entry = Object.values(store.entries).find((item) => (item as { name: string }).name === 'after') as {
        dependencies: Record<string, Record<string, unknown> | null>
        requestedDependencies: Record<string, Record<string, unknown> | null>
        request: { waitFor: string[] }
      }
      const target = present(entry.dependencies[name])
      if (variant === 'names') entry.request.waitFor = ['other']
      if (variant === 'agent') target['agent'] = 'foreign'
      if (variant === 'entry') target['entry'] = 'missing'
      if (variant === 'token') target['token'] = 'foreign'
      if (variant === 'attempt') target['attempt'] = 999
      if (variant === 'no-attempt') delete target['entry']
      if (variant === 'unbound') {
        entry.dependencies[name] = null
        entry.requestedDependencies[name] = null
      } else entry.requestedDependencies[name] = structuredClone(target)
      if (variant === 'historic-running')
        store.attempts.worker = { ...store.attempts.worker, token: 'later-token', attempt: 2 }
      await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
      await f.box.state.write('ki/agents/r/queue.jsonl', '')
      const result = await f.run('ki agent dispatch r --max 2 --foreground')
      expect(result.exitCode).not.toBe(2)
      expect(f.launched()).toBe(variant === 'historic-running' ? 1 : 0)
    }
  )

  test('a held attempt cannot replace its frozen selection while the gate opens', async () => {
    const f = await fixture()
    await f.box.state.write('ki/agents/r/before.pid', '900\n')
    expect((await f.run('ki agent launch r worker . brief.md --wait-for before --json')).exitCode).toBe(0)
    const metadata = JSON.parse(await f.box.state.read('ki/agents/r/worker.launch.json'))
    metadata.request.rules = 'push'
    metadata.request.selection.rules = 'push'
    await f.box.state.write('ki/agents/r/worker.launch.json', JSON.stringify(metadata))
    await f.box.state.write('ki/agents/r/before.status', 'DONE\n')
    const held = present(f.launches[0])
    const result = await f.run(['ki', ...held.arguments])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('selection-conflict')
    expect(f.launched()).toBe(1)
  })

  test('a transaction lock has no age or PID takeover', async () => {
    const f = await fixture()
    await f.launch()
    await f.box.state.write('ki/agents/r/control.lock', '{"pid":999999,"token":"old"}\n')
    const result = await f.stop()
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('control-transaction-busy')
    expect(f.signals).toHaveLength(0)
    expect(await f.box.state.read('ki/agents/r/control.lock')).toContain('old')
  })

  test.each(['thread', 'home', 'record'] as const)(
    'an unavailable %s refuses control before effects',
    async (variant) => {
      const f = await fixture()
      await f.launch()
      if (variant === 'thread')
        await rename(`${f.box.state.path}/ki/agents/r/thread.json`, `${f.box.state.path}/ki/agents/r/thread.saved`)
      if (variant === 'home')
        await rename(`${f.box.project.path}/+/_WORK/ki.r`, `${f.box.project.path}/+/_WORK/ki.saved`)
      if (variant === 'record')
        await rename(`${f.box.project.path}/+/_WORK/ki.r/work.md`, `${f.box.project.path}/+/_WORK/ki.r/work.saved`)
      expect((await f.stop()).exitCode).toBe(1)
      expect(f.signals).toHaveLength(0)
    }
  )

  test('unlaunched same-name reservations do not change an existing dependency binding', async () => {
    const f = await fixture()
    const first = await f.queue('before')
    expect((await f.run(`ki agent dequeue r before --entry ${first.entry} --reason owner --json`)).exitCode).toBe(0)
    const second = await f.queue('before')
    const dependent = await f.run('ki agent queue r after brief.md --wait-for before --json')
    expect(dependent.exitCode).toBe(0)
    const entry = (await f.state()).entries[JSON.parse(dependent.stdout).entry]
    expect(entry.dependencies.before.entry).toBe(second.entry)
  })

  test('dry-run refuses an empty explicit model without creating a packet', async () => {
    const f = await fixture()
    const result = await f.run([
      'ki',
      'agent',
      'launch',
      'r',
      'worker',
      '.',
      'brief.md',
      '--model',
      '',
      '--dry-run',
      '--json'
    ])
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain('model-unresolved')
    expect(await f.box.state.read('ki/agents/r/control.json').catch(() => 'absent')).toBe('absent')
    expect(f.launched()).toBe(0)
  })

  test('claimed entries without an acknowledged attempt remain visible in the live run inventory', async () => {
    const f = await fixture()
    const queued = await f.queue()
    const store = await f.state()
    store.entries[queued.entry].state = 'unconfirmed'
    await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
    const overview = await f.run('ki agent status')
    expect(overview.exitCode).toBe(0)
    expect(overview.stdout).toContain('claim-unconfirmed')
    expect((await f.run('ki agent status r')).stdout).not.toContain('ALL FINISHED')
  })

  test('human control output exposes the same durable operation identity', async () => {
    const f = await fixture()
    await f.launch()
    const result = await f.run('ki agent stop r worker --attempt 1 --reason owner --request readable-stop')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('readable-stop')
    const operation = Object.keys((await f.state()).operations)[0]
    expect((await f.run(`ki agent recover inspect r --operation ${operation}`)).exitCode).toBe(0)
    const queued = await f.queue('later')
    const cancelled = await f.run(
      `ki agent dequeue r later --entry ${queued.entry} --reason owner --request readable-dequeue`
    )
    expect(cancelled.exitCode).toBe(0)
    expect(cancelled.stdout).toContain('readable-dequeue')
  })

  test('an interrupted stop effect is retried by its adapter key rather than signalled twice', async () => {
    const f = await fixture()
    await f.launch()
    f.signal('descendants')
    expect((await f.stop('--grace 1 --request pending-stop')).exitCode).toBe(1)
    const store = await f.state()
    delete store.operations['pending-stop'].receipt
    store.attempts.worker.state = 'stop-requested'
    await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
    await rename(
      `${f.box.state.path}/ki/agents/r/control-receipts/pending-stop.json`,
      `${f.box.state.path}/ki/agents/r/control-receipts/pending-stop.saved`
    )
    const rows = (await f.box.state.read('ki/agents/r/control.journal.jsonl'))
      .trim()
      .split('\n')
      .map((row) => JSON.parse(row))
      .filter((row) => row.phase !== 'observed' || row.receipt.operationId !== 'pending-stop')
    await f.box.state.write(
      'ki/agents/r/control.journal.jsonl',
      `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`
    )
    expect((await f.stop('--grace 1 --request pending-stop')).exitCode).toBe(1)
    expect(f.signals).toHaveLength(1)
  })

  test.each(['schema', 'role', 'unknown-role', 'binding', 'runtime', 'footer', 'authority', 'authority-file'] as const)(
    'frozen role selection rejects %s changes before claim',
    async (variant) => {
      const f = await fixture()
      f.box.setAgentLaunchEvidence(evidenced())
      const role = variant === 'footer' ? 'prune' : 'build'
      expect(
        (await f.run(`ki agent queue r worker brief.md --role ${role} --authority authority.md#Grant --json`)).exitCode
      ).toBe(0)
      const store = await f.state()
      const entry = Object.values(store.entries)[0] as {
        request: {
          role: string
          selection: {
            schema: string
            role: string
            binding?: unknown
            runtime: string
            rules: string
            authority?: unknown
          }
        }
      }
      const frozen = entry.request.selection
      if (variant === 'schema') frozen.schema = 'unsupported'
      if (variant === 'role') frozen.role = 'review'
      if (variant === 'unknown-role') {
        frozen.role = '__proto__'
        entry.request.role = '__proto__'
      }
      if (variant === 'binding') delete frozen.binding
      if (variant === 'runtime') frozen.runtime = 'codex'
      if (variant === 'footer') frozen.rules = 'none'
      if (variant === 'authority') delete frozen.authority
      if (variant === 'authority-file') await f.box.project.write('authority.md', '# Missing\n')
      await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
      await f.box.state.write('ki/agents/r/queue.jsonl', '')
      const result = await f.run('ki agent dispatch r --max 1 --foreground')
      expect(result.exitCode, result.output).not.toBe(0)
      expect(f.launched()).toBe(0)
    }
  )

  test('archived review evidence belongs to its original attempt and not a later same-name report', async () => {
    const f = await fixture()
    const { declaration, authority, review } = await declarationFixture(f)
    await f.box.state.write('ki/agents/r/reviewer.report.md', review)
    await f.box.project.git(['add', '--', '+/_WORK/ki.r/reviewer.report.md'])
    await f.box.project.git(['commit', '-q', '-m', 'test: record review'])
    f.set({ empty: true })
    expect((await f.run('ki agent launch r reviewer . brief.md --relaunch --json')).exitCode).toBe(0)
    f.box.setAgentLaunchEvidence({
      ...evidenced(),
      acceptance: { revision: 'ki/scoped-acceptance/v1', render: (document) => JSON.stringify(document) }
    })
    await f.box.state.write(
      'ki/agents/r/reviewer.prev-99/reviewer.launch.json',
      JSON.stringify({ identity: { token: 'another-attempt' } })
    )
    const record = present(declaration.records[0])
    present(record.reviews[0]).path = `${f.box.state.path}/ki/agents/r/reviewer.prev-1/reviewer.report.md`
    await f.box.project.write('acceptance.json', JSON.stringify(declaration))
    expect(
      (
        await f.run(
          `ki agent launch r acceptor . brief.md --role accept --authority ${authority} --acceptance acceptance.json --json`
        )
      ).exitCode
    ).toBe(0)
    present(record.reviews[0]).path = `${f.box.project.path}/+/_WORK/ki.r/reviewer.report.md`
    await f.box.project.write('acceptance.json', JSON.stringify(declaration))
    const result = await f.run(
      `ki agent launch r unrelated . brief.md --role accept --authority ${authority} --acceptance acceptance.json --json`
    )
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('does not belong')
  })

  test.each([
    'pid',
    'birth',
    'session',
    'group',
    'token',
    'scope',
    'launcher',
    'reused-birth',
    'no-owner',
    'inspect-error'
  ] as const)('never signals unverifiable scope identity: %s', async (variant) => {
    const f = await fixture()
    await f.launch()
    const attempt = (await f.state()).attempts.worker as Identity
    const owner = { ...present(attempt.owner) }
    if (variant === 'pid') owner.pid = 0
    if (variant === 'birth') owner.birth = ''
    if (variant === 'session') owner.session = ''
    if (variant === 'group') owner.group = ''
    if (variant === 'token') owner.token = 'foreign'
    if (variant === 'scope') owner.scope = 'foreign'
    if (variant === 'launcher') owner.launcher = 'foreign'
    if (variant === 'reused-birth') owner.birth = 'new-birth'
    let signalled = false
    f.box.setAgentProcesses({
      launch: async () => 1,
      alive: () => true,
      sleep: async () => {},
      control: {
        launch: async () => owner,
        inspect: async () => {
          if (variant === 'inspect-error') throw new Error('unavailable')
          return {
            token: attempt.token,
            scope: attempt.scope,
            ownership: true,
            containment: true,
            empty: false,
            fenced: true,
            authorisationConsumed: true,
            workerStarted: true,
            ...(variant === 'no-owner' ? {} : { owner })
          }
        },
        terminate: async () => {
          signalled = true
        },
        verifyRecovery: async () => undefined
      }
    })
    const result = await f.stop()
    expect(result.exitCode).toBe(1)
    expect(JSON.parse(result.stdout).outcome).toBe('ownership-unverified')
    expect(signalled).toBe(false)
  })

  test.each([
    'done-without-report',
    'failed-after-signal',
    'done-after-signal-without-report',
    'legacy-done',
    'legacy-failed'
  ] as const)('natural terminal classification is bounded: %s', async (variant) => {
    const f = await fixture(!variant.startsWith('legacy-'))
    await f.launch()
    if (variant.startsWith('legacy-')) {
      await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
      if (variant === 'legacy-done') await f.box.state.write('ki/agents/r/worker.report.md', '# Result\n')
      expect((await f.stop()).exitCode).toBe(0)
    } else if (variant === 'done-without-report') {
      await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
      f.set({ empty: true })
    } else f.set({ terminal: variant === 'failed-after-signal' ? 'failed' : 'done' })
    const result = await f.stop()
    expect(result.exitCode, result.output).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      outcome: 'already-terminal',
      resultingState: variant === 'legacy-done' ? 'done' : 'failed'
    })
    expect((await f.events()).filter((event) => event.kind === 'stopped')).toHaveLength(0)
  })

  test('a local transaction denial changes no launch authority', async () => {
    const f = await fixture()
    await f.launch()
    const directory = `${f.box.state.path}/ki/agents/r`
    await chmod(directory, 0o555)
    try {
      expect((await f.stop()).exitCode).toBe(1)
      expect(f.signals).toHaveLength(0)
    } finally {
      await chmod(directory, 0o755)
    }
  })

  test('an absent journal never grants authority from the projection alone', async () => {
    const f = await fixture()
    await f.launch()
    await rename(
      `${f.box.state.path}/ki/agents/r/control.journal.jsonl`,
      `${f.box.state.path}/ki/agents/r/control.journal.saved`
    )
    expect((await f.stop()).exitCode).toBe(1)
    expect(f.signals).toHaveLength(0)
  })

  test('an interrupted stop retains its terminal identity after automatic verified history repair', async () => {
    const f = await fixture()
    await f.launch()
    const first = await f.stop('--request stop-crash')
    const receipt = JSON.parse(first.stdout)
    const store = await f.state()
    delete store.operations['stop-crash'].receipt
    await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
    await rename(
      `${f.box.state.path}/ki/agents/r/control-receipts/stop-crash.json`,
      `${f.box.state.path}/ki/agents/r/control-receipts/stop-crash.saved`
    )
    const events = (await f.events()).filter((event) => event.kind !== 'stopped')
    await f.box.state.write('ki/agents/r/events.jsonl', `${events.map((event) => JSON.stringify(event)).join('\n')}\n`)
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    const checkpoint = JSON.parse(await f.box.state.read('ki/agents/r/events.history'))
    expect(await f.box.state.read('ki/agents/r/events.jsonl')).toBe(checkpoint.journal)
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    expect((await f.events()).filter((event) => event.kind === 'stopped')).toHaveLength(1)
    const retried = await f.stop('--request stop-crash')
    expect(retried.exitCode).toBe(0)
    expect(JSON.parse(retried.stdout)).toMatchObject({ operationId: receipt.operationId, outcome: 'stopped' })
    expect(f.signals).toHaveLength(1)
  })

  test.each(['machine', 'run', 'name', 'home', 'id', 'counter'] as const)(
    'refuses a queue with changed %s before dispatch',
    async (variant) => {
      const f = await fixture()
      const queued = await f.queue()
      const store = await f.state()
      const entry = store.entries[queued.entry]
      if (variant === 'machine') store.machine = 'foreign'
      if (variant === 'run') entry.request.run = 'foreign'
      if (variant === 'name') entry.request.name = 'foreign'
      if (variant === 'home') store.workHome = '/missing'
      if (variant === 'id') await f.box.project.write('+/_WORK/ki.r/work.md', '---\nid: ki.foreign\n---\n')
      if (variant === 'counter') store.nextIdentity = Number.MAX_SAFE_INTEGER
      await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
      const result = await f.run(
        variant === 'counter' ? 'ki agent queue r other brief.md' : 'ki agent dispatch r --max 1 --foreground'
      )
      expect(result.exitCode).toBe(1)
      expect(f.launched()).toBe(0)
    }
  )

  test.each([
    'blank-stop',
    'blank-dequeue',
    'unknown-inspect',
    'confirmed-inspect',
    'confirmed-resolve',
    'missing-evidence',
    'historic-live'
  ] as const)('refuses invalid control requests: %s', async (variant) => {
    const f = await fixture()
    await f.launch()
    let command: string | readonly string[] = 'ki agent recover inspect r --operation missing --json'
    const store = await f.state()
    const operation = Object.keys(store.operations)[0]
    if (variant === 'blank-stop')
      command = ['ki', 'agent', 'stop', 'r', 'worker', '--attempt', '1', '--reason', '', '--json']
    if (variant === 'blank-dequeue')
      command = ['ki', 'agent', 'dequeue', 'r', 'worker', '--entry', 'missing', '--reason', '', '--json']
    if (variant === 'confirmed-inspect') command = `ki agent recover inspect r --operation ${operation} --json`
    if (variant === 'confirmed-resolve' || variant === 'missing-evidence') {
      if (variant === 'confirmed-resolve') await f.box.project.write('evidence.json', '{}')
      command = `ki agent recover resolve r --operation ${operation} --evidence evidence.json --authority authority.md#Grant --json`
    }
    if (variant === 'historic-live') {
      const old = structuredClone(store.attempts.worker)
      old.attempt = 0
      old.token = 'old-token'
      store.history[old.token] = old
      await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
      command = 'ki agent stop r worker --attempt 1 --reason test --json'
      store.attempts.worker.attempt = 2
      store.attempts.worker.token = 'new-token'
      store.history[present(Object.keys(store.history)[0])].attempt = 1
      await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
    }
    const result = await f.run(command)
    expect(result.exitCode).toBe(variant === 'confirmed-inspect' ? 0 : variant.startsWith('blank-') ? 2 : 1)
    if (variant === 'confirmed-inspect')
      expect(JSON.parse(result.stdout)).toMatchObject({ schema: 'ki/agent-control/v1', requiredEvidence: null })
    expect(f.signals).toHaveLength(0)
  })

  test.each(['started', 'absent', 'new-attempt', 'conflict', 'changed-proof'] as const)(
    'direct launch recovery preserves its boundary: %s',
    async (variant) => {
      const f = await fixture()
      f.set({ failLaunch: true, workerStarted: false, consumed: false })
      expect((await f.launch()).exitCode).toBe(1)
      const store = await f.state()
      const operation = Object.values(store.operations).find(
        (item) => (item as { operation: string }).operation === 'spawn'
      ) as { id: string; target: Identity }
      await f.box.project.write('proof.json', 'adapter-proof\n')
      const evidence = {
        schema: 'ki/agent-reconciliation/v1',
        operation_id: operation.id,
        target_id: operation.target.token,
        observation: variant === 'started' ? 'spawn-started' : 'spawn-not-started',
        proofs: [{ path: `${f.box.project.path}/proof.json`, sha256: hash('adapter-proof\n') }]
      }
      await f.box.project.write('evidence.json', JSON.stringify(evidence))
      const command = `ki agent recover resolve r --operation ${operation.id} --evidence evidence.json --authority authority.md#Grant --request resolution --json`
      if (variant === 'started') f.set({ failLaunch: false, workerStarted: true, consumed: true })
      if (variant === 'new-attempt') {
        store.attempts.worker = { ...store.attempts.worker, attempt: 2, token: 'new-attempt' }
        await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
      }
      const result = await f.run(command)
      expect(result.exitCode, result.output).toBe(variant === 'new-attempt' ? 1 : 0)
      if (variant === 'started') expect(JSON.parse(result.stdout).stopCommand).toContain('--attempt 1')
      if (variant === 'conflict' || variant === 'changed-proof') {
        await f.box.project.write('other.json', JSON.stringify(evidence))
        const retry = await f.run(
          command
            .replace('evidence.json', 'other.json')
            .replace(variant === 'changed-proof' ? '--request resolution' : 'not-present', '')
        )
        expect(retry.exitCode).toBe(1)
        expect(retry.stderr).toContain(variant === 'conflict' ? 'request-conflict' : 'prior resolution differs')
      }
      expect(f.signals).toHaveLength(0)
      expect(f.launched()).toBe(1)
    }
  )

  test.each([
    'invalid-json',
    'schema',
    'counter',
    'dependencies',
    'requested-dependencies',
    'run',
    'work',
    'machine',
    'directory',
    'immutable-token',
    'journal-empty',
    'journal-target',
    'receipt-schema',
    'receipt-id',
    'receipt-kind',
    'receipt-target'
  ] as const)('refuses altered control authority: %s', async (variant) => {
    const f = await fixture()
    await f.launch()
    const store = await f.state()
    const attempt = store.attempts.worker
    const operation = Object.values(store.operations)[0] as {
      id: string
      target: { token: string }
      receipt: { schema: string; operationId: string; operation: string; target: unknown }
    }
    if (variant === 'schema') store.schema = 'unsupported'
    if (variant === 'counter') store.nextIdentity = -1
    if (variant === 'dependencies') attempt.dependencies = null
    if (variant === 'requested-dependencies') attempt.requestedDependencies = []
    if (variant === 'run') attempt.run = 'foreign'
    if (variant === 'work') attempt.work = 'foreign'
    if (variant === 'machine') attempt.machine = 'foreign'
    if (variant === 'directory') attempt.workdir = '/foreign'
    if (variant === 'immutable-token') attempt.registered += 1
    if (variant === 'receipt-schema') operation.receipt.schema = 'foreign'
    if (variant === 'receipt-id') operation.receipt.operationId = 'foreign'
    if (variant === 'receipt-kind') operation.receipt.operation = 'foreign'
    if (variant === 'receipt-target') operation.receipt.target = {}
    if (variant === 'journal-empty') await f.box.state.write('ki/agents/r/control.journal.jsonl', '')
    if (variant === 'journal-target') {
      const journal = (await f.box.state.read('ki/agents/r/control.journal.jsonl'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      journal[0].target.token = 'foreign'
      await f.box.state.write(
        'ki/agents/r/control.journal.jsonl',
        `${journal.map((row) => JSON.stringify(row)).join('\n')}\n`
      )
    }
    const frozen = variant === 'invalid-json' ? '{invalid' : JSON.stringify(store)
    await f.box.state.write('ki/agents/r/control.json', frozen)
    expect((await f.stop()).exitCode).toBe(1)
    expect(f.signals).toHaveLength(0)
    expect(await f.box.state.read('ki/agents/r/control.json')).toBe(frozen)
  })

  test.each(['missing', 'malformed', 'empty-heading', 'missing-heading', 'ambiguous', 'slug', 'changed'] as const)(
    'authority evidence is exact: %s',
    async (variant) => {
      const f = await fixture()
      f.box.setAgentLaunchEvidence(evidenced())
      let authority = `${f.box.project.path}/authority.md#Grant`
      if (variant === 'missing') authority = `${f.box.project.path}/absent.md#Grant`
      if (variant === 'malformed') authority = 'authority.md'
      if (variant === 'empty-heading') authority = 'authority.md#'
      if (variant === 'missing-heading') authority = 'authority.md#Missing'
      if (variant === 'ambiguous') await f.box.project.write('authority.md', '# Grant\nFirst.\n# Grant\nSecond.\n')
      if (variant === 'slug') {
        await f.box.project.write('authority.md', '# Owner Grant\nBounded.\n## Details\nMore.\n# Other\nOutside.\n')
        authority = 'authority.md#owner-grant'
      }
      if (variant === 'changed') {
        expect(
          (await f.run(`ki agent queue r worker brief.md --role build --authority ${authority} --json`)).exitCode
        ).toBe(0)
        await f.box.project.write('authority.md', '# Grant\nChanged.\n')
        const result = await f.run('ki agent dispatch r --max 1 --foreground')
        expect(result.exitCode).toBe(1)
        expect(result.stderr).toContain('authority-changed')
      } else {
        const result = await f.run(`ki agent launch r worker . brief.md --role build --authority ${authority} --json`)
        expect(result.exitCode, result.output).toBe(variant === 'slug' ? 0 : 1)
      }
      expect(f.launched()).toBe(variant === 'slug' ? 1 : 0)
    }
  )

  test.each([
    'blank',
    'absent',
    'invalid-json',
    'relative-record',
    'invalid-digest',
    'wrong-id',
    'unknown-run',
    'unknown-agent',
    'inexact-identity',
    'unrelated-review'
  ] as const)('accept refuses unsupported evidence: %s', async (variant) => {
    const f = await fixture()
    const { declaration, authority } = await declarationFixture(f)
    f.box.setAgentLaunchEvidence({
      ...evidenced(),
      acceptance: { revision: 'ki/scoped-acceptance/v1', render: (document) => JSON.stringify(document) }
    })
    const record = present(declaration.records[0])
    const review = present(record.reviews[0])
    if (variant === 'relative-record') record.path = 'record.md'
    if (variant === 'invalid-digest') record.sha256 = 'bad'
    if (variant === 'wrong-id') record.id = 'KI-TEST-999'
    if (variant === 'unknown-run') review.reviewer_attempt.run = 'unknown'
    if (variant === 'unknown-agent') review.reviewer_attempt.agent = 'unknown'
    if (variant === 'inexact-identity') Object.assign(review.reviewer_attempt, { extra: true })
    if (variant === 'unrelated-review') {
      await f.box.project.write('other-review.md', '# Independent\n')
      review.path = `${f.box.project.path}/other-review.md`
      review.sha256 = hash('# Independent\n')
    }
    if (variant !== 'absent')
      await f.box.project.write(
        'acceptance.json',
        variant === 'invalid-json' ? '{invalid' : variant === 'blank' ? '' : JSON.stringify(declaration)
      )
    const result = await f.run(
      `ki agent launch r acceptor . brief.md --role accept --authority ${authority} --acceptance acceptance.json --json`
    )
    expect(result.exitCode, result.output).toBe(1)
    expect(result.stderr).toContain('acceptance-unverified')
    expect(f.launched()).toBe(2)
  })

  test('a queued stop directs the caller to exact-entry cancellation without touching a worker', async () => {
    const f = await fixture()
    const queued = await f.queue()
    const result = await f.stop('--request queued-stop')
    expect(result.exitCode).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({
      schema: 'ki/agent-control/v1',
      outcome: 'queued-use-dequeue',
      dequeueCommand: expect.stringContaining(queued.entry)
    })
    expect(f.signals).toHaveLength(0)
    expect((await f.state()).entries[queued.entry].state).toBe('queued')
    expect((await f.stop('--request queued-stop')).stdout).toBe(result.stdout)
  })

  test('DONE with a report remains busy while verified descendants own the scope', async () => {
    const f = await fixture()
    await f.launch()
    await f.box.state.write('ki/agents/r/worker.status', 'Complete\nDONE\n')
    await f.box.project.write('+/_WORK/ki.r/worker.report.md', '# Result\n')
    const status = await f.run('ki agent status r')
    expect(status.stdout).toContain('completion-unconfirmed')
    expect((await f.events()).filter((event) => event.kind === 'done')).toHaveLength(0)
    f.set({ empty: true })
    expect((await f.run('ki agent watch r')).exitCode).toBe(0)
    expect((await f.run('ki agent status r')).stdout).toContain('finished')
  })

  test('a legacy packet consumes its attempt number without authorising old PID control', async () => {
    const f = await fixture()
    await f.box.state.write('ki/agents/r/worker.pid', '999999\n')
    f.set({ empty: true })
    const launch = await f.run('ki agent launch r worker . brief.md --relaunch --json')
    expect(launch.exitCode, launch.output).toBe(0)
    expect(JSON.parse(launch.stdout).identity.attempt).toBe(2)
    expect((await f.stop()).exitCode).toBe(1)
    expect(f.signals).toHaveLength(0)
  })

  test('a later relaunch cannot reopen a gate bound to the stopped predecessor', async () => {
    const f = await fixture()
    await f.launch()
    expect((await f.run('ki agent launch r dependent . brief.md --wait-for worker --json')).exitCode).toBe(0)
    const held = f.launches[1] as AgentLaunch
    const bound = (await f.state()).attempts.dependent.dependencies.worker.token
    expect((await f.stop()).exitCode).toBe(0)
    expect((await f.run('ki agent launch r worker . brief.md --relaunch --json')).exitCode).toBe(0)
    expect((await f.state()).attempts.worker.token).not.toBe(bound)
    await f.box.state.write('ki/agents/r/worker.report.md', '# New attempt report\n')
    await f.box.state.write('ki/agents/r/worker.status', 'New attempt finished\nDONE\n')
    const result = await f.run(['ki', ...held.arguments])
    expect(result.stdout).toContain('worker was stopped')
    expect(f.launched()).toBe(3)
    f.set({ empty: true })
    expect((await f.run('ki agent launch r fresh . brief.md --wait-for worker --json')).exitCode).toBe(0)
    expect(f.launched()).toBe(4)
  })

  test('a future queued predecessor binds once; fresh requeue does not inherit its cancellation or release its old dependent', async () => {
    const f = await fixture()
    expect((await f.run('ki agent launch r dependent . brief.md --wait-for worker --json')).exitCode).toBe(0)
    const held = f.launches[0] as AgentLaunch
    expect((await f.state()).attempts.dependent.dependencies.worker).toBeNull()
    const first = await f.queue()
    expect((await f.state()).attempts.dependent.dependencies.worker.entry).toBe(first.entry)
    expect((await f.run(`ki agent dequeue r worker --entry ${first.entry} --reason owner --json`)).exitCode).toBe(0)
    await f.box.project.write('brief.md', '# Fresh request\n')
    const second = await f.queue()
    expect(second.entry).not.toBe(first.entry)
    expect((await f.run(['ki', ...held.arguments])).stdout).toContain('worker was dequeued')
    f.set({ empty: true })
    expect((await f.run('ki agent dispatch r --max 1 --foreground')).exitCode).toBe(0)
    expect((await f.state()).entries[second.entry].state).toBe('started')
    await f.box.state.write('ki/agents/r/worker.status', 'New request done\nDONE\n')
    expect(f.launched()).toBe(2)
    expect(await f.box.state.read(`ki/agents/r/queue-entries/${first.entry}.md`)).toContain('Bounded task')
  })

  test('a queued relaunch does not hide the running predecessor from the concurrency limit', async () => {
    const f = await fixture()
    await f.launch()
    const next = await f.run('ki agent queue r worker brief.md --relaunch --json')
    expect(next.exitCode).toBe(0)
    let sleeps = 0
    f.onSleep(async () => {
      sleeps += 1
      f.set({ empty: true })
    })
    expect((await f.run('ki agent dispatch r --max 1 --interval 1 --foreground')).exitCode).toBe(0)
    expect(sleeps).toBe(1)
    expect(f.launched()).toBe(2)
    expect((await f.state()).entries[JSON.parse(next.stdout).entry].state).toBe('started')
  })

  test('delayed dequeue and stop retries resolve the old terminal identity after relaunch', async () => {
    const f = await fixture()
    const first = await f.queue()
    const started = await f.run([
      'ki',
      'agent',
      'launch',
      'r',
      'worker',
      '.',
      `${f.box.state.path}/ki/agents/r/worker.queued.md`,
      '--json'
    ])
    expect(started.stderr).toBe('')
    expect(started.exitCode).toBe(0)
    const stopped = await f.stop('--request original-stop')
    expect(stopped.exitCode).toBe(0)
    expect((await f.run('ki agent launch r worker . brief.md --relaunch --json')).exitCode).toBe(0)
    const current = (await f.state()).attempts.worker.token
    const result = await f.run(`ki agent dequeue r worker --entry ${first.entry} --reason owner --json`)
    expect(JSON.parse(result.stdout).outcome).toBe('already-terminal')
    expect(await f.stop('--request original-stop')).toEqual(stopped)
    expect(f.signals).toHaveLength(1)
    expect((await f.state()).attempts.worker.token).toBe(current)
    expect((await f.state()).attempts.worker.state).toBe('running')
  })
  test('stop signals one immutable scope while another attempt remains live', async () => {
    const f = await fixture()
    await f.launch()
    await f.run('ki agent launch r neighbour . brief.md --json')
    expect((await f.stop()).exitCode).toBe(0)
    expect(f.signals).toHaveLength(1)
    expect(f.signals[0]?.agent).toBe('worker')
    expect(f.signals[0]?.scope).not.toBe(f.identities[1]?.scope)
    const status = await f.run('ki agent status r')
    expect(status.stdout).toContain('neighbour:')
    expect(status.stdout).not.toContain('neighbour: stopped')
    expect((await f.state()).attempts.neighbour.state).toBe('running')
  })
  test('positive fenced absence returns the original frozen entry to queued, including a lost projection', async () => {
    const { f, queued, operation, evidence, command } = await uncertain()
    await f.box.project.write('evidence.json', JSON.stringify(evidence))
    f.set({ empty: true, workerStarted: false, consumed: false, failLaunch: false })
    const resolved = await f.run(`${command} --request absent`)
    expect(resolved.exitCode, resolved.output).toBe(0)
    expect(JSON.parse(resolved.stdout).outcome).toBe('spawn-not-started')
    expect((await f.state()).entries[queued.entry].state).toBe('queued')
    expect((await f.state()).operations[operation.id].resolvedBy).toBe('absent')
    expect(await f.run(command)).toEqual(resolved)
    await f.box.state.write('ki/agents/r/queue.jsonl', '')
    expect((await f.run('ki agent status r')).stdout).toContain(queued.entry)
    expect((await f.run('ki agent dispatch r --max 1 --foreground')).exitCode).toBe(0)
    expect(f.launched()).toBe(2)
    expect((await f.state()).attempts.worker.token).toBe(operation.target.token)
    expect(await f.box.state.read(`ki/agents/r/queue-entries/${queued.entry}.md`)).toContain('Bounded task')
  })

  test.each([
    'schema',
    'operation',
    'target',
    'empty-proofs',
    'null-proof',
    'relative-proof',
    'bad-digest',
    'missing-proof',
    'unsupported-observation',
    'unverified-adapter',
    'ownership',
    'consumed-authorisation'
  ] as const)('keeps an uncertain claim fenced for %s evidence', async (variant) => {
    const { f, queued, evidence, command } = await uncertain()
    f.set({ empty: true, workerStarted: false, consumed: false, failLaunch: false })
    if (variant === 'schema') evidence.schema = 'unknown'
    if (variant === 'operation') evidence.operation_id = 'another-operation'
    if (variant === 'target') evidence.target_id = 'another-token'
    if (variant === 'empty-proofs') evidence.proofs = []
    if (variant === 'relative-proof') present(evidence.proofs[0]).path = 'proof.json'
    if (variant === 'bad-digest') present(evidence.proofs[0]).sha256 = hash('forged')
    if (variant === 'missing-proof') present(evidence.proofs[0]).path = `${f.box.project.path}/absent.json`
    if (variant === 'unsupported-observation') evidence.observation = 'wake-delivered'
    if (variant === 'unverified-adapter') f.set({ verified: false })
    if (variant === 'ownership') f.set({ ownership: false })
    if (variant === 'consumed-authorisation') f.set({ consumed: true })
    const document = variant === 'null-proof' ? { ...evidence, proofs: [null] } : evidence
    await f.box.project.write('evidence.json', JSON.stringify(document))
    const result = await f.run(command)
    expect(result.exitCode, result.output).toBe(1)
    expect(JSON.parse(result.stdout).outcome).toBe('reconciliation-unconfirmed')
    expect((await f.state()).entries[queued.entry].state).toBe('unconfirmed')
    expect(f.launched()).toBe(1)
    expect(f.signals).toHaveLength(0)
  })

  test.each(['null', '[]', '{invalid'])(
    'refuses malformed reconciliation document %s without changing a fence',
    async (document) => {
      const { f, command } = await uncertain()
      await f.box.project.write('evidence.json', document)
      const before = await f.box.state.read('ki/agents/r/control.json')
      expect((await f.run(command)).exitCode).toBe(1)
      expect(await f.box.state.read('ki/agents/r/control.json')).toBe(before)
    }
  )

  test('dequeue retry and observers retain one event after automatic verified history repair', async () => {
    const f = await fixture()
    const queued = await f.queue()
    const result = await f.run(
      `ki agent dequeue r worker --entry ${queued.entry} --reason owner --request cancelled --json`
    )
    expect(result.exitCode).toBe(0)
    const store = await f.state()
    delete store.operations.cancelled.receipt
    await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
    await f.box.state.write('ki/agents/r/control-receipts/cancelled.json', JSON.stringify(JSON.parse(result.stdout)))
    await f.box.state.write('ki/agents/r/events.jsonl', '')
    const repaired = await Promise.all([f.run('ki agent status r'), f.run('ki agent status r')])
    expect(repaired.map((result) => result.exitCode)).toEqual([0, 0])
    const checkpoint = JSON.parse(await f.box.state.read('ki/agents/r/events.history'))
    expect(await f.box.state.read('ki/agents/r/events.jsonl')).toBe(checkpoint.journal)
    await Promise.all([f.run('ki agent status r'), f.run('ki agent status r')])
    expect((await f.events()).filter((event) => event.kind === 'dequeued')).toHaveLength(1)
    expect(await f.run('ki agent dequeue r worker --entry unknown --reason owner')).toMatchObject({ exitCode: 1 })
    expect(
      JSON.parse(
        (await f.run(`ki agent dequeue r worker --entry ${queued.entry} --reason owner --request cancelled --json`))
          .stdout
      ).operationId
    ).toBe('cancelled')
  })
  test('accept uses none and the exact scoped declaration only with a fixture joint Harness capability', async () => {
    const f = await fixture()
    const { declaration, authority } = await declarationFixture(f)
    await f.box.project.write('acceptance.json', JSON.stringify(declaration))
    f.box.setAgentLaunchEvidence({
      ...evidenced(),
      acceptance: {
        revision: 'ki/scoped-acceptance/v1',
        render: (document) => `## Scoped acceptance fixture\n\n${JSON.stringify(document)}\n`
      }
    })
    const result = await f.run(
      `ki agent launch r acceptor . brief.md --role accept --authority ${authority} --acceptance acceptance.json --json`
    )
    expect(result.exitCode, result.output).toBe(0)
    const selected = JSON.parse(result.stdout).selection
    expect(selected).toMatchObject({
      rules: 'none',
      grants: [],
      acceptanceWordingRevision: 'ki/scoped-acceptance/v1',
      acceptance: { declaration }
    })
    const prompt = await f.box.state.read('ki/agents/r/acceptor.prompt.md')
    expect(prompt).toContain(JSON.stringify(declaration))
    expect(prompt).toContain('Tier none.')
    expect(f.launched()).toBe(3)
  })

  test('queued acceptance refuses changed review evidence without rewriting the frozen declaration', async () => {
    const f = await fixture()
    const { declaration, authority } = await declarationFixture(f)
    await f.box.project.write('acceptance.json', JSON.stringify(declaration))
    f.box.setAgentLaunchEvidence({
      ...evidenced(),
      acceptance: { revision: 'ki/scoped-acceptance/v1', render: (document) => JSON.stringify(document) }
    })
    expect(
      (
        await f.run(
          `ki agent queue r acceptor brief.md --role accept --authority ${authority} --acceptance acceptance.json --json`
        )
      ).exitCode
    ).toBe(0)
    const frozen = await f.box.project.read('acceptance.json')
    await f.box.project.write('+/_WORK/ki.r/reviewer.report.md', '# Changed review\n')
    f.set({ empty: true })
    const result = await f.run('ki agent dispatch r --max 1 --foreground')
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('changed or missing record/review')
    expect(
      Object.values((await f.state()).entries).some((entry) => (entry as { state: string }).state === 'queued')
    ).toBe(true)
    expect(f.launched()).toBe(2)
    expect(await f.box.project.read('acceptance.json')).toBe(frozen)
    expect(await f.box.state.read('ki/agents/r/acceptor.prompt.md').catch(() => 'absent')).toBe('absent')
  })
  test.each([
    ['mechanical', 'codex', 'fixture-codex-standard', 'medium', 'none'],
    ['plan', 'codex', 'fixture-codex-strongest', 'high', 'none'],
    ['build', 'claude', 'fixture-claude-worker', 'high', 'none'],
    ['review', 'codex', 'fixture-codex-strongest', 'high', 'none'],
    ['prune', 'claude', 'fixture-claude-worker', 'high', 'prune'],
    ['release', 'claude', 'fixture-claude-worker', 'high', 'release']
  ])('resolves fixture-evidenced %s without adding grants', async (role, runtime, model, effort, rules) => {
    const f = await fixture()
    f.box.setAgentLaunchEvidence(evidenced())
    const result = await f.run(
      `ki agent launch r worker . brief.md --role ${role} --authority ${f.box.project.path}/authority.md#Grant --json`
    )
    expect(result.exitCode, result.output).toBe(0)
    expect(JSON.parse(result.stdout).selection).toMatchObject({
      path: 'role',
      role,
      runtime,
      model,
      effort,
      rules,
      grants: [],
      profileRevision: 'fixture/v1'
    })
    expect(await f.box.state.read('ki/agents/r/worker.prompt.md')).toContain(`Tier ${rules}.`)
    expect(f.launched()).toBe(1)
  })

  test.each([
    'runtime-without-model',
    'wrong-model',
    'unsupported-effort',
    'bad-pin',
    'missing-authority',
    'wrong-footer'
  ] as const)('refuses evidenced profile mismatch: %s', async (variant) => {
    const f = await fixture()
    const evidence = evidenced()
    if (variant === 'unsupported-effort') evidence.profiles['codex-strongest'].efforts = ['medium']
    if (variant === 'bad-pin') evidence.profiles['codex-strongest'].evidenceRevision = ''
    f.box.setAgentLaunchEvidence(evidence)
    const options =
      variant === 'runtime-without-model'
        ? '--runtime claude'
        : variant === 'wrong-model'
          ? '--model another-model'
          : variant === 'wrong-footer'
            ? '--role accept --rules prune'
            : ''
    const authority = variant === 'missing-authority' ? '' : `--authority ${f.box.project.path}/authority.md#Grant`
    const result = await f.run(
      `ki agent launch r worker . brief.md --role review ${options} ${authority} --dry-run --json`
    )
    expect(result.exitCode).toBe(1)
    expect(JSON.parse(result.stdout).refusals.length).toBeGreaterThan(0)
    expect(f.launched()).toBe(0)
    expect(await f.box.state.read('ki/agents/r/worker.prompt.md').catch(() => 'absent')).toBe('absent')
  })

  test('an exact approved alternative and supported explicit higher effort win within the role constraints', async () => {
    const f = await fixture()
    const evidence = evidenced()
    const authoritySha256 = hash(await f.box.project.read('authority.md'))
    f.box.setAgentLaunchEvidence({
      ...evidence,
      alternatives: [
        {
          ...evidence.profiles['codex-strongest'],
          runtime: 'claude',
          model: 'fixture-authorised-review-alternative',
          role: 'review',
          authoritySha256
        }
      ]
    })
    const result = await f.run(
      `ki agent launch r worker . brief.md --role review --runtime claude --model fixture-authorised-review-alternative --effort max --authority ${f.box.project.path}/authority.md#Grant --json`
    )
    expect(result.exitCode, result.output).toBe(0)
    expect(JSON.parse(result.stdout).selection).toMatchObject({
      runtime: 'claude',
      model: 'fixture-authorised-review-alternative',
      effort: 'max',
      alternative: true,
      sources: { runtime: 'explicit', model: 'explicit', effort: 'explicit' }
    })
    expect(f.launches[0]?.arguments).toContain('fixture-authorised-review-alternative')
  })

  test('queue keeps its frozen accepted binding when the default changes and refuses removed evidence', async () => {
    const f = await fixture()
    const evidence = evidenced()
    f.box.setAgentLaunchEvidence(evidence)
    const queued = await f.run(
      `ki agent queue r worker brief.md --role plan --authority ${f.box.project.path}/authority.md#Grant --json`
    )
    expect(queued.exitCode, queued.output).toBe(0)
    const old = evidence.profiles['codex-strongest']
    f.box.setAgentLaunchEvidence({
      ...evidence,
      profiles: {
        ...evidence.profiles,
        'codex-strongest': { ...old, model: 'fixture-new-default', revision: 'fixture/v2' }
      },
      bindings: [old]
    })
    f.set({ empty: true })
    expect((await f.run('ki agent dispatch r --max 1 --foreground')).exitCode).toBe(0)
    const metadata = JSON.parse(await f.box.state.read('ki/agents/r/worker.launch.json'))
    expect(metadata).toMatchObject({ model: old.model, profileRevision: 'fixture/v1' })
    expect(f.launches[0]?.arguments).toContain(old.model)
    expect(f.launches[0]?.arguments).not.toContain('fixture-new-default')
  })

  test('held role launch retains its original selection and profile revision', async () => {
    const f = await fixture()
    const evidence = evidenced()
    f.box.setAgentLaunchEvidence(evidence)
    await f.box.state.write('ki/agents/r/before.pid', '900\n')
    const result = await f.run(
      `ki agent launch r worker . brief.md --role build --authority ${f.box.project.path}/authority.md#Grant --wait-for before --json`
    )
    expect(result.exitCode, result.output).toBe(0)
    await f.box.state.write('ki/agents/r/before.status', 'Complete\nDONE\n')
    const held = f.launches[0] as AgentLaunch
    expect((await f.run(['ki', ...held.arguments])).exitCode).toBe(0)
    expect(JSON.parse(await f.box.state.read('ki/agents/r/worker.launch.json'))).toMatchObject({
      role: 'build',
      model: 'fixture-claude-worker',
      effort: 'high',
      profileRevision: 'fixture/v1'
    })
  })
  test.each([
    'valid',
    'wildcard',
    'duplicate',
    'changed-record',
    'changed-review',
    'same-reviewer',
    'wrong-override',
    'extra-field',
    'missing-reviews'
  ] as const)('accept declaration preflight: %s remains gated without adding authority', async (variant) => {
    const f = await fixture()
    const { declaration, record, review, authority } = await declarationFixture(f)
    if (variant === 'wildcard') present(declaration.records[0]).id = '*'
    if (variant === 'duplicate') declaration.records.push(present(declaration.records[0]))
    if (variant === 'changed-record') await f.box.project.write('record.md', `${record}Changed.\n`)
    if (variant === 'changed-review')
      await f.box.project.write('+/_WORK/ki.r/reviewer.report.md', `${review}Changed.\n`)
    if (variant === 'same-reviewer')
      present(present(declaration.records[0]).reviews[0]).reviewer_attempt = present(
        present(declaration.records[0]).reviews[0]
      ).delivery_attempt
    if (variant === 'wrong-override') declaration.override = 'accept-everything'
    if (variant === 'missing-reviews') present(declaration.records[0]).reviews = []
    const document = variant === 'extra-field' ? { ...declaration, push: true } : declaration
    await f.box.project.write('acceptance.json', JSON.stringify(document))
    const result = await f.run(
      `ki agent launch r acceptor . brief.md --role accept --authority ${authority} --acceptance acceptance.json --dry-run --json`
    )
    expect(result.exitCode).toBe(1)
    const selection = JSON.parse(result.stdout)
    expect(selection.refusals.join(' ')).toContain('acceptance-contract-unavailable')
    expect(selection.rules).toBe('none')
    expect(selection.grants).toEqual([])
    if (variant === 'valid') expect(selection.acceptance.declaration).toEqual(declaration)
    else expect(selection.refusals.join(' ')).toContain('acceptance-unverified')
    expect(f.launched()).toBe(2)
    expect(await f.box.state.read('ki/agents/r/acceptor.prompt.md').catch(() => 'absent')).toBe('absent')
  })

  test.each(['machine', 'workHome', 'work'] as const)(
    'refuses a changed %s without touching the packet',
    async (field) => {
      const f = await fixture()
      await f.launch()
      const store = await f.state()
      store[field] = 'foreign'
      const before = JSON.stringify(store)
      await f.box.state.write('ki/agents/r/control.json', before)
      expect((await f.stop()).exitCode).toBe(1)
      expect(await f.box.state.read('ki/agents/r/control.json')).toBe(before)
      expect(f.signals).toHaveLength(0)
    }
  )

  test('PID reuse and a foreign group identity do not authorise a signal', async () => {
    const f = await fixture()
    await f.launch()
    const store = await f.state()
    store.attempts.worker.owner.birth = 'reused-pid'
    store.attempts.worker.owner.group = 'foreign-group'
    await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
    const result = await f.stop()
    expect(JSON.parse(result.stdout).outcome).toBe('ownership-unverified')
    expect(f.signals).toHaveLength(0)
  })

  test('a timed-out scope can be confirmed stopped later without another signal', async () => {
    const f = await fixture()
    await f.launch()
    f.set({ fenced: false })
    expect((await f.stop('--grace 1')).exitCode).toBe(1)
    f.set({ fenced: true })
    expect(JSON.parse((await f.stop()).stdout).outcome).toBe('stopped')
    expect(f.signals).toHaveLength(1)
  })

  test('claimed cancellation and unknown entry refusals preserve the journal and brief', async () => {
    const f = await fixture()
    const queue = await f.queue()
    const store = await f.state()
    store.entries[queue.entry].state = 'claimed'
    await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
    const result = await f.run(`ki agent dequeue r worker --entry ${queue.entry} --reason owner --json`)
    expect(JSON.parse(result.stdout).outcome).toBe('cancelled-before-start')
    const before = await f.box.state.read('ki/agents/r/control.json')
    expect((await f.run('ki agent dequeue r worker --entry unknown --reason owner --json')).exitCode).toBe(1)
    expect(await f.box.state.read('ki/agents/r/control.json')).toBe(before)
    expect(f.launched()).toBe(0)
  })

  test('queue selection tampering is refused before claim or launch', async () => {
    const f = await fixture()
    await f.queue()
    const frozen = await f.box.state.read('ki/agents/r/queue.jsonl')
    await f.box.state.write('ki/agents/r/queue.jsonl', frozen.replace('"runtime":"claude"', '"runtime":"codex"'))
    const result = await f.run('ki agent dispatch r --max 1 --foreground')
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('selection-changed')
    expect(f.launched()).toBe(0)
  })
  test.each(['descendants', 'ownership-loss', 'inspection-error'] as const)(
    'retains uncertainty after SIGTERM when %s remain',
    async (effect) => {
      const f = await fixture()
      await f.launch()
      f.signal(effect)
      const result = await f.stop('--grace 1')
      expect(result.exitCode).toBe(1)
      expect(JSON.parse(result.stdout).outcome).toBe(effect === 'descendants' ? 'stop-timeout' : 'ownership-unverified')
      expect(f.signals).toHaveLength(1)
      expect((await f.events()).some((event) => event.kind === 'stopped')).toBe(false)
    }
  )

  test('stop fences a held gate before it can launch, even when its dependency later finishes', async () => {
    const f = await fixture()
    await f.box.state.write('ki/agents/r/before.pid', '900\n')
    const held = await f.run('ki agent launch r worker . brief.md --wait-for before --json')
    expect(held.exitCode, held.output).toBe(0)
    expect(f.identities[0]?.state).toBe('held')
    expect((await f.stop()).exitCode).toBe(0)
    await f.box.state.write('ki/agents/r/before.status', 'Done\nDONE\n')
    const request = f.launches[0] as AgentLaunch
    const holder = await f.run(['ki', ...request.arguments])
    expect(holder.stdout).toContain('launch-fenced')
    expect(f.launched()).toBe(1)
  })

  test('gate opening wins first, then stop covers the same immutable scope', async () => {
    const f = await fixture()
    await f.box.state.write('ki/agents/r/before.pid', '900\n')
    await f.run('ki agent launch r worker . brief.md --wait-for before --json')
    const request = f.launches[0] as AgentLaunch
    await f.box.state.write('ki/agents/r/before.status', 'Done\nDONE\n')
    expect((await f.run(['ki', ...request.arguments])).exitCode).toBe(0)
    expect(f.identities).toHaveLength(2)
    expect(f.identities[0]?.token).toBe(f.identities[1]?.token)
    expect(f.identities[0]?.scope).toBe(f.identities[1]?.scope)
    expect((await f.stop()).exitCode).toBe(0)
    expect(f.signals).toHaveLength(1)
  })

  test('two observers and a lost observation snapshot cannot turn a stopped attempt into success', async () => {
    const f = await fixture()
    await f.launch()
    await f.stop()
    await f.box.state.write('ki/agents/r/events.state.json', '{}\n')
    await f.box.state.write('ki/agents/r/worker.status', 'Partial effects preserved\nDONE\n')
    await Promise.all([f.run('ki agent status r'), f.run('ki agent status r')])
    const terminal = (await f.events()).filter((event) => ['stopped', 'done', 'failed'].includes(event.kind))
    expect(terminal.map((event) => event.kind)).toEqual(['stopped'])
    expect((await f.run('ki agent launch r dependent . brief.md --wait-for worker')).stderr).toContain('was stopped')
  })
  test('keeps recovery and decision reconciliation separate in help and invalid usage', async () => {
    const f = await fixture()
    for (const command of [
      'ki agent --help',
      'ki agent recover --help',
      'ki agent recover inspect --help',
      'ki agent recover resolve --help',
      'ki agent reconcile --help'
    ]) {
      const result = await f.run(command)
      expect(result.exitCode).toBe(0)
      if (command === 'ki agent --help') {
        expect(result.stdout).toContain('reconcile')
        expect(result.stdout).toContain('recover')
      }
      if (command === 'ki agent recover --help') {
        expect(result.stdout).toContain('inspect')
        expect(result.stdout).toContain('resolve')
      }
      if (command === 'ki agent reconcile --help') {
        expect(result.stdout).toContain('<run> <entry> [home]')
        expect(result.stdout).toContain('--class')
        expect(result.stdout).not.toContain('--operation')
      }
    }
    expect((await f.run('ki agent recover resolve r')).exitCode).toBe(2)
    expect(await f.box.state.read('ki/agents/r/control.json').catch(() => 'absent')).toBe('absent')
  })

  test('records immutable identities and confirms one whole-scope stop, with idempotent receipts and events', async () => {
    const f = await fixture()
    const launched = await f.launch()
    expect(launched.exitCode, launched.output).toBe(0)
    const selection = JSON.parse(launched.stdout)
    expect(selection.selection).toMatchObject({
      schema: 'ki/agent-launch/v1',
      path: 'legacy',
      runtime: 'claude',
      rules: 'none'
    })
    expect(selection.identity).toMatchObject({ attempt: 1, work: 'ki.r', state: 'running' })
    const first = await f.stop('--request stop-one')
    expect(first.exitCode, first.output).toBe(0)
    expect(JSON.parse(first.stdout)).toMatchObject({
      schema: 'ki/agent-control/v1',
      operationId: 'stop-one',
      outcome: 'stopped',
      resultingState: 'stopped',
      exitCode: 0
    })
    expect(await f.stop('--request stop-one')).toEqual(first)
    expect(f.signals).toHaveLength(1)
    expect((await f.events()).filter((event) => event.kind === 'stopped')).toHaveLength(1)
    expect(JSON.parse((await f.stop()).stdout).outcome).toBe('already-stopped')
    const changed = await f.run('ki agent stop r worker --attempt 1 --reason different --request stop-one --json')
    expect(changed.exitCode).toBe(1)
    expect(changed.stderr).toContain('request-conflict')
    const next = await f.run('ki agent wait r --next')
    expect(next.stdout).toContain('stopped')
    expect((await f.run('ki agent status r')).stdout).toContain('stopped')
    expect((await f.run('ki agent watch r')).stdout).toContain('ALL FINISHED')
  })

  test.each(['containment', 'ownership', 'permission', 'lost'] as const)(
    'refuses unsafe %s without a confirmed stop',
    async (failure) => {
      const f = await fixture()
      await f.launch()
      if (failure === 'containment') f.set({ containment: false })
      if (failure === 'ownership') f.set({ ownership: false })
      if (failure === 'permission') f.set({ permission: true })
      if (failure === 'lost') f.set({ lost: true })
      const result = await f.stop()
      expect(result.exitCode).toBe(1)
      expect(JSON.parse(result.stdout).outcome).toBe(
        failure === 'containment' ? 'containment-unverified' : 'ownership-unverified'
      )
      expect(f.signals).toHaveLength(0)
      expect((await f.events()).filter((event) => event.kind === 'stopped')).toHaveLength(0)
    }
  )

  test('a disappearing original group does not confirm a scope with unfenced descendants', async () => {
    const f = await fixture()
    await f.launch()
    f.set({ fenced: false })
    const result = await f.stop('--grace 1')
    expect(result.exitCode).toBe(1)
    expect(JSON.parse(result.stdout).outcome).toBe('stop-timeout')
    expect(f.signals).toHaveLength(1)
    expect((await f.state()).attempts.worker.state).toBe('stop-timeout')
    expect((await f.run('ki agent status r')).stdout).toContain('stop-timeout')
  })

  test.each(['done', 'failed'] as const)('natural %s wins the signal race as a terminal no-op', async (terminal) => {
    const f = await fixture()
    await f.launch()
    f.set({ terminal, empty: true })
    if (terminal === 'done') {
      await f.box.state.write('ki/agents/r/worker.report.md', '# Natural report\n')
      await f.box.state.write('ki/agents/r/worker.status', 'Complete\nDONE\n')
    }
    const result = await f.stop()
    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ outcome: 'already-terminal', resultingState: terminal })
    expect(f.signals).toHaveLength(0)
  })

  test('dead before the request is failed, and native legacy ownership never authorises a signal', async () => {
    const f = await fixture()
    await f.launch()
    f.set({ empty: true })
    expect(JSON.parse((await f.stop()).stdout)).toMatchObject({ outcome: 'already-terminal', resultingState: 'failed' })
    const legacy = await fixture(false)
    await legacy.launch()
    expect(JSON.parse((await legacy.stop()).stdout).outcome).toBe('containment-unverified')
    expect(legacy.signals).toHaveLength(0)
  })

  test('rejects PID-only packets, foreign homes, invalid attempts and changed request IDs without signalling', async () => {
    const f = await fixture()
    await f.box.state.write('ki/agents/r/old.pid', '999\n')
    expect((await f.run('ki agent stop r old --attempt 1 --reason owner --json')).stderr).toContain(
      'ownership-unverified'
    )
    await f.launch()
    const before = await f.box.state.read('ki/agents/r/control.json')
    expect((await f.run('ki agent stop r worker --attempt 2 --reason owner')).exitCode).toBe(1)
    expect((await f.stop('--grace 121')).exitCode).toBe(2)
    expect(await f.box.state.read('ki/agents/r/control.json')).toBe(before)
    const store = JSON.parse(before)
    store.machine = 'another-machine'
    await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
    expect((await f.stop()).stderr).toContain('control-home-unverified')
    expect(f.signals).toHaveLength(0)
  })

  test('relaunch changes token and attempt; a delayed stop cannot reach it', async () => {
    const f = await fixture()
    await f.launch()
    await f.stop()
    const old = (await f.state()).attempts.worker
    f.set({ empty: false })
    const relaunched = await f.run('ki agent launch r worker . brief.md --relaunch --json')
    expect(relaunched.exitCode, relaunched.output).toBe(0)
    const current = (await f.state()).attempts.worker
    expect(current.attempt).toBe(2)
    expect(current.token).not.toBe(old.token)
    expect(JSON.parse((await f.stop()).stdout).outcome).toBe('already-stopped')
    expect(f.signals).toHaveLength(1)
  })

  test('cancellation wins before dispatch, preserves frozen evidence, and does not open a dependency gate', async () => {
    const f = await fixture()
    const queued = await f.queue()
    const cancel = `ki agent dequeue r worker --entry ${queued.entry} --reason owner --request cancel --json`
    const first = await f.run(cancel)
    expect(first.exitCode, first.output).toBe(0)
    expect(JSON.parse(first.stdout).outcome).toBe('cancelled-before-start')
    expect(await f.run(cancel)).toEqual(first)
    expect(JSON.parse((await f.run(cancel.replace('--request cancel ', ''))).stdout).outcome).toBe('already-dequeued')
    expect(await f.box.state.read('ki/agents/r/worker.queued.md')).toContain('Bounded task')
    expect((await f.run('ki agent launch r dependent . brief.md --wait-for worker')).stderr).toContain(
      'gate cannot open'
    )
    const dispatched = await f.run('ki agent dispatch r --max 1 --foreground')
    expect(dispatched.exitCode, dispatched.output).toBe(0)
    expect(f.launched()).toBe(0)
    expect((await f.events()).filter((event) => event.kind === 'dequeued')).toHaveLength(1)
    expect((await f.run('ki agent wait r --next')).stdout).toContain('dequeued')
  })

  test('concurrent queue appends retain both entries; spawn wins cancellation with a stop identity', async () => {
    const f = await fixture()
    const results = await Promise.all(
      ['one', 'two'].map((name) => f.box.run(`ki agent queue r ${name} brief.md --json`))
    )
    for (const result of results) expect(result.exitCode, result.output).toBe(0)
    const [one, two] = results.map((result) => JSON.parse(result.stdout))
    expect(one.entry).not.toBe(two.entry)
    expect(Object.keys((await f.state()).entries)).toHaveLength(2)
    expect(
      (
        await f.run([
          'ki',
          'agent',
          'launch',
          'r',
          'one',
          '.',
          `${f.box.state.path}/ki/agents/r/one.queued.md`,
          '--json'
        ])
      ).exitCode
    ).toBe(0)
    const result = await f.run(`ki agent dequeue r one --entry ${one.entry} --reason owner --json`)
    expect(result.exitCode).toBe(1)
    expect(JSON.parse(result.stdout)).toMatchObject({
      outcome: 'already-started',
      stopCommand: 'ki agent stop r one --attempt 1 --reason <text>'
    })
  })

  test('a lost launch acknowledgement fences replacement and requires token-based adapter evidence', async () => {
    const f = await fixture()
    const queued = await f.queue()
    f.set({ failLaunch: true })
    expect((await f.run('ki agent dispatch r --max 1 --foreground')).exitCode).toBe(1)
    const store = await f.state()
    const operation = Object.values(store.operations).find(
      (value) => (value as { operation: string }).operation === 'spawn'
    ) as { id: string; target: Identity }
    expect(store.entries[queued.entry].state).toBe('unconfirmed')
    expect((await f.run('ki agent dispatch r --max 1 --foreground')).stdout).toContain('claim-unconfirmed')
    const inspect = await f.run(`ki agent recover inspect r --operation ${operation.id} --json`)
    expect(inspect.exitCode).toBe(0)
    expect(JSON.parse(inspect.stdout).inspectedOperation.target.token).toBe(operation.target.token)
    await f.box.project.write('proof.json', 'adapter-proof\n')
    const evidence = {
      schema: 'ki/agent-reconciliation/v1',
      operation_id: operation.id,
      target_id: operation.target.token,
      observation: 'spawn-started',
      proofs: [{ path: `${f.box.project.path}/proof.json`, sha256: hash('adapter-proof\n') }]
    }
    await f.box.project.write('evidence.json', JSON.stringify(evidence))
    f.set({ failLaunch: false, verified: false })
    const command = `ki agent recover resolve r --operation ${operation.id} --evidence evidence.json --authority ${f.box.project.path}/authority.md#Grant --json`
    expect(JSON.parse((await f.run(command)).stdout).outcome).toBe('reconciliation-unconfirmed')
    f.set({ verified: true })
    const recovered = await f.run(`${command} --request recovered`)
    expect(recovered.exitCode, recovered.output).toBe(0)
    expect(JSON.parse(recovered.stdout).outcome).toBe('spawn-started')
    expect(await f.run(`${command} --request recovered`)).toEqual(recovered)
    expect(f.launched()).toBe(1)
    expect(f.signals).toHaveLength(0)
    expect(await f.box.project.read('evidence.json')).toBe(JSON.stringify(evidence))
  })

  test.each(['mechanical', 'plan', 'build', 'review', 'accept', 'prune', 'release'])(
    'keeps %s dormant and dry-run free of launch effects',
    async (role) => {
      const f = await fixture()
      const result = await f.run(
        `ki agent launch r worker . brief.md --role ${role} --authority ${f.box.project.path}/authority.md#Grant --dry-run --json`
      )
      expect(result.exitCode).toBe(1)
      const selection = JSON.parse(result.stdout)
      expect(selection.role).toBe(role)
      expect(selection.refusals.join(' ')).toContain('profile-dormant')
      expect(selection.grants).toEqual([])
      expect(f.launched()).toBe(0)
      expect(await readdir(`${f.box.state.path}/ki/agents`).catch(() => [])).toEqual([])
      const explicit = await f.run(
        `ki agent queue r worker brief.md --role ${role} --runtime claude --model candidate --effort max --rules none --dry-run --json`
      )
      expect(explicit.exitCode).toBe(1)
      expect(JSON.parse(explicit.stdout)).toMatchObject({
        runtime: 'claude',
        model: 'candidate',
        effort: 'max',
        rules: 'none'
      })
      expect(JSON.parse(explicit.stdout).refusals.join(' ')).toContain('model-evidence-unavailable')
    }
  )

  test.each(['push', 'prune', 'release'])('preserves role-free --rules %s without new authority', async (tier) => {
    const f = await fixture(false)
    const launch = await f.run(`ki agent launch r worker . brief.md --rules ${tier} --json`)
    expect(launch.exitCode, launch.output).toBe(0)
    expect(JSON.parse(launch.stdout).selection).toMatchObject({
      path: 'legacy',
      rules: tier,
      runtime: 'claude',
      grants: []
    })
    expect(await f.box.state.read('ki/agents/r/worker.prompt.md')).toContain(`Tier ${tier}.`)
    const queue = await f.run(`ki agent queue r queued brief.md --rules ${tier} --json`)
    expect(queue.exitCode, queue.output).toBe(0)
    expect(JSON.parse(queue.stdout).selection).toMatchObject({ path: 'legacy', rules: tier, grants: [] })
    expect((await f.run(`ki agent launch r denied . brief.md --role build --rules ${tier}`)).exitCode).toBe(1)
    expect(await f.box.state.read('ki/agents/r/denied.prompt.md').catch(() => 'absent')).toBe('absent')
  })
})

describe('implementation review regressions', () => {
  test('review-1: unreadable control projection fails closed without queue mutation', async () => {
    const f = await fixture()
    await f.queue()
    const path = `${f.box.state.path}/ki/agents/r/control.json`
    const before = await f.box.state.read('ki/agents/r/control.json')
    const queue = await f.box.state.read('ki/agents/r/queue.jsonl')
    await chmod(path, 0)
    try {
      const result = await f.run('ki agent queue r other brief.md --json')
      expect(result.exitCode, result.output).toBe(1)
      expect(result.output).toContain('control-state-unverified')
      expect(await f.box.state.read('ki/agents/r/queue.jsonl')).toBe(queue)
      expect(f.launched()).toBe(0)
    } finally {
      await chmod(path, 0o600)
    }
    expect(await f.box.state.read('ki/agents/r/control.json')).toBe(before)
  })

  test('review-1: missing projection with existing journal cannot initialise fresh state', async () => {
    const f = await fixture()
    await f.queue()
    const directory = `${f.box.state.path}/ki/agents/r`
    for (const name of await readdir(directory))
      if (name.startsWith('control') || name.endsWith('.launch.json'))
        await rename(`${directory}/${name}`, `${directory}/legacy-${name}.saved`)

    const result = await f.run('ki agent queue r other brief.md --json')
    expect(result.exitCode, result.output).toBe(1)
    expect(result.output).toMatch(/control-state-unverified|queue-identity-unverified/)
    expect(f.launched()).toBe(0)
  })

  test.each(['authority', 'evidence'] as const)(
    'review-1: held role rechecks %s when its gate opens',
    async (change) => {
      const f = await fixture()
      const evidence = evidenced()
      f.box.setAgentLaunchEvidence(evidence)
      const held = await f.run(
        'ki agent launch r worker . brief.md --wait-for before --role build --authority authority.md#Grant --json'
      )
      expect(held.exitCode, held.output).toBe(0)
      const launch = present(f.launches[0])
      f.onSleep(async () => {
        if (change === 'authority') await f.box.project.write('authority.md', '# Grant\nChanged decision.\n')
        else Reflect.deleteProperty(evidence.profiles, 'claude-worker')
        await f.box.state.write('ki/agents/r/before.status', 'DONE\n')
        await f.box.state.write('ki/agents/r/before.report.md', '# Done\n')
      })
      const result = await f.run(['ki', ...launch.arguments])
      expect(result.exitCode, result.output).toBe(1)
      expect(f.launched()).toBe(1)
    }
  )

  test('review-1: automatic history repair and a different stop request cannot duplicate a terminal event', async () => {
    const f = await fixture()
    await f.launch()
    const interrupted = await f.stop('--request earlier')
    const store = await f.state()
    delete store.operations.earlier.receipt
    await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
    await rename(
      `${f.box.state.path}/ki/agents/r/control-receipts/earlier.json`,
      `${f.box.state.path}/ki/agents/r/control-receipts/earlier.saved`
    )
    const journal = await f.box.state.read('ki/agents/r/control.journal.jsonl')
    await f.box.state.write(
      'ki/agents/r/control.journal.jsonl',
      journal
        .split('\n')
        .filter((line) => !line.includes('"phase":"observed"') || !line.includes('"operationId":"earlier"'))
        .join('\n')
    )
    await f.box.state.write(
      'ki/agents/r/events.jsonl',
      `${(await f.events())
        .filter((event) => event.kind !== 'stopped')
        .map((event) => JSON.stringify(event))
        .join('\n')}\n`
    )
    expect((await f.stop('--request later')).exitCode).toBe(0)
    const checkpoint = JSON.parse(await f.box.state.read('ki/agents/r/events.history'))
    expect(await f.box.state.read('ki/agents/r/events.jsonl')).toBe(checkpoint.journal)
    expect((await f.stop('--request later')).exitCode).toBe(0)
    await f.run('ki agent status r')
    await f.stop('--request earlier')
    await f.run('ki agent status r')
    expect(interrupted.exitCode).toBe(0)
    expect((await f.events()).filter((event) => event.kind === 'stopped')).toHaveLength(1)
  })

  test('review-2: a definite role refusal leaves its queue entry queued without a spawn intent', async () => {
    const f = await fixture()
    f.box.setAgentLaunchEvidence(evidenced())
    const queued = await f.run('ki agent queue r worker brief.md --role build --authority authority.md#Grant --json')
    const entry = JSON.parse(queued.stdout).entry
    await f.launch()
    const before = await f.state()
    const result = await f.run('ki agent dispatch r --max 2 --foreground')
    expect(result.exitCode).toBe(1)
    const after = await f.state()
    expect(after.entries[entry].state).toBe('queued')
    expect(Object.keys(after.operations)).toEqual(Object.keys(before.operations))
    expect(f.launched()).toBe(1)
  })

  test.each(['--authority missing.md#Grant', '--acceptance missing.json', '--role review --acceptance missing.json'])(
    'review-2: refuses unused declaration %s',
    async (option) => {
      const f = await fixture()
      const result = await f.run(`ki agent launch r worker . brief.md --dry-run ${option}`)
      expect(result.exitCode).toBe(1)
      expect(f.launched()).toBe(0)
    }
  )

  test.each(['review', 'plan', 'build', 'mechanical'] as const)(
    'review-2: %s cannot acquire the release footer',
    async (role) => {
      const f = await fixture()
      f.box.setAgentLaunchEvidence(evidenced())
      const result = await f.run(
        `ki agent launch r worker . brief.md --dry-run --role ${role} --rules release --authority authority.md#Grant`
      )
      expect(result.exitCode).toBe(1)
      expect(JSON.parse(result.stdout).refusals.join(' ')).toContain('footer-mismatch')
    }
  )
})

describe('lock review regressions', () => {
  test('review-1: an observer cannot take a live lock after thirty seconds', async () => {
    const f = await fixture()
    await f.launch()
    await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
    await f.box.state.write('ki/agents/r/worker.report.md', '# Done\n')
    f.set({ empty: true })
    let enter!: () => void
    let release!: () => void
    const entered = new Promise<void>((resolve) => {
      enter = resolve
    })
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    const control = present(f.processes.control)
    let first = true
    f.box.setAgentProcesses({
      ...f.processes,
      control: {
        ...control,
        inspect: async (identity) => {
          if (first && (await readFile(`${f.box.state.path}/ki/agents/r/events.lock`, 'utf8').catch(() => undefined))) {
            first = false
            enter()
            await released
          }
          return control.inspect(identity)
        }
      }
    })
    const observer = f.run('ki agent status r')
    await entered
    const lock = await f.box.state.read('ki/agents/r/events.lock')
    const contender = await f.box.run('ki agent status r', { now: () => Date.now() + 31_000 })
    release()
    expect((await observer).exitCode).toBe(0)
    expect(contender.exitCode, contender.output).toBe(1)
    expect(contender.output).toContain('events-transaction-busy')
    expect(JSON.parse(lock)).toMatchObject({
      machine: expect.any(String),
      birth: expect.any(String),
      token: expect.any(String)
    })
    expect((await f.events()).filter((event) => event.kind === 'done')).toHaveLength(1)
  })

  test.each(['hold', 'dispatch'] as const)('review-2: a busy transaction keeps the %s loop pending', async (loop) => {
    const f = await fixture(false)
    let command: string | readonly string[]
    if (loop === 'hold') {
      await f.run('ki agent launch r worker . brief.md --wait-for before --json')
      command = ['ki', ...present(f.launches[0]).arguments]
    } else {
      await f.queue()
      command = 'ki agent dispatch r --max 1 --foreground'
    }
    await f.box.state.write('ki/agents/r/control.lock', '{"pid":999999,"token":"busy"}\n')
    let waits = 0
    f.onSleep(async () => {
      waits += 1
      if (waits === (loop === 'hold' ? 2 : 1)) {
        // The injected holder completes its own transaction; the waiter never removes it.
        await rename(
          `${f.box.state.path}/ki/agents/r/control.lock`,
          `${f.box.state.path}/ki/agents/r/holder-released.lock`
        )
        if (loop === 'hold') {
          await f.box.state.write('ki/agents/r/before.status', 'DONE\n')
          await f.box.state.write('ki/agents/r/before.report.md', '# Done\n')
        }
      } else if (loop === 'dispatch') {
        await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
        await f.box.state.write('ki/agents/r/worker.report.md', '# Done\n')
      }
    })
    const result = await f.run(command)
    expect(result.exitCode, result.output).toBe(0)
    expect(f.launched()).toBe(loop === 'hold' ? 2 : 1)
    expect(waits).toBeGreaterThanOrEqual(loop === 'hold' ? 2 : 1)
  })

  test('review-2: leftover locks refuse with a documented offline recovery route and retain evidence', async () => {
    const f = await fixture()
    await f.queue()
    const contents = '{"machine":"fixture-host","pid":999999,"birth":"2026-10-21T00:00:00Z","token":"preserve"}\n'
    await f.box.state.write('ki/agents/r/control.lock', contents)
    const blocked = await f.run('ki agent queue r other brief.md --json')
    expect(blocked.exitCode).toBe(1)
    expect(blocked.output).toContain('background-agents.md#recover-an-abandoned-lock')
    expect(await f.box.state.read('ki/agents/r/control.lock')).toBe(contents)
    // Simulate the guide's explicit, quiescent recovery after verified owner exit.
    await rename(
      `${f.box.state.path}/ki/agents/r/control.lock`,
      `${f.box.state.path}/ki/agents/r/control.lock.recovered-preserve`
    )
    expect((await f.run('ki agent queue r other brief.md --json')).exitCode).toBe(0)
    expect(await f.box.state.read('ki/agents/r/control.lock.recovered-preserve')).toBe(contents)
  })
})

test('review-2: uncertain dequeue receipts give the exact frozen recovery operation', async () => {
  const f = await fixture()
  const queued = await f.queue()
  f.set({ failLaunch: true })
  await f.run('ki agent dispatch r --max 1 --foreground')
  const store = await f.state()
  const operation = store.entries[queued.entry].operation
  const command = `ki agent dequeue r worker --entry ${queued.entry} --reason owner`
  const result = await f.run(`${command} --json`)
  expect(result.exitCode).toBe(1)
  expect(JSON.parse(result.stdout).recoveryCommand).toBe(`ki agent recover inspect r --operation ${operation}`)
  const text = await f.run(command)
  expect(text.stdout).toContain(`next: ki agent recover inspect r --operation ${operation}`)
})

test('review-2: text launch receipts show explicit effective fields', async () => {
  const f = await fixture(false)
  const result = await f.run(
    'ki agent launch r worker . brief.md --runtime codex --model chosen --effort high --rules push'
  )
  expect(result.exitCode, result.output).toBe(0)
  expect(result.stdout).toContain('selection: legacy runtime=codex model=chosen effort=high rules=push grants=none')
})

test('lock ownership changes preserve a confirmed start and another holder', async () => {
  const f = await fixture(false)
  f.box.setAgentProcesses({
    ...f.processes,
    launch: async (launch) => {
      await f.box.state.write('ki/agents/r/control.lock', 'foreign-holder\n')
      return f.processes.launch(launch)
    }
  })
  const result = await f.launch()
  expect(result.exitCode).toBe(0)
  expect(result.output).toContain('inspection')
  expect(result.output).toContain('control-transaction-unverified')
  expect(await f.box.state.read('ki/agents/r/control.lock')).toBe('foreign-holder\n')
})

test('a body id cannot override the work frontmatter identity', async () => {
  const f = await fixture(false)
  await f.box.project.write('+/_WORK/ki.r/work.md', '---\nid: ki.r\n---\n\nid: unrelated-body-example\n')
  expect((await f.queue()).exitCode).toBe(0)
})

test('review-1: held acceptance revalidates record digests after waiting', async () => {
  const f = await fixture()
  const { declaration } = await declarationFixture(f)
  await f.box.project.write('acceptance.json', JSON.stringify(declaration))
  f.box.setAgentLaunchEvidence({
    ...evidenced(),
    acceptance: { revision: 'ki/scoped-acceptance/v1', render: () => 'Scoped acceptance only.' }
  })
  const held = await f.run(
    `ki agent launch r acceptor . brief.md --wait-for before --role accept --authority ${declaration.authority} --acceptance acceptance.json --json`
  )
  expect(held.exitCode, held.output).toBe(0)
  const supervisor = present(f.launches.at(-1))
  const before = f.launched()
  f.onSleep(async () => {
    await f.box.project.write('record.md', '# Changed record\n')
    await f.box.state.write('ki/agents/r/before.status', 'DONE\n')
    await f.box.state.write('ki/agents/r/before.report.md', '# Done\n')
  })
  expect(declaration).toBeDefined()
  const result = await f.run(['ki', ...supervisor.arguments])
  expect(result.exitCode, result.output).toBe(1)
  expect(f.launched()).toBe(before)
})

test('stopped receipts restore terminal ownership when an older projection lacks it', async () => {
  const f = await fixture()
  await f.launch()
  await f.stop('--request terminal-owner')
  const store = await f.state()
  delete store.attempts.worker.stoppedBy
  for (const identity of Object.values(store.history) as { stoppedBy?: string }[]) delete identity.stoppedBy
  await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
  expect((await f.run('ki agent status r')).exitCode).toBe(0)
  expect((await f.events()).filter((event) => event.kind === 'stopped')).toHaveLength(1)
})

test('frozen lower-role metadata cannot elevate its footer after launch', async () => {
  const f = await fixture()
  f.box.setAgentLaunchEvidence(evidenced())
  await f.run(
    'ki agent launch r worker . brief.md --wait-for before --role review --authority authority.md#Grant --json'
  )
  const metadata = JSON.parse(await f.box.state.read('ki/agents/r/worker.launch.json'))
  metadata.request.rules = 'release'
  metadata.request.selection.rules = 'release'
  await f.box.state.write('ki/agents/r/worker.launch.json', JSON.stringify(metadata))
  const result = await f.run(['ki', ...present(f.launches[0]).arguments])
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('footer-mismatch')
  expect(f.launched()).toBe(1)
})

test('a known worktree preparation refusal leaves a role queue retryable without an effect intent', async () => {
  const f = await fixture()
  f.box.setAgentLaunchEvidence(evidenced())
  f.box.setRunner(async (command, args, environment) => {
    if (command === 'git' && args.includes('worktree') && args.includes('add'))
      return { exitCode: 1, output: 'known worktree refusal' }
    return runCommand(command, args, environment)
  })
  const queued = await f.run(
    'ki agent queue r worker brief.md --worktree . --role build --authority authority.md#Grant --json'
  )
  expect(queued.exitCode, queued.output).toBe(0)
  const entry = JSON.parse(queued.stdout).entry
  const result = await f.run('ki agent dispatch r --max 1 --foreground')
  expect(result.exitCode).toBe(1)
  const store = await f.state()
  expect(store.entries[entry].state).toBe('queued')
  expect(Object.values(store.operations)).toHaveLength(0)
  expect(f.launched()).toBe(0)
})

test('an unacknowledged queued supervisor retains its original recovery operation', async () => {
  const f = await fixture()
  const queued = await f.run('ki agent queue r worker brief.md --wait-for before --json')
  const entry = JSON.parse(queued.stdout).entry
  f.set({ failLaunch: true, consumed: false, workerStarted: false })
  const launch = await f.run(`ki agent launch r worker . ${f.box.state.path}/ki/agents/r/worker.queued.md --json`)
  expect(launch.exitCode).toBe(1)
  const store = await f.state()
  expect(store.entries[entry].state).toBe('unconfirmed')
  const operation = store.entries[entry].operation
  expect(store.operations[operation].operation).toBe('spawn-supervisor')
  const dequeue = await f.run(`ki agent dequeue r worker --entry ${entry} --reason owner --json`)
  expect(JSON.parse(dequeue.stdout).recoveryCommand).toBe(`ki agent recover inspect r --operation ${operation}`)
  expect(f.launched()).toBe(1)
})

test('review-3: machine binding refusal names both recorded and current machine', async () => {
  const f = await fixture()
  await f.launch()
  const store = await f.state()
  store.machine = 'recorded-other-machine'
  await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
  const result = await f.stop()
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain(`stored machine recorded-other-machine; current machine ${hostname()}`)
  expect(f.signals).toHaveLength(0)
})

describe('second review regressions', () => {
  test.each(['events.jsonl', 'events.state.json'])(
    'rereview-1: unreadable %s preserves event evidence and cursors',
    async (file) => {
      const f = await fixture()
      await f.launch()
      await f.stop()
      const journal = await f.box.state.read('ki/agents/r/events.jsonl')
      const snapshot = await f.box.state.read('ki/agents/r/events.state.json')
      await f.box.state.write('ki/agents/r/events.seen', '0\n')
      const path = `${f.box.state.path}/ki/agents/r/${file}`
      await chmod(path, 0o200)
      try {
        const result = await f.run('ki agent wait r --next')
        expect(result.exitCode, result.output).toBe(1)
        expect(result.output).toContain('events-evidence-unverified')
        expect(result.output).toContain('recover-event-evidence')
        expect(await f.box.state.read('ki/agents/r/events.seen')).toBe('0\n')
      } finally {
        await chmod(path, 0o600)
      }
      expect(await f.box.state.read('ki/agents/r/events.jsonl')).toBe(journal)
      expect(await f.box.state.read('ki/agents/r/events.state.json')).toBe(snapshot)
    }
  )

  test.each(['events.jsonl', 'events.state.json'])(
    'rereview-1: corrupt %s refuses with recovery before mutation',
    async (file) => {
      const f = await fixture()
      await f.launch()
      await f.box.state.write(`ki/agents/r/${file}`, '{broken\n')
      const journal = await f.box.state.read('ki/agents/r/events.jsonl')
      const result = await f.run('ki agent status r')
      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('events-evidence-unverified')
      expect(result.output).toContain('recover-event-evidence')
      expect(await f.box.state.read('ki/agents/r/events.jsonl')).toBe(journal)
    }
  )

  test('rereview-1: missing snapshot replays the journal without duplicate terminal events', async () => {
    const f = await fixture()
    await f.launch()
    await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
    await f.box.state.write('ki/agents/r/worker.report.md', '# Done\n')
    f.set({ empty: true })
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    await rename(`${f.box.state.path}/ki/agents/r/events.state.json`, `${f.box.state.path}/ki/agents/r/snapshot.saved`)
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    expect((await f.events()).filter((event) => event.kind === 'done')).toHaveLength(1)
  })

  test.each(['launch', 'hold', 'dispatch'] as const)(
    'rereview-2: busy event publication after %s preserves a started worker',
    async (mode) => {
      const f = await fixture(false)
      let command: string | readonly string[] = 'ki agent launch r worker . brief.md --json'
      if (mode === 'hold') {
        await f.box.state.write('ki/agents/r/before.pid', '17\n')
        await f.run('ki agent launch r worker . brief.md --wait-for before --json')
        command = ['ki', ...present(f.launches[0]).arguments]
        await f.box.state.write('ki/agents/r/before.status', 'DONE\n')
        await f.box.state.write('ki/agents/r/before.report.md', '# Done\n')
      } else if (mode === 'dispatch') {
        await f.queue()
        command = 'ki agent dispatch r --max 1 --foreground'
      }
      f.box.setAgentProcesses({
        ...f.processes,
        launch: async (launch) => {
          const pid = await f.processes.launch(launch)
          await f.box.state.write('ki/agents/r/events.lock', '{"token":"observer"}\n')
          return pid
        }
      })
      f.onSleep(async () => {
        await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
        await f.box.state.write('ki/agents/r/worker.report.md', '# Done\n')
      })
      const result = await f.run(command)
      expect(result.exitCode, result.output).toBe(mode === 'dispatch' ? 1 : 0)
      expect(result.output).not.toContain('could not launch')
      const store = await f.state()
      expect(store.attempts.worker.state).toBe('running')
      if (mode === 'dispatch')
        expect(Object.values(store.entries as Record<string, { state: string }>).map((entry) => entry.state)).toEqual([
          'started'
        ])
      await rename(
        `${f.box.state.path}/ki/agents/r/events.lock`,
        `${f.box.state.path}/ki/agents/r/observer-released.lock`
      )
      expect((await f.run('ki agent status r')).exitCode).toBe(0)
      expect((await f.events()).filter((event) => event.agent === 'worker' && event.kind === 'launch')).toHaveLength(1)
      expect((await f.events()).filter((event) => event.agent === 'worker' && event.kind === 'failed')).toHaveLength(0)
    }
  )

  test.each(['control', 'events'] as const)(
    'rereview-2: interrupt and normal exit release only the held %s lock',
    async (kind) => {
      const f = await fixture()
      await f.launch()
      const cleanups = new Set<() => void>()
      let exercised = false
      const exercise = async () => {
        expect(cleanups.size).toBeGreaterThan(0)
        exercised = true
        expect(await f.box.state.read(`ki/agents/r/${kind}.lock`)).toContain('token')
        for (const cleanup of cleanups) cleanup()
        expect(await f.box.state.read(`ki/agents/r/${kind}.lock`).catch(() => undefined)).toBeUndefined()
      }
      const control = present(f.processes.control)
      f.box.setAgentProcesses({
        ...f.processes,
        onExit: (cleanup) => {
          cleanups.add(cleanup)
          return () => {
            cleanups.delete(cleanup)
          }
        },
        control: {
          ...control,
          inspect: async (identity) => {
            if (kind === 'events' && !exercised && cleanups.size > 0) await exercise()
            return control.inspect(identity)
          }
        }
      })
      if (kind === 'control') {
        f.signal('descendants')
        f.onSleep(async () => {
          await exercise()
          f.set({ empty: true })
        })
        expect((await f.stop()).exitCode).toBe(0)
      } else {
        await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
        await f.box.state.write('ki/agents/r/worker.report.md', '# Done\n')
        f.set({ empty: true })
        expect((await f.run('ki agent status r')).exitCode).toBe(0)
      }
      expect(exercised).toBe(true)
      expect(cleanups.size).toBe(0)
      expect((await f.run('ki agent status r')).exitCode).toBe(0)
    }
  )

  test.each(['launch', 'queue'] as const)(
    'advisory: foreground %s waits for a busy control transaction',
    async (command) => {
      const f = await fixture(false)
      await f.queue('before')
      await f.box.state.write(
        'ki/agents/r/control.lock',
        '{"machine":"fixture","pid":17,"birth":"birth","token":"holder"}\n'
      )
      f.onSleep(async () => {
        await rename(`${f.box.state.path}/ki/agents/r/control.lock`, `${f.box.state.path}/ki/agents/r/control.released`)
      })
      const result = await f.run(
        command === 'launch' ? 'ki agent launch r worker . brief.md --json' : 'ki agent queue r worker brief.md --json'
      )
      expect(result.exitCode, result.output).toBe(0)
    }
  )
})

test.each(['control', 'events'] as const)('rereview-2: %s cleanup preserves a changed holder token', async (kind) => {
  const f = await fixture()
  await f.launch()
  const cleanups: (() => void)[] = []
  let exercised = false
  const control = present(f.processes.control)
  const replace = async () => {
    exercised = true
    await f.box.state.write(`ki/agents/r/${kind}.lock`, '{"token":"replacement"}\n')
    present(kind === 'control' ? cleanups[0] : cleanups.at(-1))()
    expect(await f.box.state.read(`ki/agents/r/${kind}.lock`)).toBe('{"token":"replacement"}\n')
  }
  f.box.setAgentProcesses({
    ...f.processes,
    onExit: (handler) => {
      cleanups.push(handler)
      return () => {
        cleanups.splice(cleanups.indexOf(handler), 1)
      }
    },
    control: {
      ...control,
      inspect: async (identity) => {
        if (kind === 'events' && cleanups.length > 0 && !exercised) await replace()
        return control.inspect(identity)
      }
    }
  })
  let result: Awaited<ReturnType<typeof f.run>>
  if (kind === 'control') {
    f.signal('descendants')
    f.onSleep(async () => {
      await replace()
      f.set({ empty: true })
    })
    result = await f.stop()
  } else {
    await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
    await f.box.state.write('ki/agents/r/worker.report.md', '# Done\n')
    f.set({ empty: true })
    result = await f.run('ki agent status r')
  }
  expect(exercised).toBe(true)
  expect(result.exitCode).toBe(kind === 'control' ? 0 : 1)
  expect(result.output).toContain(`${kind}-transaction-unverified`)
  expect(await f.box.state.read(`ki/agents/r/${kind}.lock`)).toBe('{"token":"replacement"}\n')
})

test.each(['wait r --next', 'watch r'] as const)(
  'advisory: %s stays pending on a busy event transaction',
  async (command) => {
    const f = await fixture(false)
    await f.launch()
    await f.box.state.write('ki/agents/r/events.lock', '{"token":"observer"}\n')
    let released = false
    f.onSleep(async () => {
      if (released) return
      released = true
      await rename(`${f.box.state.path}/ki/agents/r/events.lock`, `${f.box.state.path}/ki/agents/r/observer.released`)
      await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
      await f.box.state.write('ki/agents/r/worker.report.md', '# Done\n')
      f.set({ empty: true })
    })
    const result = await f.run(`ki agent ${command}`)
    expect(result.exitCode, result.output).toBe(0)
    expect(result.output).toContain('worker done')
  }
)

test('advisory: a bounded control wait names the holder and recovery route', async () => {
  const f = await fixture(false)
  await f.queue()
  const holder = '{"machine":"fixture","pid":17,"birth":"birth-17","token":"holder"}\n'
  await f.box.state.write('ki/agents/r/control.lock', holder)
  let waited = 0
  f.box.setAgentProcesses({
    ...f.processes,
    sleep: async (milliseconds) => {
      waited += milliseconds
      await f.processes.sleep(milliseconds)
    }
  })
  const result = await f.run('ki agent queue r other brief.md --json')
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('waited 120 seconds')
  for (const identity of ['fixture', '17', 'birth-17', 'holder']) expect(result.output).toContain(identity)
  expect(result.output).toContain('recover-an-abandoned-lock')
  expect(waited).toBeGreaterThanOrEqual(120_000)
  expect(waited).toBeLessThan(122_000)
  expect(await f.box.state.read('ki/agents/r/control.lock')).toBe(holder)
})

test('rereview-1: a stale snapshot and retained publication replay only once', async () => {
  const f = await fixture(false)
  await f.launch()
  await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
  await f.box.state.write('ki/agents/r/worker.report.md', '# Done\n')
  f.set({ empty: true })
  const stale = await f.box.state.read('ki/agents/r/events.state.json')
  expect((await f.run('ki agent status r')).exitCode).toBe(0)
  const launch = (await f.events()).find((event) => event.kind === 'launch')
  await f.box.state.write(`ki/agents/r/events.pending/${launch.publication}.json`, JSON.stringify(launch))
  await f.box.state.write('ki/agents/r/events.state.json', stale)
  expect((await f.run('ki agent status r')).exitCode).toBe(0)
  expect((await f.events()).filter((event) => event.kind === 'launch')).toHaveLength(1)
  expect((await f.events()).filter((event) => event.kind === 'done')).toHaveLength(1)
})

test.each([
  ['events.jsonl', 'null\n'],
  ['events.jsonl', '{}\n'],
  ['events.state.json', 'null'],
  ['events.state.json', '[]'],
  ...[
    null,
    {},
    { attempt: 0 },
    { attempt: 1, line: 7 },
    { attempt: 1, ended: 'yes' },
    { attempt: 1, failed: 'yes' },
    { attempt: 1, queries: 'query' },
    { attempt: 1, queries: [7] }
  ].map((seen) => ['events.state.json', JSON.stringify({ worker: seen })])
])('rereview-1: malformed evidence shape refuses %s %s', async (file, contents) => {
  const f = await fixture(false)
  await f.launch()
  await f.box.state.write(`ki/agents/r/${file}`, contents as string)
  const result = await f.run('ki agent status r')
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('events-evidence-unverified')
})

test.each(['launch', 'held'])(
  'rereview-2: a failed pending write still reports %s start and reconstructs its event',
  async (kind) => {
    const f = await fixture(false)
    f.box.setAgentProcesses({
      ...f.processes,
      launch: async (launch) => {
        const pid = await f.processes.launch(launch)
        await f.box.state.write('ki/agents/r/events.pending', 'preserved obstruction\n')
        return pid
      }
    })
    if (kind === 'held') await f.box.state.write('ki/agents/r/before.pid', '17\n')
    const result = await f.run(
      `ki agent launch r worker . brief.md --json ${kind === 'held' ? '--wait-for before' : ''}`
    )
    expect(result.exitCode, result.output).toBe(0)
    expect(JSON.parse(result.stdout).pid).toBeGreaterThan(0)
    await rename(
      `${f.box.state.path}/ki/agents/r/events.pending`,
      `${f.box.state.path}/ki/agents/r/pending-obstruction.saved`
    )
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    expect((await f.events()).filter((event) => event.kind === kind)).toHaveLength(1)
    expect((await f.events()).filter((event) => event.kind === 'failed')).toHaveLength(0)
  }
)

test('rereview-1: duplicate operation publications and interrupted temporary records reconcile once', async () => {
  const f = await fixture()
  await f.launch()
  await f.stop()
  const stopped = (await f.events()).find((event) => event.kind === 'stopped')
  const launched = (await f.events()).find((event) => event.kind === 'launch')
  await f.box.state.write(
    'ki/agents/r/events.pending/late-launch.json',
    JSON.stringify({ ...launched, publication: 'late' })
  )
  await f.box.state.write('ki/agents/r/events.pending/retry.json', JSON.stringify({ ...stopped, publication: 'retry' }))
  await f.box.state.write('ki/agents/r/events.pending/interrupted.tmp', '{interrupted')
  expect((await f.run('ki agent status r')).exitCode).toBe(0)
  expect((await f.events()).filter((event) => event.kind === 'stopped')).toHaveLength(1)
  expect((await f.events()).filter((event) => event.kind === 'launch')).toHaveLength(1)
  expect(await f.box.state.read('ki/agents/r/events.pending/interrupted.tmp')).toBe('{interrupted')
})

test('rereview-1: malformed pending publication refuses without changing the journal', async () => {
  const f = await fixture(false)
  await f.launch()
  const journal = await f.box.state.read('ki/agents/r/events.jsonl')
  await f.box.state.write('ki/agents/r/events.pending/broken.json', 'null')
  const result = await f.run('ki agent status r')
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('events-evidence-unverified')
  expect(await f.box.state.read('ki/agents/r/events.jsonl')).toBe(journal)
})

test('advisory: an unreadable lock holder is explicit without takeover', async () => {
  const f = await fixture(false)
  await f.launch()
  await f.box.state.write('ki/agents/r/events.lock', 'preserved holder\n')
  const path = `${f.box.state.path}/ki/agents/r/events.lock`
  await chmod(path, 0)
  try {
    const result = await f.run('ki agent status r')
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('unreadable holder')
  } finally {
    await chmod(path, 0o600)
  }
  expect(await f.box.state.read('ki/agents/r/events.lock')).toBe('preserved holder\n')
})

test('advisory: a denied lock creation refuses without starting a worker', async () => {
  const f = await fixture(false)
  await f.queue()
  const directory = `${f.box.state.path}/ki/agents/r`
  await chmod(directory, 0o500)
  try {
    const result = await f.run('ki agent launch r other . brief.md --json')
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('control-transaction-unavailable')
    expect(f.launched()).toBe(0)
  } finally {
    await chmod(directory, 0o700)
  }
})

test('a blocked queue publication failure refuses with event recovery and never spawns', async () => {
  const f = await fixture(false)
  await f.run('ki agent queue r worker brief.md --wait-for missing --json')
  await f.box.state.write('ki/agents/r/events.pending', 'preserved obstruction\n')
  const result = await f.run('ki agent dispatch r --max 1 --foreground')
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('events-evidence-unverified')
  expect(result.output).toContain('recover-event-evidence')
  expect(f.launched()).toBe(0)
})

test.each(['events.jsonl', 'events.state.json'])(
  'unreadable publication evidence refuses before claiming a blocked queue event: %s',
  async (file) => {
    const f = await fixture(false)
    await f.run('ki agent queue r worker brief.md --wait-for missing --json')
    await f.box.state.write(`ki/agents/r/${file}`, '{broken\n')
    const result = await f.run('ki agent dispatch r --max 1 --foreground')
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('events-evidence-unverified')
    expect(result.output).toContain('recover-event-evidence')
    expect(await f.box.state.read(`ki/agents/r/${file}`)).toBe('{broken\n')
    expect(f.launched()).toBe(0)
  }
)

test('missing snapshot reconstructs outstanding query identities without duplication', async () => {
  const f = await fixture(false)
  await f.launch()
  await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
  await f.box.state.write('ki/agents/r/worker.report.md', '# Done\n\n## Queries\n\n### RECOVERY-1 - Review evidence\n')
  f.set({ empty: true })
  expect((await f.run('ki agent status r')).exitCode).toBe(0)
  await rename(
    `${f.box.state.path}/ki/agents/r/events.state.json`,
    `${f.box.state.path}/ki/agents/r/query-snapshot.saved`
  )
  expect((await f.run('ki agent status r')).exitCode).toBe(0)
  expect((await f.run('ki agent status r')).exitCode).toBe(0)
  expect((await f.events()).filter((event) => event.kind === 'needs-owner')).toHaveLength(1)
  expect(JSON.parse(await f.box.state.read('ki/agents/r/events.state.json')).worker.queries).toEqual([
    'RECOVERY-1 - Review evidence'
  ])
})

describe('third review regressions', () => {
  test('third-review B1: missing journal refuses existing event evidence', async () => {
    const f = await fixture()
    await f.launch()
    await f.stop()
    const snapshot = await f.box.state.read('ki/agents/r/events.state.json')
    await rename(`${f.box.state.path}/ki/agents/r/events.jsonl`, `${f.box.state.path}/ki/agents/r/journal.saved`)
    const result = await f.run('ki agent status r')
    expect(result.exitCode, result.output).toBe(1)
    expect(result.output).toContain('events-evidence-unverified')
    expect(result.output).toContain('recover-event-evidence')
    expect(await f.box.state.read('ki/agents/r/events.state.json')).toBe(snapshot)
  })

  test('third-review B2: snapshot loss does not replay failed status', async () => {
    const f = await fixture()
    await f.launch()
    await f.box.state.write('ki/agents/r/worker.status', '12:00 UTC - failed: bad input\n')
    f.set({ empty: true })
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    await rename(`${f.box.state.path}/ki/agents/r/events.state.json`, `${f.box.state.path}/ki/agents/r/snapshot.saved`)
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    expect((await f.events()).filter((event) => event.kind === 'failed' && event.text === 'bad input')).toHaveLength(1)
  })

  test.each(['blocked', 'failed'] as const)(
    'third-review progress %s preserves DONE and exit terminal evidence',
    async (kind) => {
      for (const done of [true, false]) {
        const f = await fixture(false)
        await f.launch()
        await f.box.state.write('ki/agents/r/worker.status', `12:00 UTC - ${kind}: waiting for input\n`)
        expect((await f.run('ki agent status r')).exitCode).toBe(0)
        if (done) {
          await f.box.state.write('ki/agents/r/worker.status', `12:00 UTC - ${kind}: waiting for input\nDONE\n`)
          await f.box.state.write('ki/agents/r/worker.report.md', '# Result\n')
        }
        f.set({ empty: true })
        expect((await f.run('ki agent status r')).exitCode).toBe(0)
        const terminal = (await f.events()).filter((event) =>
          done ? event.kind === 'done' : event.kind === 'failed' && event.text.startsWith('exited without DONE')
        )
        expect(terminal).toHaveLength(1)
        await rename(
          `${f.box.state.path}/ki/agents/r/events.state.json`,
          `${f.box.state.path}/ki/agents/r/snapshot.saved`
        )
        expect((await f.run('ki agent status r')).exitCode).toBe(0)
        const replayed = (await f.events()).filter((event) =>
          done ? event.kind === 'done' : event.kind === 'failed' && event.text.startsWith('exited without DONE')
        )
        expect(replayed).toHaveLength(1)
      }
    }
  )

  test('third-review B3: packet persistence after confirmed start cannot fail launch', async () => {
    const f = await fixture(false)
    f.box.setAgentProcesses({
      ...f.processes,
      launch: async (launch) => {
        const pid = await f.processes.launch(launch)
        await rename(
          `${f.box.state.path}/ki/agents/r/worker.launch.json`,
          `${f.box.state.path}/ki/agents/r/packet.saved`
        )
        await f.box.state.mkdir('ki/agents/r/worker.launch.json')
        return pid
      }
    })
    const result = await f.launch()
    expect(result.exitCode, result.output).toBe(0)
    expect(f.launched()).toBe(1)
    expect(result.output).toContain('inspection')
    expect((await f.state()).attempts.worker.state).toBe('running')
  })

  test.each(['wait r --next', 'watch r'])(
    'third-review B4: abandoned event lock bounds %s',
    async (command) => {
      const f = await fixture(false)
      await f.launch()
      await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
      await f.box.state.write('ki/agents/r/worker.report.md', '# Done\n')
      f.set({ empty: true })
      const holder = '{"machine":"fixture","pid":17,"birth":"birth-17","token":"abandoned"}\n'
      await f.box.state.write('ki/agents/r/events.lock', holder)
      let time = 0
      let sleeps = 0
      f.onSleep(async () => {
        time += 121_000
        if (++sleeps > 2) throw new Error('unbounded event wait')
      })
      const result = await f.box.run(`ki agent ${command}`, { now: () => time })
      expect(result.exitCode, result.output).toBe(1)
      expect(result.output).toContain('events-transaction-busy')
      expect(result.output).toContain('waited 120 seconds')
      for (const text of ['fixture', '17', 'birth-17', 'abandoned', 'recover-an-abandoned-lock'])
        expect(result.output).toContain(text)
      expect(await f.box.state.read('ki/agents/r/events.lock')).toBe(holder)
    },
    20_000
  )

  test.each(['stop', 'dequeue', 'blocked'] as const)(
    'third-review controls retain receipt with pending %s event',
    async (kind) => {
      const f = await fixture()
      const entry = kind === 'dequeue' ? (await f.queue()).entry : undefined
      if (kind !== 'dequeue') await f.launch()
      if (kind === 'blocked') f.set({ containment: false })
      await f.box.state.write('ki/agents/r/events.lock', '{"token":"observer"}\n')
      const command =
        kind === 'dequeue'
          ? `ki agent dequeue r worker --entry ${entry} --reason owner --request pending --json`
          : 'ki agent stop r worker --attempt 1 --reason owner --request pending --json'
      const result = await f.run(command)
      expect(result.exitCode, result.output).toBe(kind === 'blocked' ? 1 : 0)
      const receipt = JSON.parse(result.stdout)
      expect(receipt.operationId).toBe('pending')
      expect(receipt.eventSequence).toBeUndefined()
      expect((await f.state()).operations.pending.receipt).toEqual(receipt)
      expect((await f.run(command)).stdout).toBe(result.stdout)
      await rename(`${f.box.state.path}/ki/agents/r/events.lock`, `${f.box.state.path}/ki/agents/r/observer.released`)
      expect((await f.run('ki agent status r')).exitCode).toBe(0)
      expect(
        (await f.events()).filter(
          (event) =>
            event.operation === 'pending' &&
            event.kind === (kind === 'stop' ? 'stopped' : kind === 'dequeue' ? 'dequeued' : 'blocked')
        )
      ).toHaveLength(1)
    }
  )

  test('third-review dequeue fences held worker without another failed event', async () => {
    const f = await fixture()
    const queued = await f.run('ki agent queue r worker brief.md --wait-for before --json')
    const entry = JSON.parse(queued.stdout).entry
    expect(
      (
        await f.run([
          'ki',
          'agent',
          'launch',
          'r',
          'worker',
          '.',
          `${f.box.state.path}/ki/agents/r/worker.queued.md`,
          '--json'
        ])
      ).exitCode
    ).toBe(0)
    expect((await f.run(`ki agent dequeue r worker --entry ${entry} --reason owner --json`)).exitCode).toBe(0)
    const held = present(f.launches[0])
    expect((await f.run(['ki', ...held.arguments])).exitCode).toBe(0)
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    expect((await f.events()).filter((event) => event.agent === 'worker' && event.kind === 'failed')).toHaveLength(0)
  })

  test('third-review held supervisor lock expiry remains held and never fails its gate', async () => {
    const f = await fixture(false)
    await f.box.state.write('ki/agents/r/before.pid', '17\n')
    expect((await f.run('ki agent launch r worker . brief.md --wait-for before --json')).exitCode).toBe(0)
    const held = present(f.launches.at(-1))
    await f.box.state.write('ki/agents/r/control.lock', '{"machine":"fixture","token":"busy"}\n')
    let time = 0
    f.onSleep(async () => {
      time += 121_000
    })
    const result = await f.box.run(['ki', ...held.arguments], { now: () => time })
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('control-transaction-busy')
    await rename(`${f.box.state.path}/ki/agents/r/control.lock`, `${f.box.state.path}/ki/agents/r/control.released`)
    f.set({ empty: true })
    const status = await f.run('ki agent status r')
    expect(status.output).not.toContain('worker failed')
    expect(status.output).toContain('held')
    expect((await f.events()).filter((event) => event.agent === 'worker' && event.kind === 'failed')).toHaveLength(0)
  })
})

test('third-review pending publications preserve creation order with reversed UUID names', async () => {
  const f = await fixture(false)
  await f.box.state.write('ki/agents/r/before.pid', '17\n')
  await f.box.state.write('ki/agents/r/events.lock', '{"token":"observer"}\n')
  const heldStart = await f.run('ki agent launch r worker . brief.md --wait-for before --json')
  expect(heldStart.exitCode, heldStart.output).toBe(0)
  const held = present(f.launches[0])
  const pending = `${f.box.state.path}/ki/agents/r/events.pending`
  const first = present((await readdir(pending)).find((file) => file.endsWith('.json')))
  await rename(`${pending}/${first}`, `${pending}/zzz.json`)
  await f.box.state.write('ki/agents/r/before.status', 'DONE\n')
  await f.box.state.write('ki/agents/r/before.report.md', '# Before\n')
  const resumed = await f.run(['ki', ...held.arguments])
  expect(resumed.exitCode, resumed.output).toBe(0)
  const second = present((await readdir(pending)).find((file) => file !== 'zzz.json' && file.endsWith('.json')))
  await rename(`${pending}/${second}`, `${pending}/aaa.json`)
  await rename(`${f.box.state.path}/ki/agents/r/events.lock`, `${f.box.state.path}/ki/agents/r/observer.released`)
  expect((await f.run('ki agent status r')).exitCode).toBe(0)
  expect((await f.events()).filter((event) => event.agent === 'worker').map((event) => event.kind)).toEqual([
    'held',
    'launch'
  ])
}, 20_000)

test.each(['worker.status', 'worker.pid', 'worker.report.md'])(
  'third-review denied %s is never absent',
  async (file) => {
    const f = await fixture(false)
    await f.launch()
    await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
    await f.box.state.write('ki/agents/r/worker.report.md', '# Done\n')
    f.set({ empty: true })
    const path = `${f.box.state.path}/ki/agents/r/${file}`
    await chmod(path, 0o200)
    try {
      const result = await f.run('ki agent status r')
      expect(result.exitCode).toBe(1)
      expect(result.output).toContain('agent-evidence-unverified')
      expect((await f.events()).filter((event) => event.kind === 'failed')).toHaveLength(0)
    } finally {
      await chmod(path, 0o600)
    }
  }
)

test('third-review lock release preserves the original failed action refusal', async () => {
  const f = await fixture(false)
  f.box.setAgentProcesses({
    ...f.processes,
    launch: async () => {
      await f.box.state.write('ki/agents/r/control.lock', 'foreign-holder\n')
      throw new Error('injected launch acknowledgement loss')
    }
  })
  const result = await f.launch()
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('claim-unconfirmed')
  expect(result.output).not.toContain('control-transaction-unverified')
  expect(await f.box.state.read('ki/agents/r/control.lock')).toBe('foreign-holder\n')
})

test('third-review confirmed stop survives denied event publication', async () => {
  const f = await fixture()
  await f.launch()
  const control = present(f.processes.control)
  const pending = `${f.box.state.path}/ki/agents/r/events.pending`
  f.box.setAgentProcesses({
    ...f.processes,
    control: {
      ...control,
      terminate: async (identity, effect) => {
        await control.terminate(identity, effect)
        await chmod(pending, 0o500)
      }
    }
  })
  try {
    const result = await f.stop('--request denied-publication')
    expect(result.exitCode, result.output).toBe(0)
    expect(JSON.parse(result.stdout).outcome).toBe('stopped')
    expect((await f.state()).operations['denied-publication'].receipt.outcome).toBe('stopped')
  } finally {
    await chmod(pending, 0o700)
  }
  expect((await f.run('ki agent status r')).exitCode).toBe(0)
  expect((await f.events()).filter((event) => event.kind === 'stopped')).toHaveLength(1)
})

test('third-review history marker refuses journal loss even without snapshot and cursor', async () => {
  const f = await fixture(false)
  await f.launch()
  for (const file of ['events.jsonl', 'events.state.json'])
    await rename(`${f.box.state.path}/ki/agents/r/${file}`, `${f.box.state.path}/ki/agents/r/${file}.saved`)
  const result = await f.run('ki agent status r')
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('events-evidence-unverified')
})

test.each(['supervisor', 'held-worker'] as const)(
  'third-review confirmed %s survives its packet failure',
  async (phase) => {
    const f = await fixture(false)
    await f.box.state.write('ki/agents/r/before.pid', '17\n')
    if (phase === 'held-worker') {
      expect((await f.run('ki agent launch r worker . brief.md --wait-for before --json')).exitCode).toBe(0)
      await f.box.state.write('ki/agents/r/before.status', 'DONE\n')
    }
    f.box.setAgentProcesses({
      ...f.processes,
      launch: async (launch) => {
        const pid = await f.processes.launch(launch)
        await rename(
          `${f.box.state.path}/ki/agents/r/worker.launch.json`,
          `${f.box.state.path}/ki/agents/r/packet.saved`
        )
        await f.box.state.mkdir('ki/agents/r/worker.launch.json')
        return pid
      }
    })
    const result =
      phase === 'supervisor'
        ? await f.run('ki agent launch r worker . brief.md --wait-for before --json')
        : await f.run(['ki', ...present(f.launches[0]).arguments])
    expect(result.exitCode, result.output).toBe(0)
    expect(result.output).toContain('inspection')
    expect((await f.state()).attempts.worker.state).toBe(phase === 'supervisor' ? 'held' : 'running')
  }
)

test.each(['launch', 'held'] as const)(
  'third-review acknowledged %s survives a damaged event transaction',
  async (kind) => {
    const f = await fixture(false)
    if (kind === 'held') await f.box.state.write('ki/agents/r/before.pid', '17\n')
    f.box.setAgentProcesses({
      ...f.processes,
      onExit: () => {
        if (f.launched() > 0) writeFileSync(`${f.box.state.path}/ki/agents/r/events.jsonl`, 'corrupt journal\n')
        return () => {}
      }
    })
    const result = await f.run(
      `ki agent launch r worker . brief.md --json ${kind === 'held' ? '--wait-for before' : ''}`
    )
    expect(result.exitCode, result.output).toBe(0)
    expect(f.launched()).toBe(1)
    expect((await f.run('ki agent status r')).output).toContain('events-evidence-unverified')
  }
)

test('third-review corrupt event history refuses stop before signalling', async () => {
  const f = await fixture()
  await f.launch()
  await f.box.state.write('ki/agents/r/events.jsonl', 'corrupt journal\n')
  const result = await f.stop()
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('events-evidence-unverified')
  expect(f.signals).toHaveLength(0)
})

test.each(['snapshot', 'cursor', 'receipts'] as const)(
  'third-review missing history refuses surviving %s evidence',
  async (kind) => {
    const f = await fixture(false)
    await f.launch()
    const files =
      kind === 'snapshot' ? ['events.jsonl', 'events.history'] : ['events.jsonl', 'events.history', 'events.state.json']
    for (const file of files)
      await rename(`${f.box.state.path}/ki/agents/r/${file}`, `${f.box.state.path}/ki/agents/r/${file}.saved`)
    if (kind === 'cursor') await f.box.state.write('ki/agents/r/events.seen', '1\n')
    const result = await f.run('ki agent status r')
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('events-evidence-unverified')
  }
)

test('third-review a fresh zero cursor has no history to lose', async () => {
  const f = await fixture(false)
  await f.box.state.write('ki/agents/r/events.seen', '0\n')
  expect((await f.launch()).exitCode).toBe(0)
})

test.each(['statusLine', 'terminal'] as const)(
  'third-review corrupt %s event metadata refuses replay',
  async (field) => {
    const f = await fixture(false)
    await f.launch()
    const journal = await f.events()
    journal[0][field] = 17
    await f.box.state.write('ki/agents/r/events.jsonl', `${journal.map((event) => JSON.stringify(event)).join('\n')}\n`)
    const result = await f.run('ki agent status r')
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('events-evidence-unverified')
  }
)

test.each([
  ['done', 'DONE'],
  ['stopped', 'owner'],
  ['dequeued', 'owner'],
  ['failed', 'no report'],
  ['failed', 'attempt failed'],
  ['failed', 'exited without DONE (no status)'],
  ['blocked', 'gate cannot open: before failed'],
  ['blocked', 'owner attention']
])('third-review older %s journal recovery preserves terminal identity for %s', async (kind, text) => {
  const f = await fixture(false)
  await f.launch()
  const first = (await f.events())[0]
  await f.box.state.write('ki/agents/r/events.history', 'ki/agent-events/v1\n')
  await f.box.state.write(
    'ki/agents/r/events.jsonl',
    `${JSON.stringify({ seq: 1, at: first.at, run: 'r', agent: 'worker', attempt: 1, kind, text })}\n`
  )
  await rename(`${f.box.state.path}/ki/agents/r/events.state.json`, `${f.box.state.path}/ki/agents/r/snapshot.saved`)
  if (kind === 'failed' || (kind === 'blocked' && text.startsWith('gate cannot open:'))) {
    const store = await f.state()
    store.attempts.worker.state = 'failed'
    for (const attempt of Object.values(store.history) as { state: string }[]) attempt.state = 'failed'
    await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
  }
  expect((await f.run('ki agent status r')).exitCode).toBe(0)
  expect((await f.events()).filter((event) => event.kind === kind && event.text === text)).toHaveLength(1)
})

test.each([
  ['operation', 17],
  ['operation', ''],
  ['tag', 17],
  ['tag', ''],
  ['publication', ''],
  ['attempt', Number.MAX_SAFE_INTEGER + 1],
  ['statusLine', 17],
  ['terminal', 17],
  ['publicationOrder', 0],
  ['publicationOrder', '1']
] as const)('third-review corrupt pending %s metadata refuses publication (%s)', async (field, value) => {
  const f = await fixture(false)
  await f.launch()
  const journal = await f.box.state.read('ki/agents/r/events.jsonl')
  await f.box.state.write(
    'ki/agents/r/events.pending/corrupt.json',
    JSON.stringify({
      publication: 'corrupt',
      agent: 'worker',
      attempt: 1,
      kind: 'launch',
      text: 'started',
      [field]: value
    })
  )
  const result = await f.run('ki agent status r')
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('events-evidence-unverified')
  expect(await f.box.state.read('ki/agents/r/events.jsonl')).toBe(journal)
})

test('third-review pending source identity survives publication and replay', async () => {
  const f = await fixture(false)
  await f.launch()
  await f.box.state.write(
    'ki/agents/r/events.pending/progress.json',
    JSON.stringify({
      publication: 'progress',
      agent: 'worker',
      attempt: 1,
      kind: 'progress',
      text: 'working',
      statusLine: '12:00 UTC - milestone: working',
      terminal: false,
      publicationOrder: 2
    })
  )
  expect((await f.run('ki agent status r')).exitCode).toBe(0)
  expect((await f.events()).filter((event) => event.publication === 'progress')).toHaveLength(1)
})

test.each(['spawn-started', 'spawn-not-started'] as const)(
  'third-review legacy queue honours verified %s recovery',
  async (observation) => {
    const f = await fixture()
    const request = {
      run: 'r',
      name: 'worker',
      workdir: f.box.project.path,
      prompt: `${f.box.project.path}/brief.md`,
      runtime: 'claude',
      addDirs: [],
      rules: 'none',
      allow: [],
      waitFor: []
    }
    await f.box.state.write('ki/agents/r/queue.jsonl', `${JSON.stringify(request)}\n`)
    f.set({ failLaunch: true, workerStarted: false, consumed: false })
    expect((await f.run('ki agent dispatch r --max 1 --foreground')).exitCode).toBe(1)
    const store = await f.state()
    const operation = Object.values(store.operations).find(
      (value) => (value as { operation: string }).operation === 'spawn'
    ) as { id: string; target: Identity }
    await f.box.project.write('proof.json', 'adapter-proof\n')
    await f.box.project.write(
      'evidence.json',
      JSON.stringify({
        schema: 'ki/agent-reconciliation/v1',
        operation_id: operation.id,
        target_id: operation.target.token,
        observation,
        proofs: [{ path: `${f.box.project.path}/proof.json`, sha256: hash('adapter-proof\n') }]
      })
    )
    if (observation === 'spawn-started') f.set({ failLaunch: false, workerStarted: true, consumed: true })
    const recovered = await f.run(
      `ki agent recover resolve r --operation ${operation.id} --evidence evidence.json --authority authority.md#Grant --json`
    )
    expect(recovered.exitCode, recovered.output).toBe(0)
    f.set({ failLaunch: false })
    f.onSleep(async () => {
      f.set({ empty: true })
      await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
      await f.box.state.write('ki/agents/r/worker.report.md', '# Result\n')
    })
    const result = await f.run('ki agent dispatch r --max 1 --foreground')
    expect(result.exitCode, result.output).toBe(0)
    expect(f.launched()).toBe(observation === 'spawn-started' ? 1 : 2)
    expect((await f.events()).filter((event) => event.kind === 'failed')).toHaveLength(0)
  }
)

test('third-review queued successor failure never ends its running predecessor or duplicates its finish', async () => {
  const f = await fixture(false)
  await f.launch()
  const queued = await f.run('ki agent queue r worker brief.md --relaunch --wait-for absent --json')
  const entry = JSON.parse(queued.stdout).entry
  expect((await f.run(`ki agent dequeue r worker --entry ${entry} --reason owner --json`)).exitCode).toBe(0)
  await f.box.state.write('ki/agents/r/worker.status', '12:00 UTC - milestone: still working\n')
  expect((await f.run('ki agent status r')).exitCode).toBe(0)
  expect((await f.events()).find((event) => event.kind === 'progress')).toMatchObject({
    attempt: 1,
    text: 'still working'
  })
  await f.box.state.write('ki/agents/r/worker.status', '12:00 UTC - milestone: still working\nDONE\n')
  await f.box.state.write('ki/agents/r/worker.report.md', '# Result\n')
  f.set({ empty: true })
  for (let pass = 0; pass < 3; pass += 1) {
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    await rename(
      `${f.box.state.path}/ki/agents/r/events.state.json`,
      `${f.box.state.path}/ki/agents/r/snapshot-${pass}.saved`
    )
  }
  expect((await f.events()).filter((event) => event.kind === 'done' && event.attempt === 1)).toHaveLength(1)
  expect((await f.events()).filter((event) => event.kind === 'dequeued' && event.attempt === 2)).toHaveLength(1)
})

test('third-review legacy queue refusal belongs to its successor and cannot replay a predecessor finish', async () => {
  const f = await fixture(false)
  await f.launch()
  const request = {
    run: 'r',
    name: 'worker',
    workdir: `${f.box.project.path}/missing`,
    prompt: `${f.box.project.path}/brief.md`,
    runtime: 'claude',
    addDirs: [],
    rules: 'none',
    allow: [],
    waitFor: []
  }
  await f.box.state.write('ki/agents/r/queue.jsonl', `${JSON.stringify(request)}\n`)
  f.onSleep(async () => {
    f.set({ empty: true })
    await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
    await f.box.state.write('ki/agents/r/worker.report.md', '# Result\n')
  })
  expect((await f.run('ki agent dispatch r --max 2 --foreground')).exitCode).toBe(0)
  for (let pass = 0; pass < 3; pass += 1) {
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    await rename(
      `${f.box.state.path}/ki/agents/r/events.state.json`,
      `${f.box.state.path}/ki/agents/r/replay-${pass}.saved`
    )
  }
  const events = await f.events()
  expect(events.filter((event) => event.kind === 'failed')).toHaveLength(1)
  expect(events.find((event) => event.kind === 'failed').attempt).toBe(2)
  expect(events.filter((event) => event.kind === 'done' && event.attempt === 1)).toHaveLength(1)
})

// Execute the untouched pre-terminal-identity CLI, then upgrade the same state in place.
// The pre-terminal-identity baseline CLI is archived from Git, bundled and imported
// once for the whole file. An ES module is never unloaded, so importing a fresh bundle
// per test retained every bundle until the worker exhausted its heap on the release
// runners; one shared bundle keeps the worker's footprint flat across these tests.
let baseline: Promise<CliEntrypoint> | undefined
let baselineRoot: string | undefined
afterAll(async () => {
  if (baselineRoot) await rm(baselineRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

const baselineCli = (): Promise<CliEntrypoint> => {
  baseline ??= (async () => {
    const repository = fileURLToPath(new URL('../../../', import.meta.url))
    const root = await mkdtemp(`${tmpdir()}/ki-test-baseline-`)
    baselineRoot = root
    for (const [command, args] of [
      [
        'git',
        ['-C', repository, 'archive', '--format=tar', '-o', `${root}/source.tar`, '51725e8b', 'src', 'package.json']
      ],
      ['tar', ['-xf', `${root}/source.tar`, '-C', root]]
    ] as const) {
      const result = await runCommand(command, args, process.env)
      expect(result.exitCode, result.output).toBe(0)
    }
    await symlink(`${repository}/node_modules`, `${root}/node_modules`)
    const built = await runCommand(
      'bun',
      ['build', `${root}/src/cli.ts`, '--target=node', '--outfile', `${root}/cli.mjs`],
      process.env
    )
    expect(built.exitCode, built.output).toBe(0)
    return (await import(/* @vite-ignore */ `${root}/cli.mjs`)).run as CliEntrypoint
  })()
  return baseline
}

test.each(
  [true, false].flatMap((snapshot) =>
    [
      ['failed', 'no report'],
      ['failed', 'attempt failed'],
      ['failed', 'exited without DONE (no status)'],
      ['failed', 'could not launch: brief missing'],
      ['blocked', 'gate cannot open: dependency failed']
    ].map(([kind, text]) => ({ snapshot, kind, text }))
  )
)(
  'seventh-review repeated legacy $kind $text preserves completion, snapshot $snapshot',
  async ({ snapshot, kind, text }) => {
    const f = await fixture(false)
    const cli = await baselineCli()
    const old = (command: string) => f.box.run(command, { cli })
    expect((await old('ki agent launch r worker . brief.md --json')).exitCode).toBe(0)
    for (const time of ['12:00', '12:01']) {
      await f.box.state.write('ki/agents/r/worker.status', `${time} UTC - ${kind}: ${text}\n`)
      expect((await old('ki agent status r')).exitCode).toBe(0)
    }
    if (!snapshot)
      await rename(
        `${f.box.state.path}/ki/agents/r/events.state.json`,
        `${f.box.state.path}/ki/agents/r/legacy-snapshot.saved`
      )
    await f.box.state.write('ki/agents/r/worker.report.md', '# Repeated progress completed\n')
    await f.box.state.write('ki/agents/r/worker.status', `12:01 UTC - ${kind}: ${text}\nDONE\n`)
    f.set({ empty: true })
    const completed = await f.run('ki agent wait r --next')
    expect(completed.exitCode, completed.output).toBe(0)
    const checkpoint = JSON.parse(await f.box.state.read('ki/agents/r/events.history'))
    expect(checkpoint.failures).toEqual([
      { seq: 2, terminal: false },
      { seq: 3, terminal: false, statusLine: `12:01 UTC - ${kind}: ${text}` }
    ])
    expect((await f.events()).filter((event) => event.kind === 'done')).toHaveLength(1)
    expect(await f.box.project.read('+/_WORK/ki.r/worker.report.md')).toBe('# Repeated progress completed\n')
    await rename(`${f.box.state.path}/ki/agents/r/events.state.json`, `${f.box.state.path}/ki/agents/r/snapshot.saved`)
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    expect((await f.events()).filter((event) => event.kind === 'done')).toHaveLength(1)
  }
)

test.each([true, false])(
  'seventh-review crashed baseline run remains readable and relaunchable, snapshot %s',
  async (snapshot) => {
    const f = await fixture(false)
    const cli = await baselineCli()
    const old = (command: string) => f.box.run(command, { cli })
    expect((await old('ki agent launch r worker . brief.md --json')).exitCode).toBe(0)
    await f.box.state.write('ki/agents/r/worker.status', '12:00 UTC - milestone: working\n')
    f.set({ empty: true })
    expect((await old('ki agent status r')).exitCode).toBe(0)
    if (!snapshot)
      await rename(
        `${f.box.state.path}/ki/agents/r/events.state.json`,
        `${f.box.state.path}/ki/agents/r/snapshot.saved`
      )
    const status = await f.run('ki agent status r')
    expect(status.exitCode, status.output).toBe(0)
    const relaunched = await f.run('ki agent launch r worker . brief.md --relaunch --json')
    expect(relaunched.exitCode, relaunched.output).toBe(0)
    f.set({ empty: false })
    await f.box.state.write('ki/agents/r/worker.report.md', '# Successor\n')
    await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
    f.set({ empty: true })
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    await f.box.project.git(['add', '--', '+/_WORK/ki.r/worker.report.md'])
    await f.box.project.git(['commit', '-q', '-m', 'test: preserve successor report'])
    const closed = await f.run('ki agent close r')
    expect(closed.exitCode, closed.output).toBe(0)
  }
)

test('seventh-review a later attempt snapshot cannot corroborate an earlier failure', async () => {
  const f = await fixture(false)
  const cli = await baselineCli()
  const old = (command: string) => f.box.run(command, { cli })
  expect((await old('ki agent launch r worker . brief.md --json')).exitCode).toBe(0)
  const progress = '12:00 UTC - failed: exited without DONE (10:52 BST - DONE)'
  await f.box.state.write('ki/agents/r/worker.status', `${progress}\n`)
  expect((await old('ki agent status r')).exitCode).toBe(0)
  expect((await old('ki agent status r')).exitCode).toBe(0)
  await f.box.state.write('ki/agents/r/worker.status', `${progress}\nDONE\n`)
  await f.box.state.write('ki/agents/r/worker.report.md', '# Earlier completion\n')
  f.set({ empty: true })
  expect((await old('ki agent status r')).exitCode).toBe(0)
  expect((await old('ki agent launch r worker . brief.md --relaunch --json')).exitCode).toBe(0)
  await f.box.state.write('ki/agents/r/worker.status', '10:52 BST - DONE\nDONE\n')
  await f.box.state.write('ki/agents/r/worker.report.md', '# Later completion\n')
  expect((await old('ki agent status r')).exitCode).toBe(0)
  const result = await f.run('ki agent status r')
  expect(result.exitCode, result.output).toBe(0)
  const checkpoint = JSON.parse(await f.box.state.read('ki/agents/r/events.history'))
  expect(checkpoint.failures).toEqual([{ seq: 2, terminal: false }])
})

test.each([false, true])('seventh-review pre-event snapshot remains readable, protocol status %s', async (protocol) => {
  const f = await fixture(false)
  const cli = await baselineCli()
  const old = (command: string) => f.box.run(command, { cli })
  expect((await old('ki agent launch r worker . brief.md --json')).exitCode).toBe(0)
  const first = JSON.parse((await f.box.state.read('ki/agents/r/events.jsonl')).trim())
  const journal = `${JSON.stringify({ ...first, kind: 'needs-owner', tag: 'REVIEW', text: 'Review result' })}\n`
  await f.box.state.write('ki/agents/r/events.jsonl', journal)
  // Old observers also persisted ended without publishing an outcome (as in mac-studio-setup).
  const line = protocol ? '12:00 UTC - milestone: seeded before events' : undefined
  if (line !== undefined) await f.box.state.write('ki/agents/r/worker.status', `${line}\n`)
  await f.box.state.write(
    'ki/agents/r/worker.report.md',
    '# Prior report\n\n## Queries\n\n### SEEDED - Before events\n'
  )
  await f.box.state.write(
    'ki/agents/r/events.state.json',
    JSON.stringify({
      worker: { attempt: 1, ended: true, line, queries: ['SEEDED - Before events'] }
    })
  )
  const directory = `${f.box.state.path}/ki/agents/r`
  for (const name of await readdir(directory))
    if (name.startsWith('control') || name.endsWith('.launch.json'))
      await rename(`${directory}/${name}`, `${directory}/legacy-${name}.saved`)
  f.set({ empty: true })
  expect((await old('ki agent status r')).exitCode).toBe(0)
  const status = await f.run('ki agent status r')
  expect(status.exitCode, status.output).toBe(0)
  expect(await f.box.state.read('ki/agents/r/events.jsonl')).toBe(journal)
  for (const kind of ['milestone', 'failed', 'blocked']) {
    await f.box.state.write('ki/agents/r/worker.status', `12:01 UTC - ${kind}: archival annotation\n`)
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    // New progress cannot retroactively establish complete history or poison a pre-event end.
    expect((await f.events()).filter((event) => event.terminal === true)).toHaveLength(0)
  }
})

test.each(
  [true, false].flatMap((snapshot) =>
    ['ordinary worker failure progress', 'no report', 'attempt failed', 'exited without DONE (no status)'].map(
      (text) => ({ snapshot, text })
    )
  )
)('legacy baseline upgrade preserves failure progress $text with snapshot $snapshot', async ({ snapshot, text }) => {
  const f = await fixture(false)
  const cli = await baselineCli()
  const old = (command: string) => f.box.run(command, { cli })
  expect((await old('ki agent launch r worker . brief.md --json')).exitCode).toBe(0)
  const line = `12:00 UTC - failed: ${text}`
  await f.box.state.write('ki/agents/r/worker.status', `${line}\n`)
  expect((await old('ki agent status r')).exitCode).toBe(0)
  // A second baseline observation poisons Seen.ended, just as the reported upgrade did.
  expect((await old('ki agent status r')).exitCode).toBe(0)
  expect((await old('ki agent wait r --next')).exitCode).toBe(0)
  if (!snapshot)
    await rename(`${f.box.state.path}/ki/agents/r/events.state.json`, `${f.box.state.path}/ki/agents/r/snapshot.saved`)
  expect((await f.run('ki agent status r')).exitCode).toBe(0)
  await f.box.state.write('ki/agents/r/worker.report.md', '# Upgrade result\n')
  await f.box.state.write('ki/agents/r/worker.status', `${line}\nDONE\n`)
  f.set({ empty: true })
  const notified = await f.run('ki agent wait r --next')
  expect(notified.exitCode, notified.output).toBe(0)
  expect(notified.output).toContain('done')
  expect(notified.output).not.toContain('ALL FINISHED')
  expect(await f.box.project.read('+/_WORK/ki.r/worker.report.md')).toBe('# Upgrade result\n')
  // Retirement must survive further observations and snapshot reconstruction.
  await rename(`${f.box.project.path}/+/_WORK/ki.r/worker.report.md`, `${f.box.project.path}/retired.md`)
  await f.box.state.write('ki/agents/r/worker.status', '12:01 UTC - milestone: later status\nDONE\n')
  await rename(`${f.box.state.path}/ki/agents/r/events.state.json`, `${f.box.state.path}/ki/agents/r/upgraded.saved`)
  expect((await f.run('ki agent status r')).exitCode).toBe(0)
  expect(await f.box.project.read('+/_WORK/ki.r/worker.report.md').catch(() => undefined)).toBeUndefined()
  expect((await f.events()).filter((event) => event.kind === 'done')).toHaveLength(1)
  expect((await f.run('ki agent wait r --next')).output).toContain('ALL FINISHED')
})

test.each(
  [true, false].flatMap((snapshot) =>
    [true, false].flatMap((later) =>
      [
        ['failed', 'ordinary worker failure progress'],
        ['failed', 'no report'],
        ['failed', 'attempt failed'],
        ['failed', 'exited without DONE (no status)'],
        ['failed', 'could not launch: brief missing'],
        ['blocked', 'gate cannot open: dependency failed'],
        ['blocked', 'could not launch: brief missing']
      ].map(([kind, text]) => ({ snapshot, later, kind, text }))
    )
  )
)(
  'sixth-review baseline later progress preserves completion $kind $text snapshot $snapshot later $later',
  async ({ snapshot, later, kind, text }) => {
    const f = await fixture(false)
    const cli = await baselineCli()
    const old = (command: string) => f.box.run(command, { cli })
    expect((await old('ki agent launch r worker . brief.md --json')).exitCode).toBe(0)
    await f.box.state.write('ki/agents/r/worker.status', `12:00 UTC - ${kind}: ${text}\n`)
    expect((await old('ki agent status r')).exitCode).toBe(0)
    if (later) {
      await f.box.state.write('ki/agents/r/worker.status', '12:01 UTC - milestone: retrying\n')
      expect((await old('ki agent status r')).exitCode).toBe(0)
    }
    expect((await old('ki agent wait r --next')).exitCode).toBe(0)
    if (!snapshot)
      await rename(
        `${f.box.state.path}/ki/agents/r/events.state.json`,
        `${f.box.state.path}/ki/agents/r/snapshot.saved`
      )
    const upgraded = await f.run('ki agent status r')
    expect(upgraded.exitCode, upgraded.output).toBe(0)
    await f.box.state.write('ki/agents/r/worker.report.md', '# Recovered completion\n')
    await f.box.state.write('ki/agents/r/worker.status', '12:02 UTC - milestone: finished\nDONE\n')
    f.set({ empty: true })
    const result = await f.run('ki agent wait r --next')
    expect(result.exitCode, result.output).toBe(0)
    expect(result.output).toContain('done')
    expect(await f.box.project.read('+/_WORK/ki.r/worker.report.md')).toBe('# Recovered completion\n')
    await rename(`${f.box.state.path}/ki/agents/r/events.state.json`, `${f.box.state.path}/ki/agents/r/upgraded.saved`)
    expect((await f.run('ki agent status r')).exitCode).toBe(0)
    expect((await f.events()).filter((event) => event.kind === 'done')).toHaveLength(1)
  }
)

test.each([true, false])('sixth-review untouched baseline failure relaunch upgrades snapshot %s', async (snapshot) => {
  const f = await fixture(false)
  const cli = await baselineCli()
  const old = (command: string) => f.box.run(command, { cli })
  expect((await old('ki agent launch r worker . brief.md --json')).exitCode).toBe(0)
  await f.box.state.write('ki/agents/r/worker.status', '12:00 UTC - failed: tests failing\n')
  expect((await old('ki agent status r')).exitCode).toBe(0)
  f.set({ empty: true })
  expect((await old('ki agent status r')).exitCode).toBe(0)
  const relaunched = await old('ki agent launch r worker . brief.md --relaunch --json')
  expect(relaunched.exitCode, relaunched.output).toBe(0)
  f.set({ empty: false })
  if (!snapshot)
    await rename(`${f.box.state.path}/ki/agents/r/events.state.json`, `${f.box.state.path}/ki/agents/r/snapshot.saved`)
  const upgraded = await f.run('ki agent status r')
  expect(upgraded.exitCode, upgraded.output).toBe(0)
  await f.box.state.write('ki/agents/r/worker.report.md', '# Successor result\n')
  await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
  f.set({ empty: true })
  expect((await f.run('ki agent status r')).exitCode).toBe(0)
  expect((await f.events()).filter((event) => event.kind === 'done' && event.attempt === 2)).toHaveLength(1)
  expect(await f.box.project.read('+/_WORK/ki.r/worker.report.md')).toBe('# Successor result\n')
})

test('sixth-review untouched baseline queue launch failure upgrades', async () => {
  const f = await fixture(false)
  const cli = await baselineCli()
  const old = (command: string) => f.box.run(command, { cli })
  expect((await old('ki agent queue r worker brief.md --json')).exitCode).toBe(0)
  await rename(`${f.box.state.path}/ki/agents/r/worker.queued.md`, `${f.box.state.path}/ki/agents/r/queued.saved`)
  const dispatched = await old('ki agent dispatch r --max 1 --foreground')
  const before = await f.events()
  expect(
    before.some((event) => event.kind === 'failed' && event.text.startsWith('could not launch:')),
    dispatched.output + JSON.stringify(before)
  ).toBe(true)
  const result = await f.run('ki agent status r')
  expect(result.exitCode, result.output).toBe(0)
  expect(await f.events()).toHaveLength(before.length)
  await rename(`${f.box.state.path}/ki/agents/r/events.state.json`, `${f.box.state.path}/ki/agents/r/snapshot.saved`)
  expect((await f.run('ki agent status r')).exitCode).toBe(0)
})

test.each([
  ['failed', 'no report'],
  ['failed', 'attempt failed'],
  ['failed', 'exited without DONE (no status)'],
  ['blocked', 'gate cannot open: dependency failed'],
  ['blocked', 'could not launch: brief missing']
])('sixth-review ambiguous baseline %s %s preserves completion evidence', async (kind, text) => {
  const f = await fixture(false)
  const cli = await baselineCli()
  const old = (command: string) => f.box.run(command, { cli })
  expect((await old('ki agent launch r worker . brief.md --json')).exitCode).toBe(0)
  const line = `12:00 UTC - ${kind}: ${text}`
  await f.box.state.write('ki/agents/r/worker.status', `${line}\n`)
  expect((await old('ki agent status r')).exitCode).toBe(0)
  expect((await old('ki agent wait r --next')).exitCode).toBe(0)
  await rename(`${f.box.state.path}/ki/agents/r/events.state.json`, `${f.box.state.path}/ki/agents/r/snapshot.saved`)
  await rename(`${f.box.state.path}/ki/agents/r/worker.status`, `${f.box.state.path}/ki/agents/r/status.saved`)
  const journal = await f.box.state.read('ki/agents/r/events.jsonl')
  const provisional = await f.run('ki agent status r')
  expect(provisional.exitCode, provisional.output).toBe(0)
  expect((await f.box.state.read('ki/agents/r/events.jsonl')).startsWith(journal)).toBe(true)
  await f.box.state.write('ki/agents/r/worker.report.md', '# Verified completion\n')
  await f.box.state.write('ki/agents/r/worker.status', `${line}\nDONE\n`)
  f.set({ empty: true })
  // Restoring a previously missing source line may first publish its progress identity.
  let completed = await f.run('ki agent wait r --next')
  if (!completed.output.includes('done')) completed = await f.run('ki agent wait r --next')
  expect(completed.exitCode, completed.output).toBe(0)
  expect(completed.output).toContain('done')
  expect(await f.box.project.read('+/_WORK/ki.r/worker.report.md')).toBe('# Verified completion\n')
  expect((await f.events()).filter((event) => event.kind === 'done')).toHaveLength(1)
})

test.each(['failed', 'blocked', 'wrong-name', 'wrong-attempt', 'active', 'wrong-outcome'])(
  'sixth-review legacy queue classification requires matching cancellation %s',
  async (mode) => {
    const f = await fixture(false)
    const queued = await f.queue()
    const store = await f.state()
    const entry = store.entries[queued.entry]
    entry.state = mode === 'active' ? 'queued' : 'cancelled'
    entry.disposition = mode === 'blocked' || mode === 'wrong-outcome' ? 'blocked' : 'failed'
    await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
    const kind = mode === 'blocked' ? 'blocked' : 'failed'
    const event = {
      seq: 1,
      at: '2026-10-21T12:00:00Z',
      run: 'r',
      agent: mode === 'wrong-name' ? 'other' : 'worker',
      attempt: mode === 'wrong-attempt' ? entry.attempt + 1 : entry.attempt,
      kind,
      text: mode === 'blocked' ? 'gate cannot open: dependency failed' : 'could not launch: brief missing'
    }
    const journal = `${JSON.stringify(event)}\n`
    await f.box.state.write('ki/agents/r/events.jsonl', journal)
    await f.box.state.write('ki/agents/r/events.history', 'ki/agent-events/v1\n')
    const result = await f.run('ki agent status r')
    const valid = mode === 'failed' || mode === 'blocked'
    expect(result.exitCode, result.output).toBe(0)
    expect((await f.events())[0]).toMatchObject(event)
    const checkpoint = JSON.parse(await f.box.state.read('ki/agents/r/events.history'))
    expect(checkpoint.failures[0].terminal).toBe(valid)
  }
)

test.each([
  ['failed', 'ordinary worker failure'],
  ['failed', 'gate cannot open: dependency failed'],
  ['blocked', 'no report'],
  ['blocked', 'attempt failed'],
  ['blocked', 'exited without DONE (no status)']
])('sixth-review status overwritten before observation keeps %s %s as progress', async (kind, text) => {
  const f = await fixture(false)
  const cli = await baselineCli()
  const old = (command: string) => f.box.run(command, { cli })
  expect((await old('ki agent launch r worker . brief.md --json')).exitCode).toBe(0)
  await f.box.state.write('ki/agents/r/worker.status', `12:00 UTC - ${kind}: ${text}\n`)
  expect((await old('ki agent status r')).exitCode).toBe(0)
  await rename(`${f.box.state.path}/ki/agents/r/events.state.json`, `${f.box.state.path}/ki/agents/r/snapshot.saved`)
  await f.box.state.write('ki/agents/r/worker.status', '12:01 UTC - milestone: retrying\n')
  const upgraded = await f.run('ki agent status r')
  expect(upgraded.exitCode, upgraded.output).toBe(0)
  await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
  await f.box.state.write('ki/agents/r/worker.report.md', '# Completion\n')
  f.set({ empty: true })
  expect((await f.run('ki agent status r')).exitCode).toBe(0)
  expect((await f.events()).filter((event) => event.kind === 'done')).toHaveLength(1)
  expect(await f.box.project.read('+/_WORK/ki.r/worker.report.md')).toBe('# Completion\n')
})

test.each(['no report', 'could not launch: brief missing'])(
  'uncorroborated legacy failure %s remains readable and provisional',
  async (text) => {
    const f = await fixture(false)
    await f.launch()
    const first = (await f.events())[0]
    const journal = `${JSON.stringify({ seq: 1, at: first.at, run: 'r', agent: 'worker', attempt: 1, kind: 'failed', text })}\n`
    await f.box.state.write('ki/agents/r/events.jsonl', journal)
    await f.box.state.write('ki/agents/r/events.history', 'ki/agent-events/v1\n')
    await rename(`${f.box.state.path}/ki/agents/r/events.state.json`, `${f.box.state.path}/ki/agents/r/snapshot.saved`)
    const directory = `${f.box.state.path}/ki/agents/r`
    for (const name of await readdir(directory))
      if (name.startsWith('control') || name.endsWith('.launch.json'))
        await rename(`${directory}/${name}`, `${directory}/legacy-${name}.saved`)

    const result = await f.run('ki agent status r')
    expect(result.exitCode, result.output).toBe(0)
    const checkpoint = JSON.parse(await f.box.state.read('ki/agents/r/events.history'))
    expect(checkpoint.failures[0].terminal).toBe(false)
    expect(await f.box.state.read('ki/agents/r/events.jsonl')).toBe(journal)
  }
)

test.each([
  null,
  {},
  [null],
  [{ seq: 0, terminal: false }],
  [{ seq: 1.5, terminal: false }],
  [{ seq: 99, terminal: false }],
  [{ seq: 2, terminal: 17 }],
  [{ seq: 2, terminal: false, statusLine: 17 }],
  [{ seq: 1, terminal: false }],
  [{ seq: 2, terminal: true }],
  [{ seq: 2, terminal: false, statusLine: '12:01 UTC - failed: different' }],
  [
    { seq: 2, terminal: false },
    { seq: 2, terminal: false }
  ]
])('corrupt failure checkpoint identity refuses observation (%j)', async (failures) => {
  const f = await fixture(false)
  await f.launch()
  await f.box.state.write('ki/agents/r/worker.status', '12:00 UTC - failed: working\n')
  expect((await f.run('ki agent status r')).exitCode).toBe(0)
  const checkpoint = JSON.parse(await f.box.state.read('ki/agents/r/events.history'))
  await f.box.state.write(
    'ki/agents/r/events.history',
    JSON.stringify({ ...checkpoint, failures, failureSha256: hash(JSON.stringify(failures)) })
  )
  const result = await f.run('ki agent status r')
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('events-evidence-unverified')
})

test('legacy duplicate fixed failure text separates worker progress from its genuine terminal failure', async () => {
  const f = await fixture(false)
  await f.launch()
  const first = (await f.events())[0]
  const events = [
    first,
    { ...first, seq: 2, kind: 'failed', text: 'no report', terminal: undefined },
    { ...first, seq: 3, kind: 'failed', text: 'no report', terminal: undefined }
  ]
  await f.box.state.write('ki/agents/r/events.jsonl', `${events.map((event) => JSON.stringify(event)).join('\n')}\n`)
  await f.box.state.write('ki/agents/r/events.history', 'ki/agent-events/v1\n')
  await f.box.state.write('ki/agents/r/worker.status', '12:00 UTC - failed: no report\nDONE\n')
  await rename(`${f.box.state.path}/ki/agents/r/events.state.json`, `${f.box.state.path}/ki/agents/r/snapshot.saved`)
  f.set({ empty: true })
  expect((await f.run('ki agent status r')).exitCode).toBe(0)
  expect(JSON.parse(await f.box.state.read('ki/agents/r/events.history')).failures).toEqual([
    { seq: 2, terminal: false, statusLine: '12:00 UTC - failed: no report' },
    { seq: 3, terminal: true }
  ])
  expect((await f.events()).filter((event) => event.kind === 'failed').map(({ seq, text }) => ({ seq, text }))).toEqual(
    [
      { seq: 2, text: 'no report' },
      { seq: 3, text: 'no report' }
    ]
  )
  expect((await f.events()).filter((event) => event.kind === 'done')).toHaveLength(0)
})

test('legacy failure uses a confirmed control receipt before terminal replay', async () => {
  const f = await fixture()
  await f.launch()
  const first = (await f.events())[0]
  const store = await f.state()
  const operation = Object.values(store.operations).find((value) => (value as { receipt?: unknown }).receipt) as {
    id: string
    receipt: { resultingState: string; eventSequence: number }
  }
  // A v1 control receipt binds this failed outcome to its exact journal sequence.
  operation.receipt.resultingState = 'failed'
  operation.receipt.eventSequence = 1
  const journal = (await f.box.state.read('ki/agents/r/control.journal.jsonl'))
    .trim()
    .split('\n')
    .map((line) => {
      const entry = JSON.parse(line)
      if (entry.phase === 'observed' && entry.receipt.operationId === operation.id) entry.receipt = operation.receipt
      return JSON.stringify(entry)
    })
  await f.box.state.write('ki/agents/r/control.journal.jsonl', `${journal.join('\n')}\n`)
  await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
  await f.box.state.write(
    'ki/agents/r/events.jsonl',
    `${JSON.stringify({ ...first, operation: operation.id, kind: 'failed', text: 'confirmed legacy refusal', terminal: undefined })}\n`
  )
  await f.box.state.write('ki/agents/r/events.history', 'ki/agent-events/v1\n')
  await rename(`${f.box.state.path}/ki/agents/r/events.state.json`, `${f.box.state.path}/ki/agents/r/snapshot.saved`)
  const result = await f.run('ki agent status r')
  expect(result.exitCode, result.output).toBe(0)
  expect((await f.events()).filter((event) => event.kind === 'failed')).toHaveLength(1)
})

test('changed legacy failure identity digest refuses checkpoint adoption', async () => {
  const f = await fixture(false)
  await f.launch()
  await f.box.state.write('ki/agents/r/worker.status', '12:00 UTC - failed: working\n')
  expect((await f.run('ki agent status r')).exitCode).toBe(0)
  const checkpoint = JSON.parse(await f.box.state.read('ki/agents/r/events.history'))
  checkpoint.failures[0].terminal = true
  await f.box.state.write('ki/agents/r/events.history', JSON.stringify(checkpoint))
  const result = await f.run('ki agent status r')
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('events-evidence-unverified')
})

test.each(['progress', 'terminal', 'ambiguous'] as const)(
  'legacy pending failure %s requires proof of terminal identity',
  async (mode) => {
    const f = await fixture(false)
    await f.launch()
    if (mode === 'terminal') await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
    if (mode === 'progress')
      await f.box.state.write('ki/agents/r/worker.status', '12:00 UTC - failed: worker progress\n')
    await f.box.state.write(
      'ki/agents/r/events.pending/old.json',
      JSON.stringify({
        publication: 'old',
        agent: 'worker',
        attempt: 1,
        kind: 'failed',
        text: mode === 'progress' ? 'worker progress' : 'no report'
      })
    )
    const result = await f.run('ki agent status r')
    expect(result.exitCode, result.output).toBe(0)
    const checkpoint = JSON.parse(await f.box.state.read('ki/agents/r/events.history'))
    expect(checkpoint.failures[0].terminal).toBe(mode === 'terminal')
  }
)

test('legacy fixed failure on an older attempt survives a newer live attempt', async () => {
  const f = await fixture(false)
  await f.launch()
  await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
  f.set({ empty: true })
  expect((await f.run('ki agent status r')).exitCode).toBe(0)
  const relaunched = await f.run('ki agent launch r worker . brief.md --relaunch --json')
  expect(relaunched.exitCode, relaunched.output).toBe(0)
  f.set({ empty: false })
  const events = await f.events()
  const failure = events.find((event) => event.kind === 'failed' && event.attempt === 1)
  expect(failure).toBeDefined()
  delete failure.terminal
  await f.box.state.write('ki/agents/r/events.jsonl', `${events.map((event) => JSON.stringify(event)).join('\n')}\n`)
  await f.box.state.write('ki/agents/r/events.history', 'ki/agent-events/v1\n')
  const result = await f.run('ki agent status r')
  expect(result.exitCode, result.output).toBe(0)
  expect((await f.events()).filter((event) => event.kind === 'failed')).toHaveLength(1)
})

test('older v2 history without failure identities remains readable', async () => {
  const f = await fixture(false)
  await f.launch()
  const checkpoint = JSON.parse(await f.box.state.read('ki/agents/r/events.history'))
  delete checkpoint.failures
  delete checkpoint.failureSha256
  await f.box.state.write('ki/agents/r/events.history', JSON.stringify(checkpoint))
  expect((await f.run('ki agent status r')).exitCode).toBe(0)
})
