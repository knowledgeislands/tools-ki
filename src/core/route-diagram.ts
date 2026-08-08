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
const NODE_HEIGHT = 46
const NODE_PADDING = 16
const CHARACTER_WIDTH = 7.3
const ICON_PITCH = 14
const ICON_HEIGHT = 13
const EDGE_GAP = 8
/**
 * Shortest drawn edge the layout will produce. An edge has to carry a badge, an arrowhead, and a
 * clear gap at each end; below this the three run together and the edge stops reading as a route.
 */
const MINIMUM_EDGE_LENGTH = 96
/** Vertical clearance between two nodes sharing a column. */
const ROW_SPACING = 34
/** How far an edge detours per column it has to clear, so it passes around nodes and not through. */
const COLUMN_BOW = 92
const LEGEND_COLUMN = 230
const LEGEND_TEXT_OFFSET = 52
/** Advance of the 11px monospace legend text, used to keep the canvas wide enough to hold it. */
const LEGEND_CHARACTER_WIDTH = 6.7
/** Half the distance between the two lines of a reciprocated pair. */
const EDGE_SEPARATION = 8
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
      offset: 0
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
  }
  return ordered
}

/** Splits `owner/name` so a node can stack its two parts instead of running wide on one line. */
const nodeParts = (identity: string): readonly [string, string] => [
  identity.slice(0, identity.indexOf('/')),
  identity.slice(identity.indexOf('/') + 1)
]

/**
 * Assigns each repository a column, left to right, so that an edge points forward wherever the
 * declarations allow it. A repository that only sends therefore starts at the left edge and one
 * that only receives is pinned to the right, with everything else falling into the columns its
 * own traffic implies.
 *
 * A reciprocated estate is cyclic almost everywhere, so the edges that close a cycle are set
 * aside and the remainder — which is acyclic by construction — is layered by longest path. Depth
 * first order follows the caller's node ordering, so the same estate always lays out the same way.
 */
const columnOf = (nodes: readonly string[], edges: readonly DirectedEdge[]): ReadonlyMap<string, number> => {
  const outgoing = new Map<string, string[]>(nodes.map((node) => [node, []]))
  for (const edge of edges) (outgoing.get(edge.exporter) as string[]).push(edge.importer)
  const open = new Set<string>()
  const closed = new Set<string>()
  const closing = new Set<string>()
  const visit = (node: string): void => {
    open.add(node)
    for (const next of outgoing.get(node) as string[]) {
      if (open.has(next)) closing.add(`${node} ${next}`)
      else if (!closed.has(next)) visit(next)
    }
    open.delete(node)
    closed.add(node)
  }
  for (const node of nodes) if (!closed.has(node)) visit(node)

  const forward = edges.filter((edge) => !closing.has(`${edge.exporter} ${edge.importer}`))
  const layer = new Map<string, number>(nodes.map((node) => [node, 0]))
  // One relaxation pass per node is enough for the longest path through an acyclic graph.
  for (let pass = 0; pass < nodes.length; pass += 1)
    for (const edge of forward)
      layer.set(edge.importer, Math.max(layer.get(edge.importer) as number, (layer.get(edge.exporter) as number) + 1))

  // A repository that sends nothing belongs at the right edge whatever path reached it.
  const sending = new Set(edges.map((edge) => edge.exporter))
  const last = Math.max(0, ...layer.values())
  for (const node of nodes) if (!sending.has(node)) layer.set(node, last)
  return layer
}

const halfWidthOf = (identity: string): number => {
  const [owner, name] = nodeParts(identity)
  return (Math.max(owner.length, name.length) * CHARACTER_WIDTH) / 2 + NODE_PADDING
}

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
 * The badge turns with its edge rather than staying upright, so its icons always read in the
 * direction of travel — the same kinds appear in the same order whichever way the arrow points.
 * Nothing in a badge has an up: both icons are symmetric under the half turn this can impose.
 */
const edgeAngle = (dx: number, dy: number): number => (Math.atan2(dy, dx) * 180) / Math.PI

/** Draws the kinds travelling one edge as a boxed row of icons laid out along it. */
const kindBadge = (kinds: readonly string[], x: number, y: number, angle: number): string => {
  const width = kinds.length * ICON_PITCH + 6
  const contents = [
    `<rect x="${round(x - width / 2)}" y="${round(y - ICON_HEIGHT / 2)}" width="${round(width)}" height="${ICON_HEIGHT}" rx="4" fill="${PAPER}" stroke="${RULE}" stroke-width="1"/>`,
    ...kinds.map((kind, index) => kindIcon(kind, x - ((kinds.length - 1) * ICON_PITCH) / 2 + index * ICON_PITCH, y))
  ].join('')
  return `<g transform="rotate(${round(angle)} ${round(x)} ${round(y)})">${contents}</g>`
}

const legendEntries = [
  { text: 'work travels this way', kinds: ['work'], dashed: false, paired: false },
  { text: 'knowledge travels this way', kinds: ['knowledge'], dashed: false, paired: false },
  { text: 'both kinds travel this way', kinds: ['knowledge', 'work'], dashed: false, paired: false },
  { text: 'active', kinds: [], dashed: false, paired: false },
  { text: 'awaiting reciprocity', kinds: [], dashed: true, paired: false },
  { text: 'reciprocated, drawn side by side', kinds: [], dashed: false, paired: true }
] as const

const line = (x1: number, y1: number, x2: number, y2: number, dashed: boolean): string =>
  `<line x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" stroke="${EDGE}" stroke-width="2"${dashed ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#arrow)"/>`

/**
 * Draws an edge through a control point. Two nodes in one column would otherwise be joined by a
 * line running straight through whatever sits between them, so the control point steps aside;
 * placing it on the midpoint leaves the curve straight, which is what a cross-column edge wants.
 */
const curve = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  controlX: number,
  controlY: number,
  dashed: boolean
): string =>
  `<path d="M ${round(x1)} ${round(y1)} Q ${round(controlX)} ${round(controlY)} ${round(x2)} ${round(y2)}" fill="none" stroke="${EDGE}" stroke-width="2"${dashed ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#arrow)"/>`

const label = (x: number, y: number, text: string, colour: string, size: number): string =>
  `<text x="${round(x)}" y="${round(y)}" text-anchor="middle" dominant-baseline="middle" font-family="${FONT}" font-size="${size}" fill="${colour}">${text}</text>`

export const renderEstateRoutesDiagram = (inspected: readonly EstateRouteInspection[], incomplete: boolean): string => {
  const edges = directedEdges(incomplete ? inspected.filter((route) => route.state !== 'active') : inspected)
  const nodes = [...new Set(edges.flatMap((edge) => [edge.exporter, edge.importer]))].sort((left, right) =>
    left.localeCompare(right)
  )
  const widest = Math.max(0, ...nodes.map(halfWidthOf))
  const layer = columnOf(nodes, edges)
  // Layering leaves gaps wherever a column emptied, so re-index onto consecutive positions.
  const occupied = [...new Set(layer.values())].sort((left, right) => left - right)
  const columns: string[][] = occupied.map(() => [])
  for (const node of nodes) (columns[occupied.indexOf(layer.get(node) as number)] as string[]).push(node)

  // Space the columns so the shortest edge — one that crosses a single column — stays readable
  // once each node's box and its end gap are taken out of it.
  const columnGap = 2 * widest + MINIMUM_EDGE_LENGTH + 2 * EDGE_GAP
  const rowGap = NODE_HEIGHT + ROW_SPACING
  const tallest = Math.max(1, ...columns.map((column) => column.length))
  const spread = Math.max(columns.length - 1, 0) * columnGap
  const legendWidth =
    2 * MARGIN +
    2 * LEGEND_COLUMN +
    LEGEND_TEXT_OFFSET +
    Math.max(...legendEntries.map((entry) => entry.text.length)) * LEGEND_CHARACTER_WIDTH
  const width = round(Math.max(2 * MARGIN + 2 * widest + spread, legendWidth))
  const position = new Map<string, number>(
    columns.flatMap((column, columnIndex) =>
      column.map((identity): readonly [string, number] => [identity, columnIndex])
    )
  )
  /**
   * An edge between adjacent columns runs straight, in either direction — a reciprocated pair is
   * already separated by its perpendicular offset. Every other edge has something in the way, an
   * intervening column or the node it shares a column with, so it detours by how far it reaches.
   * That also nests the long edges instead of piling them onto one another.
   */
  const detour = (edge: DirectedEdge): number =>
    COLUMN_BOW *
    Math.abs(Math.abs((position.get(edge.importer) as number) - (position.get(edge.exporter) as number)) - 1)
  // A quadratic strays half its control offset and carries a badge at that far point. An edge
  // running back leftwards detours above the row and everything else below it, so each side is
  // sized by the edges that actually use it rather than by the largest detour anywhere.
  const runsBack = (edge: DirectedEdge): boolean =>
    (position.get(edge.importer) as number) < (position.get(edge.exporter) as number)
  const clearanceFor = (backward: boolean): number =>
    Math.max(0, ...edges.filter((edge) => runsBack(edge) === backward).map(detour)) / 2 + ICON_HEIGHT
  const above = clearanceFor(true)
  const below = clearanceFor(false)
  const centreY = TITLE_BAND + above + (tallest * rowGap) / 2
  const legendTop = TITLE_BAND + above + tallest * rowGap + below + 24
  const height = round(legendTop + LEGEND_BAND)
  const leftColumn = (width - spread) / 2
  const placed = new Map<string, PlacedNode>(
    columns.flatMap((column, columnIndex) =>
      column.map((identity, rowIndex): readonly [string, PlacedNode] => [
        identity,
        {
          identity,
          x: leftColumn + columnIndex * columnGap,
          y: centreY + (rowIndex - (column.length - 1) / 2) * rowGap,
          halfWidth: halfWidthOf(identity)
        }
      ])
    )
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
    const bow = detour(edge)
    const reach = Math.hypot(x2 - x1, y2 - y1)
    const controlX = (x1 + x2) / 2 + ((y1 - y2) / reach) * bow
    const controlY = (y1 + y2) / 2 + ((x2 - x1) / reach) * bow
    const kinds = [...edge.kinds].sort()
    const states = [...edge.states].sort().join(', ')
    const dashed = [...edge.states].some((state) => state !== 'active')
    return [
      `<g><title>${edge.exporter} &#8594; ${edge.importer} · ${kinds.join(' + ')} · ${states}</title>`,
      curve(x1, y1, x2, y2, controlX, controlY, dashed),
      // Halfway along the quadratic, which is not the midpoint of its ends once it bows.
      kindBadge(kinds, (x1 + 2 * controlX + x2) / 4, (y1 + 2 * controlY + y2) / 4, edgeAngle(x2 - x1, y2 - y1)),
      '</g>'
    ].join('')
  })

  const drawnNodes = [...placed.values()].map((node) => {
    const [owner, name] = nodeParts(node.identity)
    return [
      `<g><rect x="${round(node.x - node.halfWidth)}" y="${round(node.y - NODE_HEIGHT / 2)}" width="${round(node.halfWidth * 2)}" height="${NODE_HEIGHT}" rx="6" fill="${PAPER}" stroke="${INK}" stroke-width="1.5"/>`,
      label(node.x, node.y - 10, owner, MUTED, 10),
      label(node.x, node.y + 8, name, INK, 13),
      '</g>'
    ].join('')
  })

  const legend = legendEntries.map((entry, index) => {
    const x = MARGIN + (index % 3) * LEGEND_COLUMN
    const y = legendTop + 16 + Math.floor(index / 3) * 30
    const sample = entry.paired
      ? `${line(x, y - 4, x + 44, y - 4, false)}${line(x + 44, y + 4, x, y + 4, false)}`
      : `${line(x, y, x + 44, y, entry.dashed)}${entry.kinds.length ? kindBadge(entry.kinds, x + 22, y, 0) : ''}`
    return `${sample}<text x="${x + LEGEND_TEXT_OFFSET}" y="${y}" dominant-baseline="middle" font-family="${FONT}" font-size="11" fill="${INK}">${entry.text}</text>`
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
