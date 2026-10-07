---
id: KI-TOOL-CLI-112
area: CLI
title: Read roadmap model
theme: cli
horizon: now
status: in-progress
blocks: []
blocked_by: []
baseline_ref: 6fa3e7bb9fda9c5b8ba6fc947e312ed16f26904f
created_at: 2026-10-07T12:26:37Z
updated_at: 2026-10-07T12:42:00Z
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

### Decisions settled for planning

Kris approved the roadmap model recommendations on 2026-10-07 and asked for the rollout as soon as possible, so this record is planned in parallel with the harness records under that outcome authority, targeting `awaiting-review` only. The two open decisions are settled provisionally for review:

- The migration helper is `ki repo roadmap migrate`, beside the other mechanical roadmap operations. It previews by default and writes only with `--apply` on exactly one repository.
- `ki repo roadmap list` shows done and cancelled records last rather than hiding them, so no existing view loses evidence.

### Promotion conditions

Planned under the 2026-10-07 rollout authority while GOV-150 is still uncommitted; acceptance waits for GOV-150 to land and for reconciliation of the guesses recorded under Discussion.

## Current state

`src/core/work/items.ts` accepts only the old horizons and five statuses, requires `theme`, and has no reader for `hold`, classification or resolution fields. `ki repo roadmap list`, `summary` and `stats` group and count by the old horizons, `promote` and `demote` move along the old horizon list, `_IDEAS.md` would be read as a malformed record, and there is no grouping or migration command. The draft harness standard and checker for GOV-149 and GOV-150 are uncommitted in `ki-agentic-harness` and are read here as the target shape.

## Steps

- [ ] Extend the work-item model: seven statuses, five horizons, legacy horizons tolerated, optional `theme`, and parsed `kind`, `purpose`, `project`, `initiative`, `component`, `hold`, `resolution` and `resolution_target`, rejecting invalid new-shape values and reporting legacy shapes.
- [ ] Skip `_IDEAS.md` alongside `_ISSUES.md`.
- [ ] Order reports by lane: now, next, soon, future, hold, triage, then done and cancelled; show the Now count; update summary columns, statistics and the JSON `ki/roadmap/v1` projection additively.
- [ ] Add `ki repo roadmap list --by project|initiative`, resolving the Capital's `Streams/Projects/` registry through the local ki registry and warning without failing when it is unavailable.
- [ ] Move horizons along now, next, soon, future and hold: entering hold requires a reason and condition, leaving hold requires an explicit destination, and moves respect the status and horizon table.
- [ ] Add `ki repo roadmap migrate [--apply]` for the mechanical pass with a before/after comparison, idempotence and no commit.
- [ ] Update completion values, the manual, README and changelog.
- [ ] Cover every new branch through the CLI and keep 100% coverage.

## Files touched

- `src/core/work/items.ts`, `operations.ts`, `roadmap-report.ts`, `statistics.ts`, `index.ts`, and new `src/core/work/registry.ts` and `src/core/work/migration.ts`.
- `src/commands/repo/roadmap.ts`, `src/commands/repo/roadmap-links.ts`, `src/commands/manage/completion/grammar.ts`.
- `src/tests/cli/repo/roadmap.test.ts` and any generated command inventory or completion tests that pin roadmap grammar.
- `man/ki.1`, `README.md`, `CHANGELOG.md`.

## Verify

- `bun run test:coverage` passes with 100% thresholds.
- `bunx @biomejs/biome check`, `bunx tsc --noEmit`, `bunx knip` and `bun run ki:tools:lint-man` pass.
- `ki repo roadmap list` and `ki repo roadmap migrate` run read-only against this repository.

## Dependencies / blocks

Build order follows `ki-agentic-harness` KI-HARNESS-GOV-149 and KI-HARNESS-GOV-150, still uncommitted when this plan was made; the field shapes mirror that working tree and are reconciled once it lands.

## Documentation impact

### Decision Records

None needed: the model decision is owned by Arcadia and the harness standard; this record implements it.

### Specifications

No tools-ki specification covers roadmap record shape; the harness work-item format remains the contract.

### Guides

README and the manual describe the new grouping, hold moves and migration command.

### Roadmap

Repository migrations and the later enforcement switch-over remain separate records.

## Discussion

### Origin

Handoff from the `ki-agentic-harness` roadmap model rollout on 2026-10-07, captured and shaped by the harness agent under Kris's instruction; `tools-ki` retains priority, execution and acceptance authority.
