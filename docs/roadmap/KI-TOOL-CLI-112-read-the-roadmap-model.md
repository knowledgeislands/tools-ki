---
id: KI-TOOL-CLI-112
area: CLI
title: Read roadmap model
kind: deliver
purpose: governance
project: roadmap-model
component: repo
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 6fa3e7bb9fda9c5b8ba6fc947e312ed16f26904f
created_at: 2026-10-07T12:26:37Z
updated_at: 2026-10-07T14:36:34Z
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

[KI-HARNESS-GOV-150](https://github.com/knowledgeislands/ki-agentic-harness/blob/main/docs/roadmap/KI-HARNESS-GOV-150-check-the-roadmap-model.md) must be done so the table and field shapes are fixed. Satisfied: GOV-150 and its standards companion KI-HARNESS-GOV-149 were accepted as done on 2026-10-07 in `ki-agentic-harness` commit `bdcb7360`, on delivery commits `1780ff75` (standards) and `1549ad35` (checker).

### Decisions settled for planning

Kris approved the roadmap model recommendations on 2026-10-07 and asked for the rollout as soon as possible, so this record is planned in parallel with the harness records under that outcome authority, targeting `awaiting-review` only. The two open decisions are settled provisionally for review:

- The migration helper is `ki repo roadmap migrate`, beside the other mechanical roadmap operations. It previews by default and writes only with `--apply` on exactly one repository.
- `ki repo roadmap list` shows done and cancelled records last rather than hiding them, so no existing view loses evidence.

### Promotion conditions

Planned under the 2026-10-07 rollout authority while GOV-150 is still uncommitted; acceptance waits for GOV-150 to land and for reconciliation of the guesses recorded under Discussion.

## Current state

Delivered in `6e47d2d`: the model, lane ordering, grouping, hold moves, migration helper and terminal prune described under Review are awaiting acceptance.

## Steps

- [x] Extend the work-item model: seven statuses, five horizons, legacy horizons tolerated, optional `theme`, and parsed `kind`, `purpose`, `project`, `initiative`, `component`, `hold`, `resolution` and `resolution_target`, rejecting invalid new-shape values and reporting legacy shapes.
- [x] Skip `_IDEAS.md` alongside `_ISSUES.md`.
- [x] Order reports by lane: now, next, soon, future, hold, triage, then done and cancelled; show the Now count; update summary columns, statistics and the JSON `ki/roadmap/v1` projection additively.
- [x] Add `ki repo roadmap list --by project|initiative`, resolving the Capital's `Streams/Projects/` registry through the local ki registry and warning without failing when it is unavailable.
- [x] Move horizons along now, next, soon, future and hold: entering hold requires a reason and condition, leaving hold requires an explicit destination, and moves respect the status and horizon table.
- [x] Add `ki repo roadmap migrate [--apply]` for the mechanical pass with a before/after comparison, idempotence and no commit.
- [x] Update completion values, the manual, README and changelog.
- [x] Extend `ki repo roadmap prune` to select cancelled records as well as done ones, with the same guard: the terminal state must already be committed in an earlier commit, and the commit subject and body name the pruned records whichever terminal state they reached. This mirrors the harness `ki-accept` prune selection delivered by GOV-150.
- [x] Cover every new branch through the CLI and keep 100% coverage.

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

Build order follows `ki-agentic-harness` KI-HARNESS-GOV-149 and KI-HARNESS-GOV-150. Both are now done (harness commit `bdcb7360`), so the dependency is satisfied; the field shapes this plan mirrored from the working tree should be reconciled against the committed harness checker in `skills/change-management/ki-work-roadmap/scripts/rubric/contexts/roadmap-evidence.ts` and `project-registry.ts`.

## Documentation impact

### Decision Records

None needed: the model decision is owned by Arcadia and the harness standard; this record implements it.

### Specifications

No tools-ki specification covers roadmap record shape; the harness work-item format remains the contract.

### Guides

README and the manual describe the new grouping, hold moves and migration command.

### Roadmap

Repository migrations and the later enforcement switch-over remain separate records.

## Review

### Delivered

- `6e47d2d` `feat(roadmap): read the v1 roadmap model`.

### Change Summary

- `src/core/work/items.ts` reads seven statuses and five horizons, the `hold` mapping, `kind`, `purpose`, `project`, `initiative`, `component`, `resolution` and `resolution_target`, rejects invalid new-shape values, reports legacy shapes (old horizons, `theme`, `waiting_on_trades`, `intake_disposition*`, status and horizon pairs outside the table), and skips `_IDEAS.md`. Prune selection is `selectTerminalWorkItems`.
- `src/core/work/registry.ts` resolves `[skills.ki-repo].capital` through the local ki registry and reads `Streams/Projects/`; `src/core/work/migration.ts` is the mechanical pass.
- `ki repo roadmap list`, `summary` and `stats` order and count by lane, add `NOW=`, `CANCELLED=` and `LEGACY=`, and extend the JSON `ki/roadmap/v1` items additively with `lane`, the classification fields and `legacy`. `list --by project|initiative` groups text output and warns when the registry is unavailable.
- `promote` and `demote` move along `now` to `hold` within the status's allowed horizons; `demote --reason --condition [--review]` enters hold and an explicit destination leaves it.
- `ki repo roadmap migrate [--apply]` previews by default and writes one repository without committing; `prune` also removes cancelled records under the same guard and subject.
- Completion values, the manual, README and changelog follow.

### Verification

- `bun run test:coverage`: 1074 tests pass at 100% statements, branches, functions and lines.
- `bunx @biomejs/biome check`, `bunx tsc --noEmit`, `bunx knip`, `bun run ki:tools:lint-man` and the command-inventory regeneration pass.
- Read-only against this repository: `ki repo roadmap list` lists five records, all marked legacy for `theme` and three for the `triage` horizon; `list --by project` puts all five under `unassigned`; `migrate` would migrate the three triage-horizon drafts and writes nothing.

### Outstanding concerns

- The provisional decisions and guesses under Discussion need Kris's confirmation at acceptance.
- Every existing record reports legacy because `theme` is retired; the count falls only when repositories drop `theme`, which the migration helper deliberately leaves alone.

### Post-change review

The command and core split holds: `registry.ts` and `migration.ts` are core modules with typed results, and the command modules own grammar, validation and rendering. The old horizon-move special case in completion was removed rather than aliased.

### Mini recap

`ki roadmap` now reads, orders, groups and migrates the v1 model while tolerating the old shape, and prune covers cancelled records.

## Discussion

### Origin

Handoff from the `ki-agentic-harness` roadmap model rollout on 2026-10-07, captured and shaped by the harness agent under Kris's instruction; `tools-ki` retains priority, execution and acceptance authority.

### Harness dependency satisfied

On 2026-10-07 the harness rollout closed KI-HARNESS-GOV-149 and KI-HARNESS-GOV-150 as done under Kris's decision 6 grant. The harness checker landed with these shapes worth reconciling here: `hold` is a nested mapping with `reason` (`waiting-for` or `parked`), `condition`, optional `review` date and optional `trades`; `resolution` is one of obsolete, rejected, duplicate, merged or superseded, and duplicate, merged and superseded need `resolution_target`; `areas` is a list of codes and `components` a vocabulary in `.ki.toml`; registry discovery resolves `[skills.ki-repo].capital` through the local ki registry to `Streams/Projects/`. The harness `ki-accept` prune selection now admits cancelled records, which this record adds to `ki repo roadmap prune`. Recorded by the harness rollout agent; `tools-ki` keeps its priority, execution and acceptance authority.

### Guesses for reconciliation at acceptance

Reconciled against the committed harness checker (`roadmap-evidence.ts` and `project-registry.ts` at `bdcb7360`): hold reasons, resolution values and `resolution_target` rules, `theme` as retired-but-tolerated and registry discovery match. These remain judgement calls for Kris:

1. The helper is `ki repo roadmap migrate`, previewing by default; `--apply` needs exactly one repository.
2. Done and cancelled are listed last, not hidden.
3. `--by` is text-only and is a usage error with `--format json`.
4. When a record's project and its direct `initiative` disagree, the list warns and groups under the registry's initiative.
5. Legacy-shaped records do not move until migrated.
6. Hold is entered through `demote --reason --condition [--review]`; leaving hold needs an explicit destination and removes the mapping.
7. The status and horizon table is enforced on moves, so `ready` cannot be demoted to `soon` or `future`.
8. Migration converts a done Triage record with `intake_disposition` to `status: cancelled` with `resolution` and `resolution_target`, but only notes that a `## Cancelled` section is needed; it leaves other done records at legacy horizons, and non-draft records at the `triage` horizon, for review.
9. Prune keeps the subject `chore(roadmap): prune <N> done work record(s)` for cancelled records, as the harness `ki-accept` does.
10. `theme` is reported as legacy but never rewritten; a missing `kind` is not reported, whereas the harness checker tolerates it with a warning.
11. `component` is checked as a kebab-case slug, not against the `.ki.toml` components vocabulary the harness checks.
12. A draft at the `triage` horizon becomes `status: triage` with no horizon.
13. A condition is lifted from the record by cue phrases, truncated at 200 characters, or else set to the placeholder `REVIEW: name the release condition`.
14. JSON items gain `lane`, the classification fields as `null` when absent, and `legacy` as an array.
15. Knowledge Base adapter fields that share a governed name, such as `purpose`, are now validated.
16. Summary adds `NOW=`, `CANCELLED=` and `LEGACY=`; the summary table has eight lane columns plus the total.
17. This record keeps `theme: cli` until its repository migration.
18. Grouped items show `[status @ lane]` when the lane differs from the status, and legacy items carry a `legacy` suffix.
