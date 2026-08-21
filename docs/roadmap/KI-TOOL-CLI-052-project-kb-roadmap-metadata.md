---
id: KI-TOOL-CLI-052
area: CLI
title: Project KB roadmap metadata
theme: cli
horizon: next
status: done
blocks: []
blocked_by: []
baseline_ref: 1db20e7df538892db0f3b7b02f76572a527f38f7
---

# KI-TOOL-CLI-052: Project KB roadmap metadata

## Goal

Make repository roadmap operations project the shared work lifecycle from valid Knowledge Base Streams records without rejecting metadata owned by the selected KB adapter.

## Context

`ki repo --agora ki-all roadmap list --no-icons` currently reports valid Arcadia and Techne records as unavailable because fields such as `note_type` are not in `src/core/work/items.ts`'s project-roadmap allow-list. Both repositories pass their native `ki-repo-kb-streams` audits, proving the failure is in `tools-ki`'s projection rather than in their records.

`readRepositoryPlanningSource()` already distinguishes `roadmap` from `kb-streams` and selects `docs/roadmap` or `Streams/Roadmap`. The operations layer then discards the adapter identity and passes only the directory to `readWorkItems()`, whose one strict parser is therefore applied to both record classes.

## Boundary

Do not make `tools-ki` a second semantic validator for KB-specific metadata or weaken unknown-field rejection for ordinary project roadmaps. Continue validating the shared lifecycle fields required for listing, filtering, moving, and pruning. Preserve every adapter-owned field byte-for-byte during horizon changes.

## Current state

`src/core/work/items.ts` uses one closed `allowedFields` set for every work-item directory. That set covers the repository-roadmap contract plus common optional fields, but KB Streams records legitimately carry note metadata including `note_type`, `priority`, `tags`, `aliases`, `author`, `purpose`, and `dependencies`. The first such field stops the complete repository projection and makes mixed Agora output report a diagnostic instead of the valid queue.

The focused roadmap suite covers basic KB selection and mutation but its fixture contains only project-roadmap frontmatter. It therefore proves directory selection while missing the adapter-owned metadata that differentiates a real Streams record.

## Steps

- [x] Thread the selected adapter identity through work-item reads and mutations instead of reducing the planning source to a directory string.
- [x] Keep the project-roadmap parser's closed field contract while allowing `kb-streams` to project required common lifecycle fields alongside adapter-owned metadata, still rejecting repeated or malformed common fields.
- [x] Add CLI tests with representative KB note metadata, mixed project and KB repository selection, filtering, promotion, and pruning; prove mutations preserve unconsumed metadata exactly apart from the requested horizon field.
- [x] Update the repository-operations specification to state that KB roadmap reporting is a common-field projection and native KB governance remains the metadata authority.

## Files touched

- `src/core/work/items.ts` — adapter-aware frontmatter projection and metadata-preserving mutation boundary.
- `src/core/work/operations.ts` and `src/core/work/planning.ts` — retain the selected adapter through reads and writes.
- `src/tests/cli/repo/roadmap.test.ts` — real-shape KB metadata, mixed-selection, and mutation-preservation coverage.
- `docs/specs/repository-operations.md` — behavior-level adapter projection contract.
- This roadmap record and the issue-allocation ledger.

## Verify

1. `bunx vitest run src/tests/cli/repo/roadmap.test.ts` passes the focused CLI contract suite.
2. `bun run test:coverage` retains 100% statements, branches, functions, and lines.
3. `bunx tsc --noEmit` and `bun run build` pass.
4. `ki repo audit --repo .` reports no new failures or warnings beyond the documented release-marker warning.
5. `ki repo --agora ki-all roadmap list --no-icons` lists Arcadia and Techne queues without an unsupported `note_type` diagnostic.

## Dependencies / blocks

No local roadmap dependency blocks this work. `KI-TOOL-CLI-051` is independently executable and changes a different resolver surface.

## Documentation impact

### Decision Records

No decision record is expected; the selected-adapter boundary already exists and this work preserves it through the projection layer.

### Specifications

Update `docs/specs/repository-operations.md` with the common-field projection and metadata-preservation requirements for KB Streams records.

### Guides

No guide change is expected because the public command grammar and operator workflow remain unchanged.

### Roadmap

This independently fixes estate-wide roadmap visibility for valid KB Streams repositories. It neither blocks nor is blocked by `KI-TOOL-CLI-051`.

## Review

### Delivered

Implemented the approved adapter-aware roadmap projection from immutable baseline `1db20e7df538892db0f3b7b02f76572a527f38f7`; implementation evidence is commit `d7f674c8f52ed239692823b907f2678372921493`. The change preserves the strict project-roadmap contract and does not take semantic ownership of Knowledge Base metadata.

### Summary of changes

The selected planning adapter now reaches every read, prune, and horizon-mutation boundary. The project adapter retains its closed field set; `kb-streams` validates the shared lifecycle while leaving additional scalar or indented adapter-owned metadata opaque, rejects repeated or malformed common fields, and ignores its `_ISSUES.md` ledger and `Roadmap.md` navigation note. Horizon changes continue editing the original bytes rather than reserializing metadata. CLI coverage uses block-list metadata, mixed project and KB selection, common-field failures, and byte-exact mutation preservation. `REPO-OPS-005` and new `REPO-OPS-010` codify the behavior. No delegation occurred.

### Verification

`bunx vitest run src/tests/cli/repo/roadmap.test.ts` passed 17 tests. `bun run test:coverage` passed all 666 tests with 100% statements, branches, functions, and lines. `bunx tsc --noEmit` and `bun run build` passed. `ki repo audit --repo .` passed all 17 selected skills with no warnings or failures. Live `ki repo --agora ki-all roadmap list --no-icons` projected all 22 Arcadia records and the Techne record without KB-metadata diagnostics.

### Outstanding concerns

The live estate command still returns non-zero because `homebrew-tap` and `ki-plugins` have no physical `docs/roadmap` directory. Those are pre-existing repository-projection gaps outside CLI-052; Arcadia and Techne themselves project successfully.

### Post-change review

Adapter identity is retained at the parser and publisher boundaries instead of inferred from a path. Shared lifecycle validation remains explicit, project typo detection remains closed, and opaque KB metadata is never normalized. The implementation meets the approved goal and boundary with focused, full-suite, audit, and live-fleet evidence and is ready for human acceptance.

### Mini recap

CLI-052 restores Arcadia and Techne roadmap visibility while keeping native KB governance authoritative for note metadata. The specification is the durable learning route; the two unrelated repositories missing roadmap directories should be handled as separate forward work if fleet-wide zero-exit roadmap listing is desired.

## Done

Accepted on 2026-08-21. The reviewed delivery satisfies the approved boundary; the recorded unrelated estate projection gap does not block closure, and refreshed focused tests, type checking, and build passed.

## Discussion

### Adapter authority

The CLI needs the common lifecycle fields to report and perform bounded roadmap mutations; it does not need to understand every note field a Knowledge Base declares. The native `ki-repo-kb-streams` audit remains the semantic authority for those adapter-owned fields.

### Strictness boundary

Ordinary `docs/roadmap` records retain their closed field grammar so typos remain visible. A `Streams/Roadmap` projection may carry additional adapter-owned frontmatter fields and their indented continuations, but duplicate keys and malformed or missing common lifecycle fields must still fail.

### Preservation

Promotion and demotion should continue replacing only `horizon` and adding or removing `candidate`. Adapter-owned metadata must not be parsed and reserialized, which avoids accidental normalization or loss.
