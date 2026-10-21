import { symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { type AgentLaunch, runCommand, sandbox } from './_cli_helper.ts'

const assets = 'ki/harnesses/knowledgeislands/ki-agentic-harness/skills/governance/ki-delegation/assets'
const fixture = async () => {
  const box = await sandbox()
  box.setRunner(runCommand)
  await box.project.git(['init', '-q', '-b', 'main'])
  await box.project.write(
    '.ki.toml',
    '[repo]\nharnesses = ["knowledgeislands/ki-agentic-harness"]\n[skills.ki-repo-project]\n[skills.ki-repo]\nrepo_type = "project"\nprimary_shape = "ki-repo-project"\nrepository = "https://github.com/knowledgeislands/tools-ki"\n'
  )
  await box.project.write('.gitignore', 'node_modules/\n.agents/skills/\n.claude/skills/\n')
  await box.project.write('+/_WORK/ki.r/work.md', '# Work\n')
  await box.project.git(['add', '.ki.toml', '.gitignore', '+/_WORK/ki.r/work.md'])
  await box.project.git(['commit', '-q', '-m', 'base'])
  await box.root.write('prompt.md', '# Bounded task\n')
  await box.data.write(`${assets}/run-prompt.md`, '# Task\n')
  await box.data.write(`${assets}/rules-none.md`, '# Footer\n\n## Rules\n\nBounded authority.\n')
  const launches: AgentLaunch[] = []
  const alive = new Set<number>()
  box.setAgentProcesses({
    launch: async (launch) => {
      launches.push(launch)
      const pid = 1000 + launches.length
      alive.add(pid)
      return pid
    },
    alive: (pid) => alive.has(pid),
    sleep: async () => {}
  })
  return { box, launches, alive, prompt: join(box.root.path, 'prompt.md') }
}

test('launches in the recorded worktree, clones installed dependencies and links project skills, and close checks that location', async () => {
  const { box, launches, alive, prompt } = await fixture()
  await box.project.write('node_modules/installed/package.json', '{"name":"installed"}\n')
  await box.project.write('tooling/boundaries/node_modules/installed/package.json', '{}\n')
  await box.root.write('skill/SKILL.md', '# Project skill\n')
  await box.project.mkdir('.agents/skills')
  await box.project.mkdir('.claude/skills')
  await symlink(join(box.root.path, 'skill'), join(box.project.path, '.agents/skills/shared'))
  await symlink(join(box.root.path, 'skill'), join(box.project.path, '.claude/skills/shared'))
  await box.project.write('.agents/skills/ki-self/SKILL.md', '# Local skill\n')
  const result = await box.run(['ki', 'agent', 'launch', 'r', 'worker', '.', prompt, '--worktree', '.'])
  expect(result.exitCode, result.output).toBe(0)
  const path = join(box.state.path, 'ki/agents/r/worktrees/worker.project')
  const record = JSON.parse(await box.state.read('ki/agents/r/worker.launch.json'))
  expect(record).toMatchObject({
    workdir: path,
    worktree: { repository: await box.project.mkdir('.'), path, branch: 'run/r/worker' }
  })
  expect(launches[0]?.workingDirectory).toBe(path)
  expect(await box.state.git(['branch', '--show-current'], 'ki/agents/r/worktrees/worker.project')).toBe('run/r/worker')
  expect(await box.state.read('ki/agents/r/worktrees/worker.project/node_modules/installed/package.json')).toContain(
    'installed'
  )
  expect(
    await box.state.read('ki/agents/r/worktrees/worker.project/tooling/boundaries/node_modules/installed/package.json')
  ).toBe('{}\n')
  expect(await box.state.isSymlink('ki/agents/r/worktrees/worker.project/.agents/skills/shared')).toBe(true)
  expect(await box.state.isSymlink('ki/agents/r/worktrees/worker.project/.claude/skills/shared')).toBe(true)
  const status = await box.run('ki agent status r')
  expect(status.output).toContain(
    '- [worktree] worker · project · run/r/worker · 0 ahead, 0 behind · 0 uncommitted · last commit'
  )
  expect((await box.run('ki agent status')).output).toContain('- [worktree] worker')
  alive.clear()
  await box.state.write('ki/agents/r/worker.status', 'finished\nDONE\n')
  expect((await box.run('ki agent status r')).output).toContain('- [stranded] worker')
  expect((await box.run('ki agent status --all')).output).toContain('- [stranded] worker')
  const close = await box.run('ki agent close r --reconciled')
  expect(close.exitCode).toBe(1)
  expect(close.output).toContain('blocker: worktrees/ holds worker.project')
})

test('rejects a non-repository worktree source before launch and preserves an existing branch on collision', async () => {
  const { box, prompt, launches } = await fixture()
  await box.root.mkdir('plain')
  const refused = await box.run(['ki', 'agent', 'launch', 'r', 'bad', '.', prompt, '--worktree', '../plain'])
  expect(refused.exitCode).toBe(2)
  expect(refused.output).toContain('--worktree requires a Git repository')
  expect(launches).toEqual([])
  await box.project.git(['branch', 'run/r/collision'])
  const collision = await box.run(['ki', 'agent', 'launch', 'r', 'collision', '.', prompt, '--worktree', '.'])
  expect(collision.exitCode).toBe(1)
  expect(collision.output).toContain('cannot create worktree')
  expect(await box.project.git(['branch', '--list', 'run/r/collision'])).toContain('run/r/collision')
})

test('retains a failed preparation as a visible stranded worktree', async () => {
  const { box, prompt } = await fixture()
  await box.project.mkdir('.agents/skills')
  await symlink(join(box.root.path, 'missing'), join(box.project.path, '.agents/skills/broken'))
  const failed = await box.run(['ki', 'agent', 'launch', 'r', 'broken', '.', prompt, '--worktree', '.'])
  expect(failed.exitCode).toBe(1)
  expect(failed.output).toContain('stranded worktree retained')
  expect((await box.run('ki registry add --repo .')).exitCode).toBe(0)
  const estate = await box.run('ki agent status --worktrees')
  expect(estate.output).toContain('- [stranded]')
  expect(estate.output).toContain('run/r/broken')
})

test('passes worktree selection through a held launch and queue without creating the worktree early', async () => {
  const { box, launches, alive, prompt } = await fixture()
  alive.add(1001)
  await box.state.write('ki/agents/r/other.pid', '1001\n')
  const held = await box.run([
    'ki',
    'agent',
    'launch',
    'r',
    'held',
    '.',
    prompt,
    '--worktree',
    '.',
    '--wait-for',
    'other'
  ])
  expect(held.exitCode).toBe(0)
  expect(launches[0]?.arguments).toContain('--worktree')
  const queued = await box.run(['ki', 'agent', 'queue', 'r', 'queued', prompt, '--workdir', '.', '--worktree', '.'])
  expect(queued.exitCode).toBe(0)
  expect(JSON.parse(await box.state.read('ki/agents/r/queue.jsonl')).worktree).toBe(await box.project.mkdir('.'))
  expect(await box.project.git(['branch', '--list', 'run/r/queued'])).toBe('')
})

test('inventories linked worktrees and non-default branches, with stopped-agent state and unknown Git evidence', async () => {
  const { box, alive, prompt } = await fixture()
  expect((await box.run('ki registry add --repo .')).exitCode).toBe(0)
  expect((await box.run('ki agent status --worktrees')).output).toBe('no linked worktrees or non-default branches\n')
  expect((await box.run('ki agent status r --worktrees')).exitCode).toBe(2)
  expect((await box.run('ki agent status --all --worktrees')).exitCode).toBe(2)
  expect((await box.run(['ki', 'agent', 'launch', 'r', 'worker', '.', prompt, '--worktree', '.'])).exitCode).toBe(0)
  const live = await box.run('ki agent status --worktrees')
  expect(live.output).toContain('- [worktree]')
  expect(live.output).toContain('- [branch]')
  expect(live.output).toContain('run/r/worker')
  alive.clear()
  expect((await box.run('ki agent status --worktrees')).output).toContain('- [stranded]')
  box.setRunner(async () => ({ exitCode: 1, output: 'fixture unavailable' }))
  expect((await box.run('ki agent status --worktrees')).output).toContain('Git worktree inventory unavailable')
  const unknown = await box.run('ki agent status r')
  expect(unknown.output).toContain('ahead/behind unknown · unknown uncommitted · last commit unknown')
})

test('reports changed worktree counts and last-commit age from injected time', async () => {
  const { box, prompt } = await fixture()
  expect((await box.run(['ki', 'agent', 'launch', 'r', 'worker', '.', prompt, '--worktree', '.'])).exitCode).toBe(0)
  const relative = 'ki/agents/r/worktrees/worker.project'
  const stamp = Number(await box.state.git(['log', '-1', '--format=%ct'], relative))
  for (const [seconds, expected] of [
    [3, '3s'],
    [120, '2m'],
    [7200, '2h'],
    [172800, '2d']
  ] as const) {
    expect((await box.run('ki agent status r', { now: () => (stamp + seconds) * 1000 })).output).toContain(
      `last commit ${expected}`
    )
  }
  await box.state.write(`${relative}/change.txt`, 'worktree change\n')
  expect((await box.run('ki agent status r')).output).toContain('1 uncommitted')
  await box.state.git(['add', 'change.txt'], relative)
  await box.state.git(['commit', '-q', '-m', 'worktree change'], relative)
  await box.project.write('main.txt', 'primary change\n')
  await box.project.git(['add', 'main.txt'])
  await box.project.git(['commit', '-q', '-m', 'primary change'])
  expect((await box.run('ki agent status r')).output).toContain('1 ahead, 1 behind · 0 uncommitted')
})

test('uses the recorded origin default branch and distinguishes unowned worktrees from stopped agents', async () => {
  const { box } = await fixture()
  await box.project.git(['branch', 'stable'])
  await box.project.git(['update-ref', 'refs/remotes/origin/stable', 'HEAD'])
  await box.project.git(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/stable'])
  await box.project.git(['worktree', 'add', '-q', '--detach', '../manual'])
  expect((await box.run('ki registry add --repo .')).exitCode).toBe(0)
  const inventory = await box.run('ki agent status --worktrees')
  expect(inventory.output).toContain('- [worktree] project · project · (detached)')
  expect(inventory.output).toContain('- [branch] project · main')
  expect(inventory.output).not.toContain('- [branch] project · stable')
  expect(inventory.output).not.toContain('[stranded]')
})

test('ignores archived packets and unowned legacy packets without inventing phantom worktrees', async () => {
  const { box } = await fixture()
  await box.state.write('ki/agents/note', 'ordinary state file\n')
  await box.state.write('ki/agents/_archive/old/agent.launch.json', '{}\n')
  await box.state.write('ki/agents/r/legacy.launch.json', '{"runtime":"codex"}\n')
  await box.state.write(
    'ki/agents/r/lost.launch.json',
    JSON.stringify({ worktree: { repository: box.project.path, path: join(box.root.path, 'lost'), branch: 'lost' } })
  )
  await box.state.write('ki/agents/r/lost.pid', '0\n')
  expect((await box.run('ki registry add --repo .')).exitCode).toBe(0)
  expect((await box.run('ki agent status --worktrees')).output).toBe('no linked worktrees or non-default branches\n')
})

test('reports malformed Git inventory as unknown rather than claiming an empty estate', async () => {
  const { box } = await fixture()
  expect((await box.run('ki registry add --repo .')).exitCode).toBe(0)
  box.setRunner(async (command, args, environment) =>
    args.includes('--porcelain')
      ? { exitCode: 0, output: `worktree ${box.project.path}\0\0HEAD invalid\0\0` }
      : runCommand(command, args, environment)
  )
  const result = await box.run('ki agent status --worktrees')
  expect(result.output).toContain('malformed Git worktree inventory')
  expect(result.output).not.toContain('no linked worktrees')
})
