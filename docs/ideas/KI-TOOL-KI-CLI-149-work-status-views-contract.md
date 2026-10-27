---
id: KI-TOOL-KI-CLI-149
area: CLI
title: Work status views contract
kind: deliver
purpose: capability
project: observatory
component: agent
priority: low
size: m
horizon: soon
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-18T09:27:30Z
updated_at: 2026-10-20T22:21:15Z
---

> **Idea, not on the roadmap.** Publish the five views of ki work status as JSON under a schema so the Observatory reads them from a contract; the text views serve the Observatory today, so a schema is premature. Moved out of `docs/roadmap/` on 27 October 2026 under the roadmap sweep, with its record kept in full here so that it can return when Kris brings it back; it was `KI-TOOL-KI-CLI-149`.

# KI-TOOL-KI-CLI-149: Work Status Views Contract

## Goal

`ki work status --format json` publishes, under a new schema `ki/work-status/v2`, the five views the text form shows, with you, stuck, blocked, moving and on hold, and the count of work held in `+/_WORK_REVIEW/`, so that a consumer reads them from the contract instead of deriving them again.

## Context

`ki/work-status/v1` carries the work entries, each work's items, and nothing derived from them. `deriveWorkViews` in `src/core/work/status.ts` applies the Work Process note's view rules, and the `+/_WORK_REVIEW/` count sits beside the report in `WorkStatus`, but both reach only the text form.

The Knowledge Islands Observatory consumes `ki/work-status/v1` for its Work Instrument and its Beacon contributor. Because the contract carries neither, the Observatory derives the five views again by the same printed rules and counts `+/_WORK_REVIEW/` folders holding a `work.md` from the filesystem itself; its [machine contracts specification](/Users/krisbrown/workspaces/knowledge-islands/apps-observatory.local/docs/specs/contracts.md) names the consumed contract. Two derivations of the same rules can drift.

Kris decided on 18 October, in the [ways-of-working decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/decisions.md) ("owner answers, observatory batch", OBS-KI-CONTRACT-GAPS option a)), to ask `tools-ki` for both in `ki/work-status/v2`, with the Observatory keeping its own derivation until then. This is a handoff from the Observatory under the Capital's cross-repository handoff rule: `tools-ki` owns its priority, plan and execution, and nothing in the Observatory waits on it.

## Boundary

- In: a `ki/work-status/v2` JSON report carrying, beside the v1 fields, the five views, each line naming its work or item, holder and since and, on hold, whether a paused hold is past 31 days, in the order the text form prints them; the `+/_WORK_REVIEW/` count; the schema's documentation, help and manual, and the CHANGELOG naming the version change.
- Out: changing the view rules themselves, which the Work Process note owns; changing what the text form shows; the Observatory's switch to v2, which is its own work once v2 ships.

## Shaping

**Approach:** a `ki/work-status/v2` JSON report that adds the five views and the `+/_WORK_REVIEW/` count beside the v1 fields, taken from `deriveWorkViews` and `WorkStatus` rather than derived again.

**Dependencies:** waits on State of play confirming the work-status form, alongside [KI-TOOL-KI-CLI-160](KI-TOOL-KI-CLI-160-work-status-routing-view.md). The Observatory works from v1 and nothing there waits on this, which is why it is `low`. [KI-TOOL-KI-CLI-160](KI-TOOL-KI-CLI-160-work-status-routing-view.md) touches the same report and may be planned beside it.

**Decisions still needed:** how long v1 stays available or whether `--schema` selects it; whether views carry full lines or keys into `work`; and where the review count sits.

**Promotion to Next:** once State of play confirms the work-status form, the remaining design questions are answered and the Observatory confirms it will move to v2.

## Dependencies / blocks

Waits on State of play confirming the work-status form, alongside [KI-TOOL-KI-CLI-160](KI-TOOL-KI-CLI-160-work-status-routing-view.md). This is an external decision dependency; `blocked_by` stays empty because no local work record owns it.

Not blocking: the Observatory works from v1 today. Planning decides how long v1 stays available, or whether `--schema` selects it, so the Observatory can move when it is ready.

## Discussion

Open for planning: whether the views carry full lines or keys into `work`, which keeps the report smaller and leaves a single copy of each entry; and whether the review count belongs at the top level or as a sixth, count-only view.

### Agreed form dependency

Kris confirmed TOOLS-KI-SHAPES a) on 20 October 2026 at 23:16 BST in the [ways-of-working decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/decisions.md#2026-10-20-2316-bst---query-sign-offs-first-batch). Both work-status records wait on State of play confirming the form before planning. The compatibility and representation questions remain open.
