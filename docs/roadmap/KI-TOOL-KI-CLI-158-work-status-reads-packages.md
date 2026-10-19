---
id: KI-TOOL-KI-CLI-158
area: CLI
title: Work status reads packages
kind: deliver
purpose: capability
project: ways-of-working
component: agent
horizon: now
priority: high
size: m
status: awaiting-review
blocks: []
blocked_by: []
baseline_ref: 29687ff47bf14229b1c554aab1d8bb882ba60eac
created_at: 2026-10-19T18:27:00Z
updated_at: 2026-10-19T18:39:00Z
transferred_from: ki-principal ki.ways-of-working work-package design, points 35 and 39, 2026-10-19
---

# KI-TOOL-KI-CLI-158: Work Status Reads Packages

## Goal

`ki work status` reads a work folder in either shape the `ki-work-package` standard allows, the five-file work package and the single-file work folder, taking the state fields from `state.md` where it exists and from `work.md` otherwise, and adds each work's routing `description`, its `method_read` revision and its count of pending messages to `ki/work-status/v1`, so that the migrated ki-principal folders show in every view again.

## Context

Kris decided the work package on 19 October 2026 in the ki.ways-of-working [decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/decisions.md): PACKAGE-NAME, "I want `ki-work-package` please, where it lives is a folder", and STATE-FILE b), keeping `state.md`, which "brings back the readers-first step (`ki work status` and the Observatory read both shapes before the pass)". The [work-package design](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/design/work-package.md#the-rename) asks tools-ki, in points 35 and 39, to read the state fields from `state.md` where it exists and from `work.md` otherwise, with the output schema unchanged, three additive fields and `path` naming `state.md` where it exists, and to rename the skill in the help text and manual.

The harness standard is now [`ki-work-package`](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/skills/governance/ki-work-package/references/standards-work-package.md), carried by the `bda6e4a` pin `v0.11.5` takes. Its state file holds `id`, `state`, `target`, `hold`, `blocking`, `since`, `received`, `beat`, `mark` and `method_read`; its work file holds identity, supervision and the `description`; `messages.md` holds one list line per pending message, and a single-file folder holds the same lines in its work file's `## Messages` section.

The handoff reached ki.tools-burndown as its WORK-PACKAGE-READER message, marked blocking.

[KI-TOOL-KI-CLI-149](KI-TOOL-KI-CLI-149-work-status-views-contract.md) (views in a `v2` schema), [KI-TOOL-KI-CLI-150](KI-TOOL-KI-CLI-150-work-folder-entry-points.md) (launch refusal, done) and [KI-TOOL-KI-CLI-152](KI-TOOL-KI-CLI-152-work-folder-housekeeping-commands.md) (decisions headings, `ki work message` and `prune`) do not cover the reader: KI-TOOL-KI-CLI-149 changes what the report derives, not where it reads, and KI-TOOL-KI-CLI-152's `ki work message` will write the `messages.md` line this record only counts. Neither is extended; KI-TOOL-KI-CLI-152 should name `messages.md` as its target when it is planned.

## Boundary

- In: the both-shapes reader in `src/core/work/status.ts`; the three additive entry fields; the pending count on the text view lines; the help text, manual, command inventory, README, REPO-OPS-028 and CHANGELOG, with `ki-work-folder` renamed to `ki-work-package` in the manual.
- Out: the routing view of point 35, a listing of each work's id, state, pending count and description for State of play, which is a new view rather than a reader change; validating the package's closed file list or field set, which the `ki-work-package` rubric owns; any write to a work folder; the `v2` views contract (KI-TOOL-KI-CLI-149); the Observatory's own date fix, owned by ki.observatory.

## Current state

- `src/core/work/status.ts` reads every field from `+/_WORK/<id>/work.md` front matter alone and names that file as each entry's `path`.
- The ki-principal folders migrated to the package shape on 19 October before any reader followed, so released `ki work status` reads no state in any of them: over ki-principal's `+/_WORK/` it shows every view empty and twelve "state must be one of ..." warnings.
- The manual and its command inventory still name `ki-work-folder`; the source names it nowhere.

## Decision

1. **Shape.** A folder whose `state.md` is a file is a package; otherwise it is single-file. `work.md` stays required in both, giving `id`, `level`, `title`, `theme`, `worker`, `supervisor` and `description`. A package takes `state`, `target`, `hold`, `blocking`, `since`, `received`, `beat` and `method_read` from `state.md` only, under the same validation as today, and its `path` names `state.md`; a single-file folder takes them from `work.md` and its `path` names `work.md`.
2. **Agreement.** A package's `state.md` must declare the folder's `id`, else the entry is unreadable with "id <x> must name its folder" against `state.md`. A package whose `work.md` still carries a state field draws one warning, "carries state fields beside state.md; state.md governs", and lists from `state.md`, so a session rewriting the old shape from memory shows at once.
3. **Fields.** Each entry gains `description` (the work file's string, else `null`), `method_read` (the state file's value as written, a bare number as its digits, else `null`) and `messages`, the count of top-level `-` list lines in `messages.md` for a package or under the work file's `## Messages` heading for a single-file folder, `None.` and prose counting nothing. Old checkpoints carry `null`, `null` and `0`. The schema stays `ki/work-status/v1`: the change is additive.
4. **Text.** A view line for a work with pending messages ends `· <n> pending`, so the owner sees an unread queue, such as a waiting `REFRESH`, without the JSON.
5. **Rename.** The manual and its generated inventory name `ki-work-package` and the work-package standard; "work folder" stays where it names the directory `+/_WORK/<id>/`. The CHANGELOG's historical lines keep the name they were written with.

## Steps

- [x] **Reader.** In `status.ts` split `workEntry` into identity from `work.md` and state from the state source, add the `state.md` agreement check and the stale-field warning, count pending messages, and add the three fields to `WorkStatusEntry` and to checkpoint entries.
- [x] **Text.** Carry the pending count on `WorkViewLine` and render it in `src/commands/work/index.ts`; update the command descriptions.
- [x] **Tests** through `run(args, context)` in `src/tests/cli/work/status.test.ts`: the cases in Verify 1 to 4.
- [x] **Documentation.** `man/ki.1` and regenerated `man/ki.commands.json`, `README.md`, REPO-OPS-028 in `docs/specs/repository-operations.md`, and `CHANGELOG.md`.

## Files touched

`src/core/work/status.ts`, `src/commands/work/index.ts`, `src/tests/cli/work/status.test.ts`, `man/ki.1`, `man/ki.commands.json`, `README.md`, `docs/specs/repository-operations.md`, `CHANGELOG.md`.

## Verify

1. A package folder lists with its state, hold, target, blocking, since, received and beat from `state.md`, its identity and `description` from `work.md`, `method_read` from `state.md` and `path` naming `state.md`; a single-file folder beside it lists as before, with `method_read` `null`.
2. `messages` counts the list lines of `messages.md`, ignoring `None.`, and of a single-file work file's `## Messages` section only; the text view line shows `· <n> pending`.
3. A package whose `state.md` names another id, or has invalid state fields, is a warning and the rest list; a package whose `work.md` keeps a `state` field warns and lists from `state.md`.
4. Old checkpoints list with `description` and `method_read` `null` and `messages` `0`.
5. The repository gate passes (`bun run test:coverage`, `bunx tsc --noEmit`, `bunx biome check .`, `mandoc -T lint man/ki.1`, the command-inventory check, `ki repo audit --repo .`), and the working-tree `ki work status` over ki-principal's `+/_WORK/` lists all twelve live works with no state warning.

## Dependencies / blocks

None in this repository. It blocks the ki.ways-of-working migration's readers-first gate, which the ki-principal folders have already passed without it.

## Documentation impact

### Decision Records

None; the ki.ways-of-working decisions log and the work-package design record the decision.

### Specifications

`docs/specs/repository-operations.md`: REPO-OPS-028 reads both shapes and names the three fields.

### Guides

`README.md` work-status paragraph, `man/ki.1` and its generated `man/ki.commands.json`, and `CHANGELOG.md`.

### Roadmap

None.

## Review

### Delivered

The whole record, from baseline `29687ff4` on 19 October 2026 by the `wpreader` run, in the tools-burndown Project.

### Change Summary

- `src/core/work/status.ts`: `workEntry` reads one folder in either shape through `workDefinition` (identity, supervision, `description`) and `workState` (state fields, `method_read`); a package's `state.md` must name its folder and a stale state field in its `work.md` warns; `messages` counts the queue's `-` lines; entries carry `description`, `method_read` and `messages`, and a package's `path` names `state.md`.
- `src/commands/work/index.ts`: a view line ends `· <n> pending` when the queue holds lines; the command descriptions name work packages and both files.
- Tests: one new case for Verify 1, 2 and 3's stale-field warning; the unreadable-file case gains five unreadable `state.md` files; the checkpoint and full-report cases assert the new fields.
- Documentation as listed under Documentation impact.
- Deviation: Decision 3 first planned to normalise a YAML time in `method_read`; the YAML reader keeps such values as strings, so `method_read` is passed through as written.

### Verification

- Verify 1 to 4: covered by `reads a package from state.md and work.md beside a single-file folder, counting each pending message`, `warns of each unreadable work file and lists the rest`, `reads thread-model checkpoints through the tolerance window, warning of each new home` and `reads every work file into ki/work-status/v1 with its live runs, and counts work awaiting review`: passed.
- Verify 5: `bun run test:coverage`: 80 files and 1,354 tests passed at the coverage thresholds; `bunx tsc --noEmit`, `bunx biome check .`, `mandoc -T lint man/ki.1` and the command-inventory check clean; `ki repo audit --repo .` passes with FAIL=0. Working-tree `ki work status --repo ../ki-principal` lists all twelve works, seven with you, one stuck, three on hold and one moving beside three run items, with no warning; nine show pending lines.

### Outstanding concerns

- Released `ki` keeps missing the migrated folders until a release carries this change.
- Six of the twelve ki-principal works write a UTC time in `method_read` where the standard sets a short harness revision; the reader passes it through, and the rubric is the place to flag it.
- The routing view of point 35 is not built; it needs its own record if State of play wants it from `ki`.

### Post-change review

Reading state from `state.md` alone in a package, rather than merging both files, keeps one source of truth and turns a session that rewrites the old shape into a visible warning instead of a silent fork. `path` follows the state's file, so the Observatory's with-you link opens the file whose move it shows.

### Mini recap

`ki work status` now reads work packages and single-file folders alike and adds each work's description, method revision and pending-message count.

## Discussion

### Release

The change is additive to `ki/work-status/v1`, touches no other command, and `v0.11.5` is prepared but untagged, so it can ride that patch if it lands before the tag.
