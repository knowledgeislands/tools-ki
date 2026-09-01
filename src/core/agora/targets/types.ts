import type { Environment } from '../../paths.ts'
import type { CommandResult, Runner } from '../../runtime/runner.ts'

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

export type ObservedTargetRoot =
  | { readonly kind: 'path'; readonly value: string }
  | { readonly kind: 'external'; readonly value: string }

export interface TargetObservation {
  readonly source: string
  readonly roots: readonly ObservedTargetRoot[]
}

export interface ObserveTargetPort {
  readonly environment: Environment
  readonly platform: NodeJS.Platform
}

export interface ObserveTargetAdapter {
  readonly id: string
  readonly observe: (selector: string, port: ObserveTargetPort) => Promise<TargetObservation>
}
