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

Give each shared user-facing CLI concept one named presentation mapping, so terminal commands and generated HTML convey the same meaning consistently while remaining accessible.

## Context

Trade route lists currently render knowledge as `◇`, trade records render it as `ⓘ`, and the estate network uses a separate diamond chip. Other semantic symbols, including status and entity markers, are also defined in several command and reporting modules. A renderer-aware registry can give each concept an accessible label, a portable terminal representation, and a versioned Lucide SVG identity for self-contained HTML.

## Boundary

Do not add or remove trade routes, alter trade authority or lifecycle semantics, add an icon font or network dependency, or move structural tree punctuation and command grammar into the registry.

## Current state

The estate HTML is self-contained and currently vendors D3. It can vendor the small set of approved Lucide SVG paths in the same way, while terminal output continues to use text-safe glyphs. The presentation contract has not yet been identified or centralised.

## Steps

- [ ] Inventory shared semantic icon roles and define a typed renderer-aware registry with accessible labels, terminal text, and Lucide SVG identities where HTML needs them.
- [ ] Migrate trade kind, observation, status, and entity renderers to the registry without changing command grammar or trade semantics.
- [ ] Render the estate HTML legend and route chips from the same kind mappings, using vendored Lucide `BookOpen` and `Hammer` SVG paths.
- [ ] Extend CLI contract tests and public documentation to prove the shared vocabulary and preserve readable text output.

## Files touched

The shared presentation module, trade command renderers, estate network renderer, repository reporting renderers, CLI contract tests, README, and manual are expected to change.

## Verify

`bun run test`, `bun run test:coverage`, `ki repo audit --repo .`, and targeted command-output assertions must pass. The generated HTML must remain self-contained, include accessible text labels, and make no network request for icon assets.

## Dependencies / blocks

No external dependency is required. The selection of semantic roles must remain bounded to shared user-facing concepts, rather than absorbing tree layout characters or arbitrary command punctuation.

## Discussion

### Registry boundary

The registry owns semantic presentation identities such as trade kind, status, repository, and skill. It does not own layout glyphs such as tree branches, directional syntax, separators, or punctuation; those remain local to their rendering grammar.

### Renderer forms

Each identity carries a human-readable label and terminal fallback. Where the generated estate HTML needs imagery, it uses a matching vendored Lucide SVG identity. `BookOpen` represents knowledge and `Hammer` represents work in that view; terminal and HTML forms are different renderings of the same semantic key, not competing icon systems.

### Delivery boundary

This item standardises presentation only. A later, separately scoped review can decide whether estate route declarations should change and whether a pair-first terminal route view should accompany the existing graph.
