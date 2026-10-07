---
id: KI-TOOL-CLI-108
area: CLI
title: Roadmap list structural validity
kind: deliver
purpose: upkeep
initiative: platform-foundations
component: repo
horizon: now
status: ready
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-06T21:05:00Z
updated_at: 2026-10-07T20:53:26Z
---

# Roadmap list structural validity

## Goal

`ki repo roadmap list` applies the roadmap standard's structural-validity invariant, reporting every malformed record and every duplicate identifier with a stable diagnostic and a non-zero exit, so it agrees with the harness rubrics on the same revision.

## Context

Originating repository and item: `ki-agentic-harness` [KI-HARNESS-GOV-095](https://github.com/knowledgeislands/ki-agentic-harness/blob/fb69de8d8a734164fd1ff7dc84a886c2a509e095/docs/roadmap/KI-HARNESS-GOV-095-align-roadmap-diagnostics.md), delivered in harness commit `91b82969`. Relationship: non-blocking; this record neither blocks nor is blocked by GOV-095, which is a follow-on handoff.

On 2026-09-25 Kit Principal exposed two inconsistent results. `ki repo audit --skill ki-repo-kb-streams` passed while `ki repo roadmap list` exited non-zero because one `Streams/Roadmap/` file lacked canonical frontmatter. After that file was migrated, `ki repo roadmap list` exited successfully while displaying two active records with the same `KIT-007` identifier and no duplicate-identity diagnostic.

GOV-095 states the invariant once in the harness roadmap standard (`skills/change-management/ki-work-roadmap/references/standards-repository-roadmaps.md`, "Structural validity"): every direct-child Markdown record other than `_ISSUES.md` (and, in a knowledge base, the `Roadmap.md` index note) begins with valid canonical frontmatter whose `id` matches its filename identifier; no two retained records share an `id`; and any command that claims structural validation of a roadmap container reports each violation with a stable diagnostic and a non-zero result. The harness now enforces it through `ki-work-roadmap` `ITEM-1` and `ki-repo-kb-streams` `STREAM-6` and `STREAM-7`. The executable list command is `tools-ki`'s to change.

## Boundary

- In scope: `ki repo roadmap list` (and `ki repo roadmap summary`, which shares the inventory) reports duplicate record identifiers alongside the existing per-record faults, with a stable diagnostic naming every file that shares the identifier, and exits non-zero.
- In scope: confirm that a malformed record still produces a per-file fault and a non-zero exit for both adapters, `docs/roadmap/` and `Streams/Roadmap/`, and that `_ISSUES.md` and a KB `Roadmap.md` index note are never reported.
- Out of scope: re-validating every adapter-owned field, which stays with the `ki-work-roadmap` rubric; repairing any repository's duplicate identifiers; changing harness rubrics.

## Current state

Planned on 2026-10-07 against `main`. `parseWorkItem` in `src/core/work/items.ts` already rejects a record without canonical frontmatter or whose `id` does not match its filename, and `readWorkItemRecordInventory` turns each rejection into a per-file fault that `ki repo roadmap list` and `summary` render and exit `1` on, for both adapters; `_ISSUES.md`, `_IDEAS.md` and the KB `Roadmap.md` index are excluded by `isWorkItemFile`. Nothing compares identifiers across records, so two readable records sharing an `id` both list without a diagnostic. Mutating commands already refuse an ambiguous identifier through `selectedItem`.

## Steps

- [ ] In `readWorkItemRecordInventory`, group readable records by `id`; for every identifier held by more than one record, withhold those records from the inventory and add one fault per file, `work item <file> shares identifier <ID> with <other files>`, so list, summary and every inventory reader see the duplicate as a structural fault.
- [ ] Add a CLI contract test in `src/tests/cli/repo/roadmap.test.ts` covering both adapters: a record without frontmatter and two records sharing an `id` fail `list` and `summary` with the stable diagnostics and exit `1`, the ledger and KB index are never reported, and the repaired fixtures pass. Update the existing ambiguous-identifier test to the new diagnostic.
- [ ] Extend `REPO-OPS-011` in `docs/specs/repository-operations.md` with the duplicate-identifier diagnostic and the new test.

## Files touched

- `src/core/work/items.ts`
- `src/tests/cli/repo/roadmap.test.ts`
- `docs/specs/repository-operations.md`
- this record

## Verify

- `bun run test:coverage` passes with 100% coverage, including the new test.
- `bunx tsc --noEmit` and `bunx biome check` are clean.
- `~/.local/bin/ki repo audit --repo .` passes.

## Dependencies / blocks

None. Originating item `KI-HARNESS-GOV-095` in `ki-agentic-harness` is non-blocking in both directions.

Sequencing: `ki-agentic-harness` KI-HARNESS-GOV-094 (Check constraint reach) and KI-HARNESS-GOV-103 (Cite coordination rules once) both edit the same harness roadmap standard section, `skills/change-management/ki-work-roadmap/references/standards-repository-roadmaps.md`, whose "Structural validity" invariant this item implements. Neither blocks this item, but re-read that standard after they land and before planning this item to Ready, so the diagnostics match its final wording.

## Documentation impact

### Decision Records

None expected.

### Specifications

The roadmap command specification may gain the duplicate-identifier diagnostic.

### Guides

None expected.

### Roadmap

None.

## Discussion

Raised by the GOV-095 delivery on 2026-10-06 under Kris's owner decision that the harness delivery raises this handoff as a draft record here. `tools-ki` owns its priority, plan and execution.

### Adoption

Kris approved adoption from Triage into Next on 2026-10-06, as a disposition of the state-of-play review (`ki-arcadia-principal`, `+/_CHECKPOINTS/state-of-play.md`).

### Readiness

Shaped and marked Ready on 2026-10-07 under Kris's standing continuous-delivery decision (state-of-play Decisions 12, 17 and 19), which also adopts it into Now.
