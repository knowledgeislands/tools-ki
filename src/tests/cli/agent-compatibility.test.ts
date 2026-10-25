import { readdir, realpath } from 'node:fs/promises'
import { expect, test } from 'vitest'
import { type AgentLaunch, runCommand, sandbox } from './_cli_helper.ts'

// Golden values were recorded with d6df59d9^ through the same public CLI seam.
// The additive selection line is checked separately from the existing receipt.
test.each(['r', 'inspect', 'resolve'])('baseline decision reconciliation for run %s', async (name) => {
  const box = await sandbox()
  box.setRunner(runCommand)
  await box.project.git(['init', '-q'])
  await box.project.write(`+/_WORK/ki.${name}/work.md`, `---\nid: ki.${name}\n---\n`)
  await box.project.git(['add', '--', '+/_WORK'])
  await box.project.git(['commit', '-q', '-m', 'test: fixture'])
  await box.state.write(
    `ki/agents/${name}/thread.json`,
    JSON.stringify({ repository: box.project.path, folder: `+/_WORK/ki.${name}` })
  )
  const decisions = `+/_WORK/ki.${name}/decisions.md`
  await box.project.write(
    decisions,
    '## 2026-10-21 12:00 UTC - ALPHA\n\nFirst.\n\n## 2026-10-21 12:01 UTC - BETA\n\nSecond.\n'
  )
  const cases = [
    ['2026-10-21 12:00 UTC - ALPHA', 'docs/a.md'],
    ['2026-10-21 12:00 UTC - ALPHA', 'docs/b.md'],
    ['2026-10-21 12:01', 'docs/a.md'],
    ['2026-10-21 12:00 UTC - ALPHA', '--class', 'standalone'],
    ['2026-10-21 12:01 UTC - BETA', 'docs/b.md', '--class', 'operational'],
    ['missing', 'docs/a.md'],
    ['2026-10-21 12:00 UTC - ALPHA', '--class', 'invalid'],
    ['2026-10-21', 'docs/a.md']
  ]
  const records: unknown[] = []
  for (const operands of cases) {
    const result = await box.run(['ki', 'agent', 'reconcile', name, ...operands])
    records.push({
      exitCode: result.exitCode,
      stdout: result.stdout.replaceAll(box.root.path, '<fixture>'),
      stderr: result.stderr.replaceAll(box.root.path, '<fixture>'),
      decisions: await box.project.read(decisions)
    })
  }
  await box.project.write(decisions, '# 1 (2026-10-01)\n\nFirst.\n\n## 12 (2026-10-02)\n\nSecond.\n')
  for (const operands of [
    ['1', 'docs/a.md'],
    ['1', 'docs/b.md', '--class', 'rule'],
    ['12', '--class', 'held'],
    ['9', 'docs/a.md']
  ]) {
    const result = await box.run(['ki', 'agent', 'reconcile', name, ...operands])
    records.push({
      exitCode: result.exitCode,
      stdout: result.stdout.replaceAll(box.root.path, '<fixture>'),
      stderr: result.stderr.replaceAll(box.root.path, '<fixture>'),
      decisions: await box.project.read(decisions)
    })
  }
  expect(await readdir(`${box.state.path}/ki/agents/${name}`)).toEqual(['thread.json'])
  expect(records).toMatchSnapshot()
})

test.each(['none', 'push', 'prune', 'release'])('baseline role-free footer %s', async (tier) => {
  const box = await sandbox()
  box.setRunner(runCommand)
  await box.project.git(['init', '-q'])
  await box.project.write('+/_WORK/ki.r/work.md', '---\nid: ki.r\n---\n')
  await box.project.git(['add', '--', '+/_WORK'])
  await box.project.git(['commit', '-q', '-m', 'test: fixture'])
  await box.project.write('brief.md', '# Bounded task\n')
  const assets = 'ki/harnesses/knowledgeislands/ki-agentic-harness/skills/governance/ki-delegation/assets'
  await box.data.write(`${assets}/rules-${tier}.md`, `# Footer\n\n## Rules\n\nTier ${tier}.\n`)
  await box.data.write(`${assets}/run-prompt.md`, '# Task\n')
  await box.data.write(`${assets}/grant-fetch.md`, '# Grant\n\n## Grant: fetch\n\nExplicit fetch.\n')
  const captures: AgentLaunch[] = []
  box.setAgentProcesses({
    launch: async (launch) => {
      captures.push(launch)
      return 4001
    },
    alive: () => true,
    sleep: async () => {}
  })
  const options = [
    '--rules',
    tier,
    '--allow',
    'fetch',
    '--runtime',
    'codex',
    '--model',
    'explicit-model',
    '--effort',
    'high'
  ]
  const launch = await box.run(['ki', 'agent', 'launch', 'r', 'worker', '.', 'brief.md', ...options], {
    now: () => Date.parse('2026-10-21T12:00:00Z')
  })
  const queued = await box.run(['ki', 'agent', 'queue', 'r', 'later', 'brief.md', ...options], {
    now: () => Date.parse('2026-10-21T12:00:00Z')
  })
  const packet = JSON.parse(await box.state.read('ki/agents/r/worker.launch.json'))
  const request = JSON.parse((await box.state.read('ki/agents/r/queue.jsonl')).trim())
  // The runner records the resolved fixture root; on macOS that carries the /private prefix.
  const resolvedRoot = await realpath(box.root.path)
  const clean = (text: string): string =>
    text
      .replaceAll(resolvedRoot, '<fixture>')
      .replaceAll(box.root.path, '<fixture>')
      .replace(/^selection:.*\n/gm, '')
  expect({
    launch: { exitCode: launch.exitCode, stdout: clean(launch.stdout), stderr: clean(launch.stderr) },
    queue: { exitCode: queued.exitCode, stdout: clean(queued.stdout), stderr: clean(queued.stderr) },
    runtime: packet.runtime,
    model: packet.model,
    effort: packet.effort,
    prompt: clean(await box.state.read('ki/agents/r/worker.prompt.md')),
    queuedBrief: await box.state.read('ki/agents/r/later.queued.md'),
    queuedRequest: {
      runtime: request.runtime,
      model: request.model,
      effort: request.effort,
      rules: request.rules,
      allow: request.allow
    },
    effect: {
      command: captures[0]?.command,
      arguments: captures[0]?.arguments.map(clean),
      workingDirectory: clean(captures[0]?.workingDirectory ?? '')
    }
  }).toMatchSnapshot()
})
