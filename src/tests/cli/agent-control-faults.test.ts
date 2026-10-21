import { rename } from 'node:fs/promises'
import { afterEach, expect, test, vi } from 'vitest'
import { runCommand, sandbox } from './_cli_helper.ts'

// A journal can disappear between replay and inspection. Inject only that filesystem
// boundary: a single CLI call cannot otherwise deterministically schedule the race.
const fault = vi.hoisted(() => ({ path: '', call: 0, at: 0, directory: '' }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...original,
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
