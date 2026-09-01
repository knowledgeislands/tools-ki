export interface RepositorySelection {
  readonly repositories: readonly string[]
  readonly agora?: string
  readonly estate?: boolean
}

export type SelectRepositories = () => RepositorySelection
