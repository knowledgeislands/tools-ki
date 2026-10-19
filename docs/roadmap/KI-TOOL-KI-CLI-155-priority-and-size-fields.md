---
id: KI-TOOL-KI-CLI-155
area: CLI
title: Priority and size fields
kind: deliver
purpose: capability
project: ways-of-working
component: repo
horizon: now
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-19T07:45:00Z
updated_at: 2026-10-19T18:04:49Z
transferred_from: ki-agentic-harness work-item format and ki-principal GDR-KI-PRINCIPAL-016, 2026-10-19
---

# KI-TOOL-KI-CLI-155: Priority and Size Fields

## Goal

`ki` reads and writes the `priority` and `size` work-record fields the harness work-item format now defines, lists the records still missing a size or a `kind` or carrying a retired shape, and warns and then fails on them in step with the harness checker, so that `ki work` and `ki repo audit` give the same verdict on a record.

## Context

On 2026-10-19 Kris reversed the 15 October answer that horizon is the only priority signal. Under [GDR-KI-PRINCIPAL-016](https://github.com/knowledgeislands/ki-principal/blob/main/Admin/Governance/Decisions/GDR-KI-PRINCIPAL-016-priority-and-size-on-work-records.md) every work record, in a local roadmap or Knowledge Base Streams, carries a priority and a size written at capture whatever its horizon. The harness [work-item format](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/skills/change-management/ki-work-roadmap/references/standards-work-item-format.md#priority-and-size) and the repository-roadmap standard's [migration tolerance](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/skills/change-management/ki-work-roadmap/references/standards-repository-roadmaps.md#migration-tolerance) carry the contract, and the harness roadmap and Streams checkers already apply it.

`ki` lags the harness today:

- `src/core/work/items.ts` treats `priority` as an unknown field. In a Knowledge Base it warns that "horizon is the only priority signal"; in a roadmap repository it rejects the record as having an unsupported field, so a roadmap record cannot carry `priority` or `size` until `ki` accepts them.
- It tolerates the retired horizons `triage`, `waiting-for` and `parked`, which the harness checker already fails, and reports a missing `kind` only as legacy.
- It still accepts `initiative` and `purpose: adoption`, which the harness has retired.

The contract `ki` should match:

- `priority` is `high`, `medium` or `low`; an absent priority reads as `medium` and never warns or fails.
- `size` is `s`, `m`, `l` or `xl`, `xl` meaning split before Ready; it is required on every record.
- During the field migration window, a missing size, an adopted open record without `kind`, a retired horizon, `initiative` and `purpose: adoption` warn, and `ki work` lists each gap so that owners can backfill by judgement.
- The window closes in the first `ki` release after `ki work` shows no gaps across the estate; from that release each of these fails, as the harness checker then does.
- Capture through `ki` requires a priority and a size.
- `kind: decide`, `resolution_target` and `task_links` stay valid: the harness kept them because other rules depend on them.

## Boundary

This record changes `ki`'s work-record reader, validator, capture and `ki work` listing only. It does not edit any repository's records or backfill sizes; each owner does that. It does not change the harness standard or checker, whose closing of the window is a harness change made in step with the `ki` release that closes it.

## Discussion

### Ordering

Accepting the two fields comes first: until a `ki` release accepts them, a roadmap repository cannot record a priority or size without `ki work` rejecting the record, so capture there has to leave them out. The warn level and the gap listing can follow in the same release; the fail level is a later release, gated on the estate showing no gaps.

### Window evidence

The release that closes the window needs evidence that `ki work` shows no gaps across the estate. A territory-wide `ki work` gap count would let the release check that directly rather than by survey.
