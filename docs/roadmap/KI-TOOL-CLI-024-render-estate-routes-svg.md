---
id: KI-TOOL-CLI-024
title: Render estate routes SVG
theme: cli
horizon: now
status: draft
blocks: []
blocked-by: [KI-TOOL-CLI-025]
baseline-ref: null
---

## Goal

Render the registered repository estate's trade routes as a self-contained SVG diagram, so that the shape of an estate — who exports what to whom, which relationships are reciprocal, and where a declaration is waiting on its counterpart — can be read at a glance and embedded in documentation.

## Context

`ki trade routes list --estate` answers the question one route at a time. In the reference estate that is thirty-four rows, and the structure a reader actually wants — that this repository sends knowledge to three peers but receives it from none, or that one pair is reciprocal while another is one-way — has to be reconstructed mentally from a flat list. A diagram is the natural form for a graph, and the estate is a small directed multigraph over repositories with typed, directional edges.

The data needed is already assembled. `inspectEstateRoutes` walks every registered repository, reads each declaration, and returns edges carrying source, peer, kind, and computed state. Nothing new has to be discovered; this item is a second renderer over an existing inspection, not a new traversal.

An SVG suits this better than a raster image or a dependency on an external diagramming tool. It is text, so it diffs and reviews; it needs no runtime dependency to produce; it scales; and it can be committed beside documentation or opened directly in a browser.

## Boundary

This item does not change route declaration, route semantics, or the `.ki-config.toml` contract, and it does not alter the existing textual `--estate` output, which remains the scriptable form. It introduces no image-format dependency beyond emitting SVG text, adds no interactivity or animation, and does not attempt a general-purpose graph layout engine. It does not publish the diagram anywhere; producing the file is the whole scope.

## Current state

`inspectEstateRoutes` in `src/core/trade-core.ts` returns one inspection per declaration, each carrying `source`, `repository`, `kind`, `direction`, and `state`. Because a reciprocal route is declared on both sides, the same logical edge appears twice, which any renderer must collapse rather than draw twice.

Route state is computed from the peer's reciprocal declaration rather than stored, so `active`, `awaiting-receiver`, `awaiting-sender`, and `ambiguous-repository` are all available per edge and are the natural candidates for visual distinction.

## Steps

- [ ] Decide the command surface, most likely a flag on the existing estate listing that writes SVG to a path or to standard output, so the textual form stays the default.
- [ ] Collapse reciprocal declarations into one logical edge per repository pair and kind before layout, retaining direction and state.
- [ ] Choose a layout that stays legible at estate scale without a general graph engine; a circular or layered arrangement is likely sufficient for the tens of repositories a realistic estate holds.
- [ ] Distinguish trade kind and route state visually, and render an edge that is reciprocal differently from a one-way edge rather than drawing two arrows.
- [ ] Emit self-contained SVG with no external font, script, or stylesheet reference, so the file renders identically wherever it is opened.
- [ ] Include a legend, and label the diagram with the estate it describes.
- [ ] Cover the renderer through the CLI seam with a deterministic estate fixture, asserting structure rather than exact geometry so the test does not ossify the layout.

## Files touched

- `src/commands/trade/routes.ts` — the command surface and flag.
- A new core module owning SVG generation, kept separate from textual rendering.
- `src/tests/cli/trade/` — estate fixture and renderer tests.
- `man/ki.1`, `README.md`, `CHANGELOG.md` for the new surface.

## Verify

Generate the diagram for the real registered estate and confirm every route in `ki trade routes list --estate` appears exactly once, that reciprocal pairs are drawn as one edge, and that a deliberately one-sided declaration renders visibly differently from an active one.

Confirm the output is valid standalone SVG by opening it directly in a browser with no network access, which also proves no external font or stylesheet crept in.

Tests must assert on structural properties — node count, edge count, presence of a legend, absence of external references — rather than on coordinates, so that tuning the layout later does not require rewriting expectations. Coverage remains at 100% over product code.

## Dependencies / blocks

The inspection this renders already exists and is stable, and the diagram is additive to the existing textual output.

Blocked by `KI-TOOL-CLI-025`, which restructures `.ki-config.toml` and, if the Harness adopts the shape proposed in `TRD-aacc8a12`, re-keys route declarations by partner repository with kinds as arrays. That changes how routes are written, not what they mean, and a renderer over `inspectEstateRoutes` would be unaffected either way — but building this once against the settled declaration shape is preferable to building it twice.

## Discussion

### Why a second renderer rather than a replacement

The textual listing is scriptable and diffable and belongs in a terminal; a diagram is for comprehension and for documentation. They serve different readers and should not compete, so the SVG is an additional output rather than a new default.

### Why structural assertions

Pinning coordinates would make every layout adjustment a test rewrite, and would assert the least meaningful property of the output. Asserting that each route appears once, that reciprocity is collapsed, and that the file is self-contained tests what the diagram is for.
