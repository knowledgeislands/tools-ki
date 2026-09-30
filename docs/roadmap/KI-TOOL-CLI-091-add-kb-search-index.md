---
id: KI-TOOL-CLI-091
area: CLI
title: Add KB search index
theme: cli
horizon: waiting-for
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-30T07:36:00Z
updated_at: 2026-09-30T15:18:21Z
---

# Add KB search index

## Goal

`ki kb index` derives qmd named indexes and collections from the local KI registry so every registered notes store is searchable within its trust boundary, and `ki kb search` gives shell sessions the same scoped search that `mcp-ki-kb-fs` will expose as `kb_search`.

## Context

`KI-HARNESS-FND-028` proposes [tobi/qmd](https://github.com/tobi/qmd) as the search engine behind KI surfaces: a rebuildable BM25 + vector index over Markdown with collections, per-path `context` descriptions, named indexes and a localhost HTTP daemon. The local KI registry records canonical repository identity, checkout path, and optional store bindings, but it does not currently declare a company or trust-boundary group. KI can derive Knowledge Base kind and title/description from each checkout's declaration. `ki manage search` today covers installed capabilities, not content.

## Boundary

In scope: a `kb index` command that writes one qmd index config per trust boundary (for example kit, hnr, legal) with a collection per registered notes store, attaches `context` from the repository's declared title and description, runs `qmd update` and `qmd embed`, and reports what changed; a `kb search` command that selects the index for the current repository and passes `query`, `search` and `get` through with JSON output; daemon health reporting in `ki doctor` or equivalent. Excludes: the qmd install itself and launchd scheduling (chezmoi `DOTFILES-UE-063`), the MCP tool (`MCP-KBFS-TOOL-004`), indexing binary source stores, and any metadata-frontmatter filtering.

## Waiting for

This item waits for the direct-CLI qmd pilot recorded in `KI-HARNESS-FND-028` to produce results from real questions over kit-principal and hnr-shared, including search quality, context cost, index configuration, and failure behaviour. It also waits for an explicit decision identifying the authoritative trust-boundary assignment for each registered Knowledge Base. The current registry has no such field; neither path names nor an Agora relationship should silently become a security boundary.

The chezmoi install/daemon item `DOTFILES-UE-063` can begin independently and use a hand-written pilot config. `MCP-KBFS-TOOL-004` consumes the eventual registry-derived mapping and is downstream, not a build prerequisite for this CLI. No external repository item is placed in `blocked_by`, which is reserved for local work-item build order; there is no trade-observation condition to put in `waiting_on_trades`.

Return this item to Next for planning when the pilot evidence is recorded and the trust-boundary authority is agreed. At that point, validate the pinned qmd version's named-index configuration and CLI/daemon interfaces, choose ownership and safe publication of generated configs, and specify isolated tests for unavailable qmd and daemon states before marking Ready.

## Discussion

### Trust boundaries

Named indexes are intended to prevent an HNR session receiving kit-legal hits. The trust-boundary assignment must be explicit and auditable before deriving index names; the registry currently has no group field. Collection generation must avoid indexing nested `Resources/` checkouts twice without inferring authority from directory layout.

### Failure behaviour

If qmd or its daemon is absent, `kb search` must say so and exit non-zero rather than fall back silently; the `ki-repo-kb` QUERY procedure owns the grep fallback.
