---
id: KI-TOOL-CLI-044
title: Weight estate maps
area: CLI
theme: cli
horizon: next
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 0e0938fa4d9a41f73403e66c078ee381b8795ed2
---

## Goal

Make the generated estate trade map explain the relative shape of the current trade network. Readers can see which repositories are light satellites, active peers, sources, sinks, and coordination hubs without treating route permission as authority.

## Context

The HTML renderer currently gives every route the same target distance, spring strength, stroke width, and node treatment. The evolving estate now has deliberate structural differences: one-way Harness-to-MCP knowledge feeds, bidirectional tooling peers, the Harness and Techne as work-and-knowledge hubs, Arcadia as a knowledge source, and the Website as a public sink.

The map can derive lane capacity and network influence from active typed routes. It also needs a small, explicit presentation-only uplift: Knowledge Islands repositories receive an organisation bonus, while explicitly declared principal or hub roles receive a further bonus. These values must be visible in the generated page, separate from trade authority and lifecycle semantics.

## Boundary

Do not change route declarations, trade kinds, reciprocity rules, receipt authority, or lifecycle behaviour. Do not build the nautical visual skin, store dynamic traffic history, or hard-code individual repository identities into the renderer.

## Current state

`estateNetwork` aggregates each directed route's kinds and state, then the browser applies one global D3 link distance, link strength, charge, and collision rule. Its payload has no lane capacity, node degree, map influence, or presentation metadata. The two existing principal knowledge bases, Arcadia Principal and Techne Principal, already declare the same portable `ki-trades` capability as their peers.

## Steps

- [x] Extend the portable `ki-trades` declaration with an optional bounded non-negative `map_bonus` presentation field. Preserve its separation from trade permissions and lifecycle, reject malformed values, and document the field in the canonical trade standard.
- [x] Carry each registered repository's declared map bonus into the estate projection. Derive per-pair active lane capacity, node weighted in/out degree, the `knowledgeislands` organisation uplift, total influence, and an inferred source, sink, peer, or hub role without naming individual repositories in renderer code.
- [x] Add deterministic lane distance, spring strength, node size, collision, charge, and line-width values to the generated HTML payload. Use those values in the D3 force simulation and SVG while retaining drag, zoom, directional arcs, kind chips, and incomplete-route treatment.
- [x] Explain the derived and declared contributions in lane and node hover details and the legend, so visual prominence is inspectable rather than implicit.
- [x] Declare `map_bonus = 1` for Arcadia Principal and Techne Principal. The organisation uplift applies automatically to every `knowledgeislands/*` identity; no other repository gets a name-specific renderer rule.
- [x] Extend CLI contract coverage for payload metrics, valid and invalid map bonuses, derived organisation and declared bonuses, and self-contained HTML output. Update the user documentation, manual, changelog, and portable trade standard.

## Files touched

Expected implementation: `src/core/trade-configuration.ts`, `src/core/trade-core.ts`, `src/core/route-network.ts`, and `src/tests/cli/trade/trade.test.ts`.

Expected public material: `README.md`, `man/ki.1`, and `CHANGELOG.md` in tools-ki; the canonical `ki-trades` standard in ki-agentic-harness; and `.ki-config.toml` in Arcadia Principal and Techne Principal.

## Verify

`bunx vitest run src/tests/cli/trade/trade.test.ts`, `bun run test`, `bun run test:coverage`, `bunx tsc --noEmit`, `ki repo audit --repo .`, `bunx rumdl check README.md CHANGELOG.md`, and `mandoc -T lint man/ki.1` must pass. The two metadata repositories must pass their focused trade audits after configuration changes.

## Dependencies / blocks

No external dependency is required. The user has approved the presentation model and the Arcadia/Techne configuration updates. The renderer must continue to treat the route estate as its source of truth; `map_bonus` may alter presentation only and cannot enable a route or affect trade authority.

## Review

### Delivered

- Estate maps now derive visible topology from active typed routes and small, inspectable presentation-only bonuses.
- Arcadia Principal and Techne Principal each declare `map_bonus = 1`; every `knowledgeislands/*` repository receives the same derived organisation uplift.

### Summary of changes

- Added bounded `map_bonus` parsing, round-trip rendering, canonical rubric validation, and a generated rubric update.
- Added active lane capacity, node influence, inferred map roles, and deterministic distance, spring, width, size, charge, and collision inputs to the HTML payload and D3 simulation.
- Updated hover details, legend, README, manual, changelog, canonical standard, and CLI-level contract coverage.

### Verification

- `bun run test` — 620 tests passed.
- `bun run test:coverage` — 620 tests passed; 100% statements, branches, functions, and lines.
- `bunx tsc --noEmit`
- `bunx vitest run src/tests/cli/trade/trade.test.ts` — 42 tests passed.
- `bunx rumdl check README.md CHANGELOG.md`
- `mandoc -T lint man/ki.1`
- Harness `bunx tsc --noEmit`, focused `ki-trades` rubric test, and focused trade audits for Harness, Arcadia Principal, and Techne Principal all passed.

### Outstanding concerns

- `ki repo audit --repo .` still reports the pre-existing `ki-engineering` formatting fault in `src/core/registry.ts`, unchanged since baseline commit `0e0938f`.
- The same audit's sandboxed coverage subprocess cannot bind its installer test's loopback listener. The identical full coverage command passes outside that sandbox.

### Post-change review

- Active typed directions alone supply lane capacity and route-degree influence; incomplete routes remain visible but do not distort the force layout.
- `map_bonus` is a bounded declaration for presentation only. It cannot activate a route or alter submission, receipt, decision, lifecycle, or repository authority.
- The renderer derives roles and organisation uplift generically; it contains no individual repository identity rules.

### Mini recap

The estate map now makes its visual hierarchy explainable: topology provides the base, small declared bonuses provide deliberate emphasis, and every contribution is visible in the generated HTML.

## Discussion

### Weighting model

Route-derived facts remain the base: active kinds per unordered repository pair form lane capacity; weighted in/out degree and network position inform node influence and inferred role. Explicit presentation bonuses are an additive overlay rather than a replacement for topology.

### Presentation metadata

`map_bonus` is intentionally a small declared integer rather than a free-form rank or a repository-name lookup. The first use is `1` for the two principal knowledge repositories. A derived organisation uplift gives every `knowledgeislands/*` repository the same small visual acknowledgement. The page reports both contributions alongside the route-derived base, so a reader can distinguish topology from deliberate emphasis.

### Authority boundary

The generated map may communicate coordination and dissemination patterns, but it must not imply that a larger island has authority over a receiving repository. Every trade remains a permission to prepare or submit; the receiver continues to decide disposition and local follow-on work.
