import type { Environment } from '../paths.ts'
import type { CommandResult, Runner } from '../runtime/runner.ts'

export interface OpenTargetPort {
  readonly runner: Runner
  readonly environment: Environment
}

export interface OpenTargetOptions {
  readonly preserveProjectionOrder?: boolean
}

export interface OpenTargetAdapter {
  readonly id: string
  readonly failureMessage: string
  readonly open: (roots: readonly string[], port: OpenTargetPort, options: OpenTargetOptions) => Promise<CommandResult>
}
