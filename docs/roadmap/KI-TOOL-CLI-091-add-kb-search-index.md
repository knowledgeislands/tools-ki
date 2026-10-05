---
id: KI-TOOL-CLI-091
area: CLI
title: Add KB search index
theme: cli
horizon: now
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-30T07:36:00Z
updated_at: 2026-10-05T11:37:03Z
---

# Add KB search index

## Goal

`ki kb index` derives qmd named indexes and collections from the local KI registry so every registered notes store is searchable within its trust boundary, and `ki kb search` gives shell sessions the same scoped search that `mcp-ki-kb-fs` will expose as `kb_search`.

## Context

`KI-HARNESS-FND-028` proposes [tobi/qmd](https://github.com/tobi/qmd) as the search engine behind KI surfaces: a rebuildable BM25 + vector index over Markdown with collections, per-path `context` descriptions, named indexes and a localhost HTTP daemon. The local KI registry records canonical repository identity, checkout path, and optional store bindings, but it does not currently declare a company or trust-boundary group. KI can derive Knowledge Base kind and title/description from each checkout's declaration. `ki manage search` today covers installed capabilities, not content.

## Boundary

In scope: explicit unique registry trust-boundary assignment per stable Knowledge Base identity; one independent qmd named index per registered KB; safe Markdown projections, declared-purpose context, generated mapping and canonical mirror labels; bounded `ki kb index`, `ki kb search` (`query`, `search`, `vsearch`) and `ki kb status` health receipts. Excludes the qmd install, launchd and global binding configuration, MCP tool delivery, binary source-store indexing, metadata-frontmatter search filtering, direct qmd exposure and shared cross-KB indexes.

## Current state

The user explicitly approved delivery of the qmd pilot, registry authority, mirror labels and subsequent MCP search with one independently assigned trust boundary per registered Knowledge Base. The registry stable key owns identity; the new explicit `search_boundary` field owns assignment. No path, alias, Agora or basename supplies assignment authority. qmd v2.8.3 is pinned to upstream commit `facd35e01359e59d938bc9418e93fb9318addee3`; the Harness published its bounded functional go, measured synthetic pilot and exact pinned configuration contract before this Ready plan.

## Steps

- [ ] Bind the published pinned Harness pilot and mirror-label contract, then commit this Ready plan and exact singleton outcome authorisation before implementation.
- [ ] Extend registry parsing/rendering and explicit registration to preserve a unique assigned `search_boundary`, rejecting missing or contradictory assignments for indexing.
- [ ] Build an exclusive private generation with a fresh database, deterministic path-hash Markdown projection and named qmd configuration for one selected registry KB, excluding symlinks, protected paths, undeclared zones, nested repositories and binary stores before qmd reads any source; retain prior owned caches without deleting sources or unmanaged state.
- [ ] Implement bounded `ki kb index`, `ki kb search` and `ki kb status` with strict typed qmd modes, execution/output/HTTP bounds, whole-manifest current-source validation before retrieval, explicit unavailable failures, local-source provenance validation and independently generated titles/snippets/docidentities/labels.
- [ ] Publish the registry-derived `ki/kb-search/v1` mapping for explicit downstream MCP bindings and one loopback daemon per independent named index; document operator provisioning and failure behaviour.
- [ ] Verify CLI contracts, malformed/hostile engine fixtures and real pinned qmd against synthetic KBs, then run required repository gates and record the six-heading review packet.

## Files touched

`src/core/kb/`, `src/commands/kb/`, `src/commands/root/index.ts`, `src/commands/root/catalogue.ts`, `src/core/storage/local-registry.ts`, `src/commands/registry/add.ts`, the bounded runtime runner, focused CLI tests and inventory, `docs/specs/kb-search.md`, `docs/guides/user/kb-search.md`, this work record and its exact batch authorisation. Public command inventories and overview documentation receive only search-owned edits; any concurrent diagnostic changes require CAS and coordinated partial staging.

## Verify

Run focused CLI search/registry/inventory tests, synthetic pinned-engine integration, `bun run test`, `bun run test:coverage`, `bunx tsc --noEmit`, `bun run build`, Biome/Knip checks, and focused `ki-work`, `ki-work-roadmap`, `ki-self`, `ki-engineering` and `ki-authoring` audits sequentially. No fixture contacts a live KB or external network. Require no protected or sibling-source text to enter qmd, and no daemon text, arbitrary docid or inferred mirror label to escape the source-validation boundary.

## Known baseline findings

Stable baseline tests, 100% coverage, TypeScript and ki-self passed. A later focused engineering audit overlapped independent diagnostic edits and failed `src/tests/cli/manage/inventory.test.ts:189` because the `ki diag` description in `man/ki.1` temporarily differed from `man/ki.commands.json`. That finding belongs to the concurrent diagnostic delivery, not this search contract. Re-ground HEAD and preserve its paths; the final combined-state gates still must pass before Awaiting review.

## Dependencies / blocks

Harness owns the pinned qmd pilot and canonical mirror labels. Their durable evidence is published in the [synthetic pilot](../../../ki-agentic-harness/docs/decisions/references/qmd-synthetic-pilot.md), [pinned search contract](../../../ki-agentic-harness/skills/repo-structure/ki-repo-kb/references/standards-search.md) and [mirror standard](../../../ki-agentic-harness/skills/repo-structure/ki-repo-kb/references/standards-source-mirrors.md); tools publishes the mapping consumed downstream by MCP search. Registry assignment is settled by current explicit user policy. No external item belongs in local `blocked_by`.

## Delegation

The root coordinator assigned this repository delivery to one bounded worker, followed sequentially by MCP delivery after the CLI receipt is stable. The root independently reviews, accepts and prunes; this worker does not self-accept or prune and starts no additional writers.

## Documentation impact

### Decision Records

The Harness owns the qmd adoption rationale; this repository documents the concrete registry and executable contracts without copying that decision.

### Specifications

Add the explicit registry assignment, safe generated mapping, engine pin, bounded search, local-source provenance and no-fallback contract in `docs/specs/kb-search.md`.

### Guides

Add operator setup, isolated per-KB indexing, daemon binding, search modes and unavailable-state instructions in `docs/guides/user/kb-search.md`.

### Roadmap

This item supplies the concrete upstream contract and immutable delivery receipt required to ready MCP-KBFS-TOOL-004. Root retains acceptance and explicit prune authority.

## Discussion

### Trust boundaries

Named indexes are intended to prevent an HNR session receiving kit-legal hits. The trust-boundary assignment must be explicit and auditable before deriving index names; the registry currently has no group field. Collection generation must avoid indexing nested `Resources/` checkouts twice without inferring authority from directory layout.

### Failure behaviour

If qmd or its daemon is absent, `kb search` must say so and exit non-zero rather than fall back silently; the `ki-repo-kb` QUERY procedure owns the grep fallback.
