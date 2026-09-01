import type { EstateRouteInspection, RouteState } from './estate.ts'

export interface EstateNetwork {
  readonly nodes: readonly {
    readonly id: string
    readonly owner: string
    readonly name: string
    readonly inbound: number
    readonly outbound: number
    readonly organisationBonus: number
    readonly mapBonus: number
    readonly influence: number
    readonly role: 'source' | 'sink' | 'peer' | 'hub'
  }[]
  readonly links: readonly {
    readonly source: string
    readonly target: string
    readonly kinds: readonly string[]
    readonly states: readonly string[]
    readonly active: boolean
    readonly laneCapacity: number
    readonly targetDistance: number
    readonly springStrength: number
    readonly strokeWidth: number
  }[]
  readonly incomplete: boolean
}

const identityOf = (repository: string): string => repository.slice('https://github.com/'.length)

const endpoints = (route: EstateRouteInspection): readonly [string, string] =>
  route.direction === 'export'
    ? [route.source.identity, identityOf(route.repository)]
    : [identityOf(route.repository), route.source.identity]

const pairKey = (left: string, right: string): string =>
  left.localeCompare(right) <= 0 ? `${left}\n${right}` : `${right}\n${left}`

const nodeRole = (inbound: number, outbound: number, mapBonus: number): 'source' | 'sink' | 'peer' | 'hub' => {
  if (!inbound) return 'source'
  if (!outbound) return 'sink'
  return mapBonus ? 'hub' : 'peer'
}

/**
 * Collapses declarations onto the direction they run rather than the pair they connect, so a
 * reciprocated pair stays two links and a pair reciprocating one trade kind but not the other
 * remains distinguishable.
 */
export const estateNetwork = (inspected: readonly EstateRouteInspection[], incomplete: boolean): EstateNetwork => {
  const selected = incomplete ? inspected.filter((route) => route.state !== 'active') : inspected
  const links = new Map<
    string,
    { kinds: Set<string>; activeKinds: Set<string>; states: Set<RouteState>; source: string; target: string }
  >()
  const mapBonuses = new Map<string, number>()
  for (const route of selected) {
    const [source, target] = endpoints(route)
    mapBonuses.set(route.source.identity, route.source.mapBonus)
    if (route.peer?.configuration) mapBonuses.set(route.peer.configuration.identity, route.peer.configuration.mapBonus)
    const key = `${source} ${target}`
    const link = links.get(key) ?? {
      kinds: new Set<string>(),
      activeKinds: new Set<string>(),
      states: new Set<RouteState>(),
      source,
      target
    }
    link.kinds.add(route.kind)
    if (route.state === 'active') link.activeKinds.add(route.kind)
    link.states.add(route.state)
    links.set(key, link)
  }
  const ordered = [...links.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, link]) => link)
  const identities = [...new Set(ordered.flatMap((link) => [link.source, link.target]))].sort((left, right) =>
    left.localeCompare(right)
  )
  const laneCapacities = new Map<string, number>()
  for (const link of ordered) {
    const key = pairKey(link.source, link.target)
    laneCapacities.set(key, (laneCapacities.get(key) ?? 0) + link.activeKinds.size)
  }
  const degrees = new Map<string, { inbound: number; outbound: number }>()
  for (const link of ordered) {
    const capacity = link.activeKinds.size
    const source = degrees.get(link.source) ?? { inbound: 0, outbound: 0 }
    const target = degrees.get(link.target) ?? { inbound: 0, outbound: 0 }
    source.outbound += capacity
    target.inbound += capacity
    degrees.set(link.source, source)
    degrees.set(link.target, target)
  }
  const nodes = identities.map((id) => {
    const [owner, name] = id.split('/') as [string, string]
    const degree = degrees.get(id) as { inbound: number; outbound: number }
    const organisationBonus = owner === 'knowledgeislands' ? 1 : 0
    const mapBonus = mapBonuses.get(id) ?? 0
    const influence = degree.inbound + degree.outbound + organisationBonus + mapBonus
    return {
      id,
      owner,
      name,
      inbound: degree.inbound,
      outbound: degree.outbound,
      organisationBonus,
      mapBonus,
      influence,
      role: nodeRole(degree.inbound, degree.outbound, mapBonus)
    }
  })
  return {
    nodes,
    links: ordered.map((link) => {
      const laneCapacity = laneCapacities.get(pairKey(link.source, link.target)) as number
      return {
        source: link.source,
        target: link.target,
        kinds: [...link.kinds].sort(),
        states: [...link.states].sort(),
        active: [...link.states].every((state) => state === 'active'),
        laneCapacity,
        targetDistance: 180 + laneCapacity * 42,
        springStrength: Number((0.16 + laneCapacity * 0.03).toFixed(2)),
        strokeWidth: Number((1.4 + laneCapacity * 0.2).toFixed(1))
      }
    }),
    incomplete
  }
}
