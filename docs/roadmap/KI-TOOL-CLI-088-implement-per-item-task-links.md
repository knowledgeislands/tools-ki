---
id: KI-TOOL-CLI-088
area: CLI
title: Implement per-item task links
theme: cli
horizon: now
status: done
blocks: []
blocked_by: []
baseline_ref: 02ec3da5322d2fdb158254f05f39d61a024eed5d
task_links:
  paperclip:
    - authority: http://127.0.0.1:3100
      scope: 558dd49e-7615-409f-b7b2-7f19e22171d9
      id: b76a4ec9-be48-4a3c-8568-7885b5e6789b
      key: KIS-5
      url: http://127.0.0.1:3100/KIS/issues/KIS-5
      relation: related
created_at: 2026-09-27T13:10:03Z
updated_at: 2026-09-30T07:39:22Z
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

- [x] Add optional `task_links` parsing and typed validation: lower-case provider key to a nonempty list of refs with nonempty string `authority`, `scope`, `id`, `key`, `url`, and `relation`; relations are `evaluation`, `implementation`, `review`, `integration`, `coordination`, or `related`.
- [x] Reject malformed nested content, unknown reference keys and duplicate provider + authority + scope + id + relation within an item, while allowing multiple providers and references, duplicate readable keys under different qualified identities, and absent `task_links` on existing records.
- [x] Preserve the closed common-field allow-list, unrelated KB-owned nested metadata, historical parsing, frontmatter round trips and immutable `created_at` during horizon changes.
- [x] Expose optional task links in the path-free roadmap JSON report only when present; keep old-record output unchanged under the documented additive v1 projection unless consumer review shows a version break is required.
- [x] Update the repository-operations specification and focused CLI tests for the complete matrix above, including malformed values, identity and relation distinctions, KB Streams, historical reading and horizon preservation.
- [x] Independently compare the final implementation with `KI-HARNESS-GOV-116` and the KIS-5 plan before review.

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

## Review

### Delivered

Implemented the approved local CLI boundary from immutable baseline `02ec3da5322d2fdb158254f05f39d61a024eed5d` in the designated tools-ki primary checkout. The resulting evidence is the local commit carrying this review packet. No Paperclip state, Techné record, shared registry, KI acceptance or push changed.

### Change Summary

`src/core/work/items.ts` validates the optional nested map and exposes typed links; `src/core/work/index.ts` exports the types. `src/core/work/roadmap-report.ts` adds `taskLinks` only for linked items under `ki/roadmap/v1`. `docs/specs/repository-operations.md` states the CLI contract. `src/tests/cli/repo/roadmap.test.ts` covers both local adapters, qualified identities, relation values, malformed shapes, unchanged old-record output, byte-preserving horizon moves and historical snapshot validation through batch close. No file outside the approved list changed.

### Verification

- Focused roadmap CLI tests: 26 passed.
- Full `bun run test`: 894 passed before the final historical-snapshot case; the final `bun run test:coverage` ran the full suite with 895 passed and 100% statement, branch, function and line coverage.
- `bunx tsc --noEmit`, focused `bunx biome check`, and `rumdl check` on the two authored Markdown files: passed.
- `ki repo audit --skill ki-work --repo .` and `ki repo audit --skill ki-work-roadmap --repo .`: passed.
- Compared the six fields, six relations, provider key grammar, duplicate tuple and no-live-claim boundary with KIS-5 plan revision `cbcba3b3-82f2-44dd-9f1f-37d1b672ec71` and the `KI-HARNESS-GOV-116` portable format text.

### Outstanding concerns

At delivery, independent review of the exact resulting commit remained pending. The owner accepted the item on 2026-09-30 without a separate independent review. No known CLI failure or approved-scope deviation remains. The separate harness contract delivery is present on the harness main branch.

### Post-change review

The CLI reports durable task associations without treating them as current ownership or a second lifecycle. Existing records retain their JSON shape; KB-owned metadata and task-link blocks survive horizon changes byte-for-byte. The user accepted this delivery with the independent-review limitation recorded above.

### Mini recap

The approved parser, projection, specification and CLI tests are complete and verified. Keep the provider-neutral field semantics in `KI-HARNESS-GOV-116`; reconcile any future task-link backfill item by item rather than inferring availability from the map.

## Done

Accepted 2026-09-30 by Kris Brown on the review packet above.

## Discussion

### Association versus claim

The map carries durable associations, including finished evaluation and delivery history. It is not a lock or provider status cache. A direct agent still checks the current roadmap item, Paperclip task and retained worktree evidence before taking work; absence of a link is unknown rather than free capacity.

### Pickup checkpoint — 2026-09-27

- **Integrated evidence:** local `main` is `884f4642aed4062a22f65967313e9819e75e68cf`. Commit `c0857d5652060d644fecc7c2f20a308f59feec7c` implements `task_links` parsing and validation in `src/core/work/items.ts` (`parseTaskLinks`), optional JSON projection in `src/core/work/roadmap-report.ts` (`taskLinks`), the contract in `docs/specs/repository-operations.md`, and CLI cases in `src/tests/cli/repo/roadmap.test.ts`. Later commit `9f28542` adds linked-task text rendering in `src/commands/repo/roadmap-links.ts` (`renderRoadmapItem`) and the `--links` option in `src/commands/repo/roadmap.ts`. Both are ancestors of `main`; the recorded baseline `02ec3da5322d2fdb158254f05f39d61a024eed5d` resolves. Harness commit `a98cce65` delivered the sibling portable `task_links` contract on its local `main`. This item's existing `KIS-5` link is an association, not a current ownership claim.
- **Verification boundary:** the `## Review` packet records focused tests, a full suite and coverage, TypeScript, Biome, Markdown, and roadmap audits from delivery time. Those are historical claims, not reruns in this checkpoint. Current source and Git ancestry were inspected; no fresh executable suite or independent review result was established here.
- **Remaining and pickup:** independently review the exact integrated source against this item's approved scope and the current portable contract, then seek owner acceptance before changing `awaiting-review` or closing it. Reconcile destination branch, linked `KIS-5` task and any live ownership, and retained worktrees from current evidence before further implementation. Missing task evidence does not release ownership or lift a hold; this checkpoint is guidance, not an execution block or resumption authority. Retain any later Done record until explicit pruning.
