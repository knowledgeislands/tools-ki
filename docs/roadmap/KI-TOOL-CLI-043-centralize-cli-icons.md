---
id: KI-TOOL-CLI-043
title: Centralize CLI icons
area: CLI
theme: cli
horizon: next
status: ready
blocks: []
blocked_by: []
baseline_ref: null
---

## Goal

Give each shared user-facing CLI concept one named presentation mapping, and make estate trade routes directly legible as deterministic repository-pair relationships in terminals and generated HTML.

## Context

Trade route lists currently group outgoing declarations, so a reader must compare distant rows to understand a pair's two directions. They also render knowledge as `◇`, while trade records render it as `ⓘ` and the estate network uses a separate diamond chip. Other semantic symbols, including status and entity markers, are also defined in several command and reporting modules. A renderer-aware registry can give each concept an accessible label, a portable terminal representation, and a versioned Lucide SVG identity for self-contained HTML.

## Boundary

Do not add or remove trade routes, alter trade authority or lifecycle semantics, add an icon font or network dependency, make a generic tabular renderer a public CLI feature, or move structural tree punctuation and command grammar into the semantic-icon registry.

## Current state

The estate HTML is self-contained and currently vendors D3. It can vendor the small set of approved Lucide SVG paths in the same way, while terminal output continues to use text-safe glyphs. `ki trade routes list --estate` currently uses an exporter-grouped tree; its `--html` form opens the separate interactive network. No renderer derives a single lexical repository pair, lays out two directional cells, or adapts a table to the live TTY width.

`KiContext.stdout` exposes `isTTY` and `columns`, and the CLI sandbox injects both, so wide and narrow estate output can be exercised through command-level tests. `renderTree` owns the existing rounded box-drawing style but has no table abstraction. Trade route rendering, trade records, repository reporting, and diagnostics currently hold their own semantic glyphs or local icon maps.

## Steps

- [ ] Add a typed, renderer-aware presentation registry for the existing shared user-facing concepts: trade kinds and observations, repository and skill entities, and report/diagnostic statuses. Each entry supplies an accessible label, portable terminal glyph, and (where required) a Lucide SVG identity. Keep layout punctuation out of this registry.
- [ ] Add an internal box-table renderer that accepts a caller-supplied character set and defaults to the rounded single-line box-drawing style used by CLI trees. It must support endpoint cells spanning two directional sub-rows without exposing a generic table command or configuration.
- [ ] Refactor estate route projection into unordered lexical repository pairs. Each pair carries an explicit left-to-right and right-to-left route cell, including kinds and route state; an absent direction renders as `—`. Keep the existing directed-route and active/incomplete summary semantics.
- [ ] Make the pair table the default for `ki trade routes list --estate`; accept `--table` as its explicit equivalent; require `--estate` for both `--table` and `--html`; and reject their combination. At a viable live TTY width, render the spanning-cell table; otherwise render a stacked pair block from the same pair projection rather than an exporter-grouped tree.
- [ ] Migrate trade route and record output plus existing repository reporting and diagnostic icons to the registry, preserving all command grammar, lifecycle behaviour, textual labels, and non-icon output.
- [ ] Render the estate HTML legend and route chips from the same trade-kind mappings, using locally vendored Lucide `BookOpen` and `Hammer` SVG paths with accessible labels and no network request.
- [ ] Add CLI-level wide, narrow, empty, incomplete, explicit-table, and invalid-flag route-output coverage; update presentation-dependent command assertions; and document both estate renderers and the icon vocabulary in the README, manual, and changelog.

## Files touched

Expected implementation: new `src/core/presentation.ts` and `src/core/table-rendering.ts`; `src/core/tree-rendering.ts`; `src/commands/trade/routes.ts` and `src/commands/trade/shared.ts`; `src/core/route-network.ts`; current report and diagnostic renderers; and `src/tests/cli/trade/trade.test.ts` plus affected CLI contract tests.

Expected public material: `README.md`, `man/ki.1`, and `CHANGELOG.md`.

## Verify

`bun run test`, `bun run test:coverage`, `ki repo audit --repo .`, and the manual-page lint must pass. CLI contract assertions must prove wide and narrow pair projections, lexical endpoint ordering, explicit absent directions, active and incomplete state retention, estate-only `--table` grammar, and `--table`/`--html` exclusivity. The generated HTML must remain self-contained, include accessible text labels, and make no network request for icon assets.

## Dependencies / blocks

No external dependency is required. The selection of semantic roles must remain bounded to shared user-facing concepts, rather than absorbing tree layout characters or arbitrary command punctuation. The table view applies only to the registered estate; local declaration listing keeps its current rendering.

## Discussion

### Registry boundary

The registry owns semantic presentation identities such as trade kind, status, repository, and skill. It does not own layout glyphs such as tree branches, directional syntax, separators, or punctuation; those remain local to their rendering grammar.

### Renderer forms

Each identity carries a human-readable label and terminal fallback. Where the generated estate HTML needs imagery, it uses a matching vendored Lucide SVG identity. `BookOpen` represents knowledge and `Hammer` represents work in that view; terminal and HTML forms are different renderings of the same semantic key, not competing icon systems.

### Pairwise estate table

The estate table derives its rows from unordered routed repository pairs, ordering their canonical identities lexically. The first identity occupies the left endpoint cell and the second the right endpoint cell across both directional sub-rows. The upper central cell reports left-to-right kinds with `→`; the lower reports right-to-left kinds with `←`. An absent direction is shown explicitly rather than inferred.

The table renderer receives a box-drawing character set and defaults to the rounded single-line characters already used by CLI trees. Its endpoint cells span the two central directional rows, while the central divider joins only within the middle column. The table calculates column allocation from the live TTY width; its narrow rendering preserves the same pair and direction model in a stacked block rather than reverting to an exporter-only list. `--table` is the explicit estate text renderer and estate listing's initial default. `--html` remains the alternate interactive renderer and cannot be combined with `--table`.

### Presentation migration

The first registry is deliberately finite: it records existing shared semantic concepts, not every Unicode character in the CLI. Each renderer asks for a named concept and receives its appropriate form; it does not duplicate a literal glyph. Text remains readable without an icon, and HTML adds image semantics rather than relying on colour or shape alone.

### Delivery boundary

This item standardises presentation only. A later, separately scoped review can decide whether estate route declarations should change.
