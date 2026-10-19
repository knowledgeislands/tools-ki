---
id: KI-TOOL-KI-CLI-158
area: CLI
title: Work status reads the work package
kind: deliver
purpose: capability
project: ways-of-working
component: agent
horizon: now
priority: high
size: m
status: ready
blocks: []
blocked_by: []
baseline_ref: e88f9d6e597956f9ef66fec4078b14f91b28fa19
created_at: 2026-10-19T18:27:00Z
updated_at: 2026-10-19T18:27:00Z
transferred_from: ki-principal ki.ways-of-working work-package design, points 35 and 39, 2026-10-19
---

# KI-TOOL-KI-CLI-158: Work Status Reads the Work Package

## Goal

`ki work status` reads a work folder in either shape the `ki-work-package` standard allows, the five-file work package and the single-file work folder, taking the state fields from `state.md` where it exists and from `work.md` otherwise, and adds each work's routing `description`, its `method_read` revision and its count of pending messages to `ki/work-status/v1`, so that the migrated ki-principal folders show in every view again.

## Context

Kris decided the work package on 19 October 2026 in the ki.ways-of-working [decisions log](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/decisions.md): PACKAGE-NAME, "I want `ki-work-package` please, where it lives is a folder", and STATE-FILE b), keeping `state.md`, which "brings back the readers-first step (`ki work status` and the Observatory read both shapes before the pass)". The [work-package design](/Users/krisbrown/workspaces/knowledge-islands/ki-principal/+/_WORK/ki.ways-of-working/design/work-package.md#the-rename) asks tools-ki, in points 35 and 39, to read the state fields from `state.md` where it exists and from `work.md` otherwise, with the output schema unchanged, three additive fields and `path` naming `state.md` where it exists, and to rename the skill in the help text and manual.

The harness standard is now [`ki-work-package`](/Users/krisbrown/workspaces/knowledge-islands/ki-agentic-harness/skills/governance/ki-work-package/references/standards-work-package.md), carried by the `bda6e4a` pin `v0.11.5` takes. Its state file holds `id`, `state`, `target`, `hold`, `blocking`, `since`, `received`, `beat`, `mark` and `method_read`; its work file holds identity, supervision and the `description`; `messages.md` holds one list line per pending message, and a single-file folder holds the same lines in its work file's `## Messages` section.

The ki-principal folders migrated to the package shape on 19 October before any reader followed, so released `ki work status` reads no state in any of them: over ki-principal's `+/_WORK/` it shows every view empty and twelve "state must be one of ..." warnings. The handoff reached ki.tools-burndown as its WORK-PACKAGE-READER message, marked blocking.

[KI-TOOL-KI-CLI-149](KI-TOOL-KI-CLI-149-work-status-views-contract.md) (views in a `v2` schema), [KI-TOOL-KI-CLI-150](KI-TOOL-KI-CLI-150-work-folder-entry-points.md) (launch refusal, done) and [KI-TOOL-KI-CLI-152](KI-TOOL-KI-CLI-152-work-folder-housekeeping-commands.md) (decisions headings, `ki work message` and `prune`) do not cover the reader: KI-TOOL-KI-CLI-149 changes what the report derives, not where it reads, and KI-TOOL-KI-CLI-152's `ki work message` will write the `messages.md` line this record only counts. Neither is extended; KI-TOOL-KI-CLI-152 should name `messages.md` as its target when it is planned.

## Boundary

- In: the both-shapes reader in `src/core/work/status.ts`; the three additive entry fields; the pending count on the text view lines; the help text, manual, command inventory, README, REPO-OPS-028 and CHANGELOG, with `ki-work-folder` renamed to `ki-work-package` in the help text and manual.
- Out: the routing view of point 35, a listing of each work's id, state, pending count and description for State of play, which is a new view rather than a reader change; validating the package's closed file list or field set, which the `ki-work-package` rubric owns; any write to a work folder; the `v2` views contract (KI-TOOL-KI-CLI-149); the Observatory's own date fix, owned by ki.observatory.

## Decision

1. **Shape.** A folder whose `state.md` is a file is a package; otherwise it is single-file. `work.md` stays required in both, giving `id`, `level`, `title`, `theme`, `worker`, `supervisor` and `description`. A package takes `state`, `target`, `hold`, `blocking`, `since`, `received`, `beat` and `method_read` from `state.md` only, under the same validation as today, and its `path` names `state.md`; a single-file folder takes them from `work.md` and its `path` names `work.md`.
2. **Agreement.** A package's `state.md` must declare the folder's `id`, else the entry is unreadable with "state.md id <x> must name its folder". A package whose `work.md` still carries a state field draws one warning, "work.md carries state fields beside state.md; state.md governs", and lists, so a session rewriting the old shape from memory shows at once.
3. **Fields.** Each entry gains `description` (the work file's string, else `null`), `method_read` (the state file's revision as a string, a YAML time written as a UTC time, else `null`) and `messages`, the count of top-level list lines in `messages.md` for a package or under the work file's `## Messages` heading for a single-file folder, `None.` and prose counting nothing. Old checkpoints carry `null`, `null` and `0`. The schema stays `ki/work-status/v1`: the change is additive.
4. **Text.** A view line for a work with pending messages ends `· <n> pending`, so the owner sees an unread queue, such as a waiting `REFRESH`, without the JSON.
5. **Rename.** The manual and its generated inventory name `ki-work-package` and the work-package standard; "work folder" stays where it names the directory `+/_WORK/<id>/`. The CHANGELOG's historical lines keep the name they were written with.

## Steps

- [ ] **Reader.** In `status.ts` split `workEntry` into identity from `work.md` and state from the state source, add the `state.md` agreement check and the stale-field warning, count pending messages, and add the three fields to `WorkStatusEntry` and to checkpoint entries.
- [ ] **Text.** Carry the pending count on `WorkViewLine` and render it in `src/commands/work/index.ts`; update the command description.
- [ ] **Tests** through `run(args, context)` in `src/tests/cli/work/status.test.ts`: the cases in Verify 1 to 4.
- [ ] **Documentation.** `man/ki.1` and regenerated `man/ki.commands.json`, `README.md`, REPO-OPS-028 in `docs/specs/repository-operations.md`, and `CHANGELOG.md`.

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
