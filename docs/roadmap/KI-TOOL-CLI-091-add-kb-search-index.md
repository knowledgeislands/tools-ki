---
id: KI-TOOL-CLI-091
area: CLI
title: Add KB search index
theme: cli
horizon: triage
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-30T07:36:00Z
updated_at: 2026-09-30T07:36:00Z
---

# Add KB search index

## Goal

`ki kb index` derives qmd named indexes and collections from the local KI registry so every registered notes store is searchable within its trust boundary, and `ki kb search` gives shell sessions the same scoped search that `mcp-ki-kb-fs` will expose as `kb_search`.

## Context

`KI-HARNESS-FND-028` adopts [tobi/qmd](https://github.com/tobi/qmd) as the search engine behind KI surfaces: a rebuildable BM25 + vector index over Markdown with collections, per-path `context` descriptions, named indexes and a localhost HTTP daemon. Only `ki` knows the registry — which checkouts are Knowledge Bases, which company group they belong to and what each declares as its purpose — so index configuration must come from `ki`, not from agents running `qmd collection add`. `ki manage search` today covers installed capabilities, not content.

## Boundary

In scope: a `kb index` command that writes one qmd index config per trust boundary (for example kit, hnr, legal) with a collection per registered notes store, attaches `context` from the repository's declared title and description, runs `qmd update` and `qmd embed`, and reports what changed; a `kb search` command that selects the index for the current repository and passes `query`, `search` and `get` through with JSON output; daemon health reporting in `ki doctor` or equivalent. Excludes: the qmd install itself and launchd scheduling (chezmoi `DOTFILES-UE-063`), the MCP tool (`MCP-KBFS-TOOL-004`), indexing binary source stores, and any metadata-frontmatter filtering.

## Discussion

### Trust boundaries

Named indexes are the control that stops an HNR session receiving kit-legal hits. Derive the index name from the registry group rather than from directory layout so nested `Resources/` checkouts are not indexed twice.

### Failure behaviour

If qmd or its daemon is absent, `kb search` must say so and exit non-zero rather than fall back silently; the `ki-repo-kb` QUERY procedure owns the grep fallback.
