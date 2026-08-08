import type { EstateRouteInspection, RouteState } from './trade-core.ts'

/**
 * Renders the registered estate's collapsed trade routes as one self-contained SVG document.
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
const LABEL_HEIGHT = 16
const EDGE_GAP = 8
const FONT = 'monospace'
const INK = '#111827'
const PAPER = '#ffffff'

/** `muted` carries the legend's shape entries, which explain line style rather than trade kind. */
const STROKE = { work: '#b45309', knowledge: '#1d4ed8', both: '#4b5563', muted: '#6b7280' } as const

type StrokeKey = keyof typeof STROKE
type KindKey = Exclude<StrokeKey, 'muted'>

interface PairEdge {
  readonly left: string
  readonly right: string
  readonly kinds: Set<string>
  readonly states: Set<RouteState>
  forward: boolean
  reverse: boolean
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

// A reciprocal route is declared on both sides and a pair may trade in both directions, so
// collapse every declaration onto the unordered pair it connects and keep which ways it runs.
const pairEdges = (routes: readonly EstateRouteInspection[]): readonly PairEdge[] => {
  const pairs = new Map<string, PairEdge>()
  for (const route of routes) {
    const [exporter, importer] = endpoints(route)
    const [left, right] = exporter < importer ? [exporter, importer] : [importer, exporter]
    const key = `${left} ${right}`
    const edge = pairs.get(key) ?? {
      left,
      right,
      kinds: new Set<string>(),
      states: new Set<RouteState>(),
      forward: false,
      reverse: false
    }
    edge.kinds.add(route.kind)
    edge.states.add(route.state)
    if (exporter === left) edge.forward = true
    else edge.reverse = true
    pairs.set(key, edge)
  }
  return [...pairs.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, edge]) => edge)
}

const kindKey = (edge: PairEdge): KindKey => (edge.kinds.size > 1 ? 'both' : ([...edge.kinds][0] as KindKey))

const halfWidthOf = (identity: string): number => (identity.length * CHARACTER_WIDTH) / 2 + NODE_PADDING

const round = (value: number): number => Math.round(value * 10) / 10

/** Intersects the ray leaving a node's centre with its label rectangle, then clears the arrowhead. */
const boundary = (node: PlacedNode, towardX: number, towardY: number): readonly [number, number] => {
  const dx = towardX - node.x
  const dy = towardY - node.y
  const fraction =
    Math.min(node.halfWidth / Math.abs(dx), NODE_HEIGHT / 2 / Math.abs(dy)) + EDGE_GAP / Math.hypot(dx, dy)
  return [round(node.x + dx * fraction), round(node.y + dy * fraction)]
}

const marker = (id: string, colour: string, reversed: boolean): string =>
  `<marker id="${id}" viewBox="0 0 10 10" refX="${reversed ? 1 : 9}" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="${reversed ? 'M 10 0 L 0 5 L 10 10 z' : 'M 0 0 L 10 5 L 0 10 z'}" fill="${colour}"/></marker>`

const label = (x: number, y: number, text: string, colour: string, size: number): string =>
  `<text x="${round(x)}" y="${round(y)}" text-anchor="middle" dominant-baseline="middle" font-family="${FONT}" font-size="${size}" fill="${colour}">${text}</text>`

const legendSample = (x: number, y: number, key: StrokeKey, dashed: boolean, both: boolean): string =>
  `<line x1="${x}" y1="${y}" x2="${x + 30}" y2="${y}" stroke="${STROKE[key]}" stroke-width="2"${dashed ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#arrow-end-${key})"${both ? ` marker-start="url(#arrow-start-${key})"` : ''}/>`

export const renderEstateRoutesDiagram = (inspected: readonly EstateRouteInspection[], incomplete: boolean): string => {
  const edges = pairEdges(incomplete ? inspected.filter((route) => route.state !== 'active') : inspected)
  const nodes = [...new Set(edges.flatMap((edge) => [edge.left, edge.right]))].sort((left, right) =>
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
    const from = placed.get(edge.left) as PlacedNode
    const to = placed.get(edge.right) as PlacedNode
    const [x1, y1] = boundary(from, to.x, to.y)
    const [x2, y2] = boundary(to, from.x, from.y)
    const key = kindKey(edge)
    const colour = STROKE[key]
    const dashed = [...edge.states].some((state) => state !== 'active')
    const kinds = [...edge.kinds].sort().join(' + ')
    const states = [...edge.states].sort().join(', ')
    const arrows = `${edge.forward ? ` marker-end="url(#arrow-end-${key})"` : ''}${edge.reverse ? ` marker-start="url(#arrow-start-${key})"` : ''}`
    const midX = (x1 + x2) / 2
    const midY = (y1 + y2) / 2
    const boxWidth = kinds.length * CHARACTER_WIDTH + 10
    return [
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${colour}" stroke-width="2"${dashed ? ' stroke-dasharray="6 4"' : ''}${arrows}><title>${edge.left} ${edge.forward && edge.reverse ? '&#8596;' : edge.forward ? '&#8594;' : '&#8592;'} ${edge.right} · ${kinds} · ${states}</title></line>`,
      `<rect x="${round(midX - boxWidth / 2)}" y="${round(midY - LABEL_HEIGHT / 2)}" width="${round(boxWidth)}" height="${LABEL_HEIGHT}" rx="4" fill="${PAPER}" stroke="${colour}" stroke-width="0.5"/>`,
      label(midX, midY, kinds, colour, 10)
    ].join('')
  })

  const drawnNodes = [...placed.values()].map(
    (node) =>
      `<g><rect x="${round(node.x - node.halfWidth)}" y="${round(node.y - NODE_HEIGHT / 2)}" width="${round(node.halfWidth * 2)}" height="${NODE_HEIGHT}" rx="6" fill="${PAPER}" stroke="${INK}" stroke-width="1.5"/>${label(node.x, node.y, node.identity, INK, 12)}</g>`
  )

  const legend = [
    { text: 'work', key: 'work', dashed: false, both: false },
    { text: 'knowledge', key: 'knowledge', dashed: false, both: false },
    { text: 'both kinds', key: 'both', dashed: false, both: false },
    { text: 'active', key: 'muted', dashed: false, both: false },
    { text: 'incomplete', key: 'muted', dashed: true, both: false },
    { text: 'reciprocal', key: 'muted', dashed: false, both: true }
  ].map((entry, index) => {
    const x = MARGIN + (index % 3) * 200
    const y = legendTop + 16 + Math.floor(index / 3) * 28
    return `${legendSample(x, y, entry.key as StrokeKey, entry.dashed, entry.both)}<text x="${x + 38}" y="${y}" dominant-baseline="middle" font-family="${FONT}" font-size="11" fill="${INK}">${entry.text}</text>`
  })

  const markers = (Object.keys(STROKE) as readonly StrokeKey[]).flatMap((key) => [
    marker(`arrow-end-${key}`, STROKE[key], false),
    marker(`arrow-start-${key}`, STROKE[key], true)
  ])

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
    `<title>${title}</title>`,
    `<desc>${nodes.length} repositories, ${edges.length} routes, ${scope}.</desc>`,
    `<rect width="${width}" height="${height}" fill="${PAPER}"/>`,
    `<defs>${markers.join('')}</defs>`,
    label(width / 2, 28, title, INK, 15),
    label(width / 2, 48, `${nodes.length} repositories · ${edges.length} routes · ${scope}`, STROKE.muted, 11),
    ...drawnEdges,
    ...drawnNodes,
    `<line x1="${MARGIN}" y1="${round(legendTop - 8)}" x2="${round(width - MARGIN)}" y2="${round(legendTop - 8)}" stroke="#e5e7eb" stroke-width="1"/>`,
    ...legend,
    '</svg>',
    ''
  ].join('\n')
}
