---
id: KI-TOOL-CLI-091
area: CLI
title: Add KB search index
theme: cli
horizon: now
status: done
blocks: []
blocked_by: []
baseline_ref: 0a0ab5d0ffcc4d71eaea017bbc759c90a1330007
created_at: 2026-09-30T07:36:00Z
updated_at: 2026-10-05T13:00:00Z
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

The independently reviewed interface is frozen in `d6222b752d5f5ee3ef36c7bac55eec3f67629c87`. CLI implementation, hostile-response verification and current-source synthetic native integration now pass, including the required complete 100% coverage gate. This delivery awaits independent source review and coordinator acceptance; it does not accept itself or close the outcome batch.

## Steps

- [x] Bind the published pinned Harness pilot and mirror-label contract, then commit this Ready plan and exact singleton outcome authorisation before implementation.
- [x] Extend registry parsing/rendering and explicit registration to preserve a unique assigned `search_boundary`, rejecting missing or contradictory assignments for indexing.
- [x] Build an exclusive private generation with a fresh database, deterministic path-hash Markdown projection and named qmd configuration for one selected registry KB, excluding symlinks, protected paths, undeclared zones, nested repositories and binary stores before qmd reads any source; retain prior owned caches without deleting sources or unmanaged state.
- [x] Implement bounded `ki kb index`, `ki kb search` and `ki kb status` with strict typed qmd modes, execution/output/HTTP bounds, whole-manifest current-source validation before retrieval, explicit unavailable failures, local-source provenance validation and independently generated titles/snippets/docidentities/labels.
- [x] Publish the registry-derived `ki/kb-search/v1` mapping for explicit downstream MCP bindings and one loopback daemon per independent named index; document operator provisioning and failure behaviour.
- [x] Verify CLI contracts, malformed/hostile engine fixtures and real pinned qmd against synthetic KBs, then run required repository gates and record the six-heading review packet.

## Files touched

`src/core/kb/`, `src/commands/kb/`, `src/commands/root/index.ts`, `src/commands/root/catalogue.ts`, `src/core/storage/local-registry.ts`, `src/commands/registry/add.ts`, the bounded runtime runner, the single-snapshot declaration parser and optional private native-publisher mode, focused CLI tests and inventory, `docs/specs/kb-search.md`, `docs/guides/user/kb-search.md`, this work record and its exact batch authorisation. Public command inventories and overview documentation receive only search-owned edits; any concurrent diagnostic changes require CAS and coordinated partial staging.

## Verify

Run focused CLI search/registry/inventory tests, synthetic pinned-engine integration, `bun run test`, `bun run test:coverage`, `bunx tsc --noEmit`, `bun run build`, Biome/Knip checks, and focused `ki-work`, `ki-work-roadmap`, `ki-self`, `ki-engineering` and `ki-authoring` audits sequentially. No fixture contacts a live KB or external network. Require no protected or sibling-source text to enter qmd, and no daemon text, arbitrary docid or inferred mirror label to escape the source-validation boundary.

## Known baseline findings

Stable baseline tests, 100% coverage, TypeScript and ki-self passed. A later focused engineering audit overlapped independent diagnostic edits and failed `src/tests/cli/manage/inventory.test.ts:189` because the `ki diag` description in `man/ki.1` temporarily differed from `man/ki.commands.json`. That finding belongs to the concurrent diagnostic delivery, not this search contract. Re-ground HEAD and preserve its paths; the final combined-state gates still must pass before Awaiting review.

## Dependencies / blocks

Harness owns the pinned qmd pilot and canonical mirror labels, accepted Done in `e093d3ad08f59376b22ce18c3c74b197fe85fb85` against reviewed corrected source `b79a0941`. Their durable evidence is published in the [synthetic pilot](../../../ki-agentic-harness/docs/decisions/references/qmd-synthetic-pilot.md), [pinned search contract](../../../ki-agentic-harness/skills/repo-structure/ki-repo-kb/references/standards-search.md) and [mirror standard](../../../ki-agentic-harness/skills/repo-structure/ki-repo-kb/references/standards-source-mirrors.md); tools publishes the mapping consumed downstream by MCP search. Registry assignment is settled by current explicit user policy. No external item belongs in local `blocked_by`.

## Delegation

The root coordinator assigned this repository delivery to one bounded worker; the Harness worker owns MCP planning and subsequent implementation after the immutable CLI receipt. The root independently reviews, accepts and prunes; this worker does not self-accept or prune and starts no additional writers.

## Documentation impact

### Decision Records

The Harness owns the qmd adoption rationale; this repository documents the concrete registry and executable contracts without copying that decision.

### Specifications

Add the explicit registry assignment, safe generated mapping, engine pin, bounded search, local-source provenance and no-fallback contract in `docs/specs/kb-search.md`.

### Guides

Add operator setup, isolated per-KB indexing, daemon binding, search modes and unavailable-state instructions in `docs/guides/user/kb-search.md`.

### Roadmap

This item supplies the concrete upstream contract and immutable delivery receipt required to ready MCP-KBFS-TOOL-004. Root retains acceptance and explicit prune authority.

## Review

### Delivered

Implemented explicit unique registry `search_boundary` assignment and public `ki kb index`, `ki kb search` and `ki kb status`. Each selected registered KB has an independent private fresh qmd generation, strict mapping and declared-purpose configuration; undeclared, protected, symlinked and nested-repository content is excluded before engine ingestion. Search authenticates all current source hashes and returns locally reconstructed titles, snippets, citations and canonical mirror labels.

### Change Summary

The new command and core modules preserve command/domain separation. The registry preserves existing identity and store bindings; the declaration parser now derives authority from one raw snapshot. Optional bounded runtime execution uses POSIX process groups and separate stdout. Native publication accepts an optional file mode while retaining all existing caller defaults, allowing private `0600` mapping temporaries before exclusive create or snapshot-checked atomic replacement. Owned-marker drift refuses publication and preserves the previous mapping. Inventory, manual, guide, specification and focused public CLI fixtures accompany these changes.

### Verification

Both complete test and complete coverage runs passed: 1,025 tests across 62 files; statements, branches, functions and lines are all 100%. TypeScript, compiled build/help, Biome, Knip, manual lint and focused command inventory passed. Sequential `ki-work`, `ki-work-roadmap`, `ki-self`, `ki-engineering` and `ki-authoring` audits passed; a final lifecycle recheck also passed against this review packet. Biome reports existing warnings/information and Knip reports configuration hints without failure.

The [durable native receipt](../specs/references/kb-search-synthetic.json) records eight pinned-engine operations across separate synthetic Alpha/Omega KBs. A final repeat against current source also passed both independent indexes and lexical, vector and expanded retrieval, with exact local Mixed Case citations and no sibling or undeclared canary text. All task-owned fixture repositories, projections, configs and databases were removed; native processes exited. Independent public fixtures exercise equal relative paths across two custom-zone KBs, fingerprint-compatible hostile backend fields and nested `.git` revocation before any engine call. The publication fixture checks private temporary mode at both link and rename boundaries.

### Outstanding concerns

This optional search makes no performance, large-corpus, retrieval-quality or exhaustive coverage claim. Engine revision and models are explicitly operator provisioned; runtime checks verify the reported version and regular nonempty local assets, not cryptographic attestation. Health does not attest index identity, and a misassigned empty daemon cannot be distinguished by the pinned protocol. Source checks are bounded before/after validation, not an atomic filesystem snapshot. Publication is whole-file atomic with publication-window drift checks, without a refresh-wide lock. Old private generations are retained; qmd reads may write derived engine caches. No global installation, daemon binding or private KB indexing was performed.

### Post-change review

Root and an independent reviewer approved only the immutable interface receipt; complete CLI source approval remains pending the final clean candidate. The reviewer authored one separately scoped test file and made no production edits; root reviewed that exact test diff. The canonical portable contract and source-mirror helper remain byte-identical to the interface receipt. MCP has a separate writer and explicit binding to that receipt; this delivery contains no MCP edits. The root retains acceptance, batch completion and prune authority.

### Mini recap

The implementation baseline is `0a0ab5d0ffcc4d71eaea017bbc759c90a1330007`. The prior diagnostic inventory mismatch resolved through its own delivery, and the final combined-state engineering gate passes. All current touched paths belong to this approved search delivery, including the narrowly approved parser and private-publisher seams; no unrelated work is staged or consumed. Awaiting review is the handoff boundary, with the exact clean implementation commit supplied to the coordinator after commit.

## Done

Accepted under the principal-approved singleton outcome batch. Root and the independent reviewer approved exact clean delivery `313371fc824e51d19d1040a2c0cdb25238dcd998`, with the published interface `d6222b752d5f5ee3ef36c7bac55eec3f67629c87` unchanged. Required local verification passed: 1,025 tests across 62 files, 100% statements/branches/functions/lines, TypeScript, native build and help, Biome, Knip, man/inventory and focused work/roadmap/self/engineering/authoring audits. A fresh pinned native engine run passed all eight synthetic operations across two isolated KBs. Source and operator-owned provisioning, cache, attestation and concurrency limits remain as recorded in Review. No private KB indexing, live provider mutation, push or publication occurred.

## Discussion

### Trust boundaries

Named indexes are intended to prevent an HNR session receiving kit-legal hits. The trust-boundary assignment must be explicit and auditable before deriving index names; the registry currently has no group field. Collection generation must avoid indexing nested `Resources/` checkouts twice without inferring authority from directory layout.

### Failure behaviour

If qmd or its daemon is absent, `kb search` must say so and exit non-zero rather than fall back silently; the `ki-repo-kb` QUERY procedure owns the grep fallback.
