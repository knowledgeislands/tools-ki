import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { run as runCli } from '../cli.ts'
import { createContext } from '../core/context.ts'

// Shared end-to-end test harness for the `ki` CLI. Every test creates its own sandbox()
// — a throwaway HOME/XDG_CONFIG_HOME/XDG_DATA_HOME/project quartet with methods to
// populate and run against it — so no test assembles that layout or a raw path by hand.
// `sandbox` is the only export: fixed repo paths and cleanup hang off it as properties
// (sandbox.repo, sandbox.cleanupAll) rather than being separate top-level exports.

const repositoryFixtures = {
  root: new URL('../../', import.meta.url).pathname,
  executable: new URL('../../bin/ki', import.meta.url).pathname,
  installer: new URL('../../install.sh', import.meta.url).pathname,
  validator: new URL('../../tests/validate-kep.sh', import.meta.url).pathname
}

export interface CommandResult {
  readonly exitCode: number
  readonly output: string
}

// A named root within a sandbox. Callers address content by a path relative to that
// root, so no test ever computes a filesystem path with `join` — the sandbox owns the
// layout, the test only names what goes in it.
export interface SandboxArea {
  readonly path: string
  readonly write: (relativePath: string, content: string) => Promise<void>
  readonly read: (relativePath: string) => Promise<string>
  readonly mkdir: (relativePath: string) => Promise<void>
}

const area = (path: string): SandboxArea => ({
  path,
  write: async (relativePath, content) => {
    const target = join(path, relativePath)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content)
  },
  read: (relativePath) => readFile(join(path, relativePath), 'utf8'),
  mkdir: async (relativePath) => {
    await mkdir(join(path, relativePath), { recursive: true })
  }
})

export interface Sandbox {
  readonly root: SandboxArea
  readonly home: SandboxArea
  readonly config: SandboxArea
  readonly data: SandboxArea
  readonly project: SandboxArea
  readonly env: Record<string, string>
  readonly repo: typeof repositoryFixtures
  readonly installHarness: (auditSource?: string, conformSource?: string) => Promise<void>
  readonly installBootstrapHarness: () => Promise<void>
  readonly run: (
    arguments_: string[],
    environment?: Record<string, string | undefined>,
    workingDirectory?: string
  ) => Promise<CommandResult>
  readonly exec: (command: readonly [string, ...string[]], environment?: Record<string, string | undefined>) => Promise<CommandResult>
}

const executeFile = promisify(execFile)
const temporaryDirectories: string[] = []

const temporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'ki-test-'))
  temporaryDirectories.push(directory)
  return directory
}

const create = async (): Promise<Sandbox> => {
  const rootPath = await temporaryDirectory()
  const root = area(rootPath)
  const home = area(join(rootPath, 'home'))
  const config = area(join(rootPath, 'config'))
  const data = area(join(rootPath, 'data'))
  const project = area(join(rootPath, 'project'))
  await mkdir(home.path, { recursive: true })
  await mkdir(project.path, { recursive: true })
  const env = { HOME: home.path, XDG_CONFIG_HOME: config.path, XDG_DATA_HOME: data.path }

  // A single generic `example/harness` with one `ki-example` skill, whose
  // audit/conform native script bodies the caller supplies. Used to exercise the
  // repo/harness/skill commands against arbitrary skill behavior.
  const installHarness = async (auditSource?: string, conformSource?: string): Promise<void> => {
    const base = 'ki/harnesses/example/harness/skills/ki-example'
    await data.write(`${base}/SKILL.md`, '---\nname: ki-example\nki-depends-on: []\n---\n')
    const operations = [
      auditSource ? { mode: 'audit', source: auditSource } : undefined,
      conformSource ? { mode: 'conform', source: conformSource } : undefined
    ].filter((operation): operation is { readonly mode: string; readonly source: string } => operation !== undefined)
    await Promise.all(operations.map((operation) => data.write(`${base}/scripts/native/${operation.mode}.mjs`, operation.source)))
  }

  // A fixture shaped exactly like the real canonical knowledgeislands/ki-agentic-harness
  // (its specific skill names and keystone/process grouping), because `ki bootstrap`/`ki
  // dev` hardcode expectations about that identity rather than accepting any harness.
  const installBootstrapHarness = async (): Promise<void> => {
    const base = 'ki/harnesses/knowledgeislands/ki-agentic-harness'
    await Promise.all(['subagents', 'hooks'].map((payload) => data.mkdir(`${base}/${payload}`)))
    for (const skill of ['ki-bootstrap', 'ki-delegate', 'ki-next', 'ki-plan', 'ki-recap']) {
      const group = skill === 'ki-bootstrap' ? 'keystone' : 'process'
      await data.write(`${base}/skills/${group}/${skill}/SKILL.md`, `---\nname: ${skill}\nki-depends-on: []\n---\n`)
    }
  }

  // Drives the real `ki` command tree in-process, always starting from this sandbox's
  // own env (a real HOME/XDG_* always exists by construction — no forgotten-override
  // footgun) and, by default, this sandbox's empty project directory.
  const run = async (
    arguments_: string[],
    environment: Record<string, string | undefined> = {},
    workingDirectory: string = project.path
  ): Promise<CommandResult> => {
    let output = ''
    const write = (chunk: string): void => {
      output += chunk
    }
    const context = await createContext({
      stdout: { write },
      stderr: { write },
      executable: repositoryFixtures.executable,
      workingDirectory,
      environment: { ...env, ...environment, _: repositoryFixtures.executable }
    })
    return { exitCode: await runCli(arguments_, context), output }
  }

  // Shells out for concerns `run` can't reach in-process: the installer script,
  // the compiled/installed executable, and one-off OS tools like `mkfifo`.
  const exec = async (
    command: readonly [string, ...string[]],
    environment: Record<string, string | undefined> = {}
  ): Promise<CommandResult> => {
    try {
      const result = await executeFile(command[0], command.slice(1), {
        cwd: repositoryFixtures.root,
        env: { PATH: process.env['PATH'], TMPDIR: process.env['TMPDIR'], HOME: home.path, ...environment, _: command[0] }
      })
      return { exitCode: 0, output: `${result.stdout}${result.stderr}` }
    } catch (error: unknown) {
      const result = error as { code?: number; stdout?: string; stderr?: string }
      return { exitCode: result.code ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` }
    }
  }

  return { root, home, config, data, project, env, repo: repositoryFixtures, installHarness, installBootstrapHarness, run, exec }
}

const cleanupAll = async (): Promise<void> => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
}

export const sandbox = Object.assign(create, { cleanupAll })
