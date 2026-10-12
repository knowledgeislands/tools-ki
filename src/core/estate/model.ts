import type { Runner } from '../runtime/runner.ts'
import type { LocalRegistryEntry } from '../storage/local-registry.ts'

/** Host capabilities the estate converger needs, injected so a CLI test can drive every path. */
export interface EstatePorts {
  readonly homeDirectory: string
  readonly stateDirectory: string
  readonly environment: NodeJS.ProcessEnv
  readonly runner: Runner
  readonly now: () => number
}

/** One manifest repository with its home-relative paths expanded. */
export interface EstateTarget {
  readonly from: string
  readonly to: string
  readonly title: string
  readonly register: boolean
  readonly pathFrom?: string
  /** Absent for repositories the manifest gives no local placement. */
  readonly pathTo?: string
}

export interface WorktreeMove {
  readonly before: string
  readonly after: string
}

export type ConvergeAction =
  | {
      readonly kind: 'move'
      readonly from: string
      readonly to: string
      readonly worktrees: readonly WorktreeMove[]
    }
  | { readonly kind: 'remote'; readonly path: string; readonly from: string; readonly to: string }
  | { readonly kind: 'registry'; readonly before: LocalRegistryEntry; readonly after: LocalRegistryEntry }
  | { readonly kind: 'claude-folder'; readonly from: string; readonly to: string }
  | { readonly kind: 'claude-key'; readonly from: string; readonly to: string }
  | { readonly kind: 'clone'; readonly url: string; readonly path: string }
  | { readonly kind: 'symlink'; readonly path: string; readonly from: string; readonly to: string }
  | { readonly kind: 'rmdir'; readonly path: string }
  | { readonly kind: 'mkdir'; readonly path: string }

export type ConvergeState = 'converge' | 'no-op' | 'skip' | 'to clone' | 'absent'

export interface ConvergeItem {
  readonly target: EstateTarget
  readonly state: ConvergeState
  readonly checkout?: string
  readonly reasons: readonly string[]
  readonly notes: readonly string[]
  readonly actions: readonly ConvergeAction[]
}

export interface SweepPattern {
  readonly kind: 'path' | 'identity'
  /** A home-relative path or a GitHub owner/name identity. */
  readonly value: string
}

export interface SweepHit {
  readonly file: string
  readonly line: number
  readonly match: string
}

export interface ConvergePlan {
  readonly manifest: string
  readonly items: readonly ConvergeItem[]
  /** Symlink rewrites and empty-parent removals that follow every repository action. */
  readonly finalActions: readonly ConvergeAction[]
  readonly trackedSymlinks: readonly { readonly path: string; readonly from: string; readonly to: string }[]
  readonly leftovers: readonly { readonly path: string; readonly entries: readonly string[] }[]
  /** Old paths and renamed identities whose remaining occurrences the sweep reports. */
  readonly sweepPatterns: readonly SweepPattern[]
}

export interface ConvergeLog {
  readonly schema: 'ki/estate-converge/v1'
  readonly manifest: string
  readonly startedAt: string
  readonly backups: readonly { readonly original: string; readonly copy: string }[]
  readonly actions: readonly ConvergeAction[]
}
