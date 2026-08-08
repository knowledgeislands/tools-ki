// Regenerates the vendored viewer runtime. The estate network page has to open on a machine with
// no network, so D3 ships inside the binary rather than being fetched. Run after changing the
// pinned d3 versions; the bundle is checked in so no code generation stands in front of the gate.
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force'
import { drag } from 'd3-drag'
import { select } from 'd3-selection'
import { zoom, zoomIdentity } from 'd3-zoom'

globalThis.d3 = {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  drag,
  select,
  zoom,
  zoomIdentity
}
