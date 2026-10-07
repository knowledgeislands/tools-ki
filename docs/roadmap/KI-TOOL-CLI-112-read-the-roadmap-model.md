---
id: KI-TOOL-CLI-112
area: CLI
title: Read roadmap model
theme: cli
horizon: soon
status: draft
blocks: []
blocked_by: []
baseline_ref: null
created_at: 2026-10-07T12:26:37Z
updated_at: 2026-10-07T12:26:37Z
---

# KI-TOOL-CLI-112: Read roadmap model

## Goal

`ki roadmap` reads, reports and groups work records in the approved v1 roadmap model - status `triage` and `cancelled`, horizons Now, Next, Soon, Future and Hold, and the `kind`, `project`, `initiative` and `component` fields - and offers an idempotent migration helper that repositories use to move their open records from the old shape.

## Context

Kris approved the roadmap model on 2026-10-07 (`~/.local/state/ki/state-of-play/design/roadmap-model.md` with `decisions.md`). The harness carries the standard in `ki-agentic-harness` [KI-HARNESS-GOV-149](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/KI-HARNESS-GOV-149-adopt-the-roadmap-model.md) and the checker in [KI-HARNESS-GOV-150](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/KI-HARNESS-GOV-150-check-the-roadmap-model.md). The schema stays v1; old values are tolerated with warnings until migration coverage is complete.

`src/core/work/items.ts` hard-codes `workItemHorizons` as `['now', 'next', 'soon', 'waiting-for', 'parked', 'future', 'triage']`, requires `theme` and a known horizon, and throws otherwise. `operations.ts` derives movable horizons from that list, and `roadmap-report.ts` reports `theme`. A repository that authors a record in the new shape - no `theme`, `status: triage` without a horizon, `horizon: hold`, or `status: cancelled` - would therefore break `ki roadmap` even though the harness checker accepts it. `docs/roadmap/_IDEAS.md` is a new non-record file beside `_ISSUES.md`.

Blocked by `ki-agentic-harness` [KI-HARNESS-GOV-150](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/KI-HARNESS-GOV-150-check-the-roadmap-model.md) as build order: that record fixes the table, field shapes and tolerance rules this record mirrors. Readiness waits for it to be done.

## Boundary

- No record migration in any repository; the helper is built and tested here, and each repository runs it in the later migration phase under its own approval.
- No enforcement switch-over; rejecting old values after coverage is a later record in both repositories.
- No project registry instance or editing; the CLI only reads the registry the harness standard defines.
- No Linear or GitHub Issues projection.
- No change to harness standards or checkers.

## Shaping

### Intended approach

- **Model.** Replace `workItemHorizons` with now, next, soon, future and hold; add the status set with `triage` and `cancelled`; parse `kind`, `purpose`, `project`, `initiative`, `component`, `hold` and `resolution` / `resolution_target`; make `theme` optional. Read old values (`waiting-for`, `parked`, `triage` as a horizon, `theme`, `waiting_on_trades`, `intake_disposition*`) without throwing, reporting them as legacy.
- **Report order.** Open adopted records by horizon now, next, soon, future, hold; then triage; done and cancelled last or hidden by default. Show the Now count as a signal with no cap.
- **Grouping.** `ki roadmap list --by project|initiative`, deriving initiative from the project through the registry the harness standard defines (Capital checkout `Streams/Projects/`), with projectless records under their direct `initiative` and an explicit unassigned group; an unavailable registry warns and still lists.
- **Structural validity.** Exclude `_IDEAS.md` alongside `_ISSUES.md`.
- **Movable horizons.** Moves to `hold` require a reason and condition; leaving hold re-decides the horizon; `triage` is no longer a horizon move but adoption.
- **Migration helper.** An idempotent, dry-run-first command that applies the mechanical pass only: horizon `triage` to `status: triage` with no horizon; Waiting for and Parked to `horizon: hold` with `hold.reason` and a condition lifted from the record prose for review; `waiting_on_trades` to `hold.trades`; terminal Triage `intake_disposition*` to `status: cancelled` with `resolution`; drop `theme` or propose `component` where the theme is a declared component. It prints a before/after comparison per record, advances `updated_at`, never infers `kind`, `project` or `purpose`, and never commits.

### Known dependencies

[KI-HARNESS-GOV-150](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/KI-HARNESS-GOV-150-check-the-roadmap-model.md) must be done so the table and field shapes are fixed.

### Decisions still needed

- The migration helper's command name and whether it lives under `ki roadmap` or `ki repo`.
- Whether done and cancelled records are hidden by default in `ki roadmap list`.

### Promotion conditions

GOV-150 done; the two decisions above settled; then move to Next, plan Steps, Files touched and Verify, and seek readiness approval.

## Discussion

### Origin

Handoff from the `ki-agentic-harness` roadmap model rollout on 2026-10-07, captured and shaped by the harness agent under Kris's instruction; `tools-ki` retains priority, execution and acceptance authority.
