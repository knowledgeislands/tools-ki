---
id: KI-TOOL-KI-CLI-149
area: CLI
title: Work status views contract
status: triage
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-18T09:27:30Z
updated_at: 2026-10-18T09:27:30Z
---

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

## Dependencies / blocks

Not blocking: the Observatory works from v1 today. Planning decides how long v1 stays available, or whether `--schema` selects it, so the Observatory can move when it is ready.

## Discussion

Open for planning: whether the views carry full lines or keys into `work`, which keeps the report smaller and leaves a single copy of each entry; and whether the review count belongs at the top level or as a sixth, count-only view.
