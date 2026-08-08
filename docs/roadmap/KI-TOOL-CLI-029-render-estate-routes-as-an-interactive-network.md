---
id: KI-TOOL-CLI-029
title: Render estate routes as an interactive network
theme: cli
horizon: now
status: done
blocks: []
blocked-by: []
baseline-ref: null
---

## Goal

Render the registered estate's trade routes as an interactive force-directed network in a local HTML page, so that the shape of an estate can be explored rather than only read, and so that arranging the graph stops being this repository's problem.

## Context

`KI-TOOL-CLI-024` delivered an SVG renderer and was accepted. Its layout was then reworked three times — a circle, a circle with collapsed reciprocal edges, and a left-to-right column layering with detouring edges — and the last of these was rejected on sight. Each attempt fixed the objection it was given and introduced another, which is the signature of solving the wrong problem.

The wrong problem is static layout. A directed multigraph over repositories, with cycles almost everywhere because reciprocity is the normal case, has no good fixed arrangement that a few hundred lines of geometry will find. Columns put mutually-trading peers on one line, where their edges either overlap or detour around each other. A circle spreads them evenly and lets long chords cross. Both are defensible and neither is legible past a handful of repositories.

A force simulation does not need to be right, because the reader can move it. Nodes settle where their edges pull them, a repository that only receives drifts to the periphery on its own, and anything the simulation gets wrong is fixed by dragging one node. That also removes every geometry decision this repository has been making badly: no radius, no column gap, no detour, no minimum edge length.

## Boundary

This item does not add a server, a build step for the viewer, or any runtime that has to be running for the page to work; the output is one file opened directly from disk. It does not change route declaration, route semantics, the `.ki-config.toml` contract, or the textual `--estate` listing, which remains the scriptable form. It does not publish the page anywhere. It does not attempt to render an estate of a size that would need clustering or level-of-detail; tens of repositories is the target.

## Current state

Delivered. `ki trade routes list --estate --html` writes `estate-routes.html` under the cache and opens it. `src/core/route-diagram.ts` is deleted; its data model survives as `estateNetwork` in `src/core/route-network.ts`, and every line that placed a node or routed an edge is gone.

The vendored runtime is produced by `scripts/vendor-d3.js`, bundled to `src/assets/d3-runtime.txt` and checked in, so no code generation stands in front of the gate on a clean checkout. It is imported with `with { type: 'text' }`, which Bun embeds into the compiled binary. Four `d3-*` packages are devDependencies used only to regenerate that bundle; the shipped page carries a 64 KB minified runtime and fetches nothing.

The launch goes through `context.runner`, which tests already stub, and `KI_BROWSER_OPENER` overrides the platform default. The platform itself became an injected capability on `KiContext` rather than an ambient `process.platform` read, because the default was otherwise a branch no test on this machine could reach.

## Decisions

**The page is offline.** D3 is vendored into the binary rather than fetched from a CDN, so the page opens on a machine with no network and keeps the property `024` was built to have. Bun embeds a `with { type: 'text' }` import into a `--compile` binary, which was confirmed against Bun 1.3.14 before this item was written, so a pre-bundled asset can ship inside `ki` and be written out with the page.

**The file has a fixed home.** `--html` is an output format, not a path. The page is regenerable from the estate at any moment, so it belongs under `context.paths.cache`, is rewritten in place on each run, and is then opened. A caller who wants a copy elsewhere can take one.

**`--svg` is removed rather than kept.** Keeping it would keep the layout that prompted this item. If a static image is wanted later, the page is the better place to produce it — see the discussion below.

## Steps

- [x] Decide how the vendored viewer script is produced and where it lives, and confirm it does not put a code-generation step in front of `bun run test` on a clean checkout. This is the one genuinely open question in this item.
- [x] Emit a page carrying the estate as data — nodes with identity and owner, links with exporter, importer, kinds, and state — plus the simulation, so that the renderer's output is a payload and not a picture.
- [x] Keep every distinction the SVG earned: one link per direction, a reciprocated pair legible as two, trade kind carried per direction, an unreciprocated route visibly incomplete, and a legend.
- [x] Support drag, hover detail, and zoom, since these are the whole reason for the change.
- [x] Open the page through `context.runner` after writing it, choosing the platform opener, and cover the failure to open as a reportable condition rather than a crash.
- [x] Remove `src/core/route-diagram.ts`'s layout and the `--svg` surface, including its manual page, README, changelog and completion entries.
- [x] Assert the embedded payload through the CLI seam — node count, link count, directions, kinds, states — rather than any geometry.

## Files touched

- `src/core/route-diagram.ts` — deleted.
- `src/core/route-network.ts` — the payload, the page, and the viewer.
- `scripts/vendor-d3.js`, `src/assets/d3-runtime.txt`, `src/assets/assets.d.ts` — the vendored runtime and its type.
- `src/commands/trade/routes.ts` — `--html` replaces `--svg`, and the browser launch.
- `src/commands/manage/completion-grammar.ts` — the flag no longer completes as a path.
- `src/context.ts`, `src/tests/cli/_cli_helper.ts` — the injected platform.
- `src/tests/cli/trade/trade.test.ts`, `src/tests/cli/manage/completions.test.ts`.
- `knip.json`, `package.json` — the vendor script's dependencies.
- `man/ki.1`, `README.md`, `CHANGELOG.md`.

## Verify

Rendered against the real registered estate and checked in a browser: all five repositories and all thirteen routes present, the simulation settles, reciprocated pairs separate into two arcs, and arrowheads land on the boxes. The only URLs in the page are XML namespace identifiers from D3's internals, which are names rather than requests, so nothing is fetched.

Tests assert the payload and never the arrangement. Coverage is 100% on all four metrics with no `/* v8 ignore */` added: both platform defaults are exercised through the CLI seam by injecting the platform.

## Dependencies / blocks

Nothing local blocks this item. It supersedes the renderer delivered by `KI-TOOL-CLI-024`, which is accepted and pruned; this record carries that history so the reversal is not silently lost.

## Discussion

### Why this is a new record rather than a fix to the old one

`024` was accepted and pruned on the strength of a renderer that has since been rejected. Reopening it would misrepresent both what was accepted and why it changed. The data model it delivered is kept and the arrangement it delivered is discarded, and that distinction is worth stating once rather than inferring later.

### Capturing a static image later

The obvious way back to an SVG is not to keep the old renderer but to take one from the page, since the simulation already draws into SVG in the DOM and the reader has by then arranged it the way they want. A download control in the page would export exactly what is on screen, which is a better artefact than anything computed blind. Not built here, and recorded only so the option is not rediscovered.

### The risk this carries

An HTML page cannot be embedded in Markdown, so if the diagram is ever wanted inside documentation this item removes the only thing that could do it. That is accepted deliberately: nothing embeds it today, and the export route above covers the case if it arises.
