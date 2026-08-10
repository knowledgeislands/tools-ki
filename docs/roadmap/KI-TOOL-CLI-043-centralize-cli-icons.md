---
id: KI-TOOL-CLI-043
title: Centralize CLI icons
area: CLI
theme: cli
horizon: next
status: draft
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

## Steps

- [ ] Inventory shared semantic icon roles and define a typed renderer-aware registry with accessible labels, terminal text, and Lucide SVG identities where HTML needs them.
- [ ] Define a reusable internal box-table renderer whose default character set is the CLI's existing Unicode box-drawing style, and whose character set can be supplied by a caller without becoming a command option.
- [ ] Derive one lexical repository pair per estate row, with endpoint cells spanning two sub-rows and central left-to-right and right-to-left cells that name their permitted trade kinds.
- [ ] Make the pair table the default for `ki trade routes list --estate`, retain `--table` as its explicit form, and retain `--html` as the mutually exclusive interactive estate view; adapt the text rendering to the live TTY width without making the relationship unreadable.
- [ ] Migrate trade kind, observation, status, and entity renderers to the registry without changing command grammar or trade semantics.
- [ ] Render the estate HTML legend and route chips from the same kind mappings, using vendored Lucide `BookOpen` and `Hammer` SVG paths.
- [ ] Extend CLI contract tests and public documentation with wide and narrow text-table examples, explicit renderer grammar, and the shared vocabulary.

## Files touched

The shared presentation module, internal box-table renderer, trade command renderers, estate network renderer, repository reporting renderers, CLI contract tests, README, and manual are expected to change.

## Verify

`bun run test`, `bun run test:coverage`, `ki repo audit --repo .`, and targeted wide and narrow command-output assertions must pass. The generated HTML must remain self-contained, include accessible text labels, and make no network request for icon assets. Each pair row must be deterministic: its left endpoint is lexically first, its right endpoint lexically last, and its two central sub-rows carry the corresponding directions.

## Dependencies / blocks

No external dependency is required. The selection of semantic roles must remain bounded to shared user-facing concepts, rather than absorbing tree layout characters or arbitrary command punctuation. The table view applies only to the registered estate; local declaration listing keeps its current rendering.

## Discussion

### Registry boundary

The registry owns semantic presentation identities such as trade kind, status, repository, and skill. It does not own layout glyphs such as tree branches, directional syntax, separators, or punctuation; those remain local to their rendering grammar.

### Renderer forms

Each identity carries a human-readable label and terminal fallback. Where the generated estate HTML needs imagery, it uses a matching vendored Lucide SVG identity. `BookOpen` represents knowledge and `Hammer` represents work in that view; terminal and HTML forms are different renderings of the same semantic key, not competing icon systems.

### Pairwise estate table

The estate table derives its rows from unordered routed repository pairs, ordering their canonical identities lexically. The first identity occupies the left endpoint cell and the second the right endpoint cell across both directional sub-rows. The upper central cell reports left-to-right kinds with `→`; the lower reports right-to-left kinds with `←`. An absent direction is shown explicitly rather than inferred.

The table renderer receives a box-drawing character set and defaults to the rounded single-line characters already used by CLI trees. It calculates column allocation from the live TTY width; its narrow rendering preserves the same pair and direction model rather than reverting to an exporter-only list. `--table` is the explicit estate text renderer and estate listing's initial default. `--html` remains the alternate interactive renderer and cannot be combined with `--table`.

### Delivery boundary

This item standardises presentation only. A later, separately scoped review can decide whether estate route declarations should change.
