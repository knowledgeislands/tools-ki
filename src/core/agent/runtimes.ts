import type { Environment } from '../paths.ts'
import type { AgentLaunch } from './processes.ts'

/** Runtimes `ki agent` can start as detached, non-interactive agents. */
export const agentRuntimes = ['claude', 'codex'] as const
export type AgentRuntime = (typeof agentRuntimes)[number]

/** Reasoning efforts `ki agent` accepts; each runtime rejects any its model lacks. */
export const agentEfforts = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type AgentEffort = (typeof agentEfforts)[number]

/** Environment variable naming the run in every agent `ki agent` starts. */
const agentRunMarker = 'KI_AGENT_RUN'

/**
 * The Orca session identity a coordinating thread carries. A runtime child never
 * inherits it, so Orca cannot take the run for its coordinator; `ki agent`'s own
 * dispatcher keeps it.
 */
const orcaSessionIdentity = [
  'ORCA_AGENT_SESSION_ID',
  'ORCA_AGENT_SESSION_SPAWN_TOKEN',
  'ORCA_STRUCTURED_SESSION',
  'ORCA_CHAT_SCRATCH_DIR'
] as const

export interface RuntimeRequest {
  /** Run name, set as the child's run marker so hooks can tell a background agent apart. */
  readonly run: string
  readonly prompt: string
  readonly workingDirectory: string
  /** Absolute directories the agent may write besides its working directory. */
  readonly directories: readonly string[]
  readonly environment: Environment
  readonly log: string
  /** Passed through verbatim; omitted, the runtime uses its own default. */
  readonly model?: string | undefined
  readonly effort?: AgentEffort | undefined
}

const childEnvironment = (request: RuntimeRequest, extra: Environment = {}): Environment => {
  const environment: Environment = { ...request.environment, [agentRunMarker]: request.run, ...extra }
  for (const name of orcaSessionIdentity) delete environment[name]
  return environment
}

const optional = (value: string | undefined, form: (value: string) => readonly string[]): readonly string[] =>
  value === undefined ? [] : form(value)

/**
 * Runtime adapters: the only runtime-specific mechanics behind the ki-delegation
 * background-run contract. Each grants the agent full non-interactive autonomy,
 * because a detached agent cannot answer a permission prompt, marks the child's
 * environment with its run so a coordinating thread's hooks stay silent in it, and
 * strips the coordinator's Orca session identity from it.
 */
const adapters: Record<AgentRuntime, (request: RuntimeRequest) => AgentLaunch> = {
  claude: (request) => ({
    command: 'claude',
    arguments: [
      '-p',
      request.prompt,
      '--permission-mode',
      'bypassPermissions',
      ...request.directories.flatMap((directory) => ['--add-dir', directory]),
      ...optional(request.model, (model) => ['--model', model]),
      ...optional(request.effort, (effort) => ['--effort', effort])
    ],
    workingDirectory: request.workingDirectory,
    // A zero ceiling stops print mode ending the session while the agent waits.
    environment: childEnvironment(request, { CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '0' }),
    log: request.log
  }),
  codex: (request) => ({
    command: 'codex',
    arguments: [
      'exec',
      '--dangerously-bypass-approvals-and-sandbox',
      '--skip-git-repo-check',
      '--cd',
      request.workingDirectory,
      ...request.directories.flatMap((directory) => ['--add-dir', directory]),
      ...optional(request.model, (model) => ['-m', model]),
      ...optional(request.effort, (effort) => ['-c', `model_reasoning_effort=${effort}`]),
      request.prompt
    ],
    workingDirectory: request.workingDirectory,
    environment: childEnvironment(request),
    log: request.log
  })
}

export const runtimeLaunch = (runtime: AgentRuntime, request: RuntimeRequest): AgentLaunch => adapters[runtime](request)
