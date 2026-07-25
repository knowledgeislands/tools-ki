import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { run as runCli } from '../cli.ts'
import { createContext } from '../core/context.ts'

// Shared end-to-end test harness for the `ki` CLI. Tests drive the real command
// tree in-process through runKi/runKiAt against a throwaway temporary filesystem,
// and shell out through runProcess for the installer and fixture validators.

export const repository = new URL('../../', import.meta.url).pathname
export const executable = new URL('../../bin/ki', import.meta.url).pathname
export const installer = new URL('../../install.sh', import.meta.url).pathname
export const validator = new URL('../../tests/validate-kep.sh', import.meta.url).pathname

export interface CommandResult {
  readonly exitCode: number
  readonly output: string
}

const temporaryDirectories: string[] = []

export const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'ki-test-'))
  temporaryDirectories.push(directory)
  return directory
}

export const cleanupTemporaryDirectories = async (): Promise<void> => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
}

export interface Sandbox {
  readonly root: string
  readonly home: string
  readonly config: string
  readonly data: string
  readonly env: Record<string, string>
  readonly write: (path: string, content: string) => Promise<void>
  readonly read: (path: string) => Promise<string>
}

// A throwaway HOME/XDG_CONFIG_HOME/XDG_DATA_HOME triple, pre-wired as an
// environment override, for tests that don't need bespoke directory layout.
export const sandbox = async (): Promise<Sandbox> => {
  const root = await temporaryDirectory()
  const home = join(root, 'home')
  const config = join(root, 'config')
  const data = join(root, 'data')
  await mkdir(home, { recursive: true })
  const write = async (path: string, content: string): Promise<void> => {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content)
  }
  const read = (path: string): Promise<string> => readFile(path, 'utf8')
  return { root, home, config, data, env: { HOME: home, XDG_CONFIG_HOME: config, XDG_DATA_HOME: data }, write, read }
}

// A HOME no test ever creates, so a test that forgets to override HOME/XDG_*
// fails loudly (ENOENT) instead of silently reading or writing the real
// developer machine's config, cache, or data directories.
const unboundHome = join(tmpdir(), 'ki-test-unbound-home')

// The only ambient state child processes and in-process runs are allowed to see;
// everything else must come from an explicit override, so tests stay hermetic.
const hermeticEnvironment = (overrides: Record<string, string | undefined>): Record<string, string | undefined> => ({
  PATH: process.env['PATH'],
  TMPDIR: process.env['TMPDIR'],
  HOME: unboundHome,
  ...overrides
})

const executeFile = promisify(execFile)

export const runProcess = async (
  command: readonly [string, ...string[]],
  environment: Record<string, string | undefined> = {}
): Promise<CommandResult> => {
  try {
    const result = await executeFile(command[0], command.slice(1), {
      cwd: repository,
      env: { ...hermeticEnvironment(environment), _: command[0] }
    })
    return { exitCode: 0, output: `${result.stdout}${result.stderr}` }
  } catch (error: unknown) {
    const result = error as { code?: number; stdout?: string; stderr?: string }
    return { exitCode: result.code ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
  }
}

export const runKiAt = async (
  arguments_: string[],
  workingDirectory: string,
  environment: Record<string, string | undefined> = {}
): Promise<CommandResult> => {
  let output = ''
  const write = (chunk: string): void => {
    output += chunk
  }
  const context = await createContext({
    stdout: { write },
    stderr: { write },
    executable,
    workingDirectory,
    environment: { ...hermeticEnvironment(environment), _: executable }
  })
  return { exitCode: await runCli(arguments_, context), output }
}

export const runKi = (arguments_: string[], environment: Record<string, string | undefined> = {}): Promise<CommandResult> =>
  runKiAt(arguments_, repository, environment)

export const installHarness = async (data: string, auditSource?: string, conformSource?: string): Promise<void> => {
  const root = join(data, 'ki', 'harnesses', 'example', 'harness')
  const source = join(root, 'skills', 'ki-example')
  await mkdir(source, { recursive: true })
  const skill = '---\nname: ki-example\nki-depends-on: []\n---\n'
  await writeFile(join(root, 'skills', 'ki-example', 'SKILL.md'), skill)
  const operations = [
    auditSource ? { mode: 'audit', source: auditSource } : undefined,
    conformSource ? { mode: 'conform', source: conformSource } : undefined
  ].filter((operation): operation is { readonly mode: string; readonly source: string } => operation !== undefined)
  if (operations.length) {
    await mkdir(join(source, 'scripts', 'native'), { recursive: true })
    await Promise.all(
      operations.map(async (operation) => writeFile(join(source, 'scripts', 'native', `${operation.mode}.mjs`), operation.source))
    )
  }
}

export const installBootstrapHarness = async (data: string): Promise<void> => {
  const root = join(data, 'ki', 'harnesses', 'knowledgeislands', 'ki-agentic-harness')
  await Promise.all(['subagents', 'hooks'].map((payload) => mkdir(join(root, payload), { recursive: true })))
  for (const skill of ['ki-bootstrap', 'ki-delegate', 'ki-next', 'ki-plan', 'ki-recap']) {
    const source = skill === 'ki-bootstrap' ? join(root, 'skills', 'keystone', skill) : join(root, 'skills', 'process', skill)
    await mkdir(source, { recursive: true })
    await writeFile(join(source, 'SKILL.md'), `---\nname: ${skill}\nki-depends-on: []\n---\n`)
  }
}
