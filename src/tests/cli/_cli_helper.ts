// Shared end-to-end test harness for the `ki` CLI. Every test creates its own sandbox()
// — a throwaway HOME/XDG_CONFIG_HOME/XDG_DATA_HOME/project quartet with methods to
// populate and run against it — so no test assembles that layout or a raw path by hand.
// Cleanup is registered per sandbox via `onTestFinished`, tied to the test that created
// it, rather than a shared registry that a concurrent test could sweep prematurely.
//
// <mkdtemp>/                  (root — content outside the four areas below)
// │   └── dev/                (a local checkout selected by `ki dev local set` — populated by setupLocalCanonicalHarness())
// │       └── knowledgeislands/
// │           └── ki-agentic-harness/   (skills/, subagents/, hooks/ are real, never symlinks — `ki dev local on` validates each root)
// │               ├── skills/
// │               ├── subagents/
// │               └── hooks/
// ├── home/                   ($HOME — dotfiles a real `ki` install would read)
// ├── config/                 ($XDG_CONFIG_HOME)
// │   └── ki/config.toml
// ├── data/                   ($XDG_DATA_HOME — installed harnesses/skills project here)
// │   └── ki/harnesses/
// │       └── knowledgeislands/
// │           └── ki-agentic-harness/   (installed mode: real, from the archive. After `ki dev local on`: symlinked to root/dev/.../<payload>)
// │               ├── skills/
// │               ├── subagents/
// │               └── hooks/
// ├── state/                  ($XDG_STATE_HOME — machine-local mutable KI registry)
// │   └── ki/registry.toml
// └── project/                (run()'s default cwd; cd() moves relative to here)

import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { onTestFinished } from 'vitest'
import { run as runCli } from '../../cli.ts'
import { createContext } from '../../context.ts'
import type { Fetcher } from '../../core/acquire.ts'
import type { KiInstallationMode } from '../../core/paths.ts'
import type { Runner } from '../../core/runner.ts'

// `ki bootstrap` detects the active agent from which of these home directories exists —
// kept here as a literal, not imported from src/agents, so this black-box CLI harness
// exercises detection through observable behavior rather than sharing implementation.
type AgentId = 'chatgpt-codex' | 'claude-code'
const agentConfig: Record<AgentId, { home: string }> = {
  'chatgpt-codex': {
    home: '.agents'
  },
  'claude-code': {
    home: '.claude'
  }
}

// A fixture shaped exactly like the real canonical knowledgeislands/ki-agentic-harness
// (its specific skill names and keystone/process grouping), because `ki bootstrap`/`ki
// dev` hardcode expectations about that identity rather than accepting any harness.
const bootstrapHarnessSkills = [
  'ki-bootstrap',
  'ki-next',
  'ki-plan',
  'ki-implement',
  'ki-accept',
  'ki-batch',
  'ki-recap'
] as const

// This tools-ki checkout's own `bin/ki` — never spawned (run() drives the CLI in-process),
// only used to populate `executable`/`_` in the synthetic context so commands that inspect
// their own invocation path see a real, resolvable one.
const executablePath = new URL('../../../bin/ki', import.meta.url).pathname

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
  readonly mkdir: (relativePath: string) => Promise<string>
  readonly isSymlink: (relativePath: string) => Promise<boolean>
}

const area = (path: string): SandboxArea => {
  const resolve = (relativePath: string): string => join(path, relativePath)
  return {
    path,
    write: async (relativePath, content) => {
      const target = resolve(relativePath)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, content)
    },
    read: (relativePath) => readFile(resolve(relativePath), 'utf8'),
    mkdir: (relativePath) =>
      mkdir(resolve(relativePath), { recursive: true }).then(() => realpath(resolve(relativePath))),
    isSymlink: async (relativePath) => (await lstat(resolve(relativePath))).isSymbolicLink()
  }
}

// A single generic `example/harness` with one `ki-example` skill, whose
// `scripts/rubric/items/index.ts` default export body the caller supplies verbatim.
// Used to exercise the repo/harness/skill
// commands against arbitrary rubric-definition behavior. Omitting `rubric` writes the skill
// without a rubric module at all, for exercising skills that provide no native governance.
const setupExampleHarness = async (
  data: SandboxArea,
  { rubric, name = 'ki-example' }: { rubric?: string; name?: string } = {}
): Promise<void> => {
  const base = `ki/harnesses/example/harness/skills/${name}`
  await data.write(`${base}/SKILL.md`, `---\nname: ${name}\nki-depends-on: []\n---\n`)
  if (rubric !== undefined) await data.write(`${base}/scripts/rubric/items/index.ts`, rubric)
}

const writeBootstrapHarness = async (area: SandboxArea, base: string): Promise<void> => {
  await Promise.all(['subagents', 'hooks'].map((payload) => area.mkdir(`${base}/${payload}`)))
  for (const skill of bootstrapHarnessSkills) {
    const group = skill === 'ki-bootstrap' ? 'keystone' : 'change-management'
    await area.write(`${base}/skills/${group}/${skill}/SKILL.md`, `---\nname: ${skill}\nki-depends-on: []\n---\n`)
  }
}

const setupCanonicalHarness = (data: SandboxArea): Promise<void> =>
  writeBootstrapHarness(data, 'ki/harnesses/knowledgeislands/ki-agentic-harness')

// The same fixture, but written under an arbitrary local directory rather than the
// installed-harness data root — for exercising `ki dev local set <path>` against a local
// development checkout instead of an installed harness. Returns the checkout's real
// path, since callers select it through `ki dev local set <path>` before enabling it.
const setupLocalCanonicalHarness = async (root: SandboxArea, relativePath: string): Promise<string> => {
  await writeBootstrapHarness(root, relativePath)
  return realpath(join(root.path, relativePath))
}

export interface Sandbox {
  readonly root: SandboxArea
  readonly home: SandboxArea
  readonly config: SandboxArea
  readonly data: SandboxArea
  readonly state: SandboxArea
  readonly project: SandboxArea
  readonly env: Record<string, string>
  readonly executable: string
  readonly setupExampleHarness: (skill?: { readonly rubric?: string; readonly name?: string }) => Promise<void>
  readonly setupCanonicalHarness: () => Promise<void>
  readonly setupLocalCanonicalHarness: (relativePath: string) => Promise<string>
  readonly setupAgentHome: (agentId: AgentId) => Promise<void>
  readonly setEnv: (environment: Record<string, string | undefined>) => void
  readonly setFetcher: (fetcher: Fetcher) => void
  readonly setRunner: (runner: Runner) => void
  readonly setLstat: (lstat: typeof import('node:fs/promises').lstat) => void
  readonly cd: (relativePath: string) => void
  readonly run: (
    command: string | readonly string[],
    options?: {
      readonly interactive?: boolean
      readonly columns?: number
      readonly now?: () => number
      readonly fetcher?: 'default'
      readonly runner?: 'default'
      readonly executable?: string
      readonly installation?: KiInstallationMode
      readonly platform?: NodeJS.Platform
      readonly stdoutFailure?: Error
      /** Receives each write with its destination stream. */
      readonly captureOutput?: (stream: 'stdout' | 'stderr', chunk: string) => void
      /** Receives the interrupt handler a live display registers, so a test can fire it. */
      readonly captureInterrupt?: (handler: () => void) => void
      /** Receives the refresh handler a live display registers, so a test can fire it. */
      readonly captureInterval?: (handler: () => void) => void
    }
  ) => Promise<CommandResult>
}

const create = async (): Promise<Sandbox> => {
  const rootPath = await mkdtemp(join(tmpdir(), 'ki-test-'))
  onTestFinished(() => rm(rootPath, { recursive: true, force: true }))
  const root = area(rootPath)
  const home = area(join(rootPath, 'home'))
  const config = area(join(rootPath, 'config'))
  const data = area(join(rootPath, 'data'))
  const state = area(join(rootPath, 'state'))
  const project = area(join(rootPath, 'project'))
  await mkdir(home.path, { recursive: true })
  await mkdir(project.path, { recursive: true })
  const env = { HOME: home.path, XDG_CONFIG_HOME: config.path, XDG_DATA_HOME: data.path, XDG_STATE_HOME: state.path }
  let environmentOverrides: Record<string, string | undefined> = {}
  let workingDirectory = project.path
  // No sandbox test may reach the real network: a command that needs the fetcher
  // without a test calling setFetcher() first fails loudly here instead of silently
  // making a live request.
  let fetcher: Fetcher = async () => {
    throw new Error(
      'sandbox fetcher not configured; call setFetcher() before running a command that acquires a harness'
    )
  }
  let runner: Runner = async () => {
    throw new Error(
      'sandbox runner not configured; call setRunner() before running a command that invokes an installer'
    )
  }
  let stat: typeof lstat | undefined

  const setEnv = (environment: Record<string, string | undefined>): void => {
    environmentOverrides = { ...environmentOverrides, ...environment }
  }
  const setFetcher = (next: Fetcher): void => {
    fetcher = next
  }
  const setRunner = (next: Runner): void => {
    runner = next
  }
  const setLstat = (next: typeof lstat): void => {
    stat = next
  }
  const cd = (relativePath: string): void => {
    workingDirectory = join(workingDirectory, relativePath)
  }

  // Drives the real `ki` command tree in-process, always starting from this sandbox's
  // own env (a real HOME/XDG_* always exists by construction — no forgotten-override
  // footgun) and, by default, this sandbox's empty project directory. Overridden via
  // setEnv() and cd() — like a real shell, cd() moves relative to wherever the
  // sandbox currently is, so repeated calls compose. Commands are written exactly
  // as typed at a shell, `ki ...`, so the literal command a test asserts against is
  // unambiguous at the call site.
  const run = async (
    command: string | readonly string[],
    options?: {
      readonly interactive?: boolean
      readonly columns?: number
      readonly now?: () => number
      readonly fetcher?: 'default'
      readonly runner?: 'default'
      readonly executable?: string
      readonly installation?: KiInstallationMode
      readonly platform?: NodeJS.Platform
      readonly stdoutFailure?: Error
      /** Receives each write with its destination stream. */
      readonly captureOutput?: (stream: 'stdout' | 'stderr', chunk: string) => void
      /** Receives the interrupt handler a live display registers, so a test can fire it. */
      readonly captureInterrupt?: (handler: () => void) => void
      /** Receives the refresh handler a live display registers, so a test can fire it. */
      readonly captureInterval?: (handler: () => void) => void
    }
  ): Promise<CommandResult> => {
    let output = ''
    const write =
      (stream: 'stdout' | 'stderr') =>
      (chunk: string): void => {
        if (stream === 'stdout' && options?.stdoutFailure) throw options.stdoutFailure
        options?.captureOutput?.(stream, chunk)
        output += chunk
      }
    const executable = options?.executable ?? executablePath
    const context = await createContext({
      stdout: { write: write('stdout'), isTTY: options?.interactive, columns: options?.columns },
      stderr: { write: write('stderr'), isTTY: options?.interactive, columns: options?.columns },
      executable,
      installation: options?.installation,
      ...(options?.platform === undefined ? {} : { platform: options.platform }),
      workingDirectory,
      environment: { ...env, ...environmentOverrides, _: executable },
      ...(options?.fetcher === 'default' ? {} : { fetcher: (input, init) => fetcher(input, init) }),
      ...(options?.runner === 'default' ? {} : { runner }),
      ...(stat === undefined ? {} : { lstat: stat }),
      now: options?.now,
      ...(options?.captureInterrupt === undefined
        ? {}
        : {
            onInterrupt: (handler: () => void) => {
              options.captureInterrupt?.(handler)
              return () => {}
            }
          }),
      ...(options?.captureInterval === undefined
        ? {}
        : {
            startInterval: (_milliseconds: number, handler: () => void) => {
              options.captureInterval?.(handler)
              return () => {}
            }
          })
    })
    const tokens = typeof command === 'string' ? command.split(' ').filter(Boolean) : [...command]
    if (tokens[0] !== 'ki') throw new Error(`sandbox run() commands must start with "ki": ${command}`)
    return { exitCode: await runCli(tokens.slice(1), context), output }
  }

  return {
    root,
    home,
    config,
    data,
    state,
    project,
    env,
    executable: executablePath,
    setupExampleHarness: (skill) => setupExampleHarness(data, skill),
    setupCanonicalHarness: () => setupCanonicalHarness(data),
    setupLocalCanonicalHarness: (relativePath) => setupLocalCanonicalHarness(root, relativePath),
    setupAgentHome: async (agentId) => {
      await home.mkdir(agentConfig[agentId].home)
      await setupCanonicalHarness(data)
    },
    setEnv,
    setFetcher,
    setRunner,
    setLstat,
    cd,
    run
  }
}

export const sandbox = create
