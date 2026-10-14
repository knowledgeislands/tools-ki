import { realpath, rm } from 'node:fs/promises'
import { dirname } from 'node:path'
import { describe, expect, test } from 'vitest'
import { type AgentLaunch, runCommand, type Sandbox, sandbox } from './_cli_helper.ts'

const now = () => Date.parse('2026-10-07T19:30:00Z')
const assets = 'ki/harnesses/knowledgeislands/ki-agentic-harness/skills/governance/ki-delegation/assets'
const footer = (tier: string): string =>
  `# Authority footer: ${tier}\n\nPreamble the launcher drops.\n\n## Rules\n\n- Tier ${tier} rule.\n`

/** The project is a Git repository, so a run's thread home resolves to it; returns its physical path. */
const setupRepository = async (box: Sandbox): Promise<string> => {
  await box.project.git(['init', '-q'])
  box.setRunner(runCommand)
  return realpath(box.project.path)
}

const skeleton =
  '# Task: <one-line outcome>\n\n<Owner> approved this; see Decision <N> in `+/_THREADS/<run>/decisions.md`. Report to <report path>.\n'

const setupDelegation = async (box: Sandbox): Promise<void> => {
  await setupRepository(box)
  await box.data.mkdir('ki/harnesses/knowledgeislands/ki-agentic-harness/skills/agentic-systems/other')
  for (const tier of ['none', 'push', 'prune', 'release'])
    await box.data.write(`${assets}/rules-${tier}.md`, footer(tier))
  await box.data.write(`${assets}/run-prompt.md`, skeleton)
}

/** Fake detached processes: every launched pid stays alive until `finish` is called. */
const fakeProcesses = (box: Sandbox, onSleep: () => Promise<void> = async () => {}) => {
  const launches: AgentLaunch[] = []
  const alive = new Set<number>()
  let sleeps = 0
  box.setAgentProcesses({
    launch: async (launch) => {
      launches.push(launch)
      const pid = 1000 + launches.length
      alive.add(pid)
      return pid
    },
    alive: (pid) => alive.has(pid),
    sleep: async () => {
      sleeps += 1
      await onSleep()
    }
  })
  return {
    launches,
    alive,
    sleeps: () => sleeps,
    finish: () => alive.clear()
  }
}

const runDir = (box: Sandbox): string => `${box.state.path}/ki/agents/r`
const runPath = (box: Sandbox, file: string): string => `${runDir(box)}/${file}`
const threadPath = async (box: Sandbox, file: string): Promise<string> =>
  `${await realpath(box.project.path)}/+/_THREADS/r/${file}`

describe('ki agent launch', () => {
  test('writes the run packet and detaches the Claude Code adapter with the footer', async () => {
    const box = await sandbox()
    await setupDelegation(box)
    const processes = fakeProcesses(box)
    box.setEnv({ TZ: 'Europe/Paris' })
    await box.project.write('task.md', '# Task: do it\n\n1. Step.\n')
    await box.project.mkdir('extra')

    const result = await box.run('ki agent launch r one . task.md --rules push --add-dir extra', { now })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe(`launched r/one (pid 1001) in ${box.state.path}/ki/agents/r\n`)
    const prompt = await box.state.read('ki/agents/r/one.prompt.md')
    expect(prompt).toContain('# Task: do it\n\n1. Step.\n\n## Rules')
    expect(prompt).toContain('## Rules\n\n- Tier push rule.\n\n---\n\nProgress protocol.')
    expect(prompt).not.toContain('Preamble the launcher drops.')
    expect(prompt).toContain("(time from: TZ=Europe/Paris date '+%H:%M %Z')")
    expect(prompt).toContain('Do not use background subagents. Never end your session while waiting.\n')
    expect(prompt).toContain(`write your report to ${await threadPath(box, 'one.report.md')} as the owner report`)
    expect(await box.state.read('ki/agents/r/thread.json')).toBe(
      `${JSON.stringify({ repository: await realpath(box.project.path), folder: '+/_THREADS/r' })}\n`
    )
    expect(await box.project.mkdir('+/_THREADS/r')).toBe(`${await realpath(box.project.path)}/+/_THREADS/r`)
    expect(await box.state.read('ki/agents/r/one.status')).toBe('21:30 CEST - launched\n')
    expect(await box.state.read('ki/agents/r/one.pid')).toBe('1001\n')
    expect(await box.state.read('ki/agents/r/one.launch.json')).toBe(
      `{"runtime":"claude","workdir":"${await realpath(box.project.path)}"}\n`
    )
    const [launch] = processes.launches as [AgentLaunch]
    expect(launch.command).toBe('claude')
    expect(launch.arguments).toEqual([
      '-p',
      prompt,
      '--permission-mode',
      'bypassPermissions',
      '--add-dir',
      `${box.state.path}/ki/agents/r`,
      '--add-dir',
      `${await realpath(box.project.path)}/extra`
    ])
    expect(launch.workingDirectory).toBe(await realpath(box.project.path))
    expect(launch.environment['CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS']).toBe('0')
    expect(launch.environment['KI_AGENT_RUN']).toBe('r')
    expect(launch.log).toBe(runPath(box, 'one.log'))

    const again = await box.run('ki agent launch r one . task.md', { now })
    expect(again.exitCode).toBe(1)
    expect(again.stderr).toBe('ki: error: r/one is already running (pid 1001)\n')
  })

  test('detaches the Codex adapter with the none footer by default', async () => {
    const box = await sandbox()
    await setupDelegation(box)
    const processes = fakeProcesses(box)
    await box.project.write('task.md', '# Task: do it\n')

    expect((await box.run('ki agent launch r one . task.md --runtime codex', { now })).exitCode).toBe(0)

    const prompt = await box.state.read('ki/agents/r/one.prompt.md')
    expect(prompt).toContain('- Tier none rule.')
    expect(prompt).not.toContain('Wait gate.')
    expect(prompt).toContain("(time from: date '+%H:%M %Z')")
    const [launch] = processes.launches as [AgentLaunch]
    expect(launch.command).toBe('codex')
    expect(launch.arguments).toEqual([
      'exec',
      '--dangerously-bypass-approvals-and-sandbox',
      '--skip-git-repo-check',
      '--cd',
      await realpath(box.project.path),
      '--add-dir',
      `${box.state.path}/ki/agents/r`,
      prompt
    ])
    expect(launch.environment['CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS']).toBeUndefined()
    expect(launch.environment['KI_AGENT_RUN']).toBe('r')
  })

  test.each([
    [
      'claude',
      'claude-fable-5-1',
      ['--model', 'claude-fable-5-1', '--effort', 'xhigh'],
      (prompt: string) => ['-p', prompt, '--permission-mode', 'bypassPermissions']
    ],
    [
      'codex',
      'gpt-6-astra',
      ['-m', 'gpt-6-astra', '-c', 'model_reasoning_effort=xhigh'],
      (_prompt: string) => ['exec', '--dangerously-bypass-approvals-and-sandbox', '--skip-git-repo-check']
    ]
  ])('passes the model and effort to the %s adapter in its own form', async (runtime, model, form, leading) => {
    const box = await sandbox()
    await setupDelegation(box)
    const processes = fakeProcesses(box)
    await box.project.write('task.md', '# Task: do it\n')

    const result = await box.run(
      `ki agent launch r one . task.md --runtime ${runtime} --model ${model} --effort xhigh`,
      {
        now
      }
    )

    expect(result.exitCode).toBe(0)
    const prompt = await box.state.read('ki/agents/r/one.prompt.md')
    const [launch] = processes.launches as [AgentLaunch]
    expect(launch.arguments.slice(0, leading(prompt).length)).toEqual(leading(prompt))
    const at = launch.arguments.indexOf(form[0] as string)
    expect(launch.arguments.slice(at, at + 4)).toEqual(form)
    if (runtime === 'codex') expect(launch.arguments.at(-1)).toBe(prompt)
    expect(JSON.parse(await box.state.read('ki/agents/r/one.launch.json'))).toEqual({
      runtime,
      model,
      effort: 'xhigh',
      workdir: await realpath(box.project.path)
    })
  })

  test.each([
    ['ki agent launch r one . task.md --model=', 2, 'a model needs a name'],
    ['ki agent launch r/x one . task.md', 2, "invalid run: 'r/x'"],
    ['ki agent launch r o.ne . task.md', 2, "invalid name: 'o.ne'"],
    ['ki agent launch r one . task.md --wait-for a.b', 2, "invalid wait-for name: 'a.b'"],
    ['ki agent launch r one . task.md --wait-for one', 2, 'one cannot wait for itself'],
    ['ki agent launch r one missing task.md', 2, 'no such workdir: missing'],
    ['ki agent launch r one . task.md --add-dir missing', 2, 'no such directory: missing'],
    ['ki agent launch r one . absent.md', 2, 'no such prompt file: absent.md']
  ])('rejects %s', async (command, exitCode, message) => {
    const box = await sandbox()
    await setupDelegation(box)
    fakeProcesses(box)
    await box.project.write('task.md', '# Task\n')
    const result = await box.run(command, { now })
    expect(result.exitCode).toBe(exitCode)
    expect(result.stderr).toBe(`ki: error: ${message}\n`)
  })

  test('rejects an effort outside the shared set', async () => {
    const box = await sandbox()
    fakeProcesses(box)
    const result = await box.run('ki agent launch r one . task.md --effort extreme', { now })
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain(
      "error: option '--effort <level>' argument 'extreme' is invalid. Allowed choices are low, medium, high, xhigh, max."
    )
  })

  test('requires the pinned harness to ship well-formed run assets and a valid TZ', async () => {
    const box = await sandbox()
    await setupRepository(box)
    fakeProcesses(box)
    await box.project.write('task.md', '# Task\n')

    const missing = await box.run('ki agent launch r one . task.md', { now })
    expect(missing.exitCode).toBe(1)
    expect(missing.stderr).toContain('the pinned harness does not ship the ki-delegation run assets')

    await setupDelegation(box)
    await box.data.write(`${assets}/rules-none.md`, '# Broken footer\n')
    const broken = await box.run('ki agent launch r one . task.md', { now })
    expect(broken.exitCode).toBe(1)
    expect(broken.stderr).toBe("ki: error: the ki-delegation footer for 'none' has no '## Rules' section\n")

    await rm(`${box.data.path}/${assets}/rules-prune.md`)
    const absent = await box.run('ki agent launch r one . task.md --rules prune', { now })
    expect(absent.stderr).toBe("ki: error: the ki-delegation footer for 'prune' has no '## Rules' section\n")

    box.setEnv({ TZ: 'Nowhere/Never' })
    const zone = await box.run('ki agent launch r one . task.md --rules push', { now })
    expect(zone.exitCode).toBe(2)
    expect(zone.stderr).toBe("ki: error: invalid TZ: 'Nowhere/Never'\n")
  })
})

describe('ki agent launch --wait-for', () => {
  const runDirectory = (box: Sandbox): string => `${box.state.path}/ki/agents/r`

  test('starts the runtime at once when every gate is already DONE', async () => {
    const box = await sandbox()
    await setupDelegation(box)
    const processes = fakeProcesses(box)
    await box.project.write('task.md', '# Task\n')
    await box.state.write('ki/agents/r/zero.status', '21:00 CEST - reported\nDONE\n')

    const result = await box.run('ki agent launch r one . task.md --wait-for zero', { now })
    expect(result.stdout).toBe(`launched r/one (pid 1001) in ${runDirectory(box)}\n`)
    expect((processes.launches[0] as AgentLaunch).command).toBe('claude')
  })

  test('holds the agent in a detached process until every gate is DONE, then starts the runtime', async () => {
    const box = await sandbox()
    box.setEnv({ TZ: 'UTC' })
    await setupDelegation(box)
    const processes = fakeProcesses(box)
    await box.project.write('task.md', '# Task: do it\n')
    await box.project.mkdir('extra')
    await box.state.write('ki/agents/r/zero.status', 'DONE\n')
    processes.alive.add(7)
    await box.state.write('ki/agents/r/first.pid', '7\n')
    await box.state.write('ki/agents/r/first.status', '19:00 UTC - building\n')

    const result = await box.run(
      'ki agent launch r one . task.md --runtime codex --rules push --add-dir extra --wait-for zero --wait-for first --wait-for later --model gpt-6-astra --effort high',
      { now }
    )

    expect(result.stdout).toBe(`held r/one until first, later finish (pid 1001) in ${runDirectory(box)}\n`)
    const prompt = await box.state.read('ki/agents/r/one.prompt.md')
    expect(prompt).toContain('- Tier push rule.')
    expect(prompt).not.toContain('Wait gate.')
    expect(await box.state.read('ki/agents/r/one.status')).toBe('19:30 UTC - held until first, later finish\n')
    expect(await box.state.read('ki/agents/r/one.pid')).toBe('1001\n')
    const [hold] = processes.launches as [AgentLaunch]
    const project = await realpath(box.project.path)
    expect(hold.command).toBe(box.executable)
    expect(hold.arguments).toEqual([
      'agent',
      'launch',
      'r',
      'one',
      project,
      runPath(box, 'one.prompt.md'),
      '--runtime',
      'codex',
      '--add-dir',
      `${project}/extra`,
      '--wait-for',
      'zero',
      '--wait-for',
      'first',
      '--wait-for',
      'later',
      '--model',
      'gpt-6-astra',
      '--effort',
      'high',
      '--foreground'
    ])
    expect(hold.workingDirectory).toBe(runDirectory(box))
    expect(hold.log).toBe(runPath(box, 'one.log'))
    expect((await box.run('ki agent status r', { now })).stdout).toContain(
      'one: 19:30 UTC - held until first, later finish\n'
    )

    const intervals: number[] = []
    const launches: AgentLaunch[] = []
    box.setAgentProcesses({
      launch: async (launch) => {
        launches.push(launch)
        return 2001
      },
      alive: () => true,
      sleep: async (milliseconds) => {
        intervals.push(milliseconds)
        if (intervals.length === 1) await box.state.write('ki/agents/r/first.status', 'DONE\n')
        if (intervals.length === 2) {
          expect(await box.state.read('ki/agents/r/one.status')).toBe('19:30 UTC - held until later finish\n')
          await box.state.write('ki/agents/r/later.status', 'DONE\n')
        }
      }
    })
    const held = await box.run(['ki', ...hold.arguments], { now })

    expect(held.stdout).toBe('19:30 UTC launched r/one (pid 2001)\n')
    expect(intervals).toEqual([30_000, 30_000])
    const [launch] = launches as [AgentLaunch]
    expect(launch.command).toBe('codex')
    expect(launch.arguments.at(-1)).toBe(prompt)
    expect(launch.arguments).toContain(`${project}/extra`)
    expect(launch.arguments.slice(-5, -1)).toEqual(['-m', 'gpt-6-astra', '-c', 'model_reasoning_effort=high'])
    expect(launch.log).toBe(runPath(box, 'one.log'))
    expect(await box.state.read('ki/agents/r/one.status')).toBe('19:30 UTC - launched\n')
    expect(await box.state.read('ki/agents/r/one.pid')).toBe('2001\n')
  })

  test('refuses a gate that cannot open and ends a held agent when its gate closes', async () => {
    const box = await sandbox()
    box.setEnv({ TZ: 'UTC' })
    await setupDelegation(box)
    const processes = fakeProcesses(box)
    await box.project.write('task.md', '# Task\n')
    await box.state.write('ki/agents/r/gone.pid', '5\n')
    await box.state.write('ki/agents/r/gone.status', '19:10 UTC - halfway\n')

    const closed = await box.run('ki agent launch r one . task.md --wait-for gone', { now })
    expect(closed.exitCode).toBe(1)
    expect(closed.stderr).toBe('ki: error: r/one gate cannot open: gone exited without DONE\n')
    expect(processes.launches).toHaveLength(0)

    processes.alive.add(6)
    await box.state.write('ki/agents/r/slow.pid', '6\n')
    const held = await box.run('ki agent launch r one . task.md --wait-for slow', { now })
    expect(held.stdout).toContain('held r/one until slow finish (pid 1001)')

    const holder = fakeProcesses(box)
    const ended = await box.run(['ki', ...(processes.launches[0] as AgentLaunch).arguments], { now })
    expect(ended.stdout).toBe('19:30 UTC - gate cannot open: slow exited without DONE\n')
    expect(holder.launches).toHaveLength(0)
    expect((await box.run('ki agent status r', { now })).stdout).toContain(
      'one: EXITED WITHOUT DONE (19:30 UTC - gate cannot open: slow exited without DONE)\n'
    )
  })
})

describe('ki agent status and watch', () => {
  const setupRun = async (box: Sandbox) => {
    const processes = fakeProcesses(box)
    processes.alive.add(11)
    processes.alive.add(12)
    processes.alive.add(99)
    await box.state.write('ki/agents/r/a.pid', '10\n')
    await box.state.write('ki/agents/r/a.status', '21:00 CEST - final check\nDONE\n')
    await box.state.write('ki/agents/r/b.pid', '11\n')
    await box.state.write('ki/agents/r/b.status', 'DONE\n')
    await box.state.write('ki/agents/r/c.pid', '12\n')
    await box.state.write('ki/agents/r/c.status', '21:05 CEST - testing\n')
    await box.state.write('ki/agents/r/d.pid', '12\n')
    await box.state.write('ki/agents/r/e.pid', 'none\n')
    await box.state.write('ki/agents/r/e.status', '21:01 CEST - halfway\n')
    await box.state.write('ki/agents/r/f.pid', '13\n')
    return processes
  }

  test('reports finished, running and exited agents and the queue', async () => {
    const box = await sandbox()
    await setupRun(box)
    await box.state.write('ki/agents/r/queue.jsonl', '{"name":"g"}\n{"name":"h"}\n')

    const result = await box.run('ki agent status r', { now })
    expect(result.stdout).toBe(
      [
        'a: finished',
        'b: finished',
        'c: 21:05 CEST - testing',
        'd: no status yet',
        'e: EXITED WITHOUT DONE (21:01 CEST - halfway)',
        'f: EXITED WITHOUT DONE (no status)',
        'queued: g, h (no dispatcher)',
        ''
      ].join('\n')
    )

    await box.state.write('ki/agents/r/dispatch.pid', '99\n')
    expect((await box.run('ki agent status r', { now })).stdout).toContain('queued: g, h (dispatcher running)\n')
  })

  test('rejects an unknown run', async () => {
    const box = await sandbox()
    const result = await box.run('ki agent status nothing', { now, agentProcesses: 'default' })
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toBe('ki: error: no such run: nothing\n')
  })

  test('watches until every agent stops and ends ALL FINISHED', async () => {
    const box = await sandbox()
    box.setEnv({ TZ: 'UTC' })
    const processes = await setupRun(box)
    const original = processes.alive
    box.setAgentProcesses({
      launch: async () => 0,
      alive: (pid) => original.has(pid),
      sleep: async (milliseconds) => {
        expect(milliseconds).toBe(5000)
        original.clear()
      }
    })

    const result = await box.run('ki agent watch r 5', { now })
    const lines = result.stdout.trimEnd().split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe(
      '19:30 UTC | a: finished | b: finished | c: 21:05 CEST - testing | d: no status yet | e: EXITED WITHOUT DONE (21:01 CEST - halfway) | f: EXITED WITHOUT DONE (no status)'
    )
    expect(lines[1]).toContain('c: EXITED WITHOUT DONE (21:05 CEST - testing)')
    expect(lines[1]).toMatch(/\| ALL FINISHED$/)

    const invalid = await box.run('ki agent watch r 0', { now })
    expect(invalid.exitCode).toBe(2)
    expect(invalid.stderr).toBe("ki: error: expected a positive whole number, got '0'\n")
  })
})

describe('ki agent new and decide', () => {
  test('writes a prompt skeleton once', async () => {
    const box = await sandbox()
    await setupDelegation(box)

    const result = await box.run('ki agent new r one', { now })
    expect(result.stdout).toBe(`${runPath(box, 'one.draft.md')}\n`)
    expect(await box.state.read('ki/agents/r/one.draft.md')).toBe(
      '# Task: <one-line outcome>\n\n<Owner> approved this; see Decision <N> in `+/_THREADS/r/decisions.md`. Report to +/_THREADS/r/one.report.md.\n'
    )
    expect(await box.state.read('ki/agents/r/thread.json')).toContain(await realpath(box.project.path))

    const again = await box.run('ki agent new r one', { now })
    expect(again.exitCode).toBe(1)
    expect(again.stderr).toBe(`ki: error: prompt draft already exists: ${runPath(box, 'one.draft.md')}\n`)
  })

  test('numbers and timestamps each decision in the tracked thread log', async () => {
    const box = await sandbox()
    await setupRepository(box)
    box.setEnv({ TZ: 'Pacific/Kiritimati' })

    expect((await box.run('ki agent decide r Ship the launcher.', { now })).stdout).toBe(
      `Decision 1 recorded in ${await threadPath(box, 'decisions.md')}\n`
    )
    await box.run('ki agent decide r Release it. --home docs/roadmap/KI-TOOL-KI-CLI-124-agent-run-close.md', { now })
    expect(await box.project.read('+/_THREADS/r/decisions.md')).toBe(
      [
        '# Decisions',
        '',
        '## Decision 1 (2026-10-07T19:30:00Z)',
        '',
        '- Ship the launcher.',
        '',
        '## Decision 2 (2026-10-07T19:30:00Z)',
        '',
        'home: docs/roadmap/KI-TOOL-KI-CLI-124-agent-run-close.md',
        '',
        '- Release it.',
        ''
      ].join('\n')
    )
    expect(await box.state.read('ki/agents/r/thread.json')).toContain('"folder":"+/_THREADS/r"')

    await box.project.write('log.md', '# Log\n\n## Decision 18 (2026-10-07)\n\n- Earlier.\n')
    expect((await box.run('ki agent decide r Later. --log log.md', { now })).stdout).toBe(
      `Decision 19 recorded in ${await realpath(box.project.path)}/log.md\n`
    )
    expect(await box.project.read('log.md')).toContain('## Decision 19 (2026-10-07T19:30:00Z)\n\n- Later.\n')

    const empty = await box.run(['ki', 'agent', 'decide', 'r', ' '], { now })
    expect(empty.exitCode).toBe(2)
    expect(empty.stderr).toBe('ki: error: a decision needs text\n')
    const blank = await box.run(['ki', 'agent', 'decide', 'r', 'Text.', '--home', ' '], { now })
    expect(blank.exitCode).toBe(2)
    expect(blank.stderr).toBe('ki: error: a home needs a path or identifier\n')
  })
})

describe('ki agent thread home', () => {
  test('refuses to start a run outside a Git repository and fixes the home on first use', async () => {
    const box = await sandbox()
    box.setRunner(runCommand)
    const outside = await box.run('ki agent decide r Text.', { now })
    expect(outside.exitCode).toBe(2)
    expect(outside.stderr).toBe(
      'ki: error: the working directory is not inside a Git repository; run from the owning repository or pass --repo <dir>\n'
    )
    expect(await box.run('ki agent reconcile r 1 docs/x.md', { now })).toMatchObject({
      exitCode: 1,
      stderr: 'ki: error: r has no thread home yet; record a decision first\n'
    })

    await box.root.git(['init', '-q'], 'owner')
    const owner = await realpath(`${box.root.path}/owner`)
    const missing = await box.run('ki agent decide r Text. --repo nowhere', { now })
    expect(missing.exitCode).toBe(2)
    expect(missing.stderr).toBe('ki: error: no Git repository at nowhere\n')
    expect((await box.run(`ki agent decide r Text. --repo ${owner}`, { now })).stdout).toBe(
      `Decision 1 recorded in ${owner}/+/_THREADS/r/decisions.md\n`
    )
    expect(await box.state.read('ki/agents/r/thread.json')).toBe(
      `${JSON.stringify({ repository: owner, folder: '+/_THREADS/r' })}\n`
    )

    // Once fixed, the home holds without --repo, and a disagreeing --repo is refused.
    expect((await box.run('ki agent decide r Again.', { now })).stdout).toBe(
      `Decision 2 recorded in ${owner}/+/_THREADS/r/decisions.md\n`
    )
    expect((await box.run(`ki agent decide r Agreed. --repo ${owner}`, { now })).exitCode).toBe(0)
    await setupRepository(box)
    const mismatch = await box.run('ki agent decide r Text. --repo .', { now })
    expect(mismatch.exitCode).toBe(2)
    expect(mismatch.stderr).toBe(`ki: error: r belongs to ${owner}, not ${await realpath(box.project.path)}\n`)
  })

  test('adds the owning repository to a launch from elsewhere and rejects a broken thread file', async () => {
    const box = await sandbox()
    await setupDelegation(box)
    const processes = fakeProcesses(box)
    const project = await realpath(box.project.path)
    await box.root.mkdir('elsewhere')
    await box.root.write('elsewhere/task.md', '# Task\n')
    const result = await box.run(
      `ki agent launch r one ${box.root.path}/elsewhere ${box.root.path}/elsewhere/task.md --repo .`,
      { now }
    )
    expect(result.exitCode).toBe(0)
    const [launch] = processes.launches as [AgentLaunch]
    expect(launch.arguments.slice(-4)).toEqual(['--add-dir', runDir(box), '--add-dir', project])
    expect(JSON.parse(await box.state.read('ki/agents/r/queue.jsonl').catch(() => '{}'))).toEqual({})

    // A queued launch carries no --repo of its own: the recorded home serves the dispatcher.
    await box.run(
      `ki agent queue r two ${box.root.path}/elsewhere/task.md --add-dir . --workdir ${box.root.path}/elsewhere`,
      { now }
    )
    const [queued] = (await box.state.read('ki/agents/r/queue.jsonl')).split('\n')
    expect(JSON.parse(queued as string)).toMatchObject({ addDirs: [project] })
    expect(Object.keys(JSON.parse(queued as string))).not.toContain('repo')

    await box.state.write('ki/agents/r/thread.json', '{not json')
    const invalid = await box.run('ki agent decide r Text.', { now })
    expect(invalid.exitCode).toBe(1)
    expect(invalid.stderr).toBe(`ki: error: ${runPath(box, 'thread.json')} is not valid JSON\n`)
    await box.state.write('ki/agents/r/thread.json', '{"repository":1}\n')
    const shape = await box.run('ki agent decide r Text.', { now })
    expect(shape.stderr).toBe(`ki: error: ${runPath(box, 'thread.json')} does not name a repository and folder\n`)
  })

  test('keeps the recorded home whatever the current directory', async () => {
    const box = await sandbox()
    await setupDelegation(box)
    const processes = fakeProcesses(box)
    const owner = await realpath(box.project.path)
    await box.project.write('task.md', '# Task\n')
    expect((await box.run('ki agent decide r First.', { now })).stdout).toBe(
      `Decision 1 recorded in ${owner}/+/_THREADS/r/decisions.md\n`
    )

    // From another checkout, every later command still works in the recorded home.
    await box.root.git(['init', '-q'], 'other')
    box.cd('../other')
    expect((await box.run('ki agent decide r Second.', { now })).stdout).toBe(
      `Decision 2 recorded in ${owner}/+/_THREADS/r/decisions.md\n`
    )
    expect(await box.state.read('ki/agents/r/one.draft.md').catch(() => 'absent')).toBe('absent')
    await box.run('ki agent new r one', { now })
    expect(await box.state.read('ki/agents/r/one.draft.md')).toContain('Report to +/_THREADS/r/one.report.md.')
    const launched = await box.run(`ki agent launch r one . ${owner}/task.md`, { now })
    expect(launched.exitCode).toBe(0)
    expect(await box.state.read('ki/agents/r/one.prompt.md')).toContain(
      `write your report to ${owner}/+/_THREADS/r/one.report.md as the owner report`
    )
    const [launch] = processes.launches as [AgentLaunch]
    expect(launch.arguments.slice(-2)).toEqual(['--add-dir', owner])
    expect(await box.state.read('ki/agents/r/thread.json')).toBe(
      `${JSON.stringify({ repository: owner, folder: '+/_THREADS/r' })}\n`
    )
  })

  test("fixes a new home only from the launch's working directory unless --repo says otherwise", async () => {
    const box = await sandbox()
    await setupDelegation(box)
    fakeProcesses(box)
    const current = await realpath(box.project.path)
    await box.root.git(['init', '-q'], 'other')
    const other = await realpath(`${box.root.path}/other`)
    await box.root.mkdir('plain')
    await box.project.write('task.md', '# Task\n')
    const refuse = (run: string, root: string): string =>
      `ki: error: ${run} has no thread home yet; the current directory is in ${current}, not the launch's working directory ${root}; run from there or pass --repo <dir>\n`

    // A launch into another checkout, or a directory outside Git, does not take its home from here.
    const elsewhere = await box.run(`ki agent launch r one ${other} task.md`, { now })
    expect(elsewhere.exitCode).toBe(2)
    expect(elsewhere.stderr).toBe(refuse('r', other))
    const plain = await box.run(`ki agent queue r one task.md --workdir ${box.root.path}/plain`, { now })
    expect(plain.exitCode).toBe(2)
    expect(plain.stderr).toBe(refuse('r', `${box.root.path}/plain`))
    expect(await box.state.read('ki/agents/r/thread.json').catch(() => 'absent')).toBe('absent')
    expect((await box.run(`ki agent launch r one ${other} task.md --repo .`, { now })).exitCode).toBe(0)
    expect(await box.state.read('ki/agents/r/thread.json')).toBe(
      `${JSON.stringify({ repository: current, folder: '+/_THREADS/r' })}\n`
    )

    // A later command on a run launched elsewhere compares against the recorded launch.
    await box.state.write('ki/agents/s/a.launch.json', `${JSON.stringify({ runtime: 'claude', workdir: other })}\n`)
    const later = await box.run('ki agent decide s Text.', { now })
    expect(later.exitCode).toBe(2)
    expect(later.stderr).toBe(refuse('s', other))
    expect((await box.run(`ki agent decide s Text. --repo ${other}`, { now })).stdout).toBe(
      `Decision 1 recorded in ${other}/+/_THREADS/s/decisions.md\n`
    )

    // Launches that ran in several repositories, or predate the record, need --repo.
    await box.state.write('ki/agents/t/a.launch.json', `${JSON.stringify({ runtime: 'claude', workdir: other })}\n`)
    await box.state.write('ki/agents/t/b.launch.json', `${JSON.stringify({ runtime: 'claude', workdir: current })}\n`)
    const several = await box.run('ki agent new t c', { now })
    expect(several.exitCode).toBe(2)
    expect(several.stderr).toBe(
      `ki: error: t has no thread home yet and its launches ran in ${other}, ${current}; pass --repo <dir>\n`
    )
    await box.state.write('ki/agents/u/a.launch.json', '{"runtime":"claude"}\n')
    await box.state.write('ki/agents/u/b.launch.json', '{not json')
    const unrecorded = await box.run('ki agent decide u Text.', { now })
    expect(unrecorded.exitCode).toBe(2)
    expect(unrecorded.stderr).toBe(
      'ki: error: u has no thread home yet and a launch of it has no recorded working directory; pass --repo <dir>\n'
    )
    expect((await box.run('ki agent decide u Text. --repo .', { now })).exitCode).toBe(0)
  })
})

describe('ki agent reconcile', () => {
  test('writes or replaces one decision home in the tracked log', async () => {
    const box = await sandbox()
    await setupRepository(box)
    await box.run('ki agent decide r First.', { now })
    await box.run('ki agent decide r Second. --home old/path.md', { now })
    await box.run('ki agent decide r Third.', { now })

    expect((await box.run('ki agent reconcile r 1 KI-TOOL-KI-CLI-124', { now })).stdout).toBe(
      `Decision 1 home KI-TOOL-KI-CLI-124 recorded in ${await threadPath(box, 'decisions.md')}\n`
    )
    expect((await box.run('ki agent reconcile r 2 new/path.md', { now })).exitCode).toBe(0)
    expect(await box.project.read('+/_THREADS/r/decisions.md')).toBe(
      [
        '# Decisions',
        '',
        '## Decision 1 (2026-10-07T19:30:00Z)',
        '',
        'home: KI-TOOL-KI-CLI-124',
        '',
        '- First.',
        '',
        '## Decision 2 (2026-10-07T19:30:00Z)',
        '',
        'home: new/path.md',
        '',
        '- Second.',
        '',
        '## Decision 3 (2026-10-07T19:30:00Z)',
        '',
        '- Third.',
        ''
      ].join('\n')
    )

    const absent = await box.run('ki agent reconcile r 9 x.md', { now })
    expect(absent.exitCode).toBe(1)
    expect(absent.stderr).toBe(`ki: error: no Decision 9 in ${await threadPath(box, 'decisions.md')}\n`)
    expect((await box.run(['ki', 'agent', 'reconcile', 'r', '1', ' '], { now })).stderr).toBe(
      'ki: error: a home needs a path or identifier\n'
    )
    expect((await box.run('ki agent reconcile r x x.md', { now })).stderr).toBe(
      "ki: error: expected a positive whole number, got 'x'\n"
    )
    await rm(await threadPath(box, 'decisions.md'))
    expect((await box.run('ki agent reconcile r 1 x.md', { now })).stderr).toBe(
      `ki: error: no decisions log at ${await threadPath(box, 'decisions.md')}\n`
    )
  })
})

describe('ki agent decide on a run that predates the tracked home', () => {
  test('moves the state-folder log and reports into the thread folder and continues numbering', async () => {
    const box = await sandbox()
    await setupRepository(box)
    await box.state.write('ki/agents/r/decisions.md', '# Decisions\n\n## Decision 4 (2026-10-01)\n\n- Old.\n')
    await box.state.write('ki/agents/r/b.report.md', '# B\n')
    await box.state.write('ki/agents/r/a.report.md', '# A\n')
    await box.state.write('ki/agents/r/a.status', 'DONE\n')

    expect((await box.run('ki agent decide r New.', { now })).stdout).toBe(
      [
        `Moved a.report.md, b.report.md, decisions.md from the state folder into ${dirname(await threadPath(box, 'decisions.md'))}`,
        `Decision 5 recorded in ${await threadPath(box, 'decisions.md')}`,
        ''
      ].join('\n')
    )
    expect(await box.project.read('+/_THREADS/r/decisions.md')).toContain('## Decision 4 (2026-10-01)\n\n- Old.\n')
    expect(await box.project.read('+/_THREADS/r/a.report.md')).toBe('# A\n')
    expect(await box.state.read('ki/agents/r/a.report.md').catch(() => 'absent')).toBe('absent')
    expect(await box.state.read('ki/agents/r/a.status')).toBe('DONE\n')

    // Nothing left to move: the next decision prints only its own line.
    expect((await box.run('ki agent decide r Next.', { now })).stdout).toBe(
      `Decision 6 recorded in ${await threadPath(box, 'decisions.md')}\n`
    )
  })
})

describe('ki agent close', () => {
  /** A finished run whose only decision is housed in a committed file. */
  const setupFinishedRun = async (box: Sandbox) => {
    const project = await setupRepository(box)
    const processes = fakeProcesses(box)
    await box.state.write('ki/agents/r/a.pid', '10\n')
    await box.state.write('ki/agents/r/a.status', '21:00 CEST - final check\nDONE\n')
    await box.project.write('docs/x.md', '# X\n')
    await box.run('ki agent decide r Ship it. --home docs/x.md', { now })
    await box.project.git(['add', '--all'])
    await box.project.git(['commit', '-q', '-m', 'thread'])
    return { project, processes }
  }
  const archive = (box: Sandbox, file: string): string => `${box.state.path}/ki/agents/_archive/${file}`

  test('reports every blocker and changes nothing', async () => {
    const box = await sandbox()
    const { processes } = await setupFinishedRun(box)
    processes.alive.add(12)
    await box.state.write('ki/agents/r/b.pid', '11\n')
    await box.state.write('ki/agents/r/b.status', '21:05 CEST - testing\n')
    await box.state.write('ki/agents/r/c.pid', '12\n')
    await box.state.write('ki/agents/r/dispatch.pid', '12\n')
    await box.state.write('ki/agents/r/queue.jsonl', '{"name":"d"}\n{"name":"e"}\n')
    await box.state.mkdir('ki/agents/r/worktrees/d')
    await box.run('ki agent decide r Unhoused.', { now })
    await box.run('ki agent decide r Missing. --home docs/missing.md', { now })
    await box.project.write('docs/untracked.md', '# U\n')
    await box.run('ki agent decide r Untracked. --home docs/untracked.md#section', { now })
    await box.run('ki agent decide r Unknown. --home KI-NOPE-1', { now })
    await box.run(`ki agent decide r Absolute. --home ${await realpath(box.project.path)}/docs/x.md`, { now })
    await box.project.write(
      '+/_THREADS/r/decisions.md',
      `${await box.project.read('+/_THREADS/r/decisions.md')}\n## Notes\n\nNot a decision.\n`
    )

    const result = await box.run('ki agent close r', { now })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toBe(
      [
        'ok: a finished',
        'blocker: b exited without DONE',
        'blocker: c still running (pid 12)',
        'blocker: dispatcher still running (pid 12)',
        'blocker: queue holds d, e',
        'blocker: worktrees/ holds d',
        'ok: decision 1 home docs/x.md',
        `blocker: decision 2 has no home (${await threadPath(box, 'decisions.md')})`,
        'blocker: decision 3 home docs/missing.md does not exist',
        'blocker: decision 4 home docs/untracked.md#section is not tracked by Git',
        'blocker: decision 5 home KI-NOPE-1 matches no roadmap record in the registry',
        `ok: decision 6 home ${await realpath(box.project.path)}/docs/x.md`,
        'blocker: thread folder +/_THREADS/r has uncommitted changes',
        ''
      ].join('\n')
    )
    expect(result.stderr).toBe('ki: error: r cannot close until every blocker clears\n')
    expect(await box.state.read('ki/agents/r/a.pid')).toBe('10\n')

    const unknown = await box.run('ki agent close r --accept-exited zzz', { now })
    expect(unknown.exitCode).toBe(2)
    expect(unknown.stderr).toBe('ki: error: no agent zzz in r\n')
    const both = await box.run('ki agent close r --delete --compress', { now })
    expect(both.exitCode).toBe(2)
    expect(both.stderr).toBe('ki: error: --delete and --compress exclude each other\n')
    expect((await box.run('ki agent close nope', { now })).stderr).toBe('ki: error: no such run: nope\n')
  })

  test('archives the state folder once the gate passes and writes the close note', async () => {
    const box = await sandbox()
    const { project } = await setupFinishedRun(box)
    await box.state.write('ki/agents/r/b.pid', '11\n')
    await box.state.write('ki/agents/r/b.status', '21:05 CEST - testing\n')
    await box.state.mkdir('ki/agents/r/worktrees')

    const result = await box.run('ki agent close r --accept-exited b', { now })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe(
      [
        'ok: a finished',
        'ok: b exited without DONE, accepted',
        'ok: no dispatcher running',
        'ok: queue empty',
        'ok: no worktrees',
        'ok: decision 1 home docs/x.md',
        'ok: thread folder +/_THREADS/r committed and clean',
        `archived ${runDir(box)} to ${archive(box, 'r')}; close note at ${archive(box, 'r/close.md')}`,
        ''
      ].join('\n')
    )
    expect(await box.state.read('ki/agents/_archive/r/a.status')).toBe('21:00 CEST - final check\nDONE\n')
    expect(await box.state.read('ki/agents/_archive/r/close.md')).toBe(
      [
        '# Close of run r',
        '',
        `Closed 2026-10-07T19:30:00Z by \`ki agent close\`. archived ${runDir(box)} to ${archive(box, 'r')}.`,
        '',
        '## Gate',
        '',
        '- ok: a finished',
        '- ok: b exited without DONE, accepted',
        '- ok: no dispatcher running',
        '- ok: queue empty',
        '- ok: no worktrees',
        '- ok: decision 1 home docs/x.md',
        '- ok: thread folder +/_THREADS/r committed and clean',
        '',
        '## Decisions',
        '',
        '- Decision 1: docs/x.md',
        ''
      ].join('\n')
    )
    expect(await box.project.read('+/_THREADS/r/decisions.md')).toContain('- Ship it.')
    expect((await box.run('ki agent close r', { now })).stderr).toBe('ki: error: no such run: r\n')

    await box.state.write('ki/agents/r/a.pid', '10\n')
    await box.state.write('ki/agents/r/a.status', 'DONE\n')
    await box.state.write(
      'ki/agents/r/thread.json',
      `${JSON.stringify({ repository: project, folder: '+/_THREADS/r' })}\n`
    )
    const again = await box.run('ki agent close r', { now })
    expect(again.exitCode).toBe(1)
    expect(again.stderr).toBe(`ki: error: r is already archived at ${archive(box, 'r')}\n`)
  })

  test('compresses or deletes on request, waives the decision gate with --reconciled', async () => {
    const box = await sandbox()
    await setupFinishedRun(box)
    await box.run('ki agent decide r Unhoused.', { now })
    await box.project.git(['add', '--all'])
    await box.project.git(['commit', '-q', '-m', 'more'])

    box.setRunner((command, arguments_, environment) =>
      command === 'tar'
        ? Promise.resolve({ exitCode: 1, output: 'tar: boom\n' })
        : runCommand(command, arguments_, environment)
    )
    const broken = await box.run('ki agent close r --compress --reconciled', { now })
    expect(broken.exitCode).toBe(1)
    expect(broken.stderr).toBe('ki: error: tar failed: tar: boom\n')
    expect(await box.state.read('ki/agents/r/a.status')).toContain('DONE')
    box.setRunner(runCommand)

    const compressed = await box.run('ki agent close r --compress --reconciled', { now })
    expect(compressed.exitCode).toBe(0)
    expect(compressed.stdout).toContain(
      `ok: decision gate waived by --reconciled (2 entries in ${await threadPath(box, 'decisions.md')})\n`
    )
    expect(compressed.stdout).toContain(
      `compressed ${runDir(box)} to ${archive(box, 'r.tar.gz')}; close note at ${archive(box, 'r.close.md')}\n`
    )
    const listing = await runCommand('tar', ['-tzf', archive(box, 'r.tar.gz')], {})
    expect(listing.output).toContain('r/a.status')
    expect(await box.state.read('ki/agents/_archive/r.close.md')).toContain(
      'with the decision gate waived by the owner (`--reconciled`). compressed'
    )
    expect(await box.state.read('ki/agents/_archive/r.close.md')).toContain(
      `The owner waived the decision gate with \`--reconciled\`; 2 entries in ${await threadPath(box, 'decisions.md')} were not checked.`
    )
    expect((await box.run('ki agent status r', { now })).stderr).toBe('ki: error: no such run: r\n')

    await box.state.write('ki/agents/r/a.pid', '10\n')
    await box.state.write('ki/agents/r/a.status', 'DONE\n')
    const repeat = await box.run('ki agent close r --compress --reconciled', { now })
    expect(repeat.stderr).toBe(`ki: error: r is already archived at ${archive(box, 'r.tar.gz')}\n`)

    const deleted = await box.run('ki agent close r --delete --reconciled', { now })
    expect(deleted.exitCode).toBe(0)
    expect(deleted.stdout).toContain(`deleted ${runDir(box)}; close note at ${archive(box, 'r.close.md')}\n`)
    expect(await box.state.read('ki/agents/_archive/r.close.md')).toContain('deleted')
    expect((await box.run('ki agent status r', { now })).stderr).toBe('ki: error: no such run: r\n')
  })

  test('houses a decision in any registered roadmap record and moves a legacy state-folder log and report', async () => {
    const box = await sandbox()
    const project = await setupRepository(box)
    fakeProcesses(box)
    await box.root.mkdir('island/Streams/Roadmap')
    await box.root.write('island/Streams/Roadmap/KI-ISLAND-GOV-7-thing.md', '# 7\n')
    await box.state.write(
      'ki/registry.toml',
      [
        'schema = 1',
        '',
        '[repositories."tools-ki"]',
        'repository = "https://github.com/knowledgeislands/tools-ki"',
        `path = ${JSON.stringify(project)}`,
        '',
        '[repositories."island"]',
        'repository = "https://github.com/knowledgeislands/island"',
        `path = ${JSON.stringify(`${box.root.path}/island`)}`,
        ''
      ].join('\n')
    )
    await box.state.write('ki/agents/r/a.pid', '10\n')
    await box.state.write('ki/agents/r/a.status', 'DONE\n')
    await box.state.write(
      'ki/agents/r/decisions.md',
      '# Decisions\n\n## Decision 1 (2026-10-01)\n\nhome: KI-ISLAND-GOV-7\n\n- Old.\n\n## Decision 2 (2026-10-01)\n\n- Older.\n'
    )

    await box.state.write('ki/agents/r/a.report.md', '# A\n')

    // No thread.json: the home comes from the working directory, and close moves the state
    // folder's log and report into the thread folder, which then needs committing.
    const legacy = await box.run('ki agent close r', { now })
    expect(legacy.exitCode).toBe(1)
    expect(legacy.stdout).toContain('ok: moved a.report.md from the state folder into +/_THREADS/r\n')
    expect(legacy.stdout).toContain('ok: moved decisions.md from the state folder into +/_THREADS/r\n')
    expect(legacy.stdout).toContain('ok: decision 1 home KI-ISLAND-GOV-7\n')
    expect(legacy.stdout).toContain(`blocker: decision 2 has no home (${await threadPath(box, 'decisions.md')})\n`)
    expect(legacy.stdout).toContain('blocker: thread folder +/_THREADS/r has uncommitted changes\n')
    expect(await box.project.read('+/_THREADS/r/a.report.md')).toBe('# A\n')
    expect(await box.state.read('ki/agents/r/decisions.md').catch(() => 'absent')).toBe('absent')
    expect(await box.state.read('ki/agents/r/thread.json').catch(() => 'absent')).toBe('absent')

    await box.project.write(
      '+/_THREADS/r/decisions.md',
      '# Decisions\n\n## Decision 1 (2026-10-01)\n\nhome: KI-ISLAND-GOV-7\n\n- Old.\n'
    )
    await box.project.git(['add', '--all'])
    await box.project.git(['commit', '-q', '-m', 'thread'])
    // A state-folder copy the thread folder already holds is superseded and left to archive.
    await box.state.write('ki/agents/r/a.report.md', '# Stale\n')
    const closed = await box.run('ki agent close r', { now })
    expect(closed.exitCode).toBe(0)
    expect(closed.stdout).not.toContain('moved')
    expect(closed.stdout).toContain('ok: thread folder +/_THREADS/r committed and clean\n')
    expect(await box.project.read('+/_THREADS/r/a.report.md')).toBe('# A\n')
    expect(await box.state.read('ki/agents/_archive/r/a.report.md')).toBe('# Stale\n')
    expect(await box.state.read('ki/agents/_archive/r/close.md')).toContain('- Decision 1: KI-ISLAND-GOV-7')
  })

  test('treats a run with no log as housed and surfaces a git status failure', async () => {
    const box = await sandbox()
    await setupRepository(box)
    fakeProcesses(box)
    await box.state.write('ki/agents/r/a.pid', '10\n')
    await box.state.write('ki/agents/r/a.status', 'DONE\n')
    const dirty = await box.run('ki agent close r', { now })
    expect(dirty.exitCode).toBe(0)
    expect(dirty.stdout).toContain('ok: no decisions log\n')
    expect(dirty.stdout).toContain('ok: no thread folder at +/_THREADS/r\n')
    expect(await box.state.read('ki/agents/_archive/r/close.md')).toContain('No decisions log.')

    await box.state.write('ki/agents/r/a.pid', '10\n')
    await box.state.write('ki/agents/r/a.status', 'DONE\n')
    await box.state.write(
      'ki/agents/r/thread.json',
      `${JSON.stringify({ repository: `${box.root.path}/nowhere`, folder: '+/_THREADS/r' })}\n`
    )
    await box.root.mkdir('nowhere/+/_THREADS/r')
    const failed = await box.run('ki agent close r --delete', { now })
    expect(failed.exitCode).toBe(1)
    expect(failed.stderr).toContain(`ki: error: git status failed in ${box.root.path}/nowhere: `)
    expect(await box.state.read('ki/agents/r/a.pid')).toBe('10\n')
  })
})

describe('ki agent queue, dispatch and wait', () => {
  test('queues ready-made prompts and refuses duplicates', async () => {
    const box = await sandbox()
    await setupDelegation(box)
    fakeProcesses(box)
    await box.project.write('task.md', '# Task\n')

    expect((await box.run('ki agent queue r one task.md --rules push --wait-for zero', { now })).stdout).toBe(
      'queued r/one at position 1\n'
    )
    expect((await box.run('ki agent queue r two task.md', { now })).stdout).toBe('queued r/two at position 2\n')
    await box.project.write('task.md', '# Changed\n')
    expect(await box.state.read('ki/agents/r/one.queued.md')).toBe('# Task\n')
    const [first] = (await box.state.read('ki/agents/r/queue.jsonl')).split('\n')
    expect(JSON.parse(first as string)).toEqual({
      run: 'r',
      name: 'one',
      workdir: await realpath(box.project.path),
      prompt: runPath(box, 'one.queued.md'),
      runtime: 'claude',
      addDirs: [],
      rules: 'push',
      waitFor: ['zero']
    })

    const duplicate = await box.run('ki agent queue r one task.md', { now })
    expect(duplicate.exitCode).toBe(1)
    expect(duplicate.stderr).toBe('ki: error: r/one is already queued or launched\n')
    await box.state.write('ki/agents/r/three.pid', '5\n')
    expect((await box.run('ki agent queue r three task.md', { now })).exitCode).toBe(1)
  })

  test('carries the model and effort through the queue to the launched runtime', async () => {
    const box = await sandbox()
    box.setEnv({ TZ: 'UTC' })
    await setupDelegation(box)
    const processes = fakeProcesses(box, async () => processes.finish())
    await box.project.write('task.md', '# Task\n')
    await box.run('ki agent queue r fable task.md --model claude-fable-5-1 --effort max', { now })
    await box.run('ki agent queue r plain task.md --runtime codex', { now })
    const [fable, plain] = (await box.state.read('ki/agents/r/queue.jsonl')).split('\n')
    expect(JSON.parse(fable as string)).toMatchObject({ name: 'fable', model: 'claude-fable-5-1', effort: 'max' })
    expect(Object.keys(JSON.parse(plain as string))).not.toContain('model')
    expect(Object.keys(JSON.parse(plain as string))).not.toContain('effort')

    expect((await box.run('ki agent dispatch r --max 2 --interval 1 --foreground', { now })).exitCode).toBe(0)

    const [first, second] = processes.launches as [AgentLaunch, AgentLaunch]
    expect(first.arguments.slice(-4)).toEqual(['--model', 'claude-fable-5-1', '--effort', 'max'])
    expect(second.arguments).not.toContain('-m')
    expect(second.arguments).not.toContain('-c')
    const workdir = await realpath(box.project.path)
    expect(await box.state.read('ki/agents/r/fable.launch.json')).toBe(
      `{"runtime":"claude","model":"claude-fable-5-1","effort":"max","workdir":"${workdir}"}\n`
    )
    expect(await box.state.read('ki/agents/r/plain.launch.json')).toBe(`{"runtime":"codex","workdir":"${workdir}"}\n`)
  })

  test('starts one detached dispatcher per run', async () => {
    const box = await sandbox()
    const processes = fakeProcesses(box)

    expect((await box.run('ki agent dispatch r --max 2', { now })).stderr).toBe('ki: error: no such run: r\n')
    await box.state.mkdir('ki/agents/r')
    const result = await box.run('ki agent dispatch r --max 2', { now })
    expect(result.stdout).toBe('dispatching r with up to 2 agents (pid 1001)\n')
    const [launch] = processes.launches as [AgentLaunch]
    expect(launch.command).toBe(box.executable)
    expect(launch.arguments).toEqual(['agent', 'dispatch', 'r', '--max', '2', '--interval', '30', '--foreground'])
    expect(launch.log).toBe(runPath(box, 'dispatch.log'))
    expect(await box.state.read('ki/agents/r/dispatch.pid')).toBe('1001\n')

    const again = await box.run('ki agent dispatch r --max 2', { now })
    expect(again.stderr).toBe('ki: error: the r dispatcher is already running (pid 1001)\n')
  })

  test('re-launches a local-mode ki through the runtime that runs its entry script', async () => {
    const box = await sandbox()
    const processes = fakeProcesses(box)
    await box.state.mkdir('ki/agents/r')
    await box.state.mkdir('ki/agents/s')

    await box.run('ki agent dispatch r --max 2', { now, installation: 'local', runtimeExecutable: '/opt/bun' })
    await box.run('ki agent dispatch s --max 2', { now, installation: 'local' })

    const [explicit, inherited] = processes.launches as [AgentLaunch, AgentLaunch]
    expect(explicit.command).toBe('/opt/bun')
    expect(explicit.arguments.slice(0, 3)).toEqual([box.executable, 'agent', 'dispatch'])
    expect(inherited.command).toBe(process.execPath)
    expect(inherited.arguments[0]).toBe(box.executable)
  })

  test('keeps up to the maximum running and launches the next as soon as one finishes', async () => {
    const box = await sandbox()
    box.setEnv({ TZ: 'UTC' })
    await setupDelegation(box)
    const processes = fakeProcesses(box, async () => processes.finish())
    await box.project.write('task.md', '# Task\n')
    for (const name of ['a', 'b', 'c']) await box.run(`ki agent queue r ${name} task.md`, { now })
    await box.root.write('gone/task.md', '# Task\n')
    await box.root.mkdir('gone/work')
    await box.run(`ki agent queue r d ${box.root.path}/gone/task.md --workdir ${box.root.path}/gone/work`, { now })
    await box.run('ki agent queue r e task.md', { now })
    await rm(`${box.root.path}/gone`, { recursive: true })

    const result = await box.run('ki agent dispatch r --max 2 --interval 1 --foreground', { now })

    expect(result.stdout).toBe(
      [
        '19:30 UTC launched a',
        '19:30 UTC launched b',
        '19:30 UTC launched c',
        `19:30 UTC could not launch d: no such workdir: ${box.root.path}/gone/work`,
        '19:30 UTC launched e',
        '19:30 UTC queue empty, all finished',
        ''
      ].join('\n')
    )
    expect(processes.launches.map((launch) => launch.log)).toEqual(
      ['a', 'b', 'c', 'e'].map((name) => runPath(box, `${name}.log`))
    )
    expect(processes.sleeps()).toBe(2)
    expect(await box.state.read('ki/agents/r/queue.jsonl')).toBe('')
  })

  test('launches each queued agent once its gate opens and drops gates that cannot open', async () => {
    const box = await sandbox()
    box.setEnv({ TZ: 'UTC' })
    await setupDelegation(box)
    const processes = fakeProcesses(box, async () => {
      await box.state.write('ki/agents/r/a.status', 'DONE\n')
      processes.finish()
    })
    await box.project.write('task.md', '# Task\n')
    await box.state.write('ki/agents/r/gone.pid', '5\n')
    await box.run('ki agent queue r b task.md --wait-for a', { now })
    await box.run('ki agent queue r a task.md', { now })
    await box.run('ki agent queue r c task.md --wait-for gone', { now })
    await box.run('ki agent queue r d task.md --wait-for never', { now })

    const result = await box.run('ki agent dispatch r --max 1 --interval 1 --foreground', { now })

    expect(result.stdout).toBe(
      [
        '19:30 UTC launched a',
        '19:30 UTC could not launch c: gate cannot open: gone exited without DONE',
        '19:30 UTC launched b',
        '19:30 UTC could not launch d: gate cannot open: nothing running for never',
        '19:30 UTC queue empty, all finished',
        ''
      ].join('\n')
    )
    expect(processes.launches.map((launch) => launch.log)).toEqual(
      ['a', 'b'].map((name) => runPath(box, `${name}.log`))
    )
    expect(processes.sleeps()).toBe(2)
    expect(await box.state.read('ki/agents/r/queue.jsonl')).toBe('')
  })

  test('surfaces an unexpected launch failure', async () => {
    const box = await sandbox()
    await setupDelegation(box)
    await box.project.write('task.md', '# Task\n')
    await box.run('ki agent queue r a task.md', { now })
    box.setAgentProcesses({
      launch: async () => {
        throw new Error('spawn failed')
      },
      alive: () => false,
      sleep: async () => {}
    })
    await expect(box.run('ki agent dispatch r --max 1 --foreground', { now })).rejects.toThrow('spawn failed')
  })

  test('wakes on each finish in turn, then reports the run finished', async () => {
    const box = await sandbox()
    const alive = new Set([12, 13])
    box.setAgentProcesses({
      launch: async () => 0,
      alive: (pid) => alive.has(pid),
      sleep: async (milliseconds) => {
        expect(milliseconds).toBe(30_000)
        alive.delete(12)
        await box.state.write('ki/agents/r/c.status', '21:20 CEST - reported\nDONE\n')
      }
    })
    await box.state.write('ki/agents/r/a.pid', '10\n')
    await box.state.write('ki/agents/r/a.status', '21:00 CEST - final check\nDONE\n')
    await box.state.write('ki/agents/r/b.pid', '11\n')
    await box.state.write('ki/agents/r/c.pid', '12\n')
    await box.state.write('ki/agents/r/c.status', '21:05 CEST - testing\n')
    await box.state.write('ki/agents/r/d.pid', '13\n')
    await box.state.write('ki/agents/r/d.status', 'DONE\n')

    const waits = []
    for (let index = 0; index < 5; index += 1) waits.push((await box.run('ki agent wait r --next', { now })).stdout)
    expect(waits).toEqual([
      'a finished: 21:00 CEST - final check\n',
      'b exited without DONE: no status\n',
      'd finished: DONE\n',
      'c finished: 21:20 CEST - reported\n',
      'ALL FINISHED\n'
    ])
    expect(await box.state.read('ki/agents/r/seen')).toBe('a\nb\nd\nc\n')
  })

  test('waits for the whole run without --next', async () => {
    const box = await sandbox()
    const processes = fakeProcesses(box, async () => processes.finish())
    processes.alive.add(12)
    await box.state.write('ki/agents/r/c.pid', '12\n')
    await box.state.write('ki/agents/r/e.pid', '14\n')
    await box.state.write('ki/agents/r/e.status', '21:01 CEST - halfway\n')

    const result = await box.run('ki agent wait r --interval 2', { now })
    expect(result.stdout).toBe('ALL FINISHED\n')
    expect(processes.sleeps()).toBe(1)

    await box.state.write('ki/agents/s/e.pid', '14\n')
    await box.state.write('ki/agents/s/e.status', '21:01 CEST - halfway\n')
    expect((await box.run('ki agent wait s --next', { now })).stdout).toBe(
      'e exited without DONE: 21:01 CEST - halfway\n'
    )
  })
})
