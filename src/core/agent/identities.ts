export interface AttemptIdentity {
  readonly registered: number
  readonly dependencies: Record<string, DependencyIdentity | null>
  readonly requestedDependencies: Record<string, DependencyIdentity | null>
  readonly run: string
  readonly agent: string
  readonly attempt: number
  readonly token: string
  readonly runtime: string
  readonly workdir: string
  readonly workHome: string
  readonly work: string
  readonly machine: string
  readonly launcher: string
  readonly scope: string
  readonly entry?: string | undefined
  owner?: ProcessIdentity | undefined
  stoppedBy?: string | undefined
  gateFailure?: string | undefined
  state: 'held' | 'running' | 'stop-requested' | 'stopped' | 'stop-timeout' | 'done' | 'failed' | 'unconfirmed'
}

export interface DependencyIdentity {
  readonly registered: number
  readonly agent: string
  readonly attempt: number
  readonly token: string
  readonly entry?: string | undefined
}

export interface AgentEffectIdentity {
  readonly operationId: string
  readonly operation: string
  readonly payloadSha256: string
}

/** Adapter-issued birth and containment identities, never inferred from a PID. */
export interface ProcessIdentity {
  readonly pid: number
  readonly birth: string
  readonly session: string
  readonly group: string
  readonly token: string
  readonly scope: string
  readonly launcher: string
}
