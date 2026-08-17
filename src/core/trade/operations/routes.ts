import type { RouteDirection, TradeConfiguration, TradeKind } from '../configuration.ts'
import type { EstateRouteInspection, RouteInspection } from '../index.ts'

type RouteMutation = (
  path: string,
  repository: string,
  direction: RouteDirection,
  kind: TradeKind
) => Promise<TradeConfiguration>

interface MutateTradeRoutePorts {
  readonly configurationPath: () => Promise<string>
  readonly mutate: RouteMutation
}

export const mutateTradeRoute = async (
  repository: string,
  direction: RouteDirection,
  kind: TradeKind,
  ports: MutateTradeRoutePorts
): Promise<TradeConfiguration> => ports.mutate(await ports.configurationPath(), repository, direction, kind)

interface InspectLocalRoutesPorts {
  readonly configuration: () => Promise<TradeConfiguration>
  readonly inspect: (configuration: TradeConfiguration) => Promise<readonly RouteInspection[]>
}

export const inspectLocalTradeRoutes = async (
  incomplete: boolean,
  ports: InspectLocalRoutesPorts
): Promise<readonly RouteInspection[]> => {
  const inspected = await ports.inspect(await ports.configuration())
  return incomplete ? inspected.filter((route) => route.state !== 'active') : inspected
}

export const inspectEstateTradeRoutes = async (
  incomplete: boolean,
  inspect: () => Promise<readonly EstateRouteInspection[]>
): Promise<readonly EstateRouteInspection[]> => {
  const inspected = await inspect()
  return incomplete ? inspected.filter((route) => route.state !== 'active') : inspected
}

export interface TradeRouteSelection {
  readonly repository?: string
  readonly direction?: RouteDirection
  readonly kind?: TradeKind
}

export interface TradeRouteCheck {
  readonly routes: readonly RouteInspection[]
  readonly active: number
}

export const checkTradeRoutes = async (
  selection: TradeRouteSelection,
  ports: InspectLocalRoutesPorts
): Promise<TradeRouteCheck> => {
  const routes = (await ports.inspect(await ports.configuration())).filter(
    (route) =>
      (!selection.repository || route.repository === selection.repository) &&
      (!selection.direction || route.direction === selection.direction) &&
      (!selection.kind || route.kind === selection.kind)
  )
  return { routes, active: routes.filter((route) => route.state === 'active').length }
}
