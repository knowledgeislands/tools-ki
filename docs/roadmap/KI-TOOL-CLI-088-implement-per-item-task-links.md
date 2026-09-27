---
id: KI-TOOL-CLI-088
area: CLI
title: Implement per-item task links
theme: cli
horizon: now
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-09-27T13:10:03Z
updated_at: 2026-09-27T13:10:03Z
---

# KI-TOOL-CLI-088: Implement per-item task links

## Goal

The `ki` CLI reads, validates and reports task links stored directly on each roadmap item. An item can reference multiple Paperclip tasks and tasks in other systems without depending on a shared mapping file or live task-system access.

## Context

The human approved the task-links delivery on 2026-09-27. The existing [KIS-5 plan](http://127.0.0.1:3100/KIS/issues/KIS-5#document-plan), revision `cbcba3b3-82f2-44dd-9f1f-37d1b672ec71`, defines the proposed provider-neutral map and rejects historical links as a current ownership signal. `KI-HARNESS-GOV-116` owns the portable work-item contract. This repository currently accepts only scalar common frontmatter in `src/core/work/items.ts`; the public roadmap JSON projection omits task links. There is no existing non-Techné tools-ki work item covering this change. The older Techné proposal remains on hold and supplies provenance, not execution authority.

## Boundary

Implement the optional `task_links` field for local project roadmaps and KB Streams, its offline structural validation, typed work-item model, additive public projection and CLI specification. Preserve old items and unrelated KB adapter metadata. Keep the horizon writer's untouched frontmatter bytes and original creation timestamps. Do not copy Paperclip task status into KI lifecycle, infer availability from missing links, add a central registry, query Paperclip during ordinary validation, resume agents, or implement the broader coordination audit.

## Current state

`parseWorkItem` rejects nested common fields. `WorkItem` has no task-link type; the historical reader uses the same parser. The horizon writer edits raw frontmatter and can preserve an untouched nested block. The JSON report manually selects fields and currently has a fixed `ki/roadmap/v1` shape. KIS-5 is the existing Paperclip task; no additional Paperclip issue is needed.

## Steps

- [ ] Add optional `task_links` parsing and typed validation: lower-case provider key to a nonempty list of refs with nonempty string `authority`, `scope`, `id`, `key`, `url`, and `relation`; relations are `evaluation`, `implementation`, `review`, `integration`, `coordination`, or `related`.
- [ ] Reject malformed nested content, unknown reference keys and duplicate provider + authority + scope + id + relation within an item, while allowing multiple providers and references, duplicate readable keys under different qualified identities, and absent `task_links` on existing records.
- [ ] Preserve the closed common-field allow-list, unrelated KB-owned nested metadata, historical parsing, frontmatter round trips and immutable `created_at` during horizon changes.
- [ ] Expose optional task links in the path-free roadmap JSON report only when present; keep old-record output unchanged under the documented additive v1 projection unless consumer review shows a version break is required.
- [ ] Update the repository-operations specification and focused CLI tests for the complete matrix above, including malformed values, identity and relation distinctions, KB Streams, historical reading and horizon preservation.
- [ ] Independently compare the final implementation with `KI-HARNESS-GOV-116` and the KIS-5 plan before review.

## Files touched

`src/core/work/items.ts`, `src/core/work/roadmap-report.ts`, the relevant work type export, `src/tests/cli/repo/roadmap.test.ts`, and `docs/specs/repository-operations.md`. Any additional file requires a concrete reason recorded in review.

## Verify

Run focused roadmap CLI tests, the complete Bun test suite, TypeScript and Biome gates, `ki repo audit --skill ki-work`, and `ki repo audit --skill ki-work-roadmap`. Confirm old JSON output, KB-owned metadata and untouched nested-block bytes remain stable. An independent reviewer checks the exact resulting commit.

## Dependencies / blocks

The harness-owned `KI-HARNESS-GOV-116` defines the shared schema. Implement against the same reviewed KIS-5 revision and reconcile any mismatch before delivery. This cross-repository contract is not a local `blocked_by` identifier. Held Techné work is not a prerequisite.

## Delegation

Sol coordinates and reviews the contract boundary. The tools-ki worker changes only the named parser, model, projection, specification and tests in the primary checkout. A separate reviewer checks the exact diff and evidence. Sol returns the result to KIS-5 and the repository-owned review packet without closing KI work or resuming Paperclip agents.

## Documentation impact

### Decision Records

No new decision record: the approved per-item storage and no-registry decision are captured in KIS-5 and the governing shared format.

### Specifications

Update `docs/specs/repository-operations.md` for validation, preservation and public projection behavior.

### Guides

No new guide; the portable harness format and Paperclip coordination standard explain authoring and backlink practice.

### Roadmap

The harness sibling owns the normative field. Bulk backfill is a later reconciliation action against existing items, not a duplicate tools-ki work item.

## Discussion

### Association versus claim

The map carries durable associations, including finished evaluation and delivery history. It is not a lock or provider status cache. A direct agent still checks the current roadmap item, Paperclip task and retained worktree evidence before taking work; absence of a link is unknown rather than free capacity.
