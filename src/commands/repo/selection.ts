export interface RepositorySelection {
  readonly repositories: readonly string[]
  readonly territory?: string
  readonly filters?: readonly string[]
  readonly estate?: boolean
}

export type SelectRepositories = () => RepositorySelection
