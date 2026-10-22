import { createHash } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, test, vi } from 'vitest'
import { type AgentProcesses, runCommand, sandbox } from './_cli_helper.ts'

// Accelerate only the lock retry backoff in this isolated fault sweep. Public
// wait bounds still use the injected clock; the contention regressions and
// separate-process SIGKILL probes retain their normal host timers.
vi.mock('node:timers/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:timers/promises')>()),
  setTimeout: async () => undefined
}))

type Fault =
  | 'before'
  | 'after'
  | 'truncate'
  | 'corrupt'
  | 'death-before'
  | 'death-after'
  | 'truncate-before'
  | 'corrupt-before'
  | 'busy'
type Site = { operation: string; path: string }
const injection = vi.hoisted(() => ({
  root: '',
  home: '',
  trace: [] as Site[],
  index: -1,
  kind: '' as Fault | '',
  hit: false,
  dead: false,
  damaged: '',
  busy: '',
  original: undefined as string | undefined
}))

// Interface fault injection is necessary for the write/acknowledgement windows
// that one ordinary CLI invocation cannot schedule. Death modes fence all later
// I/O and leave the transaction lock behind, then start a fresh CLI invocation.
vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs/promises')>()
  const wrap =
    (operation: 'writeFile' | 'appendFile' | 'rename' | 'copyFile' | 'mkdir' | 'rm') =>
    async (...args: unknown[]) => {
      const path = String(args[operation === 'rename' || operation === 'copyFile' ? 1 : 0])
      const workerWrite =
        operation === 'writeFile' &&
        path.startsWith(injection.root) &&
        (path.endsWith('.report.md') || (path.endsWith('.status') && args[1] === 'DONE\n'))
      const tracked =
        injection.root !== '' && (path.startsWith(injection.root) || path.startsWith(injection.home)) && !workerWrite
      if (injection.dead && tracked) throw Object.assign(new Error('injected process death'), { code: 'EIO' })
      const selected = tracked && injection.trace.push({ operation, path }) - 1 === injection.index
      const kind = selected ? injection.kind : ''
      if (kind) injection.hit = true
      if (kind === 'death-before') injection.dead = true
      if (kind === 'before' || kind === 'death-before')
        throw Object.assign(new Error(`injected ${kind}`), { code: 'EIO' })
      const beforeDamage = kind === 'truncate-before' || kind === 'corrupt-before'
      if (beforeDamage) {
        const source = operation === 'rename' ? String(args[0]) : path
        const previous = await fs.readFile(source, 'utf8').catch(() => '')
        injection.damaged = source
        injection.original =
          operation === 'copyFile'
            ? await fs.readFile(String(args[0]), 'utf8')
            : operation === 'appendFile'
              ? previous + String(args[1])
              : operation === 'rename'
                ? previous
                : String(args[1])
        await fs.writeFile(
          source,
          kind === 'truncate-before' ? previous.slice(0, Math.floor(previous.length / 2)) : '{corrupt evidence'
        )
      } else if ((operation === 'writeFile' || operation === 'copyFile') && injection.damaged === path) {
        injection.damaged = ''
        injection.original = undefined
      } else if (operation === 'appendFile' && injection.damaged === path) {
        injection.original += String(args[1])
      }
      const invoke = fs[operation] as (...args: unknown[]) => Promise<unknown>
      const result = await invoke(...args)
      if (operation === 'rename' && injection.damaged === String(args[0])) injection.damaged = path
      if (beforeDamage && (await fs.readFile(path, 'utf8')) === injection.original) {
        injection.damaged = ''
        injection.original = undefined
      }
      if ((kind === 'truncate' || kind === 'corrupt') && operation !== 'mkdir' && operation !== 'rm') {
        const original = await fs.readFile(path, 'utf8')
        injection.damaged = path
        injection.original = original
        await fs.writeFile(
          path,
          kind === 'truncate' ? original.slice(0, Math.floor(original.length / 2)) : '{corrupt evidence'
        )
      }
      if (kind === 'death-after') injection.dead = true
      if (kind === 'after' || kind === 'death-after')
        throw Object.assign(new Error(`injected ${kind}`), { code: 'EIO' })
      return result
    }
  return {
    ...fs,
    writeFile: wrap('writeFile'),
    appendFile: wrap('appendFile'),
    copyFile: wrap('copyFile'),
    rename: wrap('rename'),
    mkdir: wrap('mkdir'),
    rm: wrap('rm')
  }
})

vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>()
  return {
    ...fs,
    unlinkSync: (...args: Parameters<typeof fs.unlinkSync>) => {
      const path = String(args[0])
      const tracked = injection.root !== '' && path.startsWith(injection.root)
      const selected = tracked && injection.trace.push({ operation: 'unlock', path }) - 1 === injection.index
      const kind = selected ? injection.kind : ''
      if (kind) injection.hit = true
      if (injection.dead || kind === 'before' || kind === 'death-before') {
        injection.dead ||= kind === 'death-before'
        throw new Error('injected release failure')
      }
      fs.unlinkSync(...args)
      if (kind === 'death-after') injection.dead = true
      if (kind === 'after' || kind === 'death-after') throw new Error('injected release acknowledgement failure')
    },
    writeFileSync: (...args: Parameters<typeof fs.writeFileSync>) => {
      const path = String(args[0])
      const tracked = injection.root !== '' && path.startsWith(injection.root)
      if (injection.dead && tracked) throw Object.assign(new Error('injected process death'), { code: 'EIO' })
      if (injection.busy === path) throw Object.assign(new Error('injected busy lock'), { code: 'EEXIST' })
      const selected = tracked && injection.trace.push({ operation: 'lock', path }) - 1 === injection.index
      const kind = selected ? injection.kind : ''
      if (kind) injection.hit = true
      if (kind === 'busy') {
        injection.busy = path
        throw Object.assign(new Error('injected busy lock'), { code: 'EEXIST' })
      }
      if (kind === 'death-before') injection.dead = true
      if (kind === 'before' || kind === 'death-before')
        throw Object.assign(new Error(`injected ${kind}`), { code: 'EIO' })
      if (kind === 'truncate-before' || kind === 'corrupt-before') {
        injection.damaged = path
        injection.original = String(args[1])
        fs.writeFileSync(path, kind === 'truncate-before' ? '' : '{corrupt holder')
      }
      fs.writeFileSync(...args)
      if (kind === 'truncate' || kind === 'corrupt') {
        injection.damaged = path
        injection.original = fs.readFileSync(path, 'utf8')
        fs.writeFileSync(path, kind === 'truncate' ? '' : '{corrupt holder')
      }
      if (kind === 'death-after') injection.dead = true
      if (kind === 'after' || kind === 'death-after')
        throw Object.assign(new Error(`injected ${kind}`), { code: 'EIO' })
    },
    readFileSync: (...args: Parameters<typeof fs.readFileSync>) => {
      if (injection.dead && String(args[0]).startsWith(injection.root)) throw new Error('injected process death')
      return fs.readFileSync(...args)
    }
  }
})

const reset = () => {
  injection.root = ''
  injection.home = ''
  injection.trace = []
  injection.index = -1
  injection.kind = ''
  injection.hit = false
  injection.dead = false
  injection.busy = ''
  injection.damaged = ''
  injection.original = undefined
}
afterEach(reset)

const fixture = async () => {
  const box = await sandbox()
  box.setRunner(runCommand)
  await box.project.git(['init', '-q'])
  await box.project.write('+/_WORK/ki.r/work.md', '---\nid: ki.r\n---\n')
  await box.project.git(['add', '+/_WORK/ki.r/work.md'])
  await box.project.git(['commit', '-q', '-m', 'fixture'])
  await box.project.write('brief.md', 'Do the work.\n')
  const assets = 'ki/harnesses/knowledgeislands/ki-agentic-harness/skills/governance/ki-delegation/assets'
  await box.data.write(`${assets}/run-prompt.md`, '# Task\n')
  await box.data.write(`${assets}/rules-none.md`, '# Footer\n\n## Rules\n\nLocal only.\n')
  const directory = `${box.state.path}/ki/agents/r`
  let time = 0
  let starts = 0
  let signals = 0
  let empty = false
  let ownership = true
  let timeout = false
  const deadPids = new Set<number>()
  let openGate = false
  let holdSleeps = 0
  let completeOnLaunch = false
  let failAcknowledgement = false
  type Identity = Parameters<NonNullable<AgentProcesses['control']>['launch']>[0]
  const owner = (identity: Identity) => ({
    pid: 4001,
    birth: 'fixture',
    session: 'fixture',
    group: 'fixture',
    token: identity.token,
    scope: identity.scope,
    launcher: identity.launcher
  })
  const processes: AgentProcesses = {
    launch: async () => {
      starts += 1
      empty = false
      if (completeOnLaunch) await finishWorker()
      return 4001
    },
    alive: (pid) => !empty && !deadPids.has(pid),
    sleep: async (milliseconds) => {
      time += Math.max(milliseconds, 121_000)
      if (openGate && ++holdSleeps === 2) {
        await box.state.write('ki/agents/r/before.report.md', '# Done\n')
        await box.state.write('ki/agents/r/before.status', 'DONE\n')
      }
      if (time > 1_000_000) throw new Error('unbounded matrix wait')
    },
    control: {
      launch: async (identity) => {
        starts += 1
        empty = false
        if (failAcknowledgement) throw new Error('injected acknowledgement loss')
        if (completeOnLaunch) await finishWorker()
        return owner(identity)
      },
      inspect: async (identity) => ({
        token: identity.token,
        scope: identity.scope,
        ownership,
        containment: true,
        empty,
        fenced: true,
        authorisationConsumed: true,
        workerStarted: true,
        owner: owner(identity)
      }),
      terminate: async () => {
        signals += 1
        empty = !timeout
      },
      verifyRecovery: async (identity) => ({
        token: identity.token,
        scope: identity.scope,
        ownership,
        containment: true,
        empty,
        fenced: true,
        authorisationConsumed: true,
        workerStarted: true,
        owner: owner(identity)
      })
    }
  }
  box.setAgentProcesses(processes)
  const run = (command: string) => box.run(`ki agent ${command}`, { now: () => time })
  const finishWorker = async () => {
    empty = true
    await box.state.write(
      'ki/agents/r/worker.report.md',
      '# Done\n\n## Queries\n\n### MATRIX-QUERY - Confirm outcome\n'
    )
    await box.state.write('ki/agents/r/worker.status', 'DONE\n')
  }
  return {
    box,
    directory,
    run,
    finishWorker,
    starts: () => starts,
    signals: () => signals,
    waitOneGatePass: () => {
      openGate = true
    },
    closeGate: () => {
      deadPids.add(17)
    },
    observeEmpty: (value: boolean) => {
      empty = value
    },
    timeout: () => {
      timeout = true
    },
    lost: () => {
      ownership = false
    },
    completeOnLaunch: () => {
      completeOnLaunch = true
    },
    loseAcknowledgement: () => {
      failAcknowledgement = true
    }
  }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

const scenarios = [
  'launch',
  'held',
  'resume',
  'gate-waiting',
  'gate-closed',
  'queued-held-gate',
  'dispatch-gate',
  'dispatch-refusal',
  'legacy-refusal',
  'dispatch-detached',
  'relaunch',
  'recover-inspect',
  'recover-resolve',
  'queue',
  'dequeue',
  'stop',
  'timeout',
  'ownership',
  'status',
  'wait',
  'watch',
  'dispatch'
] as const
type Scenario = (typeof scenarios)[number]
const prepare = async (name: Scenario) => {
  const f = await fixture()
  let command: string
  if (name === 'gate-closed' || name === 'queued-held-gate') {
    await f.box.state.write('ki/agents/r/before.pid', '17\n')
    const held = JSON.parse((await f.run('launch r worker . brief.md --wait-for before --json')).stdout) as {
      identity: { token: string }
    }
    if (name === 'queued-held-gate') {
      // Seed the durable claimed-held projection possible when a queue gate changes during preparation.
      const queued = JSON.parse((await f.run('queue r worker brief.md --relaunch --json')).stdout) as { entry: string }
      const store = JSON.parse(await f.box.state.read('ki/agents/r/control.json'))
      const bindEntry = (value: unknown): void => {
        if (!value || typeof value !== 'object') return
        const object = value as Record<string, unknown>
        if (object['token'] === held.identity.token && object['agent'] === 'worker') object['entry'] = queued.entry
        for (const child of Object.values(object)) bindEntry(child)
      }
      bindEntry(store)
      const journal = (await f.box.state.read('ki/agents/r/control.journal.jsonl'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
      for (const row of journal) bindEntry(row)
      await f.box.state.write(
        'ki/agents/r/control.journal.jsonl',
        `${journal.map((row) => JSON.stringify(row)).join('\n')}\n`
      )
      for (const operation of Object.values(store.operations) as { id: string; receipt?: unknown }[])
        if (operation.receipt)
          await f.box.state.write(
            `ki/agents/r/control-receipts/${operation.id}.json`,
            JSON.stringify(operation.receipt)
          )
      Object.assign(store.entries[queued.entry], {
        attempt: store.attempts.worker.attempt,
        token: held.identity.token,
        scope: store.attempts.worker.scope,
        state: 'claimed'
      })
      await f.box.state.write('ki/agents/r/control.json', JSON.stringify(store))
      const packet = JSON.parse(await f.box.state.read('ki/agents/r/worker.launch.json'))
      packet.request.entry = queued.entry
      await f.box.state.write('ki/agents/r/worker.launch.json', JSON.stringify(packet))
    }
    f.closeGate()
    command = `launch r worker . ${f.directory}/worker.prompt.md --foreground --launch-token ${held.identity.token}`
  } else if (name === 'dispatch-gate' || name === 'dispatch-refusal' || name === 'dispatch-detached') {
    if (name === 'dispatch-gate') await f.box.state.write('ki/agents/r/before.pid', '17\n')
    await f.run(`queue r worker brief.md --json ${name === 'dispatch-gate' ? '--wait-for before' : ''}`)
    if (name === 'dispatch-gate') f.closeGate()
    if (name === 'dispatch-refusal')
      await rename(
        `${f.box.data.path}/ki/harnesses/knowledgeislands/ki-agentic-harness/skills/governance/ki-delegation/assets/rules-none.md`,
        `${f.box.data.path}/footer.saved`
      )
    command = name === 'dispatch-detached' ? 'dispatch r --max 1' : 'dispatch r --max 1 --foreground'
  } else if (name === 'legacy-refusal') {
    await f.box.state.write(
      'ki/agents/r/queue.jsonl',
      `${JSON.stringify({ run: 'r', name: 'worker', workdir: `${f.box.project.path}/missing`, prompt: `${f.box.project.path}/brief.md`, runtime: 'claude', addDirs: [], rules: 'none', allow: [], waitFor: [] })}\n`
    )
    command = 'dispatch r --max 1 --foreground'
  } else if (name === 'recover-inspect' || name === 'recover-resolve') {
    f.loseAcknowledgement()
    await f.run('launch r worker . brief.md --json')
    const store = JSON.parse(await f.box.state.read('ki/agents/r/control.json')) as {
      operations: Record<string, { id: string; operation: string; target: { token: string } }>
    }
    const operation = Object.values(store.operations).find((operation) => operation.operation === 'spawn')
    if (!operation) throw new Error('fixture has no spawn intent')
    command = `recover inspect r --operation ${operation.id} --json`
    if (name === 'recover-resolve') {
      await f.box.project.write('authority.md', '# Grant\n\nOwner-approved fixture recovery.\n')
      await f.box.project.write('proof.json', 'adapter-proof\n')
      await f.box.project.write(
        'evidence.json',
        JSON.stringify({
          schema: 'ki/agent-reconciliation/v1',
          operation_id: operation.id,
          target_id: operation.target.token,
          observation: 'spawn-started',
          proofs: [
            {
              path: `${f.box.project.path}/proof.json`,
              sha256: createHash('sha256').update('adapter-proof\n').digest('hex')
            }
          ]
        })
      )
      command = `recover resolve r --operation ${operation.id} --evidence evidence.json --authority ${f.box.project.path}/authority.md#Grant --json`
    }
  } else if (name === 'resume' || name === 'gate-waiting') {
    await f.box.state.write('ki/agents/r/before.pid', '17\n')
    const held = JSON.parse((await f.run('launch r worker . brief.md --wait-for before --json')).stdout) as {
      identity: { token: string }
    }
    if (name === 'gate-waiting') f.waitOneGatePass()
    else {
      await f.box.state.write('ki/agents/r/before.report.md', '# Done\n')
      await f.box.state.write('ki/agents/r/before.status', 'DONE\n')
    }
    command = `launch r worker . ${f.directory}/worker.prompt.md --foreground --launch-token ${held.identity.token}`
  } else if (name === 'launch') command = 'launch r worker . brief.md --json'
  else if (name === 'held') {
    await f.box.state.write('ki/agents/r/before.pid', '17\n')
    command = 'launch r worker . brief.md --wait-for before --json'
  } else if (name === 'queue' || name === 'dispatch' || name === 'dequeue') {
    command = 'queue r worker brief.md --json'
    if (name !== 'queue') {
      const queued = JSON.parse((await f.run(command)).stdout) as { entry: string }
      command =
        name === 'dequeue'
          ? `dequeue r worker --entry ${queued.entry} --reason owner --json`
          : 'dispatch r --max 1 --foreground'
      if (name === 'dispatch') f.completeOnLaunch()
    }
  } else {
    await f.run('launch r worker . brief.md --json')
    if (name === 'relaunch') {
      await f.finishWorker()
      command = 'launch r worker . brief.md --relaunch --json'
    } else if (name === 'stop' || name === 'timeout' || name === 'ownership') {
      if (name === 'timeout') f.timeout()
      if (name === 'ownership') f.lost()
      command = 'stop r worker --attempt 1 --reason owner --grace 1 --request matrix-stop --json'
    } else {
      await f.finishWorker()
      command = name === 'status' ? 'status r' : name === 'wait' ? 'wait r --next' : 'watch r 1'
    }
  }
  return { ...f, command }
}

const journal = async (f: Fixture) => {
  const source = await readFile(join(f.directory, 'events.jsonl'), 'utf8').catch(() => '')
  return source
    .split('\n')
    .filter(Boolean)
    .map(
      (line) =>
        JSON.parse(line) as {
          seq: number
          agent: string
          attempt: number
          kind: string
          operation?: string
          terminal?: boolean
        }
    )
}

// Read witnesses before the recovery fixture changes anything: repairing bytes must never hide a reset.
const preservesJournal = async (f: Fixture, previous: string, cell: string): Promise<void> => {
  const current = await readFile(join(f.directory, 'events.jsonl'), 'utf8').catch(() => '')
  let checkpoint = ''
  try {
    const saved = JSON.parse(await readFile(join(f.directory, 'events.history'), 'utf8')) as {
      journal?: unknown
      sha256?: unknown
    }
    if (typeof saved.journal === 'string' && createHash('sha256').update(saved.journal).digest('hex') === saved.sha256)
      checkpoint = saved.journal
  } catch {
    /* A damaged checkpoint is acceptable only while the journal retains the old evidence. */
  }
  expect(current.startsWith(previous) || checkpoint.startsWith(previous), cell).toBe(true)
}

// Enumerate each actual mutation, rather than maintaining a list that can omit
// a new durable write. Every row is replayed in an independent sandbox.
test.each(scenarios)(
  'persistence fault matrix: %s',
  async (scenario) => {
    const baseline = await prepare(scenario)
    injection.root = baseline.directory
    injection.home = `${baseline.box.project.path}/+/_WORK/ki.r`
    const baselineResult = await baseline.run(baseline.command)
    if (scenario === 'queued-held-gate')
      expect(baselineResult.output).toContain('gate cannot open: before exited without DONE')
    const sites = [...injection.trace]
    console.info(`FAULT-MATRIX ${scenario}: ${sites.length} durable mutation sites`)
    console.info(
      `FAULT-COUNTS ${scenario}: ${JSON.stringify(
        Object.fromEntries(
          [...new Set(sites.map((site) => site.operation))].map((operation) => [
            operation,
            sites.filter((site) => site.operation === operation).length
          ])
        )
      )}`
    )
    reset()
    if (scenario === 'recover-inspect') expect(sites).toHaveLength(0)
    else expect(sites.length).toBeGreaterThan(0)
    for (const [index, site] of sites.entries()) {
      const kinds: Fault[] = ['before', 'after', 'death-before', 'death-after']
      if (!['mkdir', 'rm', 'unlock'].includes(site.operation))
        kinds.push('truncate-before', 'corrupt-before', 'truncate', 'corrupt')
      if (site.operation === 'lock') kinds.push('busy')
      for (const kind of kinds) {
        const f = await prepare(scenario)
        const previous = await readFile(join(f.directory, 'events.jsonl'), 'utf8').catch(() => '')
        const starts = f.starts()
        injection.root = f.directory
        injection.home = `${f.box.project.path}/+/_WORK/ki.r`
        injection.index = index
        injection.kind = kind
        let thrown: unknown
        let result: Awaited<ReturnType<typeof f.run>> | undefined
        try {
          result = await f.run(f.command)
        } catch (error) {
          thrown = error
        }
        const hit = injection.hit
        const damaged = injection.damaged
        const original = injection.original
        const trace = [...injection.trace]
        reset()
        const cell = `${scenario}/${site.operation}/${site.path.replace(baseline.directory, '<state>').replace(baseline.box.project.path, '<project>')}/${index}/${kind}`
        expect(hit, cell).toBe(true)
        await preservesJournal(f, previous, cell)
        if (!kind.startsWith('death-') && (f.starts() > starts || f.signals() > 0)) {
          expect(thrown, cell).toBeUndefined()
          expect(result?.output, cell).not.toContain('could not launch')
          expect(result?.output, cell).not.toContain('not started')
        }
        // Explicit offline recovery after the invocation has ended: restore the
        // damaged bytes and remove only this sandbox's abandoned transaction locks.
        if (damaged && original !== undefined && !damaged.endsWith('.lock')) await writeFile(damaged, original)
        for (const lock of ['control.lock', 'events.lock']) await rm(join(f.directory, lock), { force: true })
        // The checkpoint preserves the exact append intent across a torn append.
        const history = await readFile(join(f.directory, 'events.history'), 'utf8').catch(() => '')
        if (history.startsWith('{')) {
          const saved = JSON.parse(history) as { journal?: string }
          if (saved.journal !== undefined) await writeFile(join(f.directory, 'events.jsonl'), saved.journal)
        }
        if (scenario === 'legacy-refusal')
          expect((await f.run('dispatch r --max 1 --foreground')).exitCode, cell).toBe(0)
        const first = await f.run('status r').catch(() => undefined)
        const second = await f.run('status r').catch(() => undefined)
        if (first?.exitCode === 0 && second?.exitCode === 0) {
          expect((await readFile(join(f.directory, 'events.jsonl'), 'utf8')).startsWith(previous), cell).toBe(true)
          const events = await journal(f)
          expect(
            events.map((event) => event.seq),
            cell
          ).toEqual(events.map((_, ordinal) => ordinal + 1))
          const terminals = events.filter(
            (event) => event.terminal || ['done', 'stopped', 'dequeued'].includes(event.kind)
          )
          const keys = terminals.map((event) => `${event.agent}/${event.attempt}`)
          expect(new Set(keys).size, cell).toBe(keys.length)
          const refusedSources = events
            .filter((event) => 'queueSource' in event)
            .map((event) => (event as typeof event & { queueSource: string }).queueSource)
          expect(new Set(refusedSources).size, cell).toBe(refusedSources.length)
          const blocked = events
            .filter((event) => event.kind === 'blocked' && event.operation)
            .map((event) => `${event.operation}/blocked`)
          expect(new Set(blocked).size, cell).toBe(blocked.length)
          const control = JSON.parse(
            await readFile(join(f.directory, 'control.json'), 'utf8').catch(() => '{"operations":{}}')
          ) as {
            attempts?: Record<string, { attempt: number }>
            operations: Record<
              string,
              {
                operation: string
                id: string
                target: { agent: string; attempt: number; name: string }
                receipt?: { outcome: string }
              }
            >
          }
          for (const operation of Object.values(control.operations)) {
            const kind = (
              {
                started: 'launch',
                held: 'held',
                stopped: 'stopped',
                'cancelled-before-start': 'dequeued',
                'stop-timeout': 'blocked',
                'ownership-unverified': 'blocked',
                'containment-unverified': 'blocked'
              } as Record<string, string>
            )[operation.receipt?.outcome ?? '']
            if (kind)
              expect(
                events.filter(
                  (event) =>
                    event.kind === kind &&
                    event.agent === (operation.target.agent ?? operation.target.name) &&
                    event.attempt === operation.target.attempt
                ),
                cell
              ).toHaveLength(1)
          }
          const status = await readFile(join(f.directory, 'worker.status'), 'utf8').catch(() => '')
          const report = await readFile(join(f.directory, 'worker.report.md'), 'utf8').catch(() => '')
          if (status.trimEnd().endsWith('DONE') && report.includes('MATRIX-QUERY') && control.attempts?.['worker']) {
            const attempt = control.attempts['worker'].attempt
            expect(
              events.filter((event) => event.agent === 'worker' && event.attempt === attempt && event.kind === 'done'),
              cell
            ).toHaveLength(1)
            expect(
              events.filter(
                (event) => event.agent === 'worker' && event.attempt === attempt && event.kind === 'needs-owner'
              ),
              cell
            ).toHaveLength(1)
          }
          if (f.starts() > starts)
            expect(
              events.filter((event) => event.kind === 'failed'),
              cell
            ).toHaveLength(0)
        } else {
          expect(`${first?.output} ${second?.output} ${String(thrown)}`, cell).toMatch(
            /unverified|unconfirmed|injected|ENOENT|no such run/
          )
        }
        expect(trace.length, cell).toBeGreaterThan(index)
      }
    }
  },
  180_000
)

test.each(scenarios)(
  'SIGKILL persistence matrix: %s',
  async (scenario) => {
    const child = fileURLToPath(new URL('../fixtures/agent-crash-child.ts', import.meta.url))
    const invoke = async (f: Awaited<ReturnType<typeof prepare>>, index: number, phase: 'before' | 'after') => {
      const input = join(f.box.root.path, 'crash-input.json')
      await f.box.root.write(
        'crash-input.json',
        JSON.stringify({
          directory: f.directory,
          root: f.box.root.path,
          project: f.box.project.path,
          environment: f.box.env,
          command: ['ki', 'agent', ...f.command.split(' ')],
          scenario,
          index,
          phase
        })
      )
      const executed = await runCommand(
        process.execPath,
        [child, input],
        { ...f.box.env, PATH: process.env['PATH'] },
        { timeoutMs: 15_000, maxBytes: 100_000, platform: process.platform }
      )
      expect(executed.output).toBe('')
      return JSON.parse(await f.box.root.read('crash-trace.json')) as {
        sites: Site[]
        killed: boolean
        starts: number
        signals: number
        empty: boolean
      }
    }
    const baseline = await prepare(scenario)
    const initial = await invoke(baseline, -1, 'before')
    expect(initial.killed).toBe(false)
    if (scenario === 'recover-inspect') expect(initial.sites).toHaveLength(0)
    else expect(initial.sites.length, JSON.stringify(initial)).toBeGreaterThan(0)
    console.info(`SIGKILL-MATRIX ${scenario}: ${initial.sites.length} sites, before and after each`)
    for (const index of initial.sites.keys())
      for (const phase of ['before', 'after'] as const) {
        const f = await prepare(scenario)
        const previous = await readFile(join(f.directory, 'events.jsonl'), 'utf8').catch(() => '')
        const crashed = await invoke(f, index, phase)
        const cell = `${scenario}/${index}/${phase}`
        expect(crashed.killed, cell).toBe(true)
        await preservesJournal(f, previous, cell)
        f.observeEmpty(crashed.empty)
        // The child has exited; preserve and explicitly retire this sandbox's holder
        // evidence, as the documented offline recovery procedure requires.
        for (const lock of ['control.lock', 'events.lock']) {
          const path = join(f.directory, lock)
          const bytes = await readFile(path, 'utf8').catch(() => undefined)
          if (bytes !== undefined) {
            await writeFile(`${path}.preserved`, bytes)
            await rm(path)
          }
        }
        const before = await readFile(join(f.directory, 'events.jsonl'), 'utf8').catch(() => '')
        const history = await readFile(join(f.directory, 'events.history'), 'utf8').catch(() => '')
        if (history.startsWith('{')) {
          const saved = JSON.parse(history) as { journal: string; sha256: string }
          expect(createHash('sha256').update(saved.journal).digest('hex'), cell).toBe(saved.sha256)
          expect(saved.journal.startsWith(before), cell).toBe(true)
          await writeFile(join(f.directory, 'events.jsonl'), saved.journal)
        }
        const first = await f.run('status r')
        const second = await f.run('status r')
        if (first.exitCode === 0 && second.exitCode === 0) {
          expect((await readFile(join(f.directory, 'events.jsonl'), 'utf8')).startsWith(previous), cell).toBe(true)
          const events = await journal(f)
          expect(
            events.map((event) => event.seq),
            cell
          ).toEqual(events.map((_, ordinal) => ordinal + 1))
          const outcomes = events.filter(
            (event) => event.terminal || ['done', 'stopped', 'dequeued'].includes(event.kind)
          )
          expect(new Set(outcomes.map((event) => `${event.agent}/${event.attempt}`)).size, cell).toBe(outcomes.length)
          if (crashed.starts)
            expect(
              events.some((event) => event.kind === 'failed'),
              cell
            ).toBe(false)
          const store = JSON.parse(
            await f.box.state.read('ki/agents/r/control.json').catch(() => '{"operations":{}}')
          ) as { operations: Record<string, { operation: string; id: string; receipt?: unknown; resolvedBy?: string }> }
          for (const operation of Object.values(store.operations)) {
            if (
              ['spawn', 'spawn-supervisor', 'stop'].includes(operation.operation) &&
              !operation.receipt &&
              !operation.resolvedBy
            ) {
              expect(
                events.filter((event) => event.operation === operation.id && event.kind === 'blocked'),
                cell
              ).toHaveLength(1)
              const waited = await f.run('wait r')
              expect(waited.exitCode, cell).toBe(1)
              expect(waited.output, cell).toContain(operation.id)
            }
          }
        } else expect(`${first.output} ${second.output}`, cell).toMatch(/unverified|unconfirmed|no such run/)
      }
  },
  180_000
)
