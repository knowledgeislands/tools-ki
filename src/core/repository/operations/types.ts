import type { lstat } from 'node:fs/promises'
import type { ResolvedSkill } from '../../configuration/index.ts'
import type { RepositorySkillActivation } from '../../rubric/index.ts'
import type { RepositoryLocation } from '../index.ts'
import type { ProgressTracker } from '../progress/run.ts'

export type RepositoryOperationPhase = 'audit' | 'conform' | 'educate' | 're-audit'

export interface RepositoryOperationProgress {
  readonly resolved: (
    skills: readonly ResolvedSkill[],
    phase: RepositoryOperationPhase,
    completion: 'root' | 'last-root'
  ) => ProgressTracker | undefined
  readonly prepared: (
    skills: readonly import('../../runtime/index.ts').PreparedSkill[],
    phase: RepositoryOperationPhase,
    completion: 'root' | 'last-root'
  ) => ProgressTracker | undefined
}

export interface RepositorySkillActivationHost {
  readonly rubric: RepositorySkillActivation
  readonly hasProposals: () => boolean
  readonly proposedNames: () => readonly string[]
  readonly started: () => boolean
  readonly apply: () => Promise<readonly string[]>
}

export type UserConfigurationInspection =
  | { readonly state: 'missing' }
  | { readonly state: 'invalid'; readonly errors: readonly string[] }
  | { readonly state: 'valid' }

export interface RepositoryOperationContext {
  readonly configurationDirectory: string
  readonly dataDirectory: string
  readonly stateDirectory: string
  readonly workingDirectory: string
  readonly homeDirectory: string
  readonly lstat: typeof lstat
  readonly inspectUserConfiguration: (configurationDirectory: string) => Promise<UserConfigurationInspection>
  readonly createSkillActivation: (options: {
    readonly repository: string
    readonly repositoryDeclaration: string
    readonly skills: readonly ResolvedSkill[]
  }) => Promise<RepositorySkillActivationHost>
  readonly progress: RepositoryOperationProgress
}

export interface RepositorySelection {
  readonly repositories: readonly string[]
  readonly agora?: string
  readonly estate?: boolean
  readonly skill?: string
}

export interface SelectedRepositorySkills {
  readonly repository: RepositoryLocation
  readonly skills: readonly ResolvedSkill[]
}
