import type { Environment } from '../paths.ts'
import type { AgentLaunch } from './processes.ts'

/** Runtimes `ki agent` can start as detached, non-interactive agents. */
export const agentRuntimes = ['claude', 'codex'] as const
export type AgentRuntime = (typeof agentRuntimes)[number]

export interface RuntimeRequest {
  readonly prompt: string
  readonly workingDirectory: string
  /** Absolute directories the agent may write besides its working directory. */
  readonly directories: readonly string[]
  readonly environment: Environment
  readonly log: string
}

/**
 * Runtime adapters: the only runtime-specific mechanics behind the ki-delegation
 * background-run contract. Each grants the agent full non-interactive autonomy,
 * because a detached agent cannot answer a permission prompt.
 */
const adapters: Record<AgentRuntime, (request: RuntimeRequest) => AgentLaunch> = {
  claude: (request) => ({
    command: 'claude',
    arguments: [
      '-p',
      request.prompt,
      '--permission-mode',
      'bypassPermissions',
      ...request.directories.flatMap((directory) => ['--add-dir', directory])
    ],
    workingDirectory: request.workingDirectory,
    // A zero ceiling stops print mode ending the session while the agent waits.
    environment: { ...request.environment, CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '0' },
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
      request.prompt
    ],
    workingDirectory: request.workingDirectory,
    environment: request.environment,
    log: request.log
  })
}

export const runtimeLaunch = (runtime: AgentRuntime, request: RuntimeRequest): AgentLaunch => adapters[runtime](request)
