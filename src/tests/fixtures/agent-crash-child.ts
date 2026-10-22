// This process fixture reuses the parent sandbox paths and injected process ports.
// A separate process is required to prove SIGKILL bypasses every catch/finally
// and leaves recoverable evidence at each real filesystem boundary.
import fs from 'node:fs'
import promises from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { join } from 'node:path'
import { run } from '../../cli.ts'
import { createContext } from '../../context.ts'
import type { AgentProcesses } from '../../core/agent/processes.ts'

const inputPath = process.argv[2]
if (!inputPath) throw new Error('crash probe input is required')
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as {
  directory: string
  root: string
  project: string
  environment: Record<string, string>
  command: string[]
  scenario: string
  index: number
  phase: 'before' | 'after'
}
const original = { writeFileSync: fs.writeFileSync, writeFile: promises.writeFile }
const sites: { operation: string; path: string }[] = []
const trace = join(input.root, 'crash-trace.json')
const effectsFile = join(input.root, 'crash-effects.json')
let output = ''
let exitCode: number | undefined
let starts = 0
let signals = 0
let empty = input.scenario === 'relaunch' || ['status', 'wait', 'watch'].includes(input.scenario)
const record = (killed: boolean) =>
  original.writeFileSync(trace, JSON.stringify({ sites, killed, starts, signals, empty, output, exitCode }))
const die = (): never => {
  record(true)
  process.kill(process.pid, 'SIGKILL')
  process.exit(137)
}
const before = (operation: string, path: string): boolean => {
  if (!path.startsWith(input.directory) && !path.startsWith(join(input.project, '+/_WORK/ki.r'))) return false
  const selected = sites.push({ operation, path }) - 1 === input.index
  if (selected && input.phase === 'before') die()
  return selected
}
for (const operation of ['writeFile', 'appendFile', 'copyFile', 'rename', 'mkdir', 'rm'] as const) {
  const invoke = promises[operation] as (...args: unknown[]) => Promise<unknown>
  Object.assign(promises, {
    [operation]: async (...args: unknown[]) => {
      const selected = before(operation, String(args[operation === 'rename' || operation === 'copyFile' ? 1 : 0]))
      const result = await invoke(...args)
      if (selected && input.phase === 'after') die()
      return result
    }
  })
}
for (const [operation, name] of [
  ['writeFileSync', 'lock'],
  ['unlinkSync', 'unlock']
] as const) {
  const invoke = fs[operation] as (...args: unknown[]) => unknown
  Object.assign(fs, {
    [operation]: (...args: unknown[]) => {
      const selected = before(name, String(args[0]))
      const result = invoke(...args)
      if (selected && input.phase === 'after') die()
      return result
    }
  })
}
syncBuiltinESMExports()
let time = 0
let holdSleeps = 0
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
const observation = (identity: Identity) => ({
  token: identity.token,
  scope: identity.scope,
  ownership: input.scenario !== 'ownership',
  containment: true,
  empty,
  fenced: true,
  authorisationConsumed: true,
  workerStarted: true,
  owner: owner(identity)
})
const effects = () => original.writeFileSync(effectsFile, JSON.stringify({ starts, signals }))
const started = async () => {
  starts += 1
  empty = false
  effects()
  if (input.scenario === 'dispatch') {
    empty = true
    await original.writeFile(
      join(input.directory, 'worker.report.md'),
      '# Done\n\n## Queries\n\n### MATRIX-QUERY - Confirm outcome\n'
    )
    await original.writeFile(join(input.directory, 'worker.status'), 'DONE\n')
  }
  return 4001
}
const context = await createContext({
  executable: 'ki',
  workingDirectory: input.project,
  environment: input.environment,
  stdout: {
    write(chunk) {
      output += chunk
    }
  },
  stderr: {
    write(chunk) {
      output += chunk
    }
  },
  now: () => time,
  onInterrupt: () => () => {},
  startInterval: () => () => {},
  fetcher: async () => {
    throw new Error('network forbidden in crash probe')
  },
  agentProcesses: {
    launch: started,
    alive: (pid) =>
      input.scenario === 'dispatch-held-loss' && pid === 4001
        ? false
        : !empty && !(['gate-closed', 'queued-held-gate', 'dispatch-gate'].includes(input.scenario) && pid === 17),
    sleep: async (milliseconds) => {
      time += Math.max(milliseconds, 121_000)
      if (input.scenario === 'gate-waiting' && ++holdSleeps === 2) {
        await original.writeFile(join(input.directory, 'before.report.md'), '# Done\n')
        await original.writeFile(join(input.directory, 'before.status'), 'DONE\n')
      }
      if (time > 1_000_000) throw new Error('unbounded crash probe wait')
    },
    control:
      input.scenario === 'checkpoint-append'
        ? undefined
        : {
            launch: async (identity) => {
              await started()
              return owner(identity)
            },
            inspect: async (identity) => observation(identity),
            terminate: async () => {
              signals += 1
              empty = input.scenario !== 'timeout'
              effects()
            },
            verifyRecovery: async (identity) => observation(identity)
          }
  }
})
exitCode = await run(input.command.slice(1), context)
record(false)
