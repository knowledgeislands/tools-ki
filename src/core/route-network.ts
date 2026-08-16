import d3Runtime from '../assets/d3-runtime.txt' with { type: 'text' }
import { presentation } from './presentation/index.ts'
import type { EstateRouteInspection, RouteState } from './trade/index.ts'

/**
 * Renders the registered estate's declared trade routes as one self-contained interactive page.
 *
 * The page carries the estate as data and lets a force simulation arrange it. The derived route
 * metrics shape that simulation rather than fixing any repository's position, and a reader can
 * still drag a repository when a different arrangement is useful.
 *
 * D3 is vendored rather than fetched, so the page opens with no network. Identities are
 * constrained to lower-case `owner/name` over `[a-z0-9._-]`, so no value reaching this module can
 * carry an HTML metacharacter; the payload is still serialised as JSON rather than interpolated.
 */

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

interface PresentationWithSvg {
  readonly label: string
  readonly svgPaths: readonly string[]
}

const tradeKindPresentation = {
  work: presentation('trade.kind.work') as PresentationWithSvg,
  knowledge: presentation('trade.kind.knowledge') as PresentationWithSvg
} as const

const tradeKindSvgPaths = Object.fromEntries(
  Object.entries(tradeKindPresentation).map(([kind, item]) => [kind, item.svgPaths])
)

const tradeKindIcon = (kind: keyof typeof tradeKindPresentation): string => {
  const item = tradeKindPresentation[kind]
  const paths = item.svgPaths
  return `<svg class="icon ${kind}" viewBox="0 0 24 24" role="img" aria-label="${item.label}">${paths.map((path) => `<path d="${path}"/>`).join('')}</svg>`
}

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

const STYLE = `
:root { color-scheme: light dark; --ink: #111827; --muted: #6b7280; --paper: #ffffff; --rule: #e5e7eb;
  --edge: #4b5563; --work: #b45309; --knowledge: #1d4ed8; }
@media (prefers-color-scheme: dark) { :root { --ink: #f3f4f6; --muted: #9ca3af; --paper: #111827;
  --rule: #374151; --edge: #9ca3af; --work: #f59e0b; --knowledge: #60a5fa; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--paper); color: var(--ink);
  font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; }
header { padding: 18px 24px 10px; }
h1 { margin: 0; font-size: 15px; font-weight: 600; }
p { margin: 4px 0 0; color: var(--muted); font-size: 12px; }
#canvas { width: 100vw; height: calc(100vh - 132px); display: block; cursor: grab; }
#canvas:active { cursor: grabbing; }
footer { border-top: 1px solid var(--rule); padding: 10px 24px; display: flex; flex-wrap: wrap; gap: 8px 28px;
  font-size: 11px; color: var(--muted); align-items: center; }
footer span { display: inline-flex; align-items: center; gap: 6px; }
.node rect { fill: var(--paper); stroke: var(--ink); stroke-width: 1.5; }
.node.hub rect { stroke-width: 2; }
.node text.owner { fill: var(--muted); font-size: 10px; }
.node text.name { fill: var(--ink); font-size: 12px; }
.node { cursor: grab; }
.link { stroke: var(--edge); stroke-width: 2; fill: none; }
.link.incomplete { stroke-dasharray: 6 4; }
.icon { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.icon.work { color: var(--work); }
.icon.knowledge { color: var(--knowledge); }
#detail { position: fixed; padding: 6px 9px; background: var(--paper); border: 1px solid var(--rule);
  border-radius: 5px; font-size: 11px; pointer-events: none; opacity: 0; transition: opacity .12s; }
`

/**
 * The viewer. Nodes are sized from their label so the simulation can keep them apart, each link is
 * drawn as its own arc so a reciprocated pair separates, and the kinds travelling a link ride it as
 * chips. Everything here runs in the reader's browser against the payload above.
 */
const VIEWER = `
const data = window.__estate
const iconPaths = ${JSON.stringify(tradeKindSvgPaths)}
const svg = d3.select('#canvas')
const root = svg.append('g')
const detail = d3.select('#detail')
svg.append('defs').html(
  '<marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto">' +
  '<path d="M 0 0 L 10 5 L 0 10 z" fill="var(--edge)"/></marker>'
)
const measure = (node) => {
  const influence = Math.min(node.influence, 16)
  node.w = Math.max(node.owner.length, node.name.length) * 7.3 + 26 + influence * 1.4
  node.h = 42 + influence * 0.7
}
data.nodes.forEach(measure)
const radius = (node) => Math.hypot(node.w, node.h) / 2
// Where a ray leaving a node's centre crosses its label box, so an arrow stops on the edge of the
// box rather than short of it or under it.
const edgeOf = (node, towardX, towardY) => {
  const dx = towardX - node.x, dy = towardY - node.y
  const reach = Math.hypot(dx, dy) || 1
  const scale = Math.min(node.w / 2 / (Math.abs(dx) || 1e-6), node.h / 2 / (Math.abs(dy) || 1e-6))
  return [node.x + dx * scale, node.y + dy * scale, dx / reach, dy / reach]
}

const link = root.append('g').selectAll('path').data(data.links).join('path')
  .attr('class', (d) => 'link' + (d.active ? '' : ' incomplete'))
  .attr('stroke-width', (d) => d.strokeWidth)
  .attr('marker-end', 'url(#arrow)')
const chips = root.append('g').selectAll('g').data(data.links).join('g')
chips.each(function (d) {
  d3.select(this).selectAll('svg').data(d.kinds).join('svg')
    .attr('class', (kind) => 'icon ' + kind).attr('viewBox', '0 0 24 24').attr('width', 12).attr('height', 12)
    .attr('role', 'img').attr('aria-label', (kind) => kind)
    .html((kind) => iconPaths[kind].map((path) => '<path d="' + path + '"/>').join(''))
})

const node = root.append('g').selectAll('g').data(data.nodes).join('g').attr('class', (d) => 'node ' + d.role)
node.append('rect').attr('rx', 6)
  .attr('width', (d) => d.w).attr('height', (d) => d.h)
  .attr('x', (d) => -d.w / 2).attr('y', (d) => -d.h / 2)
node.append('text').attr('class', 'owner').attr('text-anchor', 'middle').attr('y', -4).text((d) => d.owner)
node.append('text').attr('class', 'name').attr('text-anchor', 'middle').attr('y', 13).text((d) => d.name)

const sized = () => ({ w: svg.node().clientWidth, h: svg.node().clientHeight })
const simulation = d3.forceSimulation(data.nodes)
  .force('link', d3.forceLink(data.links).id((d) => d.id).distance((d) => d.targetDistance).strength((d) => d.springStrength))
  .force('charge', d3.forceManyBody().strength((d) => -1800 - d.influence * 140))
  .force('collide', d3.forceCollide((d) => radius(d) + 20 + d.influence * 1.5))
  .force('centre', d3.forceCenter(sized().w / 2, sized().h / 2))
  .on('tick', tick)

// Two nodes carry a link each way, so every link bows to its own side and neither hides the other.
const paired = new Set(data.links.map((d) => d.source.id + ' ' + d.target.id))
const bowed = (d) => paired.has(d.target.id + ' ' + d.source.id)

// Kinds ride close to the arrowhead rather than the midpoint, where a reciprocated pair's two
// arcs run nearest each other and a chip cannot be told apart from its opposite number's.
const CHIP_AT = 0.82
const along = (from, control, to, t) => (1 - t) * (1 - t) * from + 2 * (1 - t) * t * control + t * t * to

// Both ends clipped to their box, bowed to one side when the pair also trades the other way.
const geometry = (d) => {
  const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y
  const span = Math.hypot(dx, dy) || 1
  const bow = bowed(d) ? 30 : 0
  const cx = (d.source.x + d.target.x) / 2 - (dy / span) * bow
  const cy = (d.source.y + d.target.y) / 2 + (dx / span) * bow
  const [sx, sy] = edgeOf(d.source, cx, cy)
  const [tx, ty, ux, uy] = edgeOf(d.target, cx, cy)
  return { cx, cy, sx, sy, tx: tx + ux * 7, ty: ty + uy * 7 }
}

function tick() {
  link.attr('d', (d) => {
    const g = geometry(d)
    return 'M ' + g.sx + ' ' + g.sy + ' Q ' + g.cx + ' ' + g.cy + ' ' + g.tx + ' ' + g.ty
  })
  chips.attr('transform', (d) => {
    const g = geometry(d)
    const x = along(g.sx, g.cx, g.tx, CHIP_AT)
    const y = along(g.sy, g.cy, g.ty, CHIP_AT)
    return 'translate(' + (x - (d.kinds.length * 15 - 4) / 2) + ',' + (y - 6) + ')'
  })
  chips.selectAll('svg').attr('x', (kind, index) => index * 15)
  node.attr('transform', (d) => 'translate(' + d.x + ',' + d.y + ')')
}

node.call(d3.drag()
  .on('start', (event, d) => { if (!event.active) simulation.alphaTarget(0.25).restart(); d.fx = d.x; d.fy = d.y })
  .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
  .on('end', (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null }))

svg.call(d3.zoom().scaleExtent([0.2, 4]).on('zoom', (event) => root.attr('transform', event.transform)))

const describe = (d) => d.source.id + ' \\u2192 ' + d.target.id + ' \\u00b7 ' +
  d.kinds.join(' + ') + ' \\u00b7 capacity ' + d.laneCapacity + '/4 \\u00b7 ' +
  d.targetDistance + ' px \\u00b7 spring ' + d.springStrength + ' \\u00b7 ' + d.states.join(', ')
link.on('mousemove', (event, d) => {
  detail.style('opacity', 1).style('left', (event.clientX + 14) + 'px')
    .style('top', (event.clientY + 14) + 'px').text(describe(d))
}).on('mouseleave', () => detail.style('opacity', 0))
node.on('mousemove', (event, d) => {
  detail.style('opacity', 1).style('left', (event.clientX + 14) + 'px')
    .style('top', (event.clientY + 14) + 'px').text(
      d.id + ' \\u00b7 ' + d.role + ' \\u00b7 sends ' + d.outbound + ' \\u00b7 receives ' + d.inbound +
      ' \\u00b7 influence ' + d.influence + ' (routes ' + (d.inbound + d.outbound) +
      ' + organisation ' + d.organisationBonus + ' + declared ' + d.mapBonus + ')'
    )
}).on('mouseleave', () => detail.style('opacity', 0))

addEventListener('resize', () => {
  simulation.force('centre', d3.forceCenter(sized().w / 2, sized().h / 2)).alpha(0.3).restart()
})
`

const legend = [
  `<span>${tradeKindIcon('work')} work</span>`,
  `<span>${tradeKindIcon('knowledge')} knowledge</span>`,
  '<span>solid â active</span>',
  '<span>dashed â awaiting reciprocity</span>',
  '<span>lane capacity sets distance, spring, and width; influence combines routes and map bonuses</span>',
  '<span>one arc per direction; drag a repository, scroll to zoom</span>'
].join('')

export const renderEstateRoutesPage = (network: EstateNetwork): string => {
  const scope = network.incomplete ? 'incomplete routes only' : 'all declared routes'
  const summary = `${network.nodes.length} repositories Â· ${network.links.length} routes Â· ${scope}`
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Knowledge Islands trade routes â registered estate</title>
<style>${STYLE}</style>
</head>
<body>
<header>
<h1>Knowledge Islands trade routes â registered estate</h1>
<p>${summary}</p>
</header>
<svg id="canvas"></svg>
<div id="detail"></div>
<footer>${legend}</footer>
<script>${d3Runtime}</script>
<script>window.__estate = ${JSON.stringify(network)}</script>
<script>${VIEWER}</script>
</body>
</html>
`
}
