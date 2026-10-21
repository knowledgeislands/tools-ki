import { createHash } from 'node:crypto'
import { chmod, readdir, readFile, rename } from 'node:fs/promises'
import { describe, expect, test } from 'vitest'
import { type AgentLaunch, type AgentLaunchEvidence, type AgentProcesses, runCommand, sandbox } from './_cli_helper.ts'

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
  box.setAgentProcesses({
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
  })
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

  test('an interrupted stop derives its single terminal event and immutable receipt on retry', async () => {
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
    f.set({ empty: true })
    expect((await f.run('ki agent dispatch r --max 1 --foreground')).exitCode).toBe(0)
    expect((await f.state()).entries[second.entry].state).toBe('started')
    await f.box.state.write('ki/agents/r/worker.status', 'New request done\nDONE\n')
    expect((await f.run(['ki', ...held.arguments])).stdout).toContain('worker was dequeued')
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

  test('dequeue retry and observers derive one event after a cancellation receipt write was interrupted', async () => {
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
    const [one, two] = await Promise.all([f.queue('one'), f.queue('two')])
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
