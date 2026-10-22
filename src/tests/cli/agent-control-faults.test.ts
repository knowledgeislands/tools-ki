import { rename } from 'node:fs/promises'
import { afterEach, expect, test, vi } from 'vitest'
import { type AgentProcesses, runCommand, sandbox } from './_cli_helper.ts'

// A journal can disappear between replay and inspection. Inject only that filesystem
// boundary: a single CLI call cannot otherwise deterministically schedule the race.
const fault = vi.hoisted(() => ({
  path: '',
  call: 0,
  at: 0,
  directory: '',
  renameTarget: '',
  writeTarget: '',
  statTarget: '',
  writeExists: '',
  syncReadTarget: ''
}))
vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>()
  return {
    ...original,
    readFileSync: (...args: Parameters<typeof original.readFileSync>) => {
      if (String(args[0]) === fault.syncReadTarget) {
        fault.syncReadTarget = ''
        throw Object.assign(new Error('injected release read denial'), { code: 'EACCES' })
      }
      return original.readFileSync(...args)
    }
  }
})
vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...original,
    stat: (...args: Parameters<typeof original.stat>) => {
      if (String(args[0]) === fault.statTarget)
        return Promise.reject(Object.assign(new Error('injected metadata denial'), { code: 'EACCES' }))
      return original.stat(...args)
    },
    writeFile: (...args: Parameters<typeof original.writeFile>) => {
      if (String(args[0]) === fault.writeExists) {
        fault.writeExists = ''
        fault.syncReadTarget = ''
        return original
          .writeFile(...args)
          .then(() => Promise.reject(Object.assign(new Error('concurrent creator'), { code: 'EEXIST' })))
      }
      if (
        String(args[0]) === fault.writeTarget ||
        (fault.writeTarget.endsWith('*') && String(args[0]).startsWith(fault.writeTarget.slice(0, -1)))
      )
        return Promise.reject(Object.assign(new Error('injected post-start persistence denial'), { code: 'EACCES' }))
      return original.writeFile(...args)
    },
    rename: (...args: Parameters<typeof original.rename>) => {
      if (String(args[1]) === fault.renameTarget)
        return Promise.reject(new Error('injected post-start queue publication failure'))
      return original.rename(...args)
    },
    readFile: (...args: Parameters<typeof original.readFile>) => {
      if (String(args[0]) === fault.path && ++fault.call === fault.at)
        return Promise.reject(Object.assign(new Error('injected missing evidence'), { code: 'ENOENT' }))
      return original.readFile(...args)
    },
    readdir: (...args: Parameters<typeof original.readdir>) => {
      if (String(args[0]) === fault.directory)
        return Promise.reject(Object.assign(new Error('injected directory denial'), { code: 'EACCES' }))
      return original.readdir(...args)
    }
  }
})
afterEach(() => {
  fault.path = ''
  fault.call = 0
  fault.at = 0
  fault.directory = ''
  fault.renameTarget = ''
  fault.writeTarget = ''
  fault.statTarget = ''
  fault.writeExists = ''
  fault.syncReadTarget = ''
})

const fixture = async () => {
  const box = await sandbox()
  box.setRunner(runCommand)
  await box.project.git(['init', '-q'])
  await box.project.write('+/_WORK/ki.r/work.md', '---\nid: ki.r\n---\n')
  await box.project.git(['add', '--', '+/_WORK'])
  await box.project.git(['commit', '-q', '-m', 'test: fixture'])
  await box.project.write('brief.md', '# Task\n')
  const assets = 'ki/harnesses/knowledgeislands/ki-agentic-harness/skills/governance/ki-delegation/assets'
  await box.data.write(`${assets}/run-prompt.md`, '# Task\n')
  await box.data.write(`${assets}/rules-none.md`, '# Footer\n\n## Rules\n\nLocal only.\n')
  box.setAgentProcesses({ launch: async () => 4001, alive: () => true, sleep: async () => {} })
  return box
}

test('fourth-review dispatcher continues the queue after a confirmed packet warning', async () => {
  const box = await fixture()
  await box.run('ki agent queue r first brief.md --json')
  await box.run('ki agent queue r second brief.md --json')
  let launches = 0
  box.setAgentProcesses({
    launch: async () => {
      launches += 1
      const name = launches === 1 ? 'first' : 'second'
      if (launches === 1) fault.writeTarget = `${box.state.path}/ki/agents/r/first.launch.json`
      await box.state.write(`ki/agents/r/${name}.status`, 'DONE\n')
      await box.state.write(`ki/agents/r/${name}.report.md`, '# Done\n')
      return 4000 + launches
    },
    alive: () => false,
    sleep: async () => {}
  })
  const dispatched = await box.run('ki agent dispatch r --max 1 --foreground')
  expect(dispatched.exitCode, dispatched.output).toBe(0)
  expect(launches).toBe(2)
  expect(dispatched.output).toContain('launched first')
  expect(dispatched.output).toContain('launched second')
})

test.each(['held-gate', 'queued-gate', 'queued-refusal'] as const)(
  'fourth-review %s outcome survives a failed pending write',
  async (kind) => {
    const box = await fixture()
    await box.state.write('ki/agents/r/before.pid', '17\n')
    let command: string
    if (kind === 'held-gate') {
      const launch = await box.run('ki agent launch r worker . brief.md --wait-for before --json')
      const token = JSON.parse(launch.stdout).identity.token
      command = `ki agent launch r worker . ${box.state.path}/ki/agents/r/worker.prompt.md --foreground --launch-token ${token}`
    } else {
      await box.run(`ki agent queue r worker brief.md --json ${kind === 'queued-gate' ? '--wait-for before' : ''}`)
      command = 'ki agent dispatch r --max 1 --foreground'
      if (kind === 'queued-refusal')
        await rename(
          `${box.data.path}/ki/harnesses/knowledgeislands/ki-agentic-harness/skills/governance/ki-delegation/assets/rules-none.md`,
          `${box.data.path}/footer.saved`
        )
    }
    box.setAgentProcesses({
      launch: async () => {
        throw new Error('worker must not start')
      },
      alive: (pid) => pid !== 17,
      sleep: async () => {}
    })
    fault.writeTarget = `${box.state.path}/ki/agents/r/events.pending/*`
    await box.run(command)
    fault.writeTarget = ''
    expect((await box.run('ki agent status r')).exitCode).toBe(0)
    const events = (await box.state.read('ki/agents/r/events.jsonl'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    const outcome = kind === 'queued-refusal' ? 'failed' : 'blocked'
    expect(events.filter((event) => event.agent === 'worker' && event.kind === outcome)).toHaveLength(1)
    if (kind === 'held-gate')
      expect(events.filter((event) => event.agent === 'worker' && event.kind === 'failed')).toHaveLength(0)
  }
)

test('fourth-review legacy refusal cannot remove its queue entry before publishing durable evidence', async () => {
  const box = await fixture()
  const request = {
    run: 'r',
    name: 'worker',
    workdir: `${box.project.path}/missing`,
    prompt: `${box.project.path}/brief.md`,
    runtime: 'claude',
    addDirs: [],
    rules: 'none',
    allow: [],
    waitFor: []
  }
  await box.state.write('ki/agents/r/queue.jsonl', `${JSON.stringify(request)}\n`)
  fault.writeTarget = `${box.state.path}/ki/agents/r/events.pending/*`
  expect((await box.run('ki agent dispatch r --max 1 --foreground')).exitCode).toBe(1)
  expect(await box.state.read('ki/agents/r/queue.jsonl')).toContain('worker')
})

test('recovery inspection refuses a journal lost after replay with a typed result', async () => {
  const box = await fixture()
  expect((await box.run('ki agent launch r worker . brief.md --json')).exitCode).toBe(0)
  const store = JSON.parse(await box.state.read('ki/agents/r/control.json'))
  const operation = Object.keys(store.operations)[0] as string
  fault.path = `${box.state.path}/ki/agents/r/control.journal.jsonl`
  fault.at = 2
  const result = await box.run(`ki agent recover inspect r --operation ${operation} --json`)
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('control-state-unverified: operation journal is unavailable')
})

test.each(['receipts', 'temporary', 'launch', 'vanished-launch', 'denied-directory'])(
  'missing projection refuses prior %s evidence',
  async (kind) => {
    const box = await fixture()
    await box.state.write(
      'ki/agents/r/thread.json',
      JSON.stringify({ repository: box.project.path, folder: '+/_WORK/ki.r' })
    )
    const directory = `${box.state.path}/ki/agents/r`
    if (kind === 'receipts') await box.state.mkdir('ki/agents/r/control-receipts')
    if (kind === 'temporary') await box.state.write('ki/agents/r/control-interrupted.tmp', '{}')
    if (kind === 'launch' || kind === 'vanished-launch') {
      await box.state.write('ki/agents/r/worker.launch.json', JSON.stringify({ identity: { token: 'prior' } }))
      if (kind === 'vanished-launch') {
        fault.path = `${directory}/worker.launch.json`
        fault.at = 1
      }
    }
    if (kind === 'denied-directory') fault.directory = directory
    const result = await box.run('ki agent queue r worker brief.md --json')
    expect(result.exitCode).toBe(1)
    expect(result.output).toContain('control-state-unverified')
  }
)

test('readable legacy launch metadata without control identity remains compatible', async () => {
  const box = await fixture()
  await box.state.write('ki/agents/r/old.launch.json', JSON.stringify({ runtime: 'claude' }))
  expect((await box.run('ki agent queue r worker brief.md --json')).exitCode).toBe(0)
})

test('a lost projection never hides immutable launch evidence', async () => {
  const box = await fixture()
  await box.run('ki agent launch r worker . brief.md --json')
  await rename(`${box.state.path}/ki/agents/r/control.json`, `${box.state.path}/ki/agents/r/control.saved`)
  const result = await box.run('ki agent queue r next brief.md --json')
  expect(result.exitCode).toBe(1)
})

test('event evidence refuses a denied pending directory before changing the journal', async () => {
  const box = await fixture()
  await box.run('ki agent launch r worker . brief.md --json')
  const journal = await box.state.read('ki/agents/r/events.jsonl')
  fault.directory = `${box.state.path}/ki/agents/r/events.pending`
  const result = await box.run('ki agent status r')
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('events-evidence-unverified')
  expect(await box.state.read('ki/agents/r/events.jsonl')).toBe(journal)
})

test('event evidence refuses a publication lost between enumeration and reading', async () => {
  const box = await fixture()
  await box.run('ki agent launch r worker . brief.md --json')
  await box.state.write('ki/agents/r/events.pending/lost.json', '{}')
  fault.path = `${box.state.path}/ki/agents/r/events.pending/lost.json`
  fault.at = 1
  const result = await box.run('ki agent status r')
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('events-evidence-unverified')
})

test('a post-start queue projection failure never cancels a started entry', async () => {
  const box = await fixture()
  const queued = await box.run('ki agent queue r worker brief.md --json')
  const entry = JSON.parse(queued.stdout).entry
  fault.renameTarget = `${box.state.path}/ki/agents/r/queue.jsonl`
  box.setAgentProcesses({
    launch: async () => {
      await box.state.write('ki/agents/r/worker.status', 'DONE\n')
      await box.state.write('ki/agents/r/worker.report.md', '# Done\n')
      return 4001
    },
    alive: () => false,
    sleep: async () => {}
  })
  const result = await box.run('ki agent dispatch r --max 1 --foreground')
  expect(result.exitCode, result.output).toBe(0)
  expect(result.output).toContain('launched worker; follow-up requires inspection')
  const state = JSON.parse(await box.state.read('ki/agents/r/control.json'))
  expect(state.entries[entry].state).toBe('started')
  expect(await box.state.read('ki/agents/r/events.jsonl')).not.toContain('"kind":"failed"')
})

test.each(['worker.pid', 'control-*', 'worker.launch.json'])(
  'third-review post-start %s denial keeps the confirmed launch',
  async (file) => {
    const box = await fixture()
    box.setAgentProcesses({
      launch: async () => {
        fault.writeTarget = `${box.state.path}/ki/agents/r/${file}`
        return 4001
      },
      alive: () => true,
      sleep: async () => {}
    })
    const result = await box.run('ki agent launch r worker . brief.md --json')
    expect(result.exitCode, result.output).toBe(0)
    const receipt = JSON.parse(result.stdout)
    expect(receipt.pid).toBe(4001)
    expect(receipt.identity.state).toBe('running')
    expect(receipt.warnings.join(' ')).toContain('inspection')
  }
)

test.each(['publication', 'acknowledgement'] as const)(
  'third-review legacy queue preserves its started identity after %s failure',
  async (kind) => {
    const box = await fixture()
    const request = {
      run: 'r',
      name: 'worker',
      workdir: box.project.path,
      prompt: `${box.project.path}/brief.md`,
      runtime: 'claude',
      addDirs: [],
      rules: 'none',
      allow: [],
      waitFor: []
    }
    await box.state.write('ki/agents/r/queue.jsonl', `${JSON.stringify(request)}\n`)
    let launches = 0
    box.setAgentProcesses({
      launch: async () => {
        launches += 1
        if (kind === 'acknowledgement') throw new Error('injected acknowledgement loss')
        fault.renameTarget = `${box.state.path}/ki/agents/r/queue.jsonl`
        await box.state.write('ki/agents/r/worker.status', 'DONE\n')
        await box.state.write('ki/agents/r/worker.report.md', '# Result\n')
        return 4001
      },
      alive: () => true,
      sleep: async () => {}
    })
    for (let retry = 0; retry < 2; retry += 1) {
      const result = await box.run('ki agent dispatch r --max 1 --foreground')
      expect(result.exitCode, result.output).toBe(kind === 'publication' ? 0 : 1)
      expect(result.output).not.toContain('could not launch')
      if (kind === 'acknowledgement') expect(result.output).toContain('claim-unconfirmed')
      fault.renameTarget = ''
    }
    expect(launches).toBe(1)
    if (kind === 'acknowledgement') {
      const status = await box.run('ki agent status r')
      expect(status.exitCode, status.output).toBe(0)
      expect(status.output).toContain('unconfirmed')
    }
    expect(await box.state.read('ki/agents/r/events.jsonl')).not.toContain('"kind":"failed"')
  }
)

test('third-review denied event metadata never becomes an absent timestamp', async () => {
  const box = await fixture()
  await box.run('ki agent launch r worker . brief.md --json')
  fault.statTarget = `${box.state.path}/ki/agents/r/worker.status`
  const result = await box.run('ki agent status r')
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('events-evidence-unverified')
})

test('third-review first history creation refuses denied writes before spawn', async () => {
  const box = await fixture()
  let launches = 0
  box.setAgentProcesses({
    launch: async () => {
      launches += 1
      return 4001
    },
    alive: () => true,
    sleep: async () => {}
  })
  fault.writeTarget = `${box.state.path}/ki/agents/r/events.jsonl`
  const result = await box.run('ki agent launch r worker . brief.md --json')
  expect(result.exitCode).toBe(1)
  expect(result.output).toContain('events-evidence-unverified')
  expect(launches).toBe(0)
})

test('third-review concurrent first history creation never overwrites the journal', async () => {
  const box = await fixture()
  fault.writeExists = `${box.state.path}/ki/agents/r/events.jsonl`
  const result = await box.run('ki agent launch r worker . brief.md --json')
  expect(result.exitCode, result.output).toBe(0)
  expect(await box.state.read('ki/agents/r/events.jsonl')).toContain('"kind":"launch"')
})

test('third-review native release read failure cannot contradict a started worker', async () => {
  const box = await fixture()
  fault.syncReadTarget = `${box.state.path}/ki/agents/r/events.lock`
  const result = await box.run('ki agent launch r worker . brief.md --json')
  expect(result.exitCode, result.output).toBe(0)
  expect(JSON.parse(result.stdout).pid).toBe(4001)
})

test('third-review lost journal during stop publication refuses before signalling', async () => {
  const box = await fixture()
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
  let signals = 0
  box.setAgentProcesses({
    launch: async () => 4001,
    alive: () => true,
    sleep: async () => {},
    control: {
      launch: async (identity) => owner(identity),
      inspect: async (identity) => ({
        token: identity.token,
        scope: identity.scope,
        ownership: true,
        containment: true,
        empty: false,
        fenced: true,
        authorisationConsumed: true,
        workerStarted: true,
        owner: owner(identity)
      }),
      terminate: async () => {
        signals += 1
      },
      verifyRecovery: async () => undefined
    }
  })
  expect((await box.run('ki agent launch r worker . brief.md --json')).exitCode).toBe(0)
  fault.path = `${box.state.path}/ki/agents/r/events.jsonl`
  fault.at = 3
  const result = await box.run('ki agent stop r worker --attempt 1 --reason owner --json')
  expect(result.exitCode, result.output).toBe(1)
  expect(result.output).toContain('events-evidence-unverified')
  expect(signals).toBe(0)
})

test('third-review dispatch returns a confirmed start with its packet inspection warning', async () => {
  const box = await fixture()
  await box.run('ki agent queue r worker brief.md --json')
  box.setAgentProcesses({
    launch: async () => {
      fault.writeTarget = `${box.state.path}/ki/agents/r/worker.launch.json`
      await box.state.write('ki/agents/r/worker.status', 'DONE\n')
      await box.state.write('ki/agents/r/worker.report.md', '# Done\n')
      return 4001
    },
    alive: () => false,
    sleep: async () => {}
  })
  const result = await box.run('ki agent dispatch r --max 1 --foreground')
  expect(result.exitCode, result.output).toBe(0)
  expect(result.output).toContain('launched worker')
  expect(result.output).toContain('inspection')
  expect(result.output).not.toContain('could not launch')
})

test('third-review a legacy preparation refusal creates no attempt or process', async () => {
  const box = await fixture()
  const request = {
    run: 'r',
    name: 'worker',
    workdir: `${box.project.path}/missing`,
    prompt: `${box.project.path}/brief.md`,
    runtime: 'claude',
    addDirs: [],
    rules: 'none',
    allow: [],
    waitFor: []
  }
  await box.state.write('ki/agents/r/queue.jsonl', `${JSON.stringify(request)}\n`)
  let launches = 0
  box.setAgentProcesses({
    launch: async () => {
      launches += 1
      return 4001
    },
    alive: () => false,
    sleep: async () => {}
  })
  const result = await box.run('ki agent dispatch r --max 1 --foreground')
  expect(result.exitCode, result.output).toBe(0)
  expect(result.output).toContain('could not launch worker')
  expect(launches).toBe(0)
})
