---
id: KI-TOOL-KI-CLI-160
area: CLI
title: Work status routing view
kind: deliver
purpose: capability
project: ways-of-working
component: agent
priority: medium
size: s
horizon: now
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 900d278857513471243f0b4a0c7cc2d7959e8e3b
created_at: 2026-10-19T21:10:00Z
updated_at: 2026-10-27T02:46:00Z
transferred_from: ki-principal ki.ways-of-working work-package design, point 35, 2026-10-19
---

# KI-TOOL-KI-CLI-160: Work Status Routing View

## Goal

`ki work status` offers a routing view: one line per work in a repository's `+/_WORK/`, giving its id, state, pending-message count and routing description, so that State of play, the single dispatch coordinator, can choose which work takes a new unit of work by reading one listing rather than every work folder.

## Context

Point 35 of the ki.ways-of-working [work-package design](https://github.com/knowledgeislands/ki-principal/blob/fba56feb/+/_WORK/ki.ways-of-working/design/work-package.md) asks tools-ki for two things: the both-shapes reader with three additive fields, and "a routing view listing each work's id, state, pending-message count and description, the register State of play reads". [KI-TOOL-KI-CLI-158](KI-TOOL-KI-CLI-158-work-status-reads-packages.md) delivered the first and named the routing view as out of its boundary and outstanding.

Kris decided on 19 October, ROUTING-VIEW a) in the ki.tools-burndown [decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.tools-burndown/decisions.md), to capture this record now and plan it straight after KI-TOOL-KI-CLI-158.

The data already exists. Since KI-TOOL-KI-CLI-158 each `ki/work-status/v1` entry carries `id`, `state`, `description` and `messages`, so the view is a projection of the report, not a new reader. The JSON consumer can already route from `--format json`; what is missing is the human listing.

## Boundary

- In: a human routing view in `ki work status`, every live work in one listing with its id, state, pending count and description, drawn from the existing report; its help text, manual, command inventory, README and REPO-OPS-028 lines; tests through `run(args, context)`.
- Out: any change to how work folders are read, which KI-TOOL-KI-CLI-158 owns; any new field in `ki/work-status/v1`; the five derived views and the `v2` contract, [KI-TOOL-KI-CLI-149](KI-TOOL-KI-CLI-149-work-status-views-contract.md); routing itself, which State of play does under `ki-coordination`; any write to a work folder.

## Current state

Grounded at `900d278857513471243f0b4a0c7cc2d7959e8e3b` on 27 October 2026. `ki work status` rendered the five views in text and the `ki/work-status/v1` report in JSON; each entry already carried `id`, `state`, `description` and `messages` since KI-TOOL-KI-CLI-158, and the only way to read them together for every work was the JSON.

## Steps

- [x] Add `--view <views|routing>` to `ki work status`, default `views`, rejecting any other value; `routing` renders one line per unfinished work in folder order: id, state, pending count and the description collapsed to one line and cut at 96 characters, or `no description`.
- [x] Keep the awaiting-review count, the warnings block and a summary line, the routing summary carrying the pending total; leave `--format json` and the five views as they were.
- [x] Test through `run(args, context)`: the full routing text with a long, a multi-line and an absent description, a finished work filtered out, a pending count, a warning and the review count; `--view routing --format json` still writes `ki/work-status/v1`; an unknown view is rejected.
- [x] Manual, command inventory, README, changelog and REPO-OPS-028 aligned; full gate.

## Files touched

- `src/commands/work/index.ts`
- `src/tests/cli/work/status.test.ts`
- `man/ki.1`, `man/ki.commands.json`, `README.md`, `CHANGELOG.md`, `docs/specs/repository-operations.md` (REPO-OPS-028)
- This record.

## Verify

- `bun run test:coverage` passes at the 100% thresholds, the routing test among them.
- `bunx tsc --noEmit`, Biome, `mandoc -T lint man/ki.1`, the command-inventory check, `ki repo audit --repo .` and `git diff --check` pass.
- `ki work status --view routing --repo <repository>` against the Capital lists each unfinished work on one line.

## Dependencies / blocks

The external dependency, State of play confirming the work-status form, was met by Kris's TOOLS-KI-SHAPES a) of 20 October 2026 and the roadmap sweep's quick-win reading of 27 October; `blocked_by` stays empty because no local work record owns it. [KI-TOOL-KI-CLI-149](KI-TOOL-KI-CLI-149-work-status-views-contract.md) is not touched.

Predecessor: [KI-TOOL-KI-CLI-158](KI-TOOL-KI-CLI-158-work-status-reads-packages.md), whose `description` and `messages` fields this view reads. Its work has landed, so it is sequence rather than build order and `blocked_by` stays empty. If KI-TOOL-KI-CLI-149 is planned first, the routing view may sit beside its views in the same text form; neither waits on the other.

## Documentation impact

### Decision Records

None.

### Specifications

REPO-OPS-028 in `docs/specs/repository-operations.md` states the routing view and names its test.

### Guides

`README.md` and `man/ki.1` describe `--view routing`; `man/ki.commands.json` is regenerated.

### Roadmap

This record only.

## Review

### Delivered

The Boundary's In clause and nothing more: a human routing listing in `ki work status`, every unfinished work in one listing with its id, state, pending count and description drawn from the existing report, with its help text, manual, command inventory, README and REPO-OPS-028 lines and a test through `run(args, context)`. No change to how work folders are read, no new `ki/work-status/v1` field, no change to the five views. Immutable baseline `900d278857513471243f0b4a0c7cc2d7959e8e3b` on `main`.

Adopted from Soon to Now and delivered on 27 October 2026 under Kris's "Do the quick wins now" on the ways-of-working [roadmap sweep](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/design/roadmap-sweep.md), bucket C, following Kris's TOOLS-KI-SHAPES a) of 20 October that the view is `--view routing` beside the text views. The Discussion's four open points are settled as the sweep's quick-win reading allows: a flag, `--view routing`, on `ki work status`; the listing holds every work the report holds, `+/_WORK_REVIEW/` staying a count; a description is collapsed to one line and cut at 96 characters with `...`; finished work is filtered, on-hold work is listed because a message may still be queued to it.

### Change Summary

- `src/commands/work/index.ts`: `--view <views|routing>` option; `routingEntries` and `routingLine` build the listing; `renderWorkStatus` takes the view and shares the review, warnings and summary lines between the two text forms.
- `src/tests/cli/work/status.test.ts`: "lists each unfinished work for routing with its id, state, pending count and description on one line".
- `man/ki.1`: the synopsis lines and the `--view routing` paragraph; `man/ki.commands.json` regenerated from it.
- `README.md`, `CHANGELOG.md`, `docs/specs/repository-operations.md`: the view described, the command surface line extended, REPO-OPS-028 extended with the view and its test.

### Verification

- `bun run test:coverage`: 97 test files, 2151 tests pass, coverage within the 100% thresholds (exit 0); the run takes about 27 minutes on this machine.
- `bunx tsc --noEmit`, Biome (396 files, one pre-existing info), `bun scripts/generate-command-inventory.ts` (inventory regenerated and stable), `mandoc -T lint man/ki.1`, `git diff --check`: pass.
- `ki repo audit --repo .` in the linked worktree: FAIL=3, none from this change: PKG-6 (the pre-existing `--write` in `package.json`'s lint-staged lines), DESIGN-2 (dependency-cruiser evidence resolving through the worktree's symlinked `tooling/depcruise/node_modules`, a worktree artefact) and COORD-15 (the worktree's base one commit behind `main`, cleared by rebasing onto `631deaf9` before publishing).
- Re-checked after the rebase onto `631deaf9`, a commit that only moved roadmap records to ideas: `bunx tsc --noEmit`, Biome and the `work status` test file.
- Pre-commit hook (lint-staged, syncpack, shellcheck and mandoc, staged audit): ran on the commit.
- Not run: the live `ki work status --view routing` against the Capital.

### Outstanding concerns

- The cut width, 96 characters, is a choice; a terminal narrower than that wraps the line, which the five views also do with a long id.
- Secondary States of play and checkpoints read through the tolerance window appear as ordinary lines; the view does not group by level.

### Post-change review

Goal met: State of play reads one listing for id, state, pending count and description without opening a work folder or parsing JSON. Scope held to the In clause. Regression risk is low: the default text form and the JSON report are unchanged, and the only new path is behind `--view routing`. Ready for acceptance.

### Mini recap

Delivered `--view routing` with its test and documents; verified by the coverage gate and audit; outstanding is the cut width as a choice. Learning route: none proposed.

## Discussion

Open for planning: whether the view is a flag on `ki work status` (such as `--view routing`), a subcommand, or a section of the default text form; whether checkpoints and `+/_WORK_REVIEW/` folders appear; how a long description is cut on one line; and whether finished or on-hold works list or are filtered. tools-ki owns priority and design.

### Agreed form dependency

Kris confirmed TOOLS-KI-SHAPES a) on 20 October 2026 at 23:16 BST in the [ways-of-working decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/decisions.md#2026-10-20-2316-bst---query-sign-offs-first-batch). Ask State of play for the form, then plan this record as `--view routing` beside the text views; [KI-TOOL-KI-CLI-149](KI-TOOL-KI-CLI-149-work-status-views-contract.md) waits alongside it. No implementation or promotion is authorised by this confirmation.
