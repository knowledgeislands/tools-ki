---
id: KI-TOOL-CLI-108
area: CLI
title: Roadmap list structural validity
theme: cli
horizon: triage
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-06T21:05:00Z
updated_at: 2026-10-06T21:05:00Z
---

# Roadmap list structural validity

## Goal

`ki repo roadmap list` applies the roadmap standard's structural-validity invariant, reporting every malformed record and every duplicate identifier with a stable diagnostic and a non-zero exit, so it agrees with the harness rubrics on the same revision.

## Context

Originating repository and item: `ki-agentic-harness` [KI-HARNESS-GOV-095](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/KI-HARNESS-GOV-095-align-roadmap-diagnostics.md), delivered in harness commit `91b82969`. Relationship: non-blocking; this record neither blocks nor is blocked by GOV-095, which is a follow-on handoff.

On 2026-09-25 Kit Principal exposed two inconsistent results. `ki repo audit --skill ki-repo-kb-streams` passed while `ki repo roadmap list` exited non-zero because one `Streams/Roadmap/` file lacked canonical frontmatter. After that file was migrated, `ki repo roadmap list` exited successfully while displaying two active records with the same `KIT-007` identifier and no duplicate-identity diagnostic.

GOV-095 states the invariant once in the harness roadmap standard (`skills/change-management/ki-work-roadmap/references/standards-repository-roadmaps.md`, "Structural validity"): every direct-child Markdown record other than `_ISSUES.md` (and, in a knowledge base, the `Roadmap.md` index note) begins with valid canonical frontmatter whose `id` matches its filename identifier; no two retained records share an `id`; and any command that claims structural validation of a roadmap container reports each violation with a stable diagnostic and a non-zero result. The harness now enforces it through `ki-work-roadmap` `ITEM-1` and `ki-repo-kb-streams` `STREAM-6` and `STREAM-7`. The executable list command is `tools-ki`'s to change.

## Boundary

- In scope: `ki repo roadmap list` (and `ki repo roadmap summary`, which shares the inventory) reports duplicate record identifiers alongside the existing per-record faults, with a stable diagnostic naming every file that shares the identifier, and exits non-zero.
- In scope: confirm that a malformed record still produces a per-file fault and a non-zero exit for both adapters, `docs/roadmap/` and `Streams/Roadmap/`, and that `_ISSUES.md` and a KB `Roadmap.md` index note are never reported.
- Out of scope: re-validating every adapter-owned field, which stays with the `ki-work-roadmap` rubric; repairing any repository's duplicate identifiers; changing harness rubrics.

## Current state

Planning has not started. A first look on 2026-10-06 suggests `readWorkItemRecordInventory` in `src/core/work/items.ts` already turns unreadable records into `faults`, and `src/commands/repo/roadmap.ts` exits `1` on faults, but nothing in `src/core/work/` compares identifiers across records.

## Steps

- [ ] Plan the change and confirm the current behaviour against fixtures for both adapters.

## Files touched

To be determined in planning.

## Verify

To be determined in planning. At minimum, fixtures with a record without frontmatter and with two records sharing an `id` fail `ki repo roadmap list` with stable diagnostics and a non-zero exit, and the same fixtures with the defects removed pass.

## Dependencies / blocks

None. Originating item `KI-HARNESS-GOV-095` in `ki-agentic-harness` is non-blocking in both directions.

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
