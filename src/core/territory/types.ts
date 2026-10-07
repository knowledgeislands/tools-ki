export type TerritoryRootKind = 'owner' | 'member'
export interface TerritoryMember {
  readonly key: string
  readonly root: string
  readonly repository: string
  readonly kind: TerritoryRootKind
}
export type TerritoryRoot = TerritoryMember
export interface TerritoryProfile {
  readonly id: string
  readonly title: string
  readonly home?: TerritoryMember
  readonly members: readonly TerritoryMember[]
  readonly roots: readonly TerritoryRoot[]
  readonly system: boolean
}
