import type { Environment } from '../paths.ts'
import type { Runner } from '../runtime/runner.ts'

export type AgoraRootKind = 'owner' | 'member' | 'reference'

export interface AgoraRoot {
  readonly key: string
  readonly root: string
  readonly repository: string
  readonly kind: AgoraRootKind
}

export interface AgoraMember extends AgoraRoot {
  readonly kind: 'owner' | 'member'
}

export interface AgoraReference extends AgoraRoot {
  readonly kind: 'reference'
}

export type AgoraReferenceDiagnosticStatus = 'unassociated' | 'missing' | 'ambiguous' | 'remote-mismatch'

export interface AgoraReferenceDiagnostic {
  readonly repository: string
  readonly status: AgoraReferenceDiagnosticStatus
  readonly detail: string
}

export interface AgoraRuntime {
  readonly runner: Runner
  readonly environment: Environment
}

export interface AgoraProfile {
  readonly id: string
  readonly name: string
  readonly purpose: string
  readonly home?: AgoraMember
  readonly members: readonly AgoraMember[]
  readonly references: readonly AgoraReference[]
  readonly roots: readonly AgoraRoot[]
  readonly referenceDiagnostics: readonly AgoraReferenceDiagnostic[]
  readonly system: boolean
}

export interface AgoraListReport {
  readonly profiles: readonly AgoraProfile[]
  readonly broken: readonly string[]
}

export interface AgoraHealthProfile {
  readonly id: string
  readonly findings: readonly string[]
}

export interface AgoraHealthReport {
  readonly profiles: readonly AgoraHealthProfile[]
  readonly estateFindings: readonly string[]
}
