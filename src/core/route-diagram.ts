import type { EstateRouteInspection, RouteState } from './trade-core.ts'

/**
 * Renders the registered estate's declared trade routes as one self-contained SVG document.
 *
 * Identities are constrained to lower-case `owner/name` over `[a-z0-9._-]`, so no value reaching
 * this module can carry an XML metacharacter and no escaping pass is needed.
 */

const MARGIN = 32
const TITLE_BAND = 64
const LEGEND_BAND = 96
const NODE_HEIGHT = 30
const NODE_PADDING = 16
const CHARACTER_WIDTH = 7.3
const ICON_PITCH = 14
const ICON_HEIGHT = 16
const EDGE_GAP = 8
/** Half the distance between the two lines of a reciprocated pair. */
const EDGE_SEPARATION = 11
const FONT = 'monospace'
const INK = '#111827'
const EDGE = '#4b5563'
const RULE = '#e5e7eb'
const MUTED = '#6b7280'
const PAPER = '#ffffff'

/** Trade kind is carried by the icons riding an edge, so the line itself is free to mean state. */
const KIND_FILL = { work: '#b45309', knowledge: '#1d4ed8' } as const

interface DirectedEdge {
  readonly exporter: string
  readonly importer: string
  readonly kinds: Set<string>
  readonly states: Set<RouteState>
  offset: number
  fraction: number
}

interface PlacedNode {
  readonly identity: string
  readonly x: number
  readonly y: number
  readonly halfWidth: number
}

const identityOf = (repository: string): string => repository.slice('https://github.com/'.length)

const endpoints = (route: EstateRouteInspection): readonly [string, string] =>
  route.direction === 'export'
    ? [route.source.identity, identityOf(route.repository)]
    : [identityOf(route.repository), route.source.identity]

/**
 * Collapses declarations onto the direction they run, not the pair they connect. A reciprocal
 * route is declared on both sides, so its two declarations become one directed edge each and are
 * drawn side by side — which also states the case a single line cannot, where a pair reciprocates
 * one trade kind and not the other.
 */
const directedEdges = (routes: readonly EstateRouteInspection[]): readonly DirectedEdge[] => {
  const edges = new Map<string, DirectedEdge>()
  for (const route of routes) {
    const [exporter, importer] = endpoints(route)
    const key = `${exporter} ${importer}`
    const edge = edges.get(key) ?? {
      exporter,
      importer,
      kinds: new Set<string>(),
      states: new Set<RouteState>(),
      offset: 0,
      fraction: 0.5
    }
    edge.kinds.add(route.kind)
    edge.states.add(route.state)
    edges.set(key, edge)
  }
  const ordered = [...edges.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, edge]) => edge)
  for (const edge of ordered) {
    // Each edge offsets to its own right-hand side, so a reciprocated pair separates without
    // either line needing to know which of the two it is.
    if (!edges.has(`${edge.importer} ${edge.exporter}`)) continue
    edge.offset = EDGE_SEPARATION
    edge.fraction = edge.exporter < edge.importer ? 0.3 : 0.7
  }
  return ordered
}

const halfWidthOf = (identity: string): number => (identity.length * CHARACTER_WIDTH) / 2 + NODE_PADDING

const round = (value: number): number => Math.round(value * 10) / 10

/** Intersects the ray leaving a node's centre with its label rectangle, then clears the arrowhead. */
const boundary = (node: PlacedNode, towardX: number, towardY: number): readonly [number, number] => {
  const dx = towardX - node.x
  const dy = towardY - node.y
  const fraction =
    Math.min(node.halfWidth / Math.abs(dx), NODE_HEIGHT / 2 / Math.abs(dy)) + EDGE_GAP / Math.hypot(dx, dy)
  return [node.x + dx * fraction, node.y + dy * fraction]
}

const kindIcon = (kind: string, x: number, y: number): string =>
  kind === 'work'
    ? `<rect x="${round(x - 4)}" y="${round(y - 4)}" width="8" height="8" fill="${KIND_FILL.work}"/>`
    : `<path d="M ${round(x)} ${round(y - 5)} L ${round(x + 5)} ${round(y)} L ${round(x)} ${round(y + 5)} L ${round(x - 5)} ${round(y)} z" fill="${KIND_FILL.knowledge}"/>`

/**
 * Keeps a badge upright whichever way its edge runs: an angle and its reverse read the same, so
 * the result stays within a quarter turn of horizontal and never renders upside down.
 */
const uprightAngle = (dx: number, dy: number): number => {
  const degrees = (Math.atan2(dy, dx) * 180) / Math.PI
  return ((((degrees + 90) % 180) + 180) % 180) - 90
}

/** Draws the kinds travelling one edge as a boxed row of icons laid out along it. */
const kindBadge = (kinds: readonly string[], x: number, y: number, angle: number): string => {
  const width = kinds.length * ICON_PITCH + 6
  const contents = [
    `<rect x="${round(x - width / 2)}" y="${round(y - ICON_HEIGHT / 2)}" width="${round(width)}" height="${ICON_HEIGHT}" rx="4" fill="${PAPER}" stroke="${RULE}" stroke-width="1"/>`,
    ...kinds.map((kind, index) => kindIcon(kind, x - ((kinds.length - 1) * ICON_PITCH) / 2 + index * ICON_PITCH, y))
  ].join('')
  return `<g transform="rotate(${round(angle)} ${round(x)} ${round(y)})">${contents}</g>`
}

const line = (x1: number, y1: number, x2: number, y2: number, dashed: boolean): string =>
  `<line x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" stroke="${EDGE}" stroke-width="2"${dashed ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#arrow)"/>`

const label = (x: number, y: number, text: string, colour: string, size: number): string =>
  `<text x="${round(x)}" y="${round(y)}" text-anchor="middle" dominant-baseline="middle" font-family="${FONT}" font-size="${size}" fill="${colour}">${text}</text>`

export const renderEstateRoutesDiagram = (inspected: readonly EstateRouteInspection[], incomplete: boolean): string => {
  const edges = directedEdges(incomplete ? inspected.filter((route) => route.state !== 'active') : inspected)
  const nodes = [...new Set(edges.flatMap((edge) => [edge.exporter, edge.importer]))].sort((left, right) =>
    left.localeCompare(right)
  )
  const widest = Math.max(0, ...nodes.map(halfWidthOf))
  // Size the circle so the arc between neighbours clears their labels, or long identities overlap.
  const radius = Math.max(150, (nodes.length * (2 * widest + 24)) / (2 * Math.PI))
  const centreX = MARGIN + widest + radius
  const centreY = TITLE_BAND + NODE_HEIGHT / 2 + radius
  const width = round(2 * (radius + widest) + 2 * MARGIN)
  const legendTop = centreY + radius + NODE_HEIGHT / 2 + 24
  const height = round(legendTop + LEGEND_BAND)
  const placed = new Map<string, PlacedNode>(
    nodes.map((identity, index) => {
      const angle = (index / nodes.length) * 2 * Math.PI - Math.PI / 2
      return [
        identity,
        {
          identity,
          x: centreX + radius * Math.cos(angle),
          y: centreY + radius * Math.sin(angle),
          halfWidth: halfWidthOf(identity)
        }
      ]
    })
  )
  const scope = incomplete ? 'incomplete routes only' : 'all declared routes'
  const title = 'Knowledge Islands trade routes — registered estate'

  const drawnEdges = edges.map((edge) => {
    const from = placed.get(edge.exporter) as PlacedNode
    const to = placed.get(edge.importer) as PlacedNode
    const [baseX1, baseY1] = boundary(from, to.x, to.y)
    const [baseX2, baseY2] = boundary(to, from.x, from.y)
    const span = Math.hypot(baseX2 - baseX1, baseY2 - baseY1)
    const shiftX = ((baseY1 - baseY2) / span) * edge.offset
    const shiftY = ((baseX2 - baseX1) / span) * edge.offset
    const x1 = baseX1 + shiftX
    const y1 = baseY1 + shiftY
    const x2 = baseX2 + shiftX
    const y2 = baseY2 + shiftY
    const kinds = [...edge.kinds].sort()
    const states = [...edge.states].sort().join(', ')
    const dashed = [...edge.states].some((state) => state !== 'active')
    return [
      `<g><title>${edge.exporter} &#8594; ${edge.importer} · ${kinds.join(' + ')} · ${states}</title>`,
      line(x1, y1, x2, y2, dashed),
      kindBadge(kinds, x1 + (x2 - x1) * edge.fraction, y1 + (y2 - y1) * edge.fraction, uprightAngle(x2 - x1, y2 - y1)),
      '</g>'
    ].join('')
  })

  const drawnNodes = [...placed.values()].map(
    (node) =>
      `<g><rect x="${round(node.x - node.halfWidth)}" y="${round(node.y - NODE_HEIGHT / 2)}" width="${round(node.halfWidth * 2)}" height="${NODE_HEIGHT}" rx="6" fill="${PAPER}" stroke="${INK}" stroke-width="1.5"/>${label(node.x, node.y, node.identity, INK, 12)}</g>`
  )

  const legend = [
    { text: 'work travels this way', kinds: ['work'], dashed: false, paired: false },
    { text: 'knowledge travels this way', kinds: ['knowledge'], dashed: false, paired: false },
    { text: 'both kinds travel this way', kinds: ['knowledge', 'work'], dashed: false, paired: false },
    { text: 'active', kinds: [], dashed: false, paired: false },
    { text: 'awaiting reciprocity', kinds: [], dashed: true, paired: false },
    { text: 'reciprocated, drawn side by side', kinds: [], dashed: false, paired: true }
  ].map((entry, index) => {
    const x = MARGIN + (index % 3) * 230
    const y = legendTop + 16 + Math.floor(index / 3) * 30
    const sample = entry.paired
      ? `${line(x, y - 4, x + 44, y - 4, false)}${line(x + 44, y + 4, x, y + 4, false)}`
      : `${line(x, y, x + 44, y, entry.dashed)}${entry.kinds.length ? kindBadge(entry.kinds, x + 22, y, 0) : ''}`
    return `${sample}<text x="${x + 52}" y="${y}" dominant-baseline="middle" font-family="${FONT}" font-size="11" fill="${INK}">${entry.text}</text>`
  })

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
    `<title>${title}</title>`,
    `<desc>${nodes.length} repositories, ${edges.length} routes, ${scope}.</desc>`,
    `<rect width="${width}" height="${height}" fill="${PAPER}"/>`,
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="${EDGE}"/></marker></defs>`,
    label(width / 2, 28, title, INK, 15),
    label(width / 2, 48, `${nodes.length} repositories · ${edges.length} routes · ${scope}`, MUTED, 11),
    ...drawnEdges,
    ...drawnNodes,
    `<line x1="${MARGIN}" y1="${round(legendTop - 8)}" x2="${round(width - MARGIN)}" y2="${round(legendTop - 8)}" stroke="${RULE}" stroke-width="1"/>`,
    ...legend,
    '</svg>',
    ''
  ].join('\n')
}
