import { spawn } from 'node:child_process'
import { closeSync, openSync } from 'node:fs'
import type { AgentEffectIdentity, AttemptIdentity, ProcessIdentity } from './identities.ts'

export interface ScopeObservation {
  readonly token: string
  readonly scope: string
  readonly ownership: boolean
  /** Includes reparented descendants and session/group changes, not just one process group. */
  readonly containment: boolean
  readonly empty: boolean
  readonly fenced: boolean
  readonly authorisationConsumed: boolean
  readonly workerStarted: boolean
  readonly owner?: ProcessIdentity | undefined
  readonly terminal?: 'done' | 'failed' | undefined
}

/** A managed adapter must acknowledge the supervisor before opening its durable worker gate.
 * Lookup uses the reserved token/scope even if no PID reached the parent. Native adapters
 * without this evidence port retain legacy launch, and cannot confirm stop or recovery.
 */
export interface AgentControlProcesses {
  /** Worker phase returns only after its verified worker-start record, not supervisor registration alone. */
  readonly launch: (
    identity: AttemptIdentity,
    launch: AgentLaunch,
    phase: 'supervisor' | 'worker',
    effect: AgentEffectIdentity
  ) => Promise<ProcessIdentity>
  readonly inspect: (identity: AttemptIdentity) => Promise<ScopeObservation>
  /** Deduplicates the durable effect key and rechecks ownership/coverage before SIGTERM. No escalation. */
  readonly terminate: (identity: AttemptIdentity, effect: AgentEffectIdentity) => Promise<void>
  /** Validates adapter-managed proof records, rather than an operator's asserted outcome. */
  readonly verifyRecovery: (
    identity: AttemptIdentity,
    evidence: Readonly<Record<string, unknown>>,
    effect: AgentEffectIdentity
  ) => Promise<ScopeObservation | undefined>
}

/** One detached agent process to start. */
export interface AgentLaunch {
  readonly command: string
  readonly arguments: readonly string[]
  readonly workingDirectory: string
  readonly environment: NodeJS.ProcessEnv
  /** File that receives the agent's combined standard output and error. */
  readonly log: string
}

/**
 * Process effects behind `ki agent`, injected so tests never start a real agent.
 * `launch` returns the detached process identifier.
 */
export interface AgentProcesses {
  readonly control?: AgentControlProcesses | undefined
  readonly launch: (launch: AgentLaunch) => Promise<number>
  readonly alive: (pid: number) => boolean
  readonly sleep: (milliseconds: number) => Promise<void>
}

/* v8 ignore start -- Real process detachment is a host concern; tests inject AgentProcesses at the context boundary. */
const launch = async (request: AgentLaunch): Promise<number> => {
  const log = openSync(request.log, 'a')
  try {
    // `detached` starts a new session (setsid), so an interrupt of the launching
    // terminal cannot reach the agent; `ignore` gives it /dev/null as stdin.
    const child = spawn(request.command, [...request.arguments], {
      cwd: request.workingDirectory,
      env: request.environment,
      detached: true,
      stdio: ['ignore', log, log]
    })
    const pid = await new Promise<number>((resolve, reject) => {
      child.once('spawn', () => resolve(child.pid as number))
      child.once('error', reject)
    })
    child.unref()
    return pid
  } finally {
    closeSync(log)
  }
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export const hostAgentProcesses: AgentProcesses = {
  launch,
  alive,
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
}
/* v8 ignore stop */
