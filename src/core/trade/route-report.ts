import type { EstateRouteInspection } from './estate.ts'

const ESTATE_ROUTE_REPORT_SCHEMA = 'ki/trade-routes/v1' as const

interface EstateRouteReport {
  readonly schema: typeof ESTATE_ROUTE_REPORT_SCHEMA
  readonly scope: 'estate'
  readonly incomplete: boolean
  readonly routes: readonly {
    readonly source: {
      readonly identity: string
      readonly repository: string
      readonly mapBonus: number
    }
    readonly peer: {
      readonly identity: string
      readonly repository: string
      readonly resolved: boolean
      readonly mapBonus: number | null
    }
    readonly direction: EstateRouteInspection['direction']
    readonly kind: EstateRouteInspection['kind']
    readonly state: EstateRouteInspection['state']
  }[]
}

const identityOf = (repository: string): string => repository.slice('https://github.com/'.length)

/**
 * Projects validated estate inspections onto a stable public contract. Registered roots and
 * declaration paths are deliberately excluded: consumers receive route evidence, never local
 * filesystem topology.
 */
export const estateRouteReport = (
  inspected: readonly EstateRouteInspection[],
  incomplete: boolean
): EstateRouteReport => ({
  schema: ESTATE_ROUTE_REPORT_SCHEMA,
  scope: 'estate',
  incomplete,
  routes: inspected.map((route) => ({
    source: route.source,
    peer: {
      identity: identityOf(route.repository),
      repository: route.repository,
      resolved: Boolean(route.peer?.configuration),
      mapBonus: route.peer?.configuration?.mapBonus ?? null
    },
    direction: route.direction,
    kind: route.kind,
    state: route.state
  }))
})
