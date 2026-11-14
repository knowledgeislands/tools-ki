// Shared end-to-end test backpack for the `ki` CLI. Every test creates its own sandbox()
// — a throwaway HOME/XDG_CONFIG_HOME/XDG_DATA_HOME/project quartet with methods to
// populate and run against it — so no test assembles that layout or a raw path by hand.
// Cleanup is registered per sandbox via `onTestFinished`, tied to the test that created
// it, rather than a shared registry that a concurrent test could sweep prematurely.
//
// <mkdtemp>/                  (root — content outside the four areas below)
// │   └── dev/                (a local checkout selected by `ki dev local set` — populated by setupLocalCanonicalBackpack())
// │       └── knowledgeislands/
// │           └── ki-agent-backpack/   (skills/, subagents/, hooks/ are real, never symlinks — `ki dev local on` validates each root)
// │               ├── skills/
// │               ├── subagents/
// │               └── hooks/
// ├── home/                   ($HOME — dotfiles a real `ki` install would read)
// ├── config/                 ($XDG_CONFIG_HOME)
// │   └── ki/config.toml
// ├── data/                   ($XDG_DATA_HOME — installed backpacks/skills project here)
// │   └── ki/backpacks/
// │       └── knowledgeislands/
// │           └── ki-agent-backpack/   (installed mode: real, from the archive. After `ki dev local on`: this complete root is symlinked to root/dev/.../ki-agent-backpack)
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
export type CliEntrypoint = typeof runCli

import { createContext } from '../../context.ts'
import type { Fetcher } from '../../core/backpack/acquire.ts'
import type { KiInstallationMode } from '../../core/paths.ts'
import { type Runner, runCommand } from '../../core/runtime/runner.ts'

export type { Runner } from '../../core/runtime/runner.ts'
// The production process runner, for a test that wraps real commands to inject one failure.
export { runCommand } from '../../core/runtime/runner.ts'

// `ki bootstrap` detects the active agent from which of these home directories exists —
// kept here as a literal, not imported from src/agents, so this black-box CLI backpack
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

// A fixture shaped exactly like the real canonical knowledgeislands/ki-agent-backpack
// (its specific skill names and keystone/process grouping), because `ki bootstrap`/`ki
// dev` hardcode expectations about that identity rather than accepting any backpack.
const bootstrapBackpackSkills = [
  'ki-bootstrap',
  'ki-next',
  'ki-plan',
  'ki-implement',
  'ki-accept',
  'ki-batch',
  'ki-recap',
  'ki-work-design'
] as const

// This tools-ki checkout's own `bin/ki` — never spawned (run() drives the CLI in-process),
// only used to populate `executable`/`_` in the synthetic context so commands that inspect
// their own invocation path see a real, resolvable one.
const executablePath = new URL('../../../bin/ki', import.meta.url).pathname

export interface CommandResult {
  readonly exitCode: number
  /** Transcript emitted on the CLI's standard-output stream. */
  readonly stdout: string
  /** Transcript emitted on the CLI's standard-error stream. */
  readonly stderr: string
  /** Merged chronological transcript, retained for existing command assertions. */
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
  /**
   * Runs real `git` from this area, or from a directory within it, for repository-shaped
   * fixtures — a working tree, a linked worktree, a repository that encloses another. Throws
   * on a non-zero exit so a broken fixture fails at its own line, and returns trimmed output.
   */
  readonly git: (arguments_: readonly string[], relativePath?: string) => Promise<string>
}

// A deterministic identity and no system or global configuration, so a fixture commit does not
// depend on the developer's own git setup. HOME is the sandbox's, which carries no .gitconfig.
const gitFixtureEnvironment = (home: string): NodeJS.ProcessEnv => ({
  HOME: home,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'ki sandbox',
  GIT_AUTHOR_EMAIL: 'sandbox@ki.invalid',
  GIT_COMMITTER_NAME: 'ki sandbox',
  GIT_COMMITTER_EMAIL: 'sandbox@ki.invalid'
})

const area = (path: string, home: string): SandboxArea => {
  const resolve = (relativePath: string): string => join(path, relativePath)
  return {
    path,
    git: async (arguments_, relativePath = '.') => {
      const directory = resolve(relativePath)
      await mkdir(directory, { recursive: true })
      const result = await runCommand('git', ['-C', directory, ...arguments_], gitFixtureEnvironment(home))
      if (result.exitCode !== 0)
        throw new Error(`sandbox git ${arguments_.join(' ')} failed in ${directory}: ${result.output}`)
      return result.output.trim()
    },
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

// A single generic `example/backpack` with one `ki-example` skill, whose
// `scripts/rubric/items/index.ts` default export body the caller supplies verbatim.
// Used to exercise the repo/backpack/skill
// commands against arbitrary rubric-definition behavior. Omitting `rubric` writes the skill
// without a rubric module at all, for exercising skills that provide no native governance.
const setupExampleBackpack = async (
  data: SandboxArea,
  {
    rubric,
    name = 'ki-example',
    identifier = 'example/backpack',
    prefix = name.split('-')[0] as string
  }: { rubric?: string; name?: string; identifier?: string; prefix?: string } = {}
): Promise<void> => {
  const canonical = 'knowledgeislands/ki-agent-backpack'
  const canonicalInstalled = await lstat(join(data.path, 'ki/backpacks', canonical)).catch(() => undefined)
  const selectedIdentifier =
    identifier === 'example/backpack' && prefix === 'ki' && canonicalInstalled?.isDirectory() ? canonical : identifier
  const root = `ki/backpacks/${selectedIdentifier}`
  await data.write(`${root}/.ki.toml`, `[skills.ki-repo-backpack]\nprefix = ${JSON.stringify(prefix)}\n`)
  const base = `${root}/skills/${name}`
  await data.write(`${base}/SKILL.md`, `---\nname: ${name}\nki-depends-on: []\n---\n`)
  if (name === 'ki-repo') {
    await data.write(`${base}/scripts/rubric/contexts/canonical-hooks.ts`, 'export const canonicalHooks = () => null\n')
    for (const shape of ['ki-repo-project', 'ki-repo-kb']) {
      await data.write(`${root}/skills/${shape}/SKILL.md`, `---\nname: ${shape}\nki-depends-on: []\n---\n`)
      await data.write(
        `${root}/skills/${shape}/scripts/rubric/items/index.ts`,
        `export default { contract: 1, name: '${shape}', concern: 'shape', createSession: async () => ({ subjects: [], proposal: () => ({ writes: [] }) }), families: [] }\n`
      )
    }
  }
  if (rubric !== undefined) await data.write(`${base}/scripts/rubric/items/index.ts`, rubric)
}

const setupRepositoryLocalSkill = async (
  project: SandboxArea,
  {
    rubric,
    name = 'ki-self',
    source = '.agents/skills/ki-self'
  }: { readonly rubric?: string; readonly name?: string; readonly source?: string } = {}
): Promise<void> => {
  await project.write(`${source}/SKILL.md`, `---\nname: ${name}\nki-depends-on: []\n---\n`)
  if (rubric !== undefined) await project.write(`${source}/scripts/rubric/items/index.ts`, rubric)
}

const writeBootstrapBackpack = async (area: SandboxArea, base: string, metadataFile = '.ki.toml'): Promise<void> => {
  await area.write(`${base}/${metadataFile}`, '[skills.ki-repo-backpack]\nprefix = "ki"\n')
  await Promise.all(['subagents', 'hooks'].map((payload) => area.mkdir(`${base}/${payload}`)))
  for (const skill of bootstrapBackpackSkills) {
    const group = skill === 'ki-bootstrap' ? 'keystone' : 'change-management'
    await area.write(`${base}/skills/${group}/${skill}/SKILL.md`, `---\nname: ${skill}\nki-depends-on: []\n---\n`)
  }
}

const setupCanonicalBackpack = (data: SandboxArea): Promise<void> =>
  writeBootstrapBackpack(data, 'ki/backpacks/knowledgeislands/ki-agent-backpack')

// The same fixture, but written under an arbitrary local directory rather than the
// installed-backpack data root — for exercising `ki dev local set <backpack-id> <path>` against a local
// development checkout instead of an installed backpack. Returns the checkout's real
// path, since callers select it through the named set command before enabling it.
const setupLocalCanonicalBackpack = async (root: SandboxArea, relativePath: string): Promise<string> => {
  await writeBootstrapBackpack(root, relativePath, '.ki.toml')
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
  readonly setupExampleBackpack: (skill?: {
    readonly rubric?: string
    readonly name?: string
    readonly identifier?: string
    readonly prefix?: string
  }) => Promise<void>
  readonly setupRepositoryLocalSkill: (skill?: {
    readonly rubric?: string
    readonly name?: string
    readonly source?: string
  }) => Promise<void>
  readonly setupCanonicalBackpack: () => Promise<void>
  readonly setupLocalCanonicalBackpack: (relativePath: string) => Promise<string>
  readonly setupAgentHome: (agentId: AgentId) => Promise<void>
  readonly setEnv: (environment: Record<string, string | undefined>) => void
  readonly setFetcher: (fetcher: Fetcher) => void
  readonly setRunner: (runner: Runner) => void
  readonly setLstat: (lstat: typeof import('node:fs/promises').lstat) => void
  readonly cd: (relativePath: string) => void
  readonly run: (
    command: string | readonly string[],
    options?: {
      readonly cli?: typeof runCli
      readonly interactive?: boolean
      readonly columns?: number
      readonly now?: () => number
      readonly fetcher?: 'default'
      readonly runner?: 'default'
      readonly executable?: string
      readonly installation?: KiInstallationMode
      readonly installationProvenance?: 'local' | 'release' | 'unknown'
      readonly entrypointUrl?: string
      readonly architecture?: string
      readonly runtime?: string
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
  // Retry transient fixture-removal errors, but still fail teardown if the directory stays busy.
  onTestFinished(() => rm(rootPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }))
  const homePath = join(rootPath, 'home')
  const root = area(rootPath, homePath)
  const home = area(homePath, homePath)
  const config = area(join(rootPath, 'config'), homePath)
  const data = area(join(rootPath, 'data'), homePath)
  const state = area(join(rootPath, 'state'), homePath)
  const project = area(join(rootPath, 'project'), homePath)
  await mkdir(home.path, { recursive: true })
  await mkdir(project.path, { recursive: true })
  const env = {
    HOME: home.path,
    TMPDIR: join(rootPath, 'tmp'),
    XDG_CONFIG_HOME: config.path,
    XDG_DATA_HOME: data.path,
    XDG_STATE_HOME: state.path,
    TZ: 'UTC'
  }
  let environmentOverrides: Record<string, string | undefined> = {}
  let workingDirectory = project.path
  // No sandbox test may reach the real network: a command that needs the fetcher
  // without a test calling setFetcher() first fails loudly here instead of silently
  // making a live request.
  let fetcher: Fetcher = async () => {
    throw new Error(
      'sandbox fetcher not configured; call setFetcher() before running a command that acquires a backpack'
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
      readonly cli?: typeof runCli
      readonly interactive?: boolean
      readonly columns?: number
      readonly now?: () => number
      readonly fetcher?: 'default'
      readonly runner?: 'default'
      readonly executable?: string
      readonly installation?: KiInstallationMode
      readonly installationProvenance?: 'local' | 'release' | 'unknown'
      readonly entrypointUrl?: string
      readonly architecture?: string
      readonly runtime?: string
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
    let stdout = ''
    let stderr = ''
    const write =
      (stream: 'stdout' | 'stderr') =>
      (chunk: string): void => {
        if (stream === 'stdout' && options?.stdoutFailure) throw options.stdoutFailure
        options?.captureOutput?.(stream, chunk)
        if (stream === 'stdout') stdout += chunk
        else stderr += chunk
        output += chunk
      }
    const executable = options?.executable ?? executablePath
    const context = await createContext({
      stdout: { write: write('stdout'), isTTY: options?.interactive, columns: options?.columns },
      stderr: { write: write('stderr'), isTTY: options?.interactive, columns: options?.columns },
      executable,
      installation: options?.installation,
      installationProvenance: options?.installationProvenance,
      entrypointUrl: options?.entrypointUrl,
      architecture: options?.architecture,
      runtime: options?.runtime,
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
    // Existing tests compare `{ exitCode, output }` exactly. The named stream transcripts are
    // intentionally non-enumerable so that strengthening the backpack preserves that contract.
    return Object.defineProperties(
      { exitCode: await (options?.cli ?? runCli)(tokens.slice(1), context), output },
      { stdout: { value: stdout }, stderr: { value: stderr } }
    ) as CommandResult
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
    setupExampleBackpack: (skill) => setupExampleBackpack(data, skill),
    setupRepositoryLocalSkill: (skill) => setupRepositoryLocalSkill(project, skill),
    setupCanonicalBackpack: () => setupCanonicalBackpack(data),
    setupLocalCanonicalBackpack: (relativePath) => setupLocalCanonicalBackpack(root, relativePath),
    setupAgentHome: async (agentId) => {
      await home.mkdir(agentConfig[agentId].home)
      await setupCanonicalBackpack(data)
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
