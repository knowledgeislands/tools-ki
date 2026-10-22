import { createHash } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, test, vi } from 'vitest'
import { runCommand, sandbox } from './_cli_helper.ts'

const fault = vi.hoisted(() => ({
  archive: '',
  traceJournal: '',
  journalReads: 0,
  checkpointReadCount: 0,
  dropJournalReadAt: 0,
  append: '',
  preparation: '',
  corruptCreate: '',
  shortAppend: '',
  pauseCheckpoint: '',
  beforeCheckpoint: undefined as (() => Promise<void>) | undefined,
  journalMissingOnce: '',
  historyMissingOnce: ''
}))
vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof import('node:fs/promises')>()
  return {
    ...fs,
    readFile: async (...args: Parameters<typeof fs.readFile>) => {
      const path = String(args[0])
      if (path === fault.pauseCheckpoint) {
        fault.pauseCheckpoint = ''
        const captured = await fs.readFile(...args).then(
          (value) => ({ value }),
          (error) => ({ error })
        )
        await fault.beforeCheckpoint?.()
        if ('error' in captured) throw captured.error
        return captured.value
      }
      if (path === fault.traceJournal) {
        fault.journalReads += 1
        if (fault.journalReads === fault.dropJournalReadAt) {
          fault.dropJournalReadAt = 0
          throw Object.assign(new Error('injected journal disappearance before append intent'), { code: 'ENOENT' })
        }
      }

      if (path === fault.journalMissingOnce || path === fault.historyMissingOnce) {
        if (path === fault.journalMissingOnce) fault.journalMissingOnce = ''
        else fault.historyMissingOnce = ''
        throw Object.assign(new Error('injected concurrent initialization'), { code: 'ENOENT' })
      }
      return fs.readFile(...args)
    },
    rename: async (...args: Parameters<typeof fs.rename>) => {
      if (String(args[1]) === fault.archive) {
        fault.archive = ''
        throw new Error('injected archive interruption')
      }
      return fs.rename(...args)
    },
    writeFile: async (...args: Parameters<typeof fs.writeFile>) => {
      if (
        fault.traceJournal &&
        String(args[0]) === fault.traceJournal.replace('events.jsonl', 'events.history.tmp') &&
        fault.checkpointReadCount === 0
      )
        fault.checkpointReadCount = fault.journalReads

      if (String(args[0]) === fault.corruptCreate) {
        fault.corruptCreate = ''
        return fs.writeFile(args[0], '{corrupt initial journal')
      }
      if (String(args[0]) === fault.preparation) {
        fault.preparation = ''
        throw new Error('injected preparation interruption after archive')
      }
      return fs.writeFile(...args)
    },
    appendFile: async (...args: Parameters<typeof fs.appendFile>) => {
      if (String(args[0]) === fault.append) {
        fault.append = ''
        throw new Error('injected checkpoint/append interruption')
      }
      if (String(args[0]) === fault.shortAppend) {
        fault.shortAppend = ''
        const contents = Buffer.from(String(args[1]))
        return fs.appendFile(args[0], contents.subarray(0, Math.floor(contents.length / 2)))
      }
      return fs.appendFile(...args)
    }
  }
})
afterEach(() => {
  fault.traceJournal = ''
  fault.journalReads = 0
  fault.checkpointReadCount = 0
  fault.dropJournalReadAt = 0
  fault.archive = ''
  fault.append = ''
  fault.preparation = ''
  fault.corruptCreate = ''
  fault.shortAppend = ''
  fault.pauseCheckpoint = ''
  fault.beforeCheckpoint = undefined
  fault.journalMissingOnce = ''
  fault.historyMissingOnce = ''
})

const fixture = async () => {
  const box = await sandbox()
  box.setRunner(runCommand)
  await box.project.git(['init', '-q'])
  await box.project.write('+/_WORK/ki.r/work.md', '---\nid: ki.r\n---\n')
  await box.project.git(['add', '--', '+/_WORK'])
  await box.project.git(['commit', '-q', '-m', 'test: fixture'])
  await box.project.write('brief.md', '# Worker\n')
  const assets = 'ki/harnesses/knowledgeislands/ki-agentic-harness/skills/governance/ki-delegation/assets'
  await box.data.write(`${assets}/run-prompt.md`, '# Task\n')
  await box.data.write(`${assets}/rules-none.md`, '# Footer\n\n## Rules\n\nLocal only.\n')
  let alive = true
  let starts = 0
  let time = 0
  box.setAgentProcesses({
    launch: async () => ++starts + 4000,
    alive: () => alive,
    sleep: async () => {
      alive = false
      time += 500000
    }
  })
  const run = (args: string) => box.run(`ki agent ${args}`, { now: () => time })
  return {
    box,
    run,
    directory: join(box.state.path, 'ki/agents/r'),
    dead: () => {
      alive = false
    },
    starts: () => starts
  }
}

test('seventh-review concurrent checkpoint adoption cannot erase interrupted completion append', async () => {
  const f = await fixture()
  expect((await f.run('launch r worker . brief.md --json')).exitCode).toBe(0)
  await rename(join(f.directory, 'events.history'), join(f.directory, 'history.saved'))
  let reached!: () => void
  let release!: () => void
  const paused = new Promise<void>((resolve) => {
    reached = resolve
  })
  const resumed = new Promise<void>((resolve) => {
    release = resolve
  })
  fault.pauseCheckpoint = join(f.directory, 'events.history')
  fault.beforeCheckpoint = async () => {
    reached()
    await resumed
  }
  const adopting = f.run('stop r worker --attempt 1 --reason owner --request adopting')
  await paused
  f.dead()
  await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
  await f.box.state.write('ki/agents/r/worker.report.md', '# Concurrent completion\n')
  fault.shortAppend = join(f.directory, 'events.jsonl')
  let committed = ''
  try {
    const interrupted = await f.run('status r')
    expect(interrupted.exitCode, interrupted.output).toBe(1)
    committed = await readFile(join(f.directory, 'events.history'), 'utf8')
    expect(JSON.parse(committed).seq).toBe(2)
  } finally {
    release()
    await adopting
  }
  expect(await readFile(join(f.directory, 'events.history'), 'utf8')).toBe(committed)
  // The publisher's exact completion suffix must remain recoverable after initialization returns.
  await f.run('status r')
  const recovered = await f.run('status r')
  expect(recovered.exitCode, recovered.output).toBe(0)
  const checkpoint = JSON.parse(await readFile(join(f.directory, 'events.history'), 'utf8'))
  expect(await readFile(join(f.directory, 'events.jsonl'), 'utf8')).toBe(checkpoint.journal)
  const events = checkpoint.journal
    .trim()
    .split('\n')
    .map((line: string) => JSON.parse(line))
  expect(events.filter((event: { kind: string }) => event.kind === 'done')).toHaveLength(1)
  expect(await f.box.project.read('+/_WORK/ki.r/worker.report.md')).toBe('# Concurrent completion\n')
})

test.each(['archive', 'preparation'])(
  'interrupted relaunch retry at %s preserves a completed predecessor and its dependent gate',
  async (phase) => {
    const f = await fixture()
    const first = await f.run('launch r worker . brief.md --json')
    expect(first.exitCode, first.output).toBe(0)
    const token = JSON.parse(first.stdout).identity.token
    expect((await f.run('queue r dependent brief.md --wait-for worker --json')).exitCode).toBe(0)
    f.dead()
    await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
    await f.box.state.write('ki/agents/r/worker.report.md', '# Done\n')
    if (phase === 'archive') fault.archive = join(f.directory, 'worker.prev-1/worker.prompt.md')
    else fault.preparation = join(f.directory, 'worker.prompt.md')
    expect((await f.run('launch r worker . brief.md --relaunch --json')).exitCode).toBe(1)
    expect((await f.run('launch r worker . brief.md --relaunch --json')).exitCode).toBe(0)
    const store = JSON.parse(await f.box.state.read('ki/agents/r/control.json'))
    expect.soft(store.history[token].state).toBe('done')
    const dispatched = await f.run('dispatch r --max 2 --foreground')
    expect.soft(dispatched.output).not.toContain('worker failed')
    expect.soft(f.starts()).toBe(3)
  }
)

test.each([false, true])('dispatch refuses held ownership loss with dependent queue=%s', async (dependent) => {
  const f = await fixture()
  await f.box.state.write('ki/agents/r/before.pid', '17\n')
  expect((await f.run('launch r worker . brief.md --wait-for before --json')).exitCode).toBe(0)
  if (dependent) expect((await f.run('queue r dependent brief.md --wait-for worker --json')).exitCode).toBe(0)
  f.dead()
  const result = await f.run('dispatch r --max 2 --foreground')
  expect.soft(result.exitCode, result.output).toBe(1)
  expect.soft(result.output).not.toContain('all finished')
  expect.soft(result.output).toContain('ownership-unverified')
})

test.each(['status r', 'wait r --next', 'watch r 1'])(
  'interrupted checkpoint append recovers through %s',
  async (observer) => {
    const f = await fixture()
    expect((await f.run('launch r worker . brief.md --json')).exitCode).toBe(0)
    const previous = await readFile(join(f.directory, 'events.jsonl'), 'utf8')
    fault.append = join(f.directory, 'events.jsonl')
    expect((await f.run('launch r second . brief.md --json')).exitCode).toBe(0)
    const intended = JSON.parse(await readFile(join(f.directory, 'events.history'), 'utf8')).journal
    expect(intended.length).toBeGreaterThan(previous.length)
    f.dead()
    await f.box.state.write('ki/agents/r/worker.status', 'DONE\n')
    await f.box.state.write('ki/agents/r/worker.report.md', '# Done\n')
    const result = await f.run(observer)
    expect(result.output).not.toContain('events-evidence-unverified')
    expect((await readFile(join(f.directory, 'events.jsonl'), 'utf8')).startsWith(intended)).toBe(true)
    expect((await f.run('status r')).exitCode).toBe(0)
    const events = (await readFile(join(f.directory, 'events.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(events.filter((event) => event.agent === 'second' && event.kind === 'launch')).toHaveLength(1)
  }
)

test.each(['launch', 'dispatch', 'dispatch-claimed'])(
  'SIGKILL before spawn intent leaves a reservation that %s automatically retires',
  async (mode) => {
    const child = fileURLToPath(new URL('../fixtures/agent-crash-child.ts', import.meta.url))
    const invoke = async (f: Awaited<ReturnType<typeof fixture>>, index: number) => {
      const input = join(f.box.root.path, 'crash-input.json')
      await writeFile(
        input,
        JSON.stringify({
          directory: f.directory,
          root: f.box.root.path,
          project: f.box.project.path,
          environment: f.box.env,
          scenario: mode === 'launch' ? 'launch' : 'dispatch',
          index,
          phase: 'after',
          command:
            mode === 'launch'
              ? ['ki', 'agent', 'launch', 'r', 'worker', '.', 'brief.md', '--json']
              : ['ki', 'agent', 'dispatch', 'r', '--max', '1', '--foreground']
        })
      )
      await runCommand(
        process.execPath,
        [child, input],
        { ...f.box.env, PATH: process.env['PATH'] },
        { timeoutMs: 15000, maxBytes: 100000, platform: process.platform }
      )
      return JSON.parse(await f.box.root.read('crash-trace.json'))
    }
    const baseline = await fixture()
    if (mode !== 'launch') await baseline.run('queue r worker brief.md --json')
    const trace = await invoke(baseline, -1)
    const index = trace.sites.findIndex(
      (site: { operation: string; path: string }) => site.operation === 'rename' && site.path.endsWith('/control.json')
    )
    expect(index).toBeGreaterThanOrEqual(0)
    const f = await fixture()
    if (mode !== 'launch') await f.run('queue r worker brief.md --json')
    const killed = await invoke(f, index)
    expect(killed.killed).toBe(true)
    expect(killed.starts).toBe(0)
    await rename(join(f.directory, 'control.lock'), join(f.directory, 'control.lock.preserved'))
    const before = JSON.parse(await f.box.state.read('ki/agents/r/control.json'))
    if (mode === 'dispatch-claimed') {
      for (const entry of Object.values(before.entries)) (entry as { state: string }).state = 'claimed'
      await f.box.state.write('ki/agents/r/control.json', JSON.stringify(before))
    }

    expect(Object.keys(before.operations)).toHaveLength(0)
    const result = await f.run(
      mode === 'launch' ? 'launch r worker . brief.md --relaunch --json' : 'dispatch r --max 1 --foreground'
    )
    expect(result.exitCode, result.output).toBe(0)
    const after = JSON.parse(await f.box.state.read('ki/agents/r/control.json'))
    if (mode === 'launch') expect(after.history[before.attempts.worker.token].state).toBe('failed')
    expect(after.operations[`prepare-${before.attempts.worker.token}`].receipt).toMatchObject({
      outcome: 'preparation-not-started',
      reason: 'preparation interrupted before spawn intent; no process was started'
    })
    if (mode === 'launch') expect(after.attempts.worker.token).not.toBe(before.attempts.worker.token)
    else expect(Object.values(after.entries).map((entry) => (entry as { state: string }).state)).toEqual(['started'])
    expect(f.starts()).toBe(1)
  }
)

test('a repair interrupted in a Unicode byte prefix retries without losing bytes or identities', async () => {
  const f = await fixture()
  await f.run('launch r worker . brief.md --json')
  await f.box.state.write('ki/agents/r/worker.status', '00:00 BST - milestone: café\n')
  expect((await f.run('status r')).exitCode).toBe(0)
  const path = join(f.directory, 'events.jsonl')
  const intended = await readFile(path)
  const prefix = intended.subarray(0, intended.indexOf(Buffer.from('é')) + 1)
  expect(prefix.length).toBeGreaterThan(0)
  await writeFile(path, prefix)
  fault.append = path
  expect((await f.run('status r')).exitCode).toBe(1)
  expect(await readFile(path)).toEqual(prefix)
  expect((await f.run('status r')).exitCode).toBe(0)
  expect(await readFile(path)).toEqual(intended)
})

test('an invalid UTF-8 journal byte is not accepted as an equivalent replacement character', async () => {
  const f = await fixture()
  await f.run('launch r worker . brief.md --json')
  await f.box.state.write('ki/agents/r/worker.status', '00:00 BST - milestone: \uFFFD\n')
  expect((await f.run('status r')).exitCode).toBe(0)
  const path = join(f.directory, 'events.jsonl')
  const intended = await readFile(path)
  const index = intended.indexOf(Buffer.from('\uFFFD'))
  expect(index).toBeGreaterThan(0)
  const damaged = Buffer.concat([intended.subarray(0, index), Buffer.from([255]), intended.subarray(index + 3)])
  await writeFile(path, damaged)
  const result = await f.run('status r')
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('events-evidence-unverified')
  expect(await readFile(path)).toEqual(damaged)
})

test('held uncertainty ends dispatch even while an unrelated gate process stays alive', async () => {
  const f = await fixture()
  await f.box.state.write('ki/agents/r/before.pid', '17\n')
  await f.run('launch r worker . brief.md --wait-for before --json')
  f.box.setAgentProcesses({
    launch: async () => {
      throw new Error('must not replace held work')
    },
    alive: (pid) => pid === 17,
    sleep: async () => {
      throw new Error('dispatch must return its blocked outcome')
    }
  })
  const result = await f.run('dispatch r --max 1 --foreground')
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('ownership-unverified')
  expect(result.output).not.toContain('all finished')
})

test('a short append during repair is refused and the remaining verified suffix is recoverable', async () => {
  const f = await fixture()
  await f.run('launch r worker . brief.md --json')
  const path = join(f.directory, 'events.jsonl')
  const intended = await readFile(path)
  await writeFile(path, intended.subarray(0, 7))
  fault.shortAppend = path
  const result = await f.run('status r')
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('journal recovery could not be verified')
  const partial = await readFile(path)
  expect(intended.subarray(0, partial.length)).toEqual(partial)
  expect(partial.length).toBeGreaterThan(7)
  expect((await f.run('status r')).exitCode).toBe(0)
  expect(await readFile(path)).toEqual(intended)
})

test('a first checkpoint appearing during an absent-journal read is re-read with its journal', async () => {
  const f = await fixture()
  await f.box.state.write('ki/agents/r/events.jsonl', '')
  await f.box.state.write(
    'ki/agents/r/events.history',
    JSON.stringify({
      schema: 'ki/agent-events/v2',
      seq: 0,
      sha256: createHash('sha256').update('').digest('hex'),
      journal: ''
    })
  )
  fault.journalMissingOnce = join(f.directory, 'events.jsonl')
  fault.historyMissingOnce = join(f.directory, 'events.history')
  const result = await f.run('status r')
  expect(result.exitCode, result.output).toBe(0)
  expect(await readFile(join(f.directory, 'events.jsonl'), 'utf8')).toBe('')
})

test('an interrupted first legacy-refusal append recovers without a missing-journal repair', async () => {
  const f = await fixture()
  await f.box.state.write(
    'ki/agents/r/queue.jsonl',
    `${JSON.stringify({ run: 'r', name: 'worker', workdir: `${f.box.project.path}/missing`, prompt: `${f.box.project.path}/brief.md`, runtime: 'claude', addDirs: [], rules: 'none', allow: [], waitFor: [] })}\n`
  )
  fault.append = join(f.directory, 'events.jsonl')
  expect((await f.run('dispatch r --max 1 --foreground')).exitCode).toBe(1)
  const retried = await f.run('dispatch r --max 1 --foreground')
  expect(retried.exitCode, retried.output).toBe(0)
  expect((await f.run('status r')).exitCode).toBe(0)
  const events = (await readFile(join(f.directory, 'events.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  expect(events.filter((event) => event.kind === 'failed')).toHaveLength(1)
  expect(f.starts()).toBe(0)
})

test('a corrupt first journal creation is verified before any worker starts', async () => {
  const f = await fixture()
  fault.corruptCreate = join(f.directory, 'events.jsonl')
  const result = await f.run('launch r worker . brief.md --json')
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('events-evidence-unverified')
  expect(f.starts()).toBe(0)
  expect(await readFile(join(f.directory, 'events.jsonl'), 'utf8')).toBe('{corrupt initial journal')
})

test('a digest-valid checkpoint with an incorrect positive sequence count preserves both copies', async () => {
  const f = await fixture()
  await f.run('launch r worker . brief.md --json')
  const path = join(f.directory, 'events.jsonl')
  const journal = await readFile(path, 'utf8')
  const checkpoint = JSON.parse(await readFile(join(f.directory, 'events.history'), 'utf8'))
  checkpoint.seq += 1
  const damaged = JSON.stringify(checkpoint)
  await f.box.state.write('ki/agents/r/events.history', damaged)
  await f.box.state.write('ki/agents/r/events.seen', '1\n')
  const result = await f.run('status r')
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('events-evidence-unverified')
  expect(await readFile(path, 'utf8')).toBe(journal)
  expect(await readFile(join(f.directory, 'events.history'), 'utf8')).toBe(damaged)
  expect(await readFile(join(f.directory, 'events.seen'), 'utf8')).toBe('1\n')
  expect(f.starts()).toBe(1)
})

test('held ownership loss drains an unresolved future gate and still refuses completion', async () => {
  const f = await fixture()
  await f.box.state.write('ki/agents/r/before.pid', '17\n')
  await f.run('launch r worker . brief.md --wait-for before --json')
  expect((await f.run('queue r dependent brief.md --wait-for future --json')).exitCode).toBe(0)
  f.dead()
  const result = await f.run('dispatch r --max 2 --foreground')
  expect(result.exitCode, result.output).toBe(1)
  expect(result.output).toContain('nothing running for future')
  expect(result.output).not.toContain('all finished')
  const store = JSON.parse(await f.box.state.read('ki/agents/r/control.json'))
  expect(Object.values(store.entries).map((entry) => (entry as { state: string }).state)).toEqual(['cancelled'])
  expect(f.starts()).toBe(1)
})

// Profile the filesystem boundary so the fault stays immediately before append
// intent even when an implementation adds another verified journal read.
test('a journal disappearing before append intent cannot replace the committed checkpoint', async () => {
  const profile = await fixture()
  await profile.run('launch r worker . brief.md --json')
  fault.traceJournal = join(profile.directory, 'events.jsonl')
  fault.journalReads = 0
  fault.checkpointReadCount = 0
  await profile.box.state.write('ki/agents/r/worker.status', '00:00 BST - milestone: preserved journal\n')
  expect((await profile.run('status r')).exitCode).toBe(0)
  const readAt = fault.checkpointReadCount
  expect(readAt).toBeGreaterThan(0)
  fault.traceJournal = ''
  const f = await fixture()
  await f.run('launch r worker . brief.md --json')
  const path = join(f.directory, 'events.jsonl')
  const journal = await readFile(path, 'utf8')
  const checkpoint = await readFile(join(f.directory, 'events.history'), 'utf8')
  fault.traceJournal = path
  fault.journalReads = 0
  fault.checkpointReadCount = 0
  fault.dropJournalReadAt = readAt
  await f.box.state.write('ki/agents/r/worker.status', '00:00 BST - milestone: preserved journal\n')
  const result = await f.run('status r')
  expect(result.exitCode).toBe(1)
  fault.traceJournal = ''
  expect(await readFile(path, 'utf8')).toBe(journal)
  expect(await readFile(join(f.directory, 'events.history'), 'utf8')).toBe(checkpoint)
  expect((await f.run('status r')).exitCode).toBe(0)
  const events = (await readFile(path, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  expect(events.filter((event) => event.kind === 'progress')).toHaveLength(1)
  expect(f.starts()).toBe(1)
})
