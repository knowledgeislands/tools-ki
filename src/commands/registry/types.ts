export interface RegistrySelection {
  readonly repositories: readonly string[]
  readonly territory?: string
  readonly filters?: readonly string[]
  readonly estate?: boolean
  readonly principals?: boolean
}
