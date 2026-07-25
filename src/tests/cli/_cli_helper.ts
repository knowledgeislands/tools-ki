// Shared end-to-end test harness for the `ki` CLI. Every test creates its own sandbox()
// — a throwaway HOME/XDG_CONFIG_HOME/XDG_DATA_HOME/project quartet with methods to
// populate and run against it — so no test assembles that layout or a raw path by hand.
// Cleanup is registered per sandbox via `onTestFinished`, tied to the test that created
// it, rather than a shared registry that a concurrent test could sweep prematurely.
//
// <mkdtemp>/                  (root — content outside the four areas below)
// │   └── dev/                (a local checkout, once `ki dev on` runs against it — populated by setupLocalCanonicalHarness())
// │       └── knowledgeislands/
// │           └── ki-agentic-harness/   (skills/, subagents/, hooks/ are real, never symlinks — `ki dev on` validates each root)
// │               ├── skills/
// │               ├── subagents/
// │               └── hooks/
// ├── home/                   ($HOME — dotfiles a real `ki` install would read)
// ├── config/                 ($XDG_CONFIG_HOME)
// │   └── ki/config.toml
// ├── data/                   ($XDG_DATA_HOME — installed harnesses/skills project here)
// │   └── ki/harnesses/
// │       └── knowledgeislands/
// │           └── ki-agentic-harness/   (installed mode: real, from the archive. After `ki dev on`: symlinked to root/dev/.../<payload>)
// │               ├── skills/
// │               ├── subagents/
// │               └── hooks/
// └── project/                (run()'s default cwd; cd() moves relative to here)

import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { onTestFinished } from 'vitest'
import { run as runCli } from '../../cli.ts'
import { createContext } from '../../context.ts'

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
const bootstrapHarnessSkills = ['ki-bootstrap', 'ki-delegate', 'ki-next', 'ki-plan', 'ki-recap'] as const

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
    mkdir: (relativePath) => mkdir(resolve(relativePath), { recursive: true }).then(() => realpath(resolve(relativePath))),
    isSymlink: async (relativePath) => (await lstat(resolve(relativePath))).isSymbolicLink()
  }
}

// A single generic `example/harness` with one `ki-example` skill, whose audit/conform
// native script bodies the caller supplies. Used to exercise the repo/harness/skill
// commands against arbitrary skill behavior.
const setupExampleHarness = async (data: SandboxArea, { audit, conform }: { audit?: string; conform?: string } = {}): Promise<void> => {
  const base = 'ki/harnesses/example/harness/skills/ki-example'
  await data.write(`${base}/SKILL.md`, '---\nname: ki-example\nki-depends-on: []\n---\n')
  const operations = [
    audit ? { mode: 'audit', source: audit } : undefined,
    conform ? { mode: 'conform', source: conform } : undefined
  ].filter((operation): operation is { readonly mode: string; readonly source: string } => operation !== undefined)
  await Promise.all(operations.map((operation) => data.write(`${base}/scripts/native/${operation.mode}.mjs`, operation.source)))
}

const writeBootstrapHarness = async (area: SandboxArea, base: string): Promise<void> => {
  await Promise.all(['subagents', 'hooks'].map((payload) => area.mkdir(`${base}/${payload}`)))
  for (const skill of bootstrapHarnessSkills) {
    const group = skill === 'ki-bootstrap' ? 'keystone' : 'process'
    await area.write(`${base}/skills/${group}/${skill}/SKILL.md`, `---\nname: ${skill}\nki-depends-on: []\n---\n`)
  }
}

const setupCanonicalHarness = (data: SandboxArea): Promise<void> =>
  writeBootstrapHarness(data, 'ki/harnesses/knowledgeislands/ki-agentic-harness')

// The same fixture, but written under an arbitrary local directory rather than the
// installed-harness data root — for exercising `ki dev on <path>` against a local
// development checkout instead of an installed harness. Returns the checkout's real
// path, since callers always need it to build the `ki dev on <path>` invocation.
const setupLocalCanonicalHarness = async (root: SandboxArea, relativePath: string): Promise<string> => {
  await writeBootstrapHarness(root, relativePath)
  return realpath(join(root.path, relativePath))
}

export interface Sandbox {
  readonly root: SandboxArea
  readonly home: SandboxArea
  readonly config: SandboxArea
  readonly data: SandboxArea
  readonly project: SandboxArea
  readonly env: Record<string, string>
  readonly executable: string
  readonly setupExampleHarness: (skill?: { readonly audit?: string; readonly conform?: string }) => Promise<void>
  readonly setupCanonicalHarness: () => Promise<void>
  readonly setupLocalCanonicalHarness: (relativePath: string) => Promise<string>
  readonly setupAgentHome: (agentId: AgentId) => Promise<void>
  readonly setEnv: (environment: Record<string, string | undefined>) => void
  readonly cd: (relativePath: string) => void
  readonly run: (command: string) => Promise<CommandResult>
}

const create = async (): Promise<Sandbox> => {
  const rootPath = await mkdtemp(join(tmpdir(), 'ki-test-'))
  onTestFinished(() => rm(rootPath, { recursive: true, force: true }))
  const root = area(rootPath)
  const home = area(join(rootPath, 'home'))
  const config = area(join(rootPath, 'config'))
  const data = area(join(rootPath, 'data'))
  const project = area(join(rootPath, 'project'))
  await mkdir(home.path, { recursive: true })
  await mkdir(project.path, { recursive: true })
  const env = { HOME: home.path, XDG_CONFIG_HOME: config.path, XDG_DATA_HOME: data.path }
  let environmentOverrides: Record<string, string | undefined> = {}
  let workingDirectory = project.path

  const setEnv = (environment: Record<string, string | undefined>): void => {
    environmentOverrides = { ...environmentOverrides, ...environment }
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
  const run = async (command: string): Promise<CommandResult> => {
    let output = ''
    const write = (chunk: string): void => {
      output += chunk
    }
    const context = await createContext({
      stdout: { write },
      stderr: { write },
      executable: executablePath,
      workingDirectory,
      environment: { ...env, ...environmentOverrides, _: executablePath }
    })
    const tokens = command.split(' ').filter(Boolean)
    if (tokens[0] !== 'ki') throw new Error(`sandbox run() commands must start with "ki": ${command}`)
    return { exitCode: await runCli(tokens.slice(1), context), output }
  }

  return {
    root,
    home,
    config,
    data,
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
    cd,
    run
  }
}

export const sandbox = create
